import {
  Review,
  ReviewFinding,
  GeneratedTest,
  TestExecution,
  AppSettings,
  EvaluationRunSummary,
} from '../../src/types/review.js';

class ReviewRepository {
  private reviews: Map<string, Review> = new Map();
  private evaluationRuns: EvaluationRunSummary[] = [];
  private settings: AppSettings = {
    retentionPeriod: '7d',
    defaultProfile: 'COMPREHENSIVE',
    maxInputSizeBytes: 500 * 1024, // 500 KB
    modelName: 'gemini-3.8-flash',
    sandboxIsolationConfigured: true,
    allowManualVerification: true,
  };

  constructor() {
    this.seedDemoReview();
  }

  public getAllReviews(): Review[] {
    return Array.from(this.reviews.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getReviewById(id: string): Review | undefined {
    return this.reviews.get(id);
  }

  public saveReview(review: Review): Review {
    this.reviews.set(review.id, review);
    return review;
  }

  public deleteReview(id: string): boolean {
    return this.reviews.delete(id);
  }

  public updateFinding(
    reviewId: string,
    findingId: string,
    updates: Partial<ReviewFinding>
  ): ReviewFinding | null {
    const review = this.reviews.get(reviewId);
    if (!review) return null;

    const findingIndex = review.findings.findIndex(f => f.id === findingId);
    if (findingIndex === -1) return null;

    review.findings[findingIndex] = {
      ...review.findings[findingIndex],
      ...updates,
    };

    // Update stats
    this.recalculateStats(review);
    return review.findings[findingIndex];
  }

  public addGeneratedTest(reviewId: string, test: GeneratedTest): void {
    const review = this.reviews.get(reviewId);
    if (review) {
      review.generatedTests = review.generatedTests || [];
      review.generatedTests.push(test);
      this.recalculateStats(review);
    }
  }

  public addTestExecution(reviewId: string, execution: TestExecution): void {
    const review = this.reviews.get(reviewId);
    if (review) {
      review.testExecutions = review.testExecutions || [];
      review.testExecutions.push(execution);
      
      // If test passed, mark finding as TEST_CONFIRMED per Section 8
      if (execution.status === 'PASSED') {
        const finding = review.findings.find(f => f.id === execution.findingId);
        if (finding && finding.validationStatus !== 'DISMISSED') {
          finding.validationStatus = 'TEST_CONFIRMED';
        }
      }
      this.recalculateStats(review);
    }
  }

  public recalculateStats(review: Review): void {
    const findings = review.findings || [];
    review.stats = {
      totalFindings: findings.length,
      criticalCount: findings.filter(f => f.severity === 'CRITICAL').length,
      highCount: findings.filter(f => f.severity === 'HIGH').length,
      mediumCount: findings.filter(f => f.severity === 'MEDIUM').length,
      lowCount: findings.filter(f => f.severity === 'LOW').length,
      infoCount: findings.filter(f => f.severity === 'INFORMATIONAL').length,
      staticallyConfirmedCount: findings.filter(f => f.validationStatus === 'STATICALLY_CONFIRMED').length,
      testConfirmedCount: findings.filter(f => f.validationStatus === 'TEST_CONFIRMED').length,
      dismissedCount: findings.filter(f => f.validationStatus === 'DISMISSED').length,
      testsGeneratedCount: (review.generatedTests || []).length,
    };
  }

  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...newSettings };
    return this.settings;
  }

  public saveEvaluationRun(run: EvaluationRunSummary): void {
    this.evaluationRuns.unshift(run);
    if (this.evaluationRuns.length > 20) {
      this.evaluationRuns.pop();
    }
  }

  public getEvaluationRuns(): EvaluationRunSummary[] {
    return this.evaluationRuns;
  }

  private seedDemoReview(): void {
    const demoId = 'rev-auth-service-v2';
    const sampleCode = `import express, { Request, Response } from 'express';
import { db } from './database';

const router = express.Router();

// Hardcoded legacy token - pending rotation
const INTERNAL_SECRET = 'AKIAIOSFODNN7EXAMPLE_SECRET';

export async function handleUserQuery(req: Request, res: Response) {
  const userId = req.query.id as string;
  const role = req.query.role as string;

  // Accidental assignment instead of comparison
  if (role = 'admin') {
    console.log('Admin elevated access granted');
  }

  // Raw unparameterized SQL concatenation
  const query = "SELECT * FROM users WHERE id = '" + userId + "'";
  const user = await db.query(query);

  // Deep property access without null guard
  const tenantTier = user.profile.subscription.tier;

  res.json({
    status: 'ok',
    tier: tenantTier,
    userData: user
  });
}`;

    const diffContent = `diff --git a/src/authRouter.ts b/src/authRouter.ts
--- a/src/authRouter.ts
+++ b/src/authRouter.ts
@@ -6,6 +6,13 @@ const router = express.Router();
-const INTERNAL_SECRET = null;
+const INTERNAL_SECRET = 'AKIAIOSFODNN7EXAMPLE_SECRET';
 
 export async function handleUserQuery(req: Request, res: Response) {
   const userId = req.query.id as string;
+  const role = req.query.role as string;
+  if (role = 'admin') {
+    console.log('Admin elevated access granted');
+  }
+  const query = "SELECT * FROM users WHERE id = '" + userId + "'";`;

    const findings: ReviewFinding[] = [
      {
        id: 'finding-sec-01',
        reviewId: demoId,
        title: 'Hardcoded Credential or API Token Detected',
        category: 'SECURITY',
        severity: 'CRITICAL',
        confidence: 0.98,
        filePath: 'src/authRouter.ts',
        startLine: 7,
        endLine: 7,
        codeExcerpt: "const INTERNAL_SECRET = 'AKIAIOSFODNN7EXAMPLE_SECRET';",
        description: 'Hardcoded credential pattern matching AWS access key was detected in source code.',
        impact: 'Exposes private infrastructure credentials in source repository history.',
        evidence: [
          'Direct string assignment on line 7',
          'Matches regex pattern for cloud access key format',
        ],
        recommendedFix: 'Load secret securely from process.env.INTERNAL_SERVICE_SECRET.',
        suggestedPatch: `--- a/src/authRouter.ts\n+++ b/src/authRouter.ts\n@@ -7,1 +7,1 @@\n-const INTERNAL_SECRET = 'AKIAIOSFODNN7EXAMPLE_SECRET';\n+const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;`,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: true,
        relatedFindingIds: [],
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'finding-sec-02',
        reviewId: demoId,
        title: 'Potential SQL Injection via Unparameterized Query',
        category: 'SECURITY',
        severity: 'CRITICAL',
        confidence: 0.94,
        filePath: 'src/authRouter.ts',
        startLine: 18,
        endLine: 18,
        codeExcerpt: 'const query = "SELECT * FROM users WHERE id = \'" + userId + "\'";',
        description: 'Unsanitized user-controlled query parameter is concatenated directly into raw SQL string.',
        impact: 'Permits an unauthenticated attacker to manipulate query logic and bypass access controls.',
        evidence: [
          'userId variable sourced from req.query.id',
          'Concatenated directly with string addition operator into SQL statement',
        ],
        recommendedFix: 'Use parameterized queries: db.query("SELECT * FROM users WHERE id = $1", [userId]);',
        suggestedPatch: `--- a/src/authRouter.ts\n+++ b/src/authRouter.ts\n@@ -18,2 +18,1 @@\n-const query = "SELECT * FROM users WHERE id = '" + userId + "'";\n-const user = await db.query(query);\n+const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);`,
        detectionSource: 'AI_ANALYSIS',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: true,
        relatedFindingIds: [],
        createdAt: new Date(Date.now() - 3550000).toISOString(),
      },
      {
        id: 'finding-bug-01',
        reviewId: demoId,
        title: 'Accidental Assignment in Conditional Statement',
        category: 'BUG',
        severity: 'HIGH',
        confidence: 0.96,
        filePath: 'src/authRouter.ts',
        startLine: 14,
        endLine: 14,
        codeExcerpt: "if (role = 'admin') {",
        description: "Single equals assignment (=) inside if condition assigns 'admin' and always evaluates as truthy.",
        impact: 'Every user regardless of actual permissions is treated as an admin.',
        evidence: [
          "if (role = 'admin') overwrites variable value during condition check",
        ],
        recommendedFix: "Replace with strict equality: if (role === 'admin')",
        suggestedPatch: `--- a/src/authRouter.ts\n+++ b/src/authRouter.ts\n@@ -14,1 +14,1 @@\n-if (role = 'admin') {\n+if (role === 'admin') {`,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: true,
        relatedFindingIds: [],
        createdAt: new Date(Date.now() - 3500000).toISOString(),
      },
      {
        id: 'finding-bug-02',
        reviewId: demoId,
        title: 'Unchecked Null or Undefined Property Access',
        category: 'BUG',
        severity: 'MEDIUM',
        confidence: 0.89,
        filePath: 'src/authRouter.ts',
        startLine: 22,
        endLine: 22,
        codeExcerpt: 'const tenantTier = user.profile.subscription.tier;',
        description: 'Chained property access will throw TypeError if user is not found or has no profile.',
        impact: 'Application crash and 500 Internal Server Error when querying non-existent or un-onboarded user IDs.',
        evidence: [
          'user.profile may be null if database returns empty row or user row has null profile column',
        ],
        recommendedFix: 'Use optional chaining: const tenantTier = user?.profile?.subscription?.tier || "FREE";',
        suggestedPatch: `--- a/src/authRouter.ts\n+++ b/src/authRouter.ts\n@@ -22,1 +22,1 @@\n-const tenantTier = user.profile.subscription.tier;\n+const tenantTier = user?.profile?.subscription?.tier || 'FREE';`,
        detectionSource: 'AI_ANALYSIS',
        validationStatus: 'UNVERIFIED',
        introducedByChange: true,
        relatedFindingIds: [],
        createdAt: new Date(Date.now() - 3450000).toISOString(),
      },
    ];

    const generatedTests: GeneratedTest[] = [
      {
        id: 'test-seed-01',
        findingId: 'finding-sec-02',
        reviewId: demoId,
        framework: 'vitest',
        language: 'typescript',
        targetFunction: 'handleUserQuery',
        testType: 'DEFECT_REPRODUCTION',
        validationStatus: 'SYNTAX_VALID',
        testCode: `import { describe, it, expect, vi } from 'vitest';
import { handleUserQuery } from './authRouter';
import { db } from './database';

vi.mock('./database');

describe('handleUserQuery SQL Injection vulnerability test', () => {
  it('should escape malicious quote characters and use parameterized query binding', async () => {
    const maliciousPayload = "' OR '1'='1";
    const req = { query: { id: maliciousPayload, role: 'viewer' } } as any;
    const res = { json: vi.fn() } as any;

    await handleUserQuery(req, res);

    // Verify raw SQL concatenation did NOT occur
    expect(db.query).not.toHaveBeenCalledWith(
      expect.stringContaining("' OR '1'='1'")
    );
  });
});`,
        createdAt: new Date(Date.now() - 3400000).toISOString(),
      },
    ];

    const testExecutions: TestExecution[] = [
      {
        id: 'exec-seed-01',
        testId: 'test-seed-01',
        findingId: 'finding-sec-02',
        reviewId: demoId,
        status: 'SANDBOX_RESTRICTED',
        executionTimeMs: 16,
        stdout: `[ReviewPilot AST Sandbox: VITEST]
✓ Syntax compilation: SUCCESS (Target: TYPESCRIPT)
✓ Scope analyzed: Function "handleUserQuery"
✓ Test intent: Defect reproduction
✓ AST Safety Audit: Clean (No forbidden process, network, or filesystem calls)
⚠ SERVER-SIDE EXECUTION DISABLED BY SECURITY POLICY
  Host Isolation Status: MicroVM / hypervisor sandbox container is not provisioned on this host.
  Security Policy: Untrusted code is never executed inside the application server process.
  Safe Alternative: Use "Copy Code" or "Export" to execute this test suite within your isolated local runner or CI/CD container.`,
        stderr: '',
        failureExplanation: 'Server-side execution disabled by security policy (microVM isolation not present on host). Test syntax is valid and ready for export.',
        sandboxInfo: {
          isIsolated: false,
          runtime: 'ReviewPilot Safe AST Syntax Validator (esbuild)',
          isolationMechanism: 'Server-side execution disabled by security policy (microVM isolation not present). Untrusted code execution is strictly prohibited inside the application server.',
        },
        executedAt: new Date(Date.now() - 3350000).toISOString(),
      },
    ];

    const demoReview: Review = {
      id: demoId,
      title: 'Authentication & Database Routing Handler',
      description: 'Review of user query handling, role checks, and database queries in authRouter.ts',
      language: 'typescript',
      profile: 'COMPREHENSIVE',
      inputType: 'diff',
      status: 'COMPLETED',
      files: [
        {
          id: 'file-1',
          reviewId: demoId,
          path: 'src/authRouter.ts',
          content: sampleCode,
          originalContent: sampleCode.replace('AKIAIOSFODNN7EXAMPLE_SECRET', 'null'),
          language: 'typescript',
          isDiff: true,
          changesCount: { additions: 8, deletions: 1 },
        },
      ],
      findings,
      generatedTests,
      testExecutions,
      stats: {
        totalFindings: 4,
        criticalCount: 2,
        highCount: 1,
        mediumCount: 1,
        lowCount: 0,
        infoCount: 0,
        staticallyConfirmedCount: 3,
        testConfirmedCount: 0,
        dismissedCount: 0,
        testsGeneratedCount: 1,
      },
      aiModelUsed: 'gemini-3.8-flash',
      analysisTimeMs: 1240,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      completedAt: new Date(Date.now() - 3350000).toISOString(),
    };

    this.reviews.set(demoId, demoReview);
  }
}

export const reviewRepository = new ReviewRepository();
