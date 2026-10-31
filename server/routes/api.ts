import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { reviewRepository } from '../repositories/reviewRepository.js';
import { createAndExecuteReview, reAnalyzeReview } from '../services/reviewService.js';
import { generateTestForFinding } from '../ai/geminiTestService.js';
import { executeTestInSandbox, CURRENT_SANDBOX_CAPABILITY } from '../sandbox/sandboxAdapter.js';
import { runEvaluationSuite } from '../evaluation/evaluationRunner.js';
import { sanitizeErrorMessage, scrubSecrets } from '../security/secretScrubber.js';
import { sanitizeHtmlContent } from '../security/sanitizer.js';
import { languageAdapterRegistry } from '../adapters/languages/index.js';

export const apiRouter = Router();

const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function validateIdParam(id: string | undefined): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && ID_REGEX.test(id);
}

const CreateReviewSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  language: z.enum(['typescript', 'javascript', 'python', 'java', 'csharp']),
  profile: z.enum([
    'BUG_DETECTION',
    'SECURITY_REVIEW',
    'CODE_QUALITY',
    'PERFORMANCE',
    'TEST_COVERAGE',
    'COMPREHENSIVE',
  ]).optional().default('COMPREHENSIVE'),
  inputType: z.enum(['snippet', 'diff', 'file']).optional().default('snippet'),
  code: z.string().trim().min(1, 'Source code or diff is required').max(1024 * 1024, 'Payload exceeds 1MB limit'),
  fileName: z.string().max(255).optional(),
});

const ReAnalyzeSchema = z.object({
  profile: z.enum([
    'BUG_DETECTION',
    'SECURITY_REVIEW',
    'CODE_QUALITY',
    'PERFORMANCE',
    'TEST_COVERAGE',
    'COMPREHENSIVE',
  ]).optional(),
});

const FeedbackSchema = z.object({
  reviewId: z.string().regex(ID_REGEX, 'Invalid reviewId format'),
  dismissed: z.boolean().optional(),
  reason: z.enum(['FALSE_POSITIVE', 'INTENDED_BEHAVIOR', 'ACCEPTED_RISK', 'OUT_OF_SCOPE', 'OTHER']).optional(),
  comment: z.string().max(1000).optional(),
  verifiedByUser: z.boolean().optional(),
});

const GenerateTestSchema = z.object({
  reviewId: z.string().regex(ID_REGEX, 'Invalid reviewId format'),
});

const ExecuteTestSchema = z.object({
  test: z.object({
    id: z.string().max(128),
    findingId: z.string().max(128),
    reviewId: z.string().max(128),
    framework: z.enum(['vitest', 'jest', 'pytest', 'junit', 'xunit']),
    language: z.enum(['typescript', 'javascript', 'python', 'java', 'csharp']),
    targetFunction: z.string().max(255),
    testCode: z.string().max(100000),
    validationStatus: z.enum(['SYNTAX_VALID', 'SYNTAX_ERROR', 'UNCHECKED']).optional(),
    testType: z.enum(['DEFECT_REPRODUCTION', 'HAPPY_PATH', 'EDGE_CASE']),
    createdAt: z.string().optional(),
  }),
});

const ExportSchema = z.object({
  format: z.enum(['markdown', 'json']).default('markdown'),
});

const UpdateSettingsSchema = z.object({
  retentionPeriod: z.enum(['session', '24h', '7d', '30d']).optional(),
  defaultProfile: z.enum([
    'BUG_DETECTION',
    'SECURITY_REVIEW',
    'CODE_QUALITY',
    'PERFORMANCE',
    'TEST_COVERAGE',
    'COMPREHENSIVE',
  ]).optional(),
  maxInputSizeBytes: z.number().int().min(1024).max(10 * 1024 * 1024).optional(),
  modelName: z.string().max(64).optional(),
  sandboxIsolationConfigured: z.boolean().optional(),
  allowManualVerification: z.boolean().optional(),
});

// GET /api/reviews - list all reviews
apiRouter.get('/reviews', (_req: Request, res: Response) => {
  try {
    const reviews = reviewRepository.getAllReviews();
    res.json({ success: true, reviews });
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Failed to retrieve reviews') });
  }
});

// POST /api/reviews - create and trigger new review
apiRouter.post('/reviews', async (req: Request, res: Response) => {
  const parseResult = CreateReviewSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      message: parseResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', '),
    });
  }

  try {
    const review = await createAndExecuteReview(parseResult.data);
    res.status(201).json({ success: true, review });
  } catch (error: any) {
    const safeMsg = sanitizeErrorMessage(error, 'Review execution failed');
    console.error('Failed to create review:', safeMsg);
    res.status(500).json({ success: false, message: safeMsg });
  }
});

// GET /api/reviews/:reviewId - get single review
apiRouter.get('/reviews/:reviewId', (req: Request, res: Response) => {
  if (!validateIdParam(req.params.reviewId)) {
    return res.status(400).json({ success: false, message: 'Invalid review ID format' });
  }

  try {
    const review = reviewRepository.getReviewById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    res.json({ success: true, review });
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Error fetching review') });
  }
});

// POST /api/reviews/:reviewId/analyze - re-run analysis on existing review
apiRouter.post('/reviews/:reviewId/analyze', async (req: Request, res: Response) => {
  if (!validateIdParam(req.params.reviewId)) {
    return res.status(400).json({ success: false, message: 'Invalid review ID format' });
  }

  const parseResult = ReAnalyzeSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      message: parseResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', '),
    });
  }

  try {
    const review = await reAnalyzeReview(req.params.reviewId, parseResult.data.profile);
    res.json({ success: true, review });
  } catch (error: any) {
    if (error.message === 'Review not found') {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Re-analysis failed') });
  }
});

// DELETE /api/reviews/:reviewId - delete review (data privacy compliance)
apiRouter.delete('/reviews/:reviewId', (req: Request, res: Response) => {
  if (!validateIdParam(req.params.reviewId)) {
    return res.status(400).json({ success: false, message: 'Invalid review ID format' });
  }

  try {
    const deleted = reviewRepository.deleteReview(req.params.reviewId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    res.json({ success: true, message: 'Review deleted in compliance with privacy retention settings' });
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Failed to delete review') });
  }
});

// GET /api/reviews/:reviewId/findings - get findings for review
apiRouter.get('/reviews/:reviewId/findings', (req: Request, res: Response) => {
  if (!validateIdParam(req.params.reviewId)) {
    return res.status(400).json({ success: false, message: 'Invalid review ID format' });
  }

  try {
    const review = reviewRepository.getReviewById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    res.json({ success: true, findings: review.findings });
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Error fetching findings') });
  }
});

// POST /api/findings/:findingId/generate-tests - generate unit test for a finding
apiRouter.post('/findings/:findingId/generate-tests', async (req: Request, res: Response) => {
  if (!validateIdParam(req.params.findingId)) {
    return res.status(400).json({ success: false, message: 'Invalid finding ID format' });
  }

  const parseResult = GenerateTestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      message: parseResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', '),
    });
  }

  try {
    const { findingId } = req.params;
    const { reviewId } = parseResult.data;

    const review = reviewRepository.getReviewById(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    const finding = review.findings.find(f => f.id === findingId);
    if (!finding) {
      return res.status(404).json({ success: false, message: 'Finding not found' });
    }

    const file = review.files.find(f => f.path === finding.filePath) || review.files[0];
    const sourceCode = file ? file.content : finding.codeExcerpt;

    const test = await generateTestForFinding(finding, sourceCode, review.language);
    reviewRepository.addGeneratedTest(reviewId, test);

    res.json({ success: true, test });
  } catch (error: any) {
    const safeMsg = sanitizeErrorMessage(error, 'Failed to generate test');
    console.error('Error generating tests:', safeMsg);
    res.status(500).json({ success: false, message: safeMsg });
  }
});

// POST /api/findings/:findingId/feedback - false-positive dismissal / manual verification
apiRouter.post('/findings/:findingId/feedback', (req: Request, res: Response) => {
  if (!validateIdParam(req.params.findingId)) {
    return res.status(400).json({ success: false, message: 'Invalid finding ID format' });
  }

  const parseResult = FeedbackSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      message: parseResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', '),
    });
  }

  try {
    const { findingId } = req.params;
    const { reviewId, dismissed, reason, comment, verifiedByUser } = parseResult.data;

    const updates: any = {};
    if (typeof dismissed === 'boolean') {
      updates.validationStatus = dismissed ? 'DISMISSED' : 'UNVERIFIED';
    }
    if (verifiedByUser) {
      updates.validationStatus = 'MANUALLY_VERIFIED';
    }

    updates.developerFeedback = {
      dismissed: Boolean(dismissed),
      reason,
      comment: comment ? sanitizeHtmlContent(comment) : undefined,
      verifiedByUser: Boolean(verifiedByUser),
      updatedAt: new Date().toISOString(),
    };

    const updated = reviewRepository.updateFinding(reviewId, findingId, updates);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Finding not found' });
    }

    res.json({ success: true, finding: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Failed to update finding feedback') });
  }
});

// POST /api/tests/execute - handle test execution request in accordance with security policy
apiRouter.post('/tests/execute', async (req: Request, res: Response) => {
  const parseResult = ExecuteTestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      message: parseResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', '),
    });
  }

  try {
    const { test } = parseResult.data;
    const execution = await executeTestInSandbox(test as any);
    if (test.reviewId && validateIdParam(test.reviewId)) {
      reviewRepository.addTestExecution(test.reviewId, execution);
    }

    res.json({ success: true, execution });
  } catch (error: any) {
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Sandbox test verification failed') });
  }
});

// POST /api/reviews/:reviewId/export - export review report as Markdown or JSON
apiRouter.post('/reviews/:reviewId/export', (req: Request, res: Response) => {
  if (!validateIdParam(req.params.reviewId)) {
    return res.status(400).json({ success: false, message: 'Invalid review ID format' });
  }

  const parseResult = ExportSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      message: parseResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', '),
    });
  }

  try {
    const { reviewId } = req.params;
    const { format } = parseResult.data;

    const review = reviewRepository.getReviewById(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="reviewpilot-${reviewId}.json"`);
      // Scrub any sensitive patterns from exported JSON
      const serialized = scrubSecrets(JSON.stringify(review, null, 2));
      return res.send(serialized);
    }

    // Markdown report format - ensure clean output free of leaked host paths or unescaped HTML
    const markdown = `# ReviewPilot Code Review Report
**Review ID:** ${review.id}  
**Title:** ${sanitizeHtmlContent(review.title)}  
**Language:** ${review.language.toUpperCase()}  
**Profile:** ${review.profile}  
**Status:** ${review.status}  
**Created:** ${new Date(review.createdAt).toLocaleString()}  
**Total Findings:** ${review.stats.totalFindings} (Critical: ${review.stats.criticalCount}, High: ${review.stats.highCount}, Medium: ${review.stats.mediumCount})

---

## Findings Summary

${review.findings.map((f, i) => `### ${i + 1}. [${f.severity}] ${sanitizeHtmlContent(f.title)}
- **Category:** ${f.category}
- **Location:** \`${f.filePath}\` (Lines ${f.startLine}-${f.endLine})
- **Detection Source:** ${f.detectionSource}
- **Status:** ${f.validationStatus}
- **Confidence:** ${Math.round(f.confidence * 100)}%

**Description:**  
${sanitizeHtmlContent(f.description)}

**Impact:**  
${sanitizeHtmlContent(f.impact)}

**Evidence:**  
${f.evidence.map(e => `> ${sanitizeHtmlContent(e)}`).join('\n')}

**Recommended Fix:**  
${sanitizeHtmlContent(f.recommendedFix)}

${f.suggestedPatch ? `**Suggested Patch:**
\`\`\`diff
${f.suggestedPatch}
\`\`\`
` : ''}
---
`).join('\n')}

## Automated Tests
- Tests Generated: ${(review.generatedTests || []).length}
- Tests Executed: ${(review.testExecutions || []).length}
- Execution Policy: Server-side execution disabled for isolation security.

Generated with ReviewPilot AI Code Review & Automated Testing Platform.
`;

    const cleanMarkdown = scrubSecrets(markdown);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reviewpilot-${reviewId}.md"`);
    res.send(cleanMarkdown);
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Failed to export report') });
  }
});

// GET /api/evaluations - get previous evaluation runs
apiRouter.get('/evaluations', (_req: Request, res: Response) => {
  try {
    const runs = reviewRepository.getEvaluationRuns();
    res.json({ success: true, runs });
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Failed to get evaluation history') });
  }
});

// POST /api/evaluations/run - execute evaluation suite on benchmark fixtures
apiRouter.post('/evaluations/run', async (_req: Request, res: Response) => {
  try {
    const summary = await runEvaluationSuite(20);
    reviewRepository.saveEvaluationRun(summary);
    res.json({ success: true, summary });
  } catch (error: any) {
    const safeMsg = sanitizeErrorMessage(error, 'Evaluation run failed');
    console.error('Failed to run evaluation suite:', safeMsg);
    res.status(500).json({ success: false, message: safeMsg });
  }
});

// GET /api/settings - retrieve application and privacy settings
apiRouter.get('/settings', (_req: Request, res: Response) => {
  try {
    const settings = reviewRepository.getSettings();
    res.json({
      success: true,
      settings,
      sandboxCapability: CURRENT_SANDBOX_CAPABILITY,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Failed to retrieve settings') });
  }
});

// GET /api/languages/capabilities - retrieve detailed language adapter capabilities and tool status
apiRouter.get('/languages/capabilities', (req: Request, res: Response) => {
  try {
    const langQuery = req.query.language as string | undefined;
    if (langQuery) {
      const adapter = languageAdapterRegistry.getAdapterOrNull(langQuery);
      if (!adapter) {
        return res.status(404).json({ success: false, message: `Unsupported language: "${langQuery}"` });
      }
      return res.json({ success: true, capabilities: adapter.getCapabilities() });
    }

    const allCapabilities = languageAdapterRegistry.getAllAdapters().map((adapter) => adapter.getCapabilities());
    res.json({ success: true, capabilities: allCapabilities });
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Failed to retrieve language capabilities') });
  }
});

// PUT /api/settings - update settings
apiRouter.put('/settings', (req: Request, res: Response) => {
  const parseResult = UpdateSettingsSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      message: parseResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', '),
    });
  }

  try {
    const updated = reviewRepository.updateSettings(parseResult.data);
    res.json({ success: true, settings: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: sanitizeErrorMessage(error, 'Failed to update settings') });
  }
});
