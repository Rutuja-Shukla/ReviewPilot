import { describe, it, expect } from 'vitest';
import { runStaticAnalysis } from '../../server/analyzers/staticAnalyzer.js';
import { deduplicateFindings } from '../../server/services/reviewService.js';
import { parseGitDiff } from '../../server/analyzers/diffParser.js';
import { ReviewFinding } from '../../src/types/review.js';

describe('Review Pipeline & Defect Detection Verification', () => {
  describe('Clean Code Baseline (Zero False Positives)', () => {
    it('should report zero findings on production-grade clean TypeScript code', () => {
      const cleanTs = `
export interface User {
  id: string;
  name: string;
  role: 'admin' | 'user';
}

export function formatUserName(user: User): string {
  if (!user || !user.name) {
    return 'Anonymous';
  }
  return user.name.trim();
}

export async function fetchUserById(db: { query: (q: string, params: any[]) => Promise<any> }, id: string) {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}
`;
      const findings = runStaticAnalysis(cleanTs, 'src/users.ts', 'typescript', 'rev-clean-1');
      expect(findings).toHaveLength(0);
    });

    it('should report zero findings on clean Python utility code', () => {
      const cleanPy = `
import os

def read_config(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def calculate_total(items: list[float]) -> float:
    total = 0.0
    for item in items:
        total += item
    return total
`;
      const findings = runStaticAnalysis(cleanPy, 'utils.py', 'python', 'rev-clean-2');
      expect(findings).toHaveLength(0);
    });
  });

  describe('Known Defect Detection & Exact Source Line Mapping', () => {
    it('should map SQL injection defect to exact source line (SEC-002)', () => {
      const vulnerableSql = `import express from 'express';
const router = express.Router();

router.get('/user', async (req, res) => {
  const userId = req.query.id;
  const sql = "SELECT * FROM users WHERE id = " + userId;
  const result = await db.query(sql);
  res.json(result);
});`;

      const findings = runStaticAnalysis(vulnerableSql, 'routes/users.ts', 'typescript', 'rev-vuln-1');
      const sqlFinding = findings.find((f) => f.ruleId === 'SEC-002');

      expect(sqlFinding).toBeDefined();
      expect(sqlFinding?.startLine).toBe(6);
      expect(sqlFinding?.endLine).toBe(6);
      expect(sqlFinding?.codeExcerpt).toContain('SELECT * FROM users WHERE id =');
      expect(sqlFinding?.detectionSource).toBe('STATIC_ANALYZER');
      expect(sqlFinding?.validationStatus).toBe('STATICALLY_CONFIRMED');
      expect(sqlFinding?.severity).toBe('CRITICAL');
    });

    it('should detect hardcoded credential and provide actionable suggested patch (SEC-001)', () => {
      const secretCode = `export const config = {
  service: 'aws-s3',
  accessKey: 'AKIAIOSFODNN7EXAMPLE',
  region: 'us-east-1'
};`;

      const findings = runStaticAnalysis(secretCode, 'config.ts', 'typescript', 'rev-vuln-2');
      const secretFinding = findings.find((f) => f.ruleId === 'SEC-001');

      expect(secretFinding).toBeDefined();
      expect(secretFinding?.startLine).toBe(3);
      expect(secretFinding?.codeExcerpt).toContain('AKIAIOSFODNN7EXAMPLE');
      expect(secretFinding?.suggestedPatch).toBeDefined();
      expect(secretFinding?.suggestedPatch).toContain('process.env.SERVICE_API_KEY');
    });

    it('should detect accidental assignment inside condition and suggest strict equality (BUG-001)', () => {
      const bugCode = `function checkAdmin(role: string) {
  if (role = 'superuser') {
    return true;
  }
  return false;
}`;

      const findings = runStaticAnalysis(bugCode, 'auth.ts', 'typescript', 'rev-vuln-3');
      const bugFinding = findings.find((f) => f.ruleId === 'BUG-001');

      expect(bugFinding).toBeDefined();
      expect(bugFinding?.startLine).toBe(2);
      expect(bugFinding?.suggestedPatch).toContain('role === \'superuser\'');
    });

    it('should identify off-by-one array traversal boundary (BUG-005)', () => {
      const loopCode = `export function getNames(list: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i <= list.length; i++) {
    result.push(list[i]);
  }
  return result;
}`;

      const findings = runStaticAnalysis(loopCode, 'list.ts', 'typescript', 'rev-vuln-4');
      const loopFinding = findings.find((f) => f.ruleId === 'BUG-005');

      expect(loopFinding).toBeDefined();
      expect(loopFinding?.startLine).toBe(3);
      expect(loopFinding?.suggestedPatch).toContain('i < list.length');
    });
  });

  describe('Deduplication & Dual-Confirmation Logic', () => {
    it('should merge static and AI findings on the same line and category into a single confirmed finding', () => {
      const staticFinding: ReviewFinding = {
        id: 'static-sec-002-1',
        reviewId: 'rev-merge-1',
        title: 'Potential SQL Injection via Unparameterized Query',
        category: 'SECURITY',
        severity: 'CRITICAL',
        confidence: 0.92,
        filePath: 'src/api.ts',
        startLine: 15,
        endLine: 15,
        codeExcerpt: 'const sql = "SELECT * FROM orders WHERE id = " + req.query.id;',
        description: 'Dynamic user input concatenated directly into raw query',
        impact: 'Exposes database to SQL injection attacks',
        evidence: ['Unparameterized query detected'],
        recommendedFix: 'Use prepared statement',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: true,
        relatedFindingIds: [],
        createdAt: new Date().toISOString(),
      };

      const aiFinding: ReviewFinding = {
        id: 'ai-rev-merge-1-1',
        reviewId: 'rev-merge-1',
        title: 'SQL Injection in /orders endpoint',
        category: 'SECURITY',
        severity: 'CRITICAL',
        confidence: 0.96,
        filePath: 'src/api.ts',
        startLine: 15,
        endLine: 16,
        codeExcerpt: 'const sql = "SELECT * FROM orders WHERE id = " + req.query.id;',
        description: 'Tainted user input req.query.id leads to SQLi',
        impact: 'Data exfiltration possible by malicious actor',
        evidence: ['req.query.id passed unsanitized into SQL string'],
        recommendedFix: 'Replace with parameter placeholder $1',
        suggestedPatch: '--- a/src/api.ts\n+++ b/src/api.ts\n@@ -15,1 +15,1 @@\n-const sql = "SELECT * FROM orders WHERE id = " + req.query.id;\n+const sql = "SELECT * FROM orders WHERE id = $1";',
        detectionSource: 'AI_ANALYSIS',
        validationStatus: 'UNVERIFIED',
        introducedByChange: true,
        relatedFindingIds: [],
        createdAt: new Date().toISOString(),
      };

      const merged = deduplicateFindings([staticFinding], [aiFinding]);

      // Exactly 1 deduplicated finding
      expect(merged).toHaveLength(1);
      const unified = merged[0];

      // Dual-confirmation elevates confidence
      expect(unified.confidence).toBeGreaterThanOrEqual(0.95);
      expect(unified.validationStatus).toBe('STATICALLY_CONFIRMED');
      expect(unified.detectionSource).toBe('STATIC_ANALYZER');
      expect(unified.relatedFindingIds).toContain(aiFinding.id);

      // AI suggested patch is preserved
      expect(unified.suggestedPatch).toContain('SELECT * FROM orders WHERE id = $1');

      // Evidence combined
      expect(unified.evidence).toContain('Unparameterized query detected');
      expect(unified.evidence).toContain('req.query.id passed unsanitized into SQL string');
    });

    it('should keep disjoint AI findings as UNVERIFIED AI suggestions without fake confirmation', () => {
      const staticFinding: ReviewFinding = {
        id: 'static-bug-1',
        reviewId: 'rev-distinct-1',
        title: 'Accidental Assignment',
        category: 'BUG',
        severity: 'HIGH',
        confidence: 0.9,
        filePath: 'src/auth.ts',
        startLine: 5,
        endLine: 5,
        codeExcerpt: 'if (x = 1)',
        description: 'Assignment inside condition',
        impact: 'Always true',
        evidence: ['Line 5 assignment'],
        recommendedFix: 'Use ===',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: true,
        relatedFindingIds: [],
        createdAt: new Date().toISOString(),
      };

      const aiFinding: ReviewFinding = {
        id: 'ai-distinct-1',
        reviewId: 'rev-distinct-1',
        title: 'Missing Rate Limiting on Login',
        category: 'SECURITY',
        severity: 'MEDIUM',
        confidence: 0.8,
        filePath: 'src/auth.ts',
        startLine: 42,
        endLine: 55,
        codeExcerpt: 'export async function login() {}',
        description: 'Login endpoint does not implement IP rate limiting',
        impact: 'Brute force risk',
        evidence: ['No express-rate-limit middleware applied'],
        recommendedFix: 'Apply rate limiter middleware',
        suggestedPatch: null,
        detectionSource: 'AI_ANALYSIS',
        validationStatus: 'UNVERIFIED',
        introducedByChange: true,
        relatedFindingIds: [],
        createdAt: new Date().toISOString(),
      };

      const merged = deduplicateFindings([staticFinding], [aiFinding]);

      expect(merged).toHaveLength(2);

      const staticResult = merged.find((f) => f.id === staticFinding.id);
      expect(staticResult?.validationStatus).toBe('STATICALLY_CONFIRMED');
      expect(staticResult?.detectionSource).toBe('STATIC_ANALYZER');

      const aiResult = merged.find((f) => f.id === aiFinding.id);
      expect(aiResult?.validationStatus).toBe('UNVERIFIED');
      expect(aiResult?.detectionSource).toBe('AI_ANALYSIS');
    });
  });

  describe('Git Diff Parsing and Line Scope Tracking', () => {
    it('should distinguish introduced changes from pre-existing code', () => {
      const diff = `diff --git a/src/calc.ts b/src/calc.ts
--- a/src/calc.ts
+++ b/src/calc.ts
@@ -10,3 +10,4 @@
 export function compute(n: number) {
-  return n * 2;
+  const secret = 'AKIAIOSFODNN7EXAMPLE';
+  return n * 2;
 }`;

      const parsed = parseGitDiff(diff);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].changedLines).toContain(11); // line 11 was added

      const fullContent = parsed[0].fullNewContent;
      const findings = runStaticAnalysis(fullContent, 'src/calc.ts', 'typescript', 'rev-diff', parsed[0].changedLines);

      expect(findings.length).toBeGreaterThan(0);
      const secretFinding = findings.find((f) => f.ruleId === 'SEC-001');
      expect(secretFinding).toBeDefined();
      expect(secretFinding?.introducedByChange).toBe(true);
    });
  });
});
