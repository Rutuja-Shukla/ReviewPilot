import { Router, Request, Response } from 'express';
import { reviewRepository } from '../repositories/reviewRepository.js';
import { createAndExecuteReview } from '../services/reviewService.js';
import { generateTestForFinding } from '../ai/geminiTestService.js';
import { executeTestInSandbox, CURRENT_SANDBOX_CAPABILITY } from '../sandbox/sandboxAdapter.js';
import { runEvaluationSuite } from '../evaluation/evaluationRunner.js';

export const apiRouter = Router();

// GET /api/reviews - list all reviews
apiRouter.get('/reviews', (_req: Request, res: Response) => {
  try {
    const reviews = reviewRepository.getAllReviews();
    res.json({ success: true, reviews });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve reviews' });
  }
});

// POST /api/reviews - create and trigger new review
apiRouter.post('/reviews', async (req: Request, res: Response) => {
  try {
    const { title, description, language, profile, inputType, code, fileName } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Source code or diff is required' });
    }

    if (!language) {
      return res.status(400).json({ success: false, message: 'Language is required' });
    }

    const review = await createAndExecuteReview({
      title,
      description,
      language: language || 'typescript',
      profile: profile || 'COMPREHENSIVE',
      inputType: inputType || 'snippet',
      code,
      fileName,
    });

    res.status(201).json({ success: true, review });
  } catch (error: any) {
    console.error('Failed to create review:', error);
    res.status(500).json({ success: false, message: error.message || 'Review execution failed' });
  }
});

// GET /api/reviews/:reviewId - get single review
apiRouter.get('/reviews/:reviewId', (req: Request, res: Response) => {
  try {
    const review = reviewRepository.getReviewById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    res.json({ success: true, review });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching review' });
  }
});

// DELETE /api/reviews/:reviewId - delete review (data privacy compliance)
apiRouter.delete('/reviews/:reviewId', (req: Request, res: Response) => {
  try {
    const deleted = reviewRepository.deleteReview(req.params.reviewId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    res.json({ success: true, message: 'Review deleted in compliance with privacy retention settings' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete review' });
  }
});

// GET /api/reviews/:reviewId/findings - get findings for review
apiRouter.get('/reviews/:reviewId/findings', (req: Request, res: Response) => {
  try {
    const review = reviewRepository.getReviewById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    res.json({ success: true, findings: review.findings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching findings' });
  }
});

// POST /api/findings/:findingId/generate-tests - generate unit test for a finding
apiRouter.post('/findings/:findingId/generate-tests', async (req: Request, res: Response) => {
  try {
    const { findingId } = req.params;
    const { reviewId } = req.body;

    if (!reviewId) {
      return res.status(400).json({ success: false, message: 'reviewId is required' });
    }

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
    console.error('Error generating tests:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to generate test' });
  }
});

// POST /api/findings/:findingId/feedback - false-positive dismissal / manual verification
apiRouter.post('/findings/:findingId/feedback', (req: Request, res: Response) => {
  try {
    const { findingId } = req.params;
    const { reviewId, dismissed, reason, comment, verifiedByUser } = req.body;

    if (!reviewId) {
      return res.status(400).json({ success: false, message: 'reviewId is required' });
    }

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
      comment,
      verifiedByUser: Boolean(verifiedByUser),
      updatedAt: new Date().toISOString(),
    };

    const updated = reviewRepository.updateFinding(reviewId, findingId, updates);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Finding not found' });
    }

    res.json({ success: true, finding: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update finding feedback' });
  }
});

// POST /api/tests/execute - execute or validate test in isolated sandbox
apiRouter.post('/tests/execute', async (req: Request, res: Response) => {
  try {
    const { test } = req.body;
    if (!test || !test.id) {
      return res.status(400).json({ success: false, message: 'Valid test object is required' });
    }

    const execution = await executeTestInSandbox(test);
    if (test.reviewId) {
      reviewRepository.addTestExecution(test.reviewId, execution);
    }

    res.json({ success: true, execution });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Sandbox test execution failed' });
  }
});

// POST /api/reviews/:reviewId/export - export review report as Markdown or JSON
apiRouter.post('/reviews/:reviewId/export', (req: Request, res: Response) => {
  try {
    const { reviewId } = req.params;
    const { format = 'markdown' } = req.body;

    const review = reviewRepository.getReviewById(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="reviewpilot-${reviewId}.json"`);
      return res.json(review);
    }

    // Markdown report format
    const markdown = `# ReviewPilot Code Review Report
**Review ID:** ${review.id}  
**Title:** ${review.title}  
**Language:** ${review.language.toUpperCase()}  
**Profile:** ${review.profile}  
**Status:** ${review.status}  
**Created:** ${new Date(review.createdAt).toLocaleString()}  
**Total Findings:** ${review.stats.totalFindings} (Critical: ${review.stats.criticalCount}, High: ${review.stats.highCount}, Medium: ${review.stats.mediumCount})

---

## Findings Summary

${review.findings.map((f, i) => `### ${i + 1}. [${f.severity}] ${f.title}
- **Category:** ${f.category}
- **Location:** \`${f.filePath}\` (Lines ${f.startLine}-${f.endLine})
- **Detection Source:** ${f.detectionSource}
- **Status:** ${f.validationStatus}
- **Confidence:** ${Math.round(f.confidence * 100)}%

**Description:**  
${f.description}

**Impact:**  
${f.impact}

**Evidence:**  
${f.evidence.map(e => `> ${e}`).join('\n')}

**Recommended Fix:**  
${f.recommendedFix}

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

Generated with [ReviewPilot](https://github.com/reviewpilot) AI Code Review & Automated Testing Platform.
`;

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="reviewpilot-${reviewId}.md"`);
    res.send(markdown);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export report' });
  }
});

// GET /api/evaluations - get previous evaluation runs
apiRouter.get('/evaluations', (_req: Request, res: Response) => {
  try {
    const runs = reviewRepository.getEvaluationRuns();
    res.json({ success: true, runs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get evaluation history' });
  }
});

// POST /api/evaluations/run - execute evaluation suite on 20 benchmark fixtures
apiRouter.post('/evaluations/run', async (_req: Request, res: Response) => {
  try {
    const summary = await runEvaluationSuite(20);
    reviewRepository.saveEvaluationRun(summary);
    res.json({ success: true, summary });
  } catch (error: any) {
    console.error('Failed to run evaluation suite:', error);
    res.status(500).json({ success: false, message: error.message || 'Evaluation run failed' });
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
    res.status(500).json({ success: false, message: 'Failed to retrieve settings' });
  }
});

// PUT /api/settings - update settings
apiRouter.put('/settings', (req: Request, res: Response) => {
  try {
    const updated = reviewRepository.updateSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});
