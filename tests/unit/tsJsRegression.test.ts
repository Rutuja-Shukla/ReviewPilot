import { describe, it, expect, vi } from 'vitest';
import {
  detectLanguage,
  detectLanguageFromFilename,
  detectLanguageFromDiff,
  detectLanguageFromContent,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
} from '../../src/utils/languageDetector.js';
import { runStaticAnalysis } from '../../server/analyzers/staticAnalyzer.js';
import { parseGitDiff } from '../../server/analyzers/diffParser.js';
import { deduplicateFindings, createAndExecuteReview } from '../../server/services/reviewService.js';
import { reviewRepository } from '../../server/repositories/reviewRepository.js';
import { validateTestCodeSafety, executeTestInSandbox, CURRENT_SANDBOX_CAPABILITY } from '../../server/sandbox/sandboxAdapter.js';
import { ReviewFinding, Review } from '../../src/types/review.js';

// Mock external AI calls for deterministic unit test execution
vi.mock('../../server/ai/geminiReviewService.js', () => ({
  analyzeCodeWithGemini: vi.fn().mockResolvedValue({
    summary: 'Mocked Gemini Review Summary for Unit Tests',
    findings: [],
    unresolvedQuestions: [],
    limitations: [],
  }),
}));

describe('ReviewPilot TS/JS Baseline Regression Suite', () => {
  // 1. Language Detection & Selection
  describe('Centralized Language Detection & Validation', () => {
    it('should correctly identify all supported languages', () => {
      expect(SUPPORTED_LANGUAGES).toEqual(['typescript', 'javascript', 'python', 'java', 'csharp']);
      expect(isSupportedLanguage('typescript')).toBe(true);
      expect(isSupportedLanguage('javascript')).toBe(true);
      expect(isSupportedLanguage('python')).toBe(true);
      expect(isSupportedLanguage('java')).toBe(true);
      expect(isSupportedLanguage('csharp')).toBe(true);
      expect(isSupportedLanguage('ruby')).toBe(false);
      expect(isSupportedLanguage('golang')).toBe(false);
      expect(isSupportedLanguage('')).toBe(false);
      expect(isSupportedLanguage(null)).toBe(false);
    });

    it('should detect TypeScript and JavaScript by file extensions', () => {
      expect(detectLanguageFromFilename('src/index.ts')).toBe('typescript');
      expect(detectLanguageFromFilename('components/App.tsx')).toBe('typescript');
      expect(detectLanguageFromFilename('utils/math.mts')).toBe('typescript');
      expect(detectLanguageFromFilename('server.js')).toBe('javascript');
      expect(detectLanguageFromFilename('src/main.jsx')).toBe('javascript');
      expect(detectLanguageFromFilename('lib/module.mjs')).toBe('javascript');
      expect(detectLanguageFromFilename('legacy.cjs')).toBe('javascript');
      expect(detectLanguageFromFilename('script.py')).toBe('python');
      expect(detectLanguageFromFilename('Main.java')).toBe('java');
      expect(detectLanguageFromFilename('Program.cs')).toBe('csharp');
      expect(detectLanguageFromFilename('readme.md')).toBeNull();
      expect(detectLanguageFromFilename('noextension')).toBeNull();
    });

    it('should detect language from unified git diff headers', () => {
      const tsDiff = `diff --git a/src/service.ts b/src/service.ts
--- a/src/service.ts
+++ b/src/service.ts
@@ -1,3 +1,4 @@
+const x: number = 10;`;
      expect(detectLanguageFromDiff(tsDiff)).toBe('typescript');

      const jsDiff = `--- a/lib/server.js
+++ b/lib/server.js
@@ -10,2 +10,3 @@`;
      expect(detectLanguageFromDiff(jsDiff)).toBe('javascript');

      expect(detectLanguageFromDiff('not a diff text')).toBeNull();
    });

    it('should detect language from source content heuristics', () => {
      const tsContent = `interface UserProfile {
  id: string;
  name: string;
}
export function format(u: UserProfile): string {
  return u.name;
}`;
      expect(detectLanguageFromContent(tsContent)).toBe('typescript');

      const jsShebang = `#!/usr/bin/env node
const fs = require('fs');
console.log('running node');`;
      expect(detectLanguageFromContent(jsShebang)).toBe('typescript');

      const jsContent = `function calculateTotal(price, tax) {
  const result = price * (1 + tax);
  return result;
}
module.exports = calculateTotal;`;
      expect(detectLanguageFromContent(jsContent)).toBe('javascript');
    });

    it('should prioritize filename over heuristics in unified detectLanguage', () => {
      const detected = detectLanguage({
        fileName: 'handler.js',
        code: 'const x = 1;',
      });
      expect(detected).toBe('javascript');
    });
  });

  // 2. Input Validation, Empty Input & Unsupported Languages
  describe('Input Validation & Error Handling', () => {
    it('should reject empty code strings', async () => {
      await expect(
        createAndExecuteReview({
          language: 'typescript',
          profile: 'COMPREHENSIVE',
          inputType: 'snippet',
          code: '',
        })
      ).rejects.toThrow('Source code or diff is required');
    });

    it('should reject whitespace-only code strings', async () => {
      await expect(
        createAndExecuteReview({
          language: 'typescript',
          profile: 'COMPREHENSIVE',
          inputType: 'snippet',
          code: '   \n\t  \n  ',
        })
      ).rejects.toThrow('Source code or diff is required');
    });

    it('should reject unsupported languages', async () => {
      await expect(
        createAndExecuteReview({
          language: 'ruby' as any,
          profile: 'COMPREHENSIVE',
          inputType: 'snippet',
          code: 'puts "Hello"',
        })
      ).rejects.toThrow('Unsupported language: ruby');
    });

    it('should reject inputs exceeding maximum byte size limit', async () => {
      const settings = reviewRepository.getSettings();
      const oversized = 'a'.repeat(settings.maxInputSizeBytes + 10);
      await expect(
        createAndExecuteReview({
          language: 'typescript',
          profile: 'COMPREHENSIVE',
          inputType: 'snippet',
          code: oversized,
        })
      ).rejects.toThrow(/exceeds limit/);
    });

    it('should sanitize path traversal attempts in fileName', async () => {
      const review = await createAndExecuteReview({
        language: 'typescript',
        profile: 'COMPREHENSIVE',
        inputType: 'snippet',
        fileName: '../../../etc/passwd',
        code: 'export const status = "ok";',
      });

      expect(review.files[0].path).not.toContain('..');
      expect(review.files[0].path).toBe('etc/passwd');
    });
  });

  // 3. Static Analysis & Line-Number Mapping for TypeScript
  describe('TypeScript Static Analysis & Defect Mapping', () => {
    it('should detect SQL injection on exact line in TypeScript', () => {
      const tsCode = `import { db } from './db';
export async function getOrder(req: any) {
  const orderId = req.query.id;
  const sql = "SELECT * FROM orders WHERE id = " + orderId;
  return await db.query(sql);
}`;
      const findings = runStaticAnalysis(tsCode, 'src/orders.ts', 'typescript', 'rev-ts-sqli');
      const finding = findings.find((f) => f.ruleId === 'SEC-002');

      expect(finding).toBeDefined();
      expect(finding?.startLine).toBe(4);
      expect(finding?.endLine).toBe(4);
      expect(finding?.category).toBe('SECURITY');
      expect(finding?.severity).toBe('CRITICAL');
      expect(finding?.detectionSource).toBe('STATIC_ANALYZER');
      expect(finding?.validationStatus).toBe('STATICALLY_CONFIRMED');
    });

    it('should detect accidental conditional assignment with suggested patch in TypeScript', () => {
      const tsCode = `export function isAdmin(user: { role: string }) {
  if (user.role = 'admin') {
    return true;
  }
  return false;
}`;
      const findings = runStaticAnalysis(tsCode, 'src/auth.ts', 'typescript', 'rev-ts-assign');
      const finding = findings.find((f) => f.ruleId === 'BUG-001');

      expect(finding).toBeDefined();
      expect(finding?.startLine).toBe(2);
      expect(finding?.category).toBe('BUG');
      expect(finding?.severity).toBe('HIGH');
      expect(finding?.suggestedPatch).toContain('user.role === \'admin\'');
    });

    it('should detect off-by-one boundary traversal in TypeScript', () => {
      const tsCode = `export function processItems(items: string[]) {
  for (let i = 0; i <= items.length; i++) {
    console.log(items[i]);
  }
}`;
      const findings = runStaticAnalysis(tsCode, 'src/loop.ts', 'typescript', 'rev-ts-loop');
      const finding = findings.find((f) => f.ruleId === 'BUG-005');

      expect(finding).toBeDefined();
      expect(finding?.startLine).toBe(2);
      expect(finding?.category).toBe('BUG');
      expect(finding?.severity).toBe('HIGH');
      expect(finding?.suggestedPatch).toContain('i < items.length');
    });

    it('should produce 0 false positives on clean idiomatic TypeScript code', () => {
      const cleanTs = `export interface Item {
  id: string;
  count: number;
}

export function sumItems(items: Item[]): number {
  if (!items || items.length === 0) return 0;
  return items.reduce((acc, item) => acc + item.count, 0);
}

export async function fetchItem(db: any, id: string): Promise<Item | null> {
  const result = await db.query('SELECT id, count FROM items WHERE id = $1', [id]);
  return result.rows?.[0] ?? null;
}`;
      const findings = runStaticAnalysis(cleanTs, 'src/clean.ts', 'typescript', 'rev-ts-clean');
      expect(findings).toHaveLength(0);
    });
  });

  // 4. Static Analysis & Defect Mapping for JavaScript
  describe('JavaScript Static Analysis & Defect Mapping', () => {
    it('should detect unsafe dynamic code execution in JavaScript (SEC-003)', () => {
      const jsCode = `function runScript(req) {
  const userFormula = req.body.formula;
  return eval(userFormula);
}`;
      const findings = runStaticAnalysis(jsCode, 'calculator.js', 'javascript', 'rev-js-eval');
      const finding = findings.find((f) => f.ruleId === 'SEC-003');

      expect(finding).toBeDefined();
      expect(finding?.startLine).toBe(3);
      expect(finding?.category).toBe('SECURITY');
      expect(finding?.severity).toBe('CRITICAL');
    });

    it('should detect insecure CORS wildcard origin with credentials in JavaScript (SEC-007)', () => {
      const jsCode = `const express = require('express');
const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});`;
      const findings = runStaticAnalysis(jsCode, 'server.js', 'javascript', 'rev-js-cors');
      const finding = findings.find((f) => f.ruleId === 'SEC-007');

      expect(finding).toBeDefined();
      expect(finding?.startLine).toBe(4);
      expect(finding?.category).toBe('SECURITY');
      expect(finding?.severity).toBe('HIGH');
    });

    it('should produce 0 false positives on clean JavaScript code', () => {
      const cleanJs = `const path = require('path');

function getSafeFilePath(baseDir, fileName) {
  const safeName = path.basename(fileName);
  return path.join(baseDir, safeName);
}

module.exports = { getSafeFilePath };`;
      const findings = runStaticAnalysis(cleanJs, 'utils.js', 'javascript', 'rev-js-clean');
      expect(findings).toHaveLength(0);
    });
  });

  // 5. Unified Diff Parsing and Scope Mapping
  describe('Git Diff Parsing and Scope Tracking for TS/JS', () => {
    it('should accurately isolate changed lines in a TypeScript diff', () => {
      const diff = `diff --git a/src/api.ts b/src/api.ts
--- a/src/api.ts
+++ b/src/api.ts
@@ -20,4 +20,5 @@
  export function checkAuth(token: string) {
+   const secret = 'AKIAIOSFODNN7EXAMPLE';
    return Boolean(token);
  }`;
      const parsed = parseGitDiff(diff);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].newPath).toBe('src/api.ts');
      expect(parsed[0].changedLines).toContain(21);

      const findings = runStaticAnalysis(
        parsed[0].fullNewContent,
        parsed[0].newPath,
        'typescript',
        'rev-diff-ts',
        parsed[0].changedLines
      );
      const secretFinding = findings.find((f) => f.ruleId === 'SEC-001');
      expect(secretFinding).toBeDefined();
      expect(secretFinding?.introducedByChange).toBe(true);
    });

    it('should correctly flag pre-existing issues as introducedByChange=false when outside diff scope', () => {
      const preExistingContent = `const secret = 'AKIAIOSFODNN7EXAMPLE';
export function calculate(a: number, b: number) {
  return a + b;
}`;
      // Changed lines only line 3
      const findings = runStaticAnalysis(preExistingContent, 'src/calc.ts', 'typescript', 'rev-diff-pre', [3]);
      const secretFinding = findings.find((f) => f.ruleId === 'SEC-001');

      expect(secretFinding).toBeDefined();
      expect(secretFinding?.startLine).toBe(1);
      expect(secretFinding?.introducedByChange).toBe(false);
    });
  });

  // 6. Test Generation & AST Syntax Validation
  describe('Test Generation Safety & esbuild AST Validation', () => {
    it('should validate valid TypeScript test code via esbuild syntax check', () => {
      const tsTestCode = `import { describe, it, expect } from 'vitest';
describe('MathService', () => {
  it('multiplies numbers accurately', () => {
    expect(2 * 3).toBe(6);
  });
});`;
      const safety = validateTestCodeSafety(tsTestCode, 'typescript');
      expect(safety.isSafe).toBe(true);
      expect(safety.syntaxValid).toBe(true);
      expect(safety.errors).toHaveLength(0);
    });

    it('should validate valid JavaScript test code via esbuild syntax check', () => {
      const jsTestCode = `import { describe, it, expect } from 'vitest';
describe('StringHelper', () => {
  it('trims whitespace', () => {
    expect('  hello  '.trim()).toBe('hello');
  });
});`;
      const safety = validateTestCodeSafety(jsTestCode, 'javascript');
      expect(safety.isSafe).toBe(true);
      expect(safety.syntaxValid).toBe(true);
      expect(safety.errors).toHaveLength(0);
    });

    it('should catch syntax errors in malformed TypeScript test code', () => {
      const brokenTs = `describe('broken syntax' () => {
  let x: number = ;
});`;
      const safety = validateTestCodeSafety(brokenTs, 'typescript');
      expect(safety.syntaxValid).toBe(false);
      expect(safety.errors.length).toBeGreaterThan(0);
    });

    it('should enforce execution restriction policy and never execute untrusted code', async () => {
      expect(CURRENT_SANDBOX_CAPABILITY.available).toBe(false);
      expect(CURRENT_SANDBOX_CAPABILITY.executionDisabled).toBe(true);

      const execution = await executeTestInSandbox({
        id: 'test-ts-1',
        findingId: 'f-1',
        reviewId: 'r-1',
        framework: 'vitest',
        language: 'typescript',
        targetFunction: 'handleAuth',
        testCode: `import { describe, it, expect } from 'vitest';
describe('test', () => {
  it('passes AST check', () => {
    expect(true).toBe(true);
  });
});`,
        validationStatus: 'SYNTAX_VALID',
        testType: 'DEFECT_REPRODUCTION',
        createdAt: new Date().toISOString(),
      });

      expect(execution.status).toBe('SANDBOX_RESTRICTED');
      expect(execution.stdout).toContain('SERVER-SIDE EXECUTION DISABLED BY SECURITY POLICY');
      expect(execution.sandboxInfo.isIsolated).toBe(false);
    });
  });

  // 7. Review Lifecycle, Repository & Feedback State
  describe('Review Lifecycle & Repository Management', () => {
    it('should create, retrieve, update feedback, and delete a review', async () => {
      const review = await createAndExecuteReview({
        language: 'typescript',
        profile: 'BUG_DETECTION',
        inputType: 'snippet',
        code: `export function divide(a: number, b: number) {
  if (b = 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}`,
      });

      expect(review.id).toBeDefined();
      expect(review.status).toBe('COMPLETED');
      expect(review.findings.length).toBeGreaterThan(0);

      // Verify retrieval
      const retrieved = reviewRepository.getReviewById(review.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(review.id);

      // Verify finding feedback
      const firstFinding = review.findings[0];
      const updated = reviewRepository.updateFinding(review.id, firstFinding.id, {
        validationStatus: 'DISMISSED',
        developerFeedback: {
          dismissed: true,
          reason: 'INTENDED_BEHAVIOR',
          comment: 'Handled in caller',
          updatedAt: new Date().toISOString(),
        },
      });

      expect(updated?.validationStatus).toBe('DISMISSED');
      expect(updated?.developerFeedback?.dismissed).toBe(true);

      // Verify stats updated
      const afterUpdate = reviewRepository.getReviewById(review.id);
      expect(afterUpdate?.stats.dismissedCount).toBe(1);

      // Verify deletion
      const deleted = reviewRepository.deleteReview(review.id);
      expect(deleted).toBe(true);
      expect(reviewRepository.getReviewById(review.id)).toBeUndefined();
    });
  });
});
