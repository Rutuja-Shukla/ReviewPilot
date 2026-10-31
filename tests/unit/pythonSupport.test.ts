import { describe, it, expect, vi } from 'vitest';
import {
  languageAdapterRegistry,
  PythonAdapter,
  normalizeRuffOutput,
  checkRuffAvailable,
  runPythonStaticAnalysis,
} from '../../server/adapters/languages/index.js';
import { detectLanguage, detectLanguageFromFilename, detectLanguageFromContent } from '../../src/utils/languageDetector.js';
import { validateTestCodeSafety, executeTestInSandbox } from '../../server/sandbox/sandboxAdapter.js';
import { createAndExecuteReview } from '../../server/services/reviewService.js';
import { ReviewFinding } from '../../src/types/review.js';

// Mock external AI calls for deterministic pipeline testing
vi.mock('../../server/ai/geminiReviewService.js', () => ({
  analyzeCodeWithGemini: vi.fn().mockResolvedValue({
    summary: 'Automated test AI analysis of Python code.',
    findings: [
      {
        id: 'ai-mock-py-1',
        reviewId: 'rev-test',
        title: 'Unchecked Input in Division Operation',
        category: 'BUG',
        severity: 'MEDIUM',
        confidence: 0.88,
        filePath: 'app.py',
        startLine: 2,
        endLine: 2,
        codeExcerpt: 'return a / b',
        description: 'Parameter b may be zero causing ZeroDivisionError.',
        impact: 'Uncaught ZeroDivisionError crashes worker thread.',
        evidence: ['Line 2: arithmetic division without zero check'],
        recommendedFix: 'Validate that b != 0 before division.',
        suggestedPatch: null,
        detectionSource: 'AI_ANALYSIS',
        validationStatus: 'UNVERIFIED',
        introducedByChange: true,
        relatedFindingIds: [],
        createdAt: new Date().toISOString(),
      },
    ],
    unresolvedQuestions: [],
    limitations: [],
  }),
}));

describe('ReviewPilot Phase 1: Production-Quality Python Support', () => {
  const pythonAdapter = new PythonAdapter();

  describe('1. Python Adapter Architecture & Capabilities', () => {
    it('is registered in the global languageAdapterRegistry', () => {
      expect(languageAdapterRegistry.hasAdapter('python')).toBe(true);
      const adapter = languageAdapterRegistry.getAdapter('python');
      expect(adapter).toBeInstanceOf(PythonAdapter);
      expect(adapter.displayName).toBe('Python');
      expect(adapter.fileExtensions).toEqual(['.py', '.pyw']);
      expect(adapter.defaultFileName).toBe('app.py');
      expect(adapter.testFramework).toBe('pytest');
      expect(adapter.commentPrefix).toBe('#');
    });

    it('reports explicit capability and dependency status honestly', () => {
      const caps = pythonAdapter.getCapabilities();
      expect(caps.language).toBe('python');
      expect(caps.displayName).toBe('Python');
      expect(caps.syntaxValidation.available).toBe(true);
      expect(caps.syntaxValidation.offline).toBe(true);
      expect(caps.staticAnalysis.available).toBe(true);
      expect(caps.testGeneration.targetFramework).toBe('pytest');
      expect(caps.executionSandbox.available).toBe(false);
      expect(caps.executionSandbox.statusMessage).toContain('Server-side execution disabled by security policy');

      // Check toolchain statuses
      const ruffTool = caps.tools.find((t) => t.name === 'Ruff');
      expect(ruffTool).toBeDefined();
      expect(ruffTool?.status).toBe('FALLBACK');

      const lezerTool = caps.tools.find((t) => t.name === '@lezer/python');
      expect(lezerTool?.status).toBe('ACTIVE');

      const pyRuntime = caps.tools.find((t) => t.name === 'Python 3');
      expect(pyRuntime?.status).toBe('ACTIVE');
    });

    it('provides targeted architectural and security context for AI reviews', () => {
      const context = pythonAdapter.getLanguageContext();
      expect(context).toContain('PYTHON ARCHITECTURAL & SECURITY CONTEXT');
      expect(context).toContain('shell=True');
      expect(context).toContain('mutable default');
      expect(context).toContain('pytest');
    });
  });

  describe('2. Python Source and Diff Validation', () => {
    it('validates clean Python code successfully', () => {
      const code = `
def add(a: int, b: int) -> int:
    """Adds two integers."""
    return a + b
`;
      const res = pythonAdapter.validateSource(code, 'math_utils.py');
      expect(res.valid).toBe(true);
      expect(res.errors).toEqual([]);
    });

    it('rejects empty or whitespace-only Python source', () => {
      const res = pythonAdapter.validateSource('   \n\t  ', 'empty.py');
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('Python source code cannot be empty');
    });

    it('warns on non-standard Python file extensions', () => {
      const code = 'x = 1\n';
      const res = pythonAdapter.validateSource(code, 'script.txt');
      expect(res.valid).toBe(true);
      expect(res.warnings?.some((w) => w.includes('standard Python extension'))).toBe(true);
    });

    it('validates valid unified diff format for Python changes', () => {
      const diff = `--- a/service.py
+++ b/service.py
@@ -1,3 +1,3 @@
-def foo(): pass
+def foo(): return 42
`;
      const res = pythonAdapter.validateDiff!(diff);
      expect(res.valid).toBe(true);
      expect(res.errors).toEqual([]);
    });

    it('rejects invalid diff structures', () => {
      const invalidDiff = 'This is just some random text without patch headers';
      const res = pythonAdapter.validateDiff!(invalidDiff);
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('Input does not conform to unified git diff syntax');
    });
  });

  describe('3. Language Detection for Python', () => {
    it('detects Python from file extension (.py, .pyw)', () => {
      expect(detectLanguageFromFilename('main.py')).toBe('python');
      expect(detectLanguageFromFilename('src/api/routes.py')).toBe('python');
      expect(detectLanguageFromFilename('gui_launcher.pyw')).toBe('python');
    });

    it('detects Python from shebang line', () => {
      const shebangScript = '#!/usr/bin/env python3\nimport sys\nprint("Hello")';
      expect(detectLanguageFromContent(shebangScript)).toBe('python');
    });

    it('detects Python from idiomatic keywords and syntax', () => {
      const code = `
from typing import List, Optional
import os

def process_items(items: List[str]) -> Optional[int]:
    if __name__ == '__main__':
        pass
`;
      expect(detectLanguageFromContent(code)).toBe('python');
    });

    it('detects Python from unified git diff headers', () => {
      const diff = `diff --git a/backend/worker.py b/backend/worker.py
--- a/backend/worker.py
+++ b/backend/worker.py
@@ -10,3 +10,4 @@
`;
      expect(detectLanguage({ diffText: diff })).toBe('python');
    });
  });

  describe('4. Offline AST Syntax Parsing (@lezer/python)', () => {
    it('accurately reports line and column for Python syntax errors', () => {
      const malformedPy = `def calculate(a, b:
    total = a + b
    return total
`;
      const result = pythonAdapter.validateSyntax(malformedPy);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/Line \d+, Col \d+: Python syntax error/);
    });

    it('warns when test assertions are absent in a Python test file', () => {
      const noAssertCode = `
def test_something():
    x = 10
    y = 20
`;
      const result = pythonAdapter.validateSyntax(noAssertCode);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'Python test function does not include an assertion statement'
      );
    });
  });

  describe('5. Ruff Result Normalization & Missing-Tool Behavior', () => {
    it('reports missing Ruff tool honestly without throwing or fabricating results', async () => {
      const tool = await checkRuffAvailable();
      // On this host, ruff is not installed in PATH
      expect(typeof tool.available).toBe('boolean');
      expect(tool.available).toBe(false);
    });

    it('normalizes valid Ruff JSON output with security, bug, and quality findings', () => {
      const mockRuffJson = JSON.stringify([
        {
          code: 'S602',
          message: 'subprocess call with shell=True identified, security issue.',
          location: { row: 5, column: 12 },
          end_location: { row: 5, column: 45 },
          filename: 'views.py',
          url: 'https://docs.astral.sh/ruff/rules/subprocess-popen-with-shell-equals-true',
        },
        {
          code: 'B006',
          message: 'Do not use mutable data structures for argument defaults',
          location: { row: 8, column: 1 },
          end_location: { row: 8, column: 30 },
          filename: 'views.py',
          url: 'https://docs.astral.sh/ruff/rules/mutable-argument-default',
        },
        {
          code: 'F401',
          message: '`os` imported but unused',
          location: { row: 1, column: 8 },
          end_location: { row: 1, column: 10 },
          filename: 'views.py',
          fix: {
            message: 'Remove unused import: `os`',
            edits: [
              {
                content: '',
                location: { row: 1, column: 1 },
                end_location: { row: 2, column: 1 },
              },
            ],
          },
        },
      ]);

      const sourceCode = `import os\n\ndef run():\n    pass\n    subprocess.Popen(cmd, shell=True)\n\ndef fn(x=[]):\n    pass\n`;
      const findings = normalizeRuffOutput(mockRuffJson, 'views.py', 'rev-test-1', sourceCode);

      expect(findings.length).toBe(3);

      // Security finding
      const s602 = findings.find((f) => f.ruleId === 'RUFF-S602');
      expect(s602).toBeDefined();
      expect(s602?.category).toBe('SECURITY');
      expect(s602?.severity).toBe('CRITICAL');
      expect(s602?.startLine).toBe(5);
      expect(s602?.detectionSource).toBe('STATIC_ANALYZER');

      // Bug finding
      const b006 = findings.find((f) => f.ruleId === 'RUFF-B006');
      expect(b006?.category).toBe('BUG');
      expect(b006?.severity).toBe('HIGH');
      expect(b006?.startLine).toBe(8);

      // Code quality finding with suggested patch
      const f401 = findings.find((f) => f.ruleId === 'RUFF-F401');
      expect(f401?.category).toBe('CODE_QUALITY');
      expect(f401?.severity).toBe('LOW');
      expect(f401?.startLine).toBe(1);
      expect(f401?.suggestedPatch).toContain('--- a/views.py');
    });

    it('handles empty, invalid, or malformed Ruff outputs safely without throwing', () => {
      expect(normalizeRuffOutput('', 'test.py', 'rev-1')).toEqual([]);
      expect(normalizeRuffOutput('[]', 'test.py', 'rev-1')).toEqual([]);
      expect(normalizeRuffOutput('not-valid-json', 'test.py', 'rev-1')).toEqual([]);
      expect(normalizeRuffOutput({ not: 'an array' }, 'test.py', 'rev-1')).toEqual([]);
      expect(normalizeRuffOutput([null, {}], 'test.py', 'rev-1')).toEqual([]);
    });
  });

  describe('6. Python AST Static Analyzer Rules', () => {
    it('detects subprocess command injection with shell=True (PY-SEC-001)', () => {
      const code = `
import subprocess
def ping(host: str):
    subprocess.check_output(f"ping -c 1 {host}", shell=True)
`;
      const findings = runPythonStaticAnalysis(code, { filePath: 'app.py', reviewId: 'r1' });
      const secFinding = findings.find((f) => f.ruleId === 'PY-SEC-001');
      expect(secFinding).toBeDefined();
      expect(secFinding?.severity).toBe('CRITICAL');
      expect(secFinding?.category).toBe('SECURITY');
      expect(secFinding?.startLine).toBe(4);
      expect(secFinding?.recommendedFix).toContain('explicit list of strings');
    });

    it('detects SQL injection via formatted f-string query (PY-SEC-002)', () => {
      const code = `
def get_user(cursor, username: str):
    cursor.execute(f"SELECT * FROM users WHERE username = '{username}'")
`;
      const findings = runPythonStaticAnalysis(code, { filePath: 'db.py', reviewId: 'r1' });
      const sqli = findings.find((f) => f.ruleId === 'PY-SEC-002');
      expect(sqli).toBeDefined();
      expect(sqli?.severity).toBe('CRITICAL');
      expect(sqli?.category).toBe('SECURITY');
      expect(sqli?.startLine).toBe(3);
    });

    it('detects mutable default arguments in functions (PY-BUG-001)', () => {
      const code = `
def append_item(val: str, bucket: list = []):
    bucket.append(val)
    return bucket
`;
      const findings = runPythonStaticAnalysis(code, { filePath: 'utils.py', reviewId: 'r1' });
      const mutableFinding = findings.find((f) => f.ruleId === 'PY-BUG-001');
      expect(mutableFinding).toBeDefined();
      expect(mutableFinding?.category).toBe('BUG');
      expect(mutableFinding?.severity).toBe('HIGH');
      expect(mutableFinding?.suggestedPatch).toContain('bucket=None');
      expect(mutableFinding?.suggestedPatch).toContain('if bucket is None:');
    });

    it('detects identity comparison with string or numeric literals (PY-BUG-002)', () => {
      const code = `
def check_role(role: str):
    if role is "admin":
        grant_access()
`;
      const findings = runPythonStaticAnalysis(code, { filePath: 'auth.py', reviewId: 'r1' });
      const identityFinding = findings.find((f) => f.ruleId === 'PY-BUG-002');
      expect(identityFinding).toBeDefined();
      expect(identityFinding?.severity).toBe('HIGH');
      expect(identityFinding?.suggestedPatch).toContain('role == "admin"');
    });

    it('detects bare except clauses and swallowed exceptions (PY-BUG-003 & PY-BUG-004)', () => {
      const code = `
def risky_operation():
    try:
        do_work()
    except:
        pass
`;
      const findings = runPythonStaticAnalysis(code, { filePath: 'worker.py', reviewId: 'r1' });
      expect(findings.some((f) => f.ruleId === 'PY-BUG-003')).toBe(true);
      expect(findings.some((f) => f.ruleId === 'PY-BUG-004')).toBe(true);
    });

    it('detects unclosed file resources opened without context managers (PY-RES-001)', () => {
      const code = `
def load_data(file_path: str):
    f = open(file_path, 'r')
    return f.read()
`;
      const findings = runPythonStaticAnalysis(code, { filePath: 'io.py', reviewId: 'r1' });
      const resFinding = findings.find((f) => f.ruleId === 'PY-RES-001');
      expect(resFinding).toBeDefined();
      expect(resFinding?.title).toContain('File Resource Opened Without "with" Context Manager');
    });

    it('detects wildcard imports (PY-QUAL-001)', () => {
      const code = `from math import *\n`;
      const findings = runPythonStaticAnalysis(code, { filePath: 'math.py', reviewId: 'r1' });
      const qual = findings.find((f) => f.ruleId === 'PY-QUAL-001');
      expect(qual).toBeDefined();
      expect(qual?.category).toBe('CODE_QUALITY');
    });

    it('produces zero false positives on clean, idiomatic Python code', () => {
      const cleanCode = `
import sqlite3
from typing import Optional, Dict, Any

def get_user_record(db_path: str, user_id: int) -> Optional[Dict[str, Any]]:
    if not isinstance(user_id, int) or user_id <= 0:
        raise ValueError("Invalid user_id: must be a positive integer")
    
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, email FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return {"id": row[0], "username": row[1], "email": row[2]}
`;
      const findings = runPythonStaticAnalysis(cleanCode, { filePath: 'service.py', reviewId: 'r1' });
      expect(findings).toEqual([]);
    });
  });

  describe('7. pytest Test Generation & Sandbox Execution Safeguards', () => {
    const dummyFinding: ReviewFinding = {
      id: 'f-py-1',
      reviewId: 'rev-py',
      title: 'Command Injection in Subprocess Call',
      category: 'SECURITY',
      severity: 'CRITICAL',
      confidence: 0.95,
      filePath: 'service.py',
      startLine: 4,
      endLine: 4,
      codeExcerpt: 'subprocess.check_output(cmd, shell=True)',
      description: 'Arbitrary command execution via shell=True.',
      impact: 'Remote code execution.',
      evidence: ['Line 4: shell=True with unescaped input'],
      recommendedFix: 'Pass argument list without shell=True.',
      suggestedPatch: null,
      detectionSource: 'STATIC_ANALYZER',
      validationStatus: 'STATICALLY_CONFIRMED',
      introducedByChange: true,
      relatedFindingIds: [],
      createdAt: new Date().toISOString(),
    };

    it('generates syntactically valid pytest unit test code targeting the finding', () => {
      const testCode = pythonAdapter.generateFallbackTest(dummyFinding);
      expect(testCode).toContain('import pytest');
      expect(testCode).toContain('def test_command_injection_in_subprocess');
      expect(testCode).toContain('assert True');

      // Verify the generated test code compiles cleanly with Python AST parser
      const syntax = pythonAdapter.validateSyntax(testCode);
      expect(syntax.valid).toBe(true);
      expect(syntax.errors).toEqual([]);
      expect(syntax.astSummary?.tests?.length).toBeGreaterThan(0);
    });

    it('safely rejects dangerous system operations in generated Python tests', () => {
      const maliciousTest = `
import pytest
import os
import child_process

def test_pwn():
    process.exit(1)
`;
      const safety = validateTestCodeSafety(maliciousTest, 'python');
      expect(safety.isSafe).toBe(false);
      expect(safety.securityViolations).toContain('Direct child_process execution prohibited in test suite');
      expect(safety.securityViolations).toContain('process.exit() is prohibited in tests');
    });

    it('enforces host sandbox restriction policy on valid pytest test', async () => {
      const validTest = {
        id: 'test-py-safe',
        findingId: 'f-py-1',
        reviewId: 'rev-py',
        framework: 'pytest' as const,
        language: 'python' as const,
        targetFunction: 'ping_host',
        testCode: `
import pytest

def test_ping_host_sanitizes_input():
    assert True
`,
        validationStatus: 'SYNTAX_VALID' as const,
        testType: 'DEFECT_REPRODUCTION' as const,
        createdAt: new Date().toISOString(),
      };

      const execution = await executeTestInSandbox(validTest);
      expect(execution.status).toBe('SANDBOX_RESTRICTED');
      expect(execution.stdout).toContain('[ReviewPilot AST Sandbox: PYTEST]');
      expect(execution.stdout).toContain('Syntax compilation: SUCCESS (Target: PYTHON)');
      expect(execution.stdout).toContain('SERVER-SIDE EXECUTION DISABLED BY SECURITY POLICY');
      expect(execution.stdout).toContain('Safe Alternative: Use "Copy Code" or "Export"');
    });
  });

  describe('8. End-to-End Review Pipeline with Python', () => {
    it('executes full review on Python snippet with static and AI findings', async () => {
      const pythonSnippet = `
import subprocess

def ping(host: str):
    # Command injection vulnerability
    subprocess.check_output(f"ping {host}", shell=True)
`;
      const review = await createAndExecuteReview({
        title: 'Python Subprocess Review',
        language: 'python',
        profile: 'SECURITY_REVIEW',
        inputType: 'snippet',
        code: pythonSnippet,
        fileName: 'ping_service.py',
      });

      expect(review.status).toBe('COMPLETED');
      expect(review.language).toBe('python');
      expect(review.files[0].path).toBe('ping_service.py');
      expect(review.findings.length).toBeGreaterThan(0);

      // Verify static analyzer finding is statically confirmed
      const staticCmdFinding = review.findings.find((f) => f.ruleId === 'PY-SEC-001');
      expect(staticCmdFinding).toBeDefined();
      expect(staticCmdFinding?.detectionSource).toBe('STATIC_ANALYZER');
      expect(staticCmdFinding?.validationStatus).toBe('STATICALLY_CONFIRMED');

      // Verify AI finding is present and separated
      const aiFinding = review.findings.find((f) => f.detectionSource === 'AI_ANALYSIS');
      expect(aiFinding).toBeDefined();
      expect(aiFinding?.validationStatus).toBe('UNVERIFIED');
    });
  });
});
