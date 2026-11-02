import { describe, it, expect } from 'vitest';
import {
  languageAdapterRegistry,
  TypeScriptAdapter,
  JavaScriptAdapter,
  PythonAdapter,
  JavaAdapter,
  CSharpAdapter,
} from '../../server/adapters/languages/index.js';
import { runStaticAnalysis } from '../../server/analyzers/staticAnalyzer.js';
import { sanitizeFilePath } from '../../server/security/pathValidator.js';
import { clampFindingCoordinates } from '../../server/ai/geminiReviewService.js';
import { executeTestInSandbox, validateTestCodeSafety } from '../../server/sandbox/sandboxAdapter.js';
import { EVALUATION_FIXTURES } from '../../server/evaluation/fixtures.js';
import { SupportedLanguage, ReviewFinding, GeneratedTest } from '../../src/types/review.js';

describe('ReviewPilot — Cross-Language Release Readiness & Evidence-Based Validation', () => {
  const languages: SupportedLanguage[] = ['typescript', 'javascript', 'python', 'java', 'csharp'];

  describe('1. Universal Language Adapter Contract & Capability Verification', () => {
    it.each(languages)('verifies %s adapter exposes accurate non-fabricated capabilities', (lang) => {
      const adapter = languageAdapterRegistry.getAdapter(lang);
      expect(adapter).toBeDefined();
      expect(adapter.language).toBe(lang);
      expect(adapter.fileExtensions.length).toBeGreaterThan(0);
      expect(adapter.defaultFileName).toBeTruthy();

      const caps = adapter.getCapabilities();
      // Syntax validation must be available and offline (no external process/network required)
      expect(caps.syntaxValidation.available).toBe(true);
      expect(caps.syntaxValidation.offline).toBe(true);

      // Target test framework must match language conventions
      const expectedFrameworks: Record<SupportedLanguage, string> = {
        typescript: 'vitest',
        javascript: 'vitest',
        python: 'pytest',
        java: 'junit',
        csharp: 'xunit',
      };
      expect(caps.testGeneration.targetFramework).toBe(expectedFrameworks[lang]);
      expect(caps.testGeneration.available).toBe(true);

      // Main application server NEVER executes untrusted code; execution sandbox must report false
      expect(caps.executionSandbox.available).toBe(false);
      expect(caps.executionSandbox.statusMessage).toContain('disabled by security policy');

      // Tools list must accurately reflect availability
      expect(Array.isArray(caps.tools)).toBe(true);
      expect(caps.tools.length).toBeGreaterThan(0);
    });
  });

  describe('2. Source Acceptance, Boundaries & Error Handling Across All 5 Languages', () => {
    it.each(languages)('rejects empty and whitespace-only code for %s', (lang) => {
      const adapter = languageAdapterRegistry.getAdapter(lang);
      const emptyResult = adapter.validateSource('');
      expect(emptyResult.valid).toBe(false);
      expect(emptyResult.errors.length).toBeGreaterThan(0);

      const whitespaceResult = adapter.validateSource('   \n\t  \n  ');
      expect(whitespaceResult.valid).toBe(false);
      expect(whitespaceResult.errors.length).toBeGreaterThan(0);
    });

    it.each(languages)('rejects oversized source files exceeding 1MB limit for %s', (lang) => {
      const adapter = languageAdapterRegistry.getAdapter(lang);
      const hugeCode = '// Comment\n'.repeat(120000); // > 1MB
      const result = adapter.validateSource(hugeCode, `file.${adapter.fileExtensions[0].replace('.', '')}`);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exceeds limit'))).toBe(true);
    });

    it.each(languages)('warns when file does not have the expected language extension for %s', (lang) => {
      const adapter = languageAdapterRegistry.getAdapter(lang);
      const result = adapter.validateSource('// Some valid code\n', 'unrelated.xyz');
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });

    it.each(languages)('validates unified diff headers for %s', (lang) => {
      const adapter = languageAdapterRegistry.getAdapter(lang);
      if (adapter.validateDiff) {
        const validDiff = `--- a/file\n+++ b/file\n@@ -1,2 +1,2 @@\n-old\n+new`;
        expect(adapter.validateDiff(validDiff).valid).toBe(true);

        const invalidDiff = `Not a git diff header`;
        const resInvalid = adapter.validateDiff(invalidDiff);
        expect(resInvalid.valid).toBe(false);
        expect(resInvalid.errors.some((e) => e.includes('unified git diff syntax'))).toBe(true);
      }
    });
  });

  describe('3. Syntax & Delimiter Diagnostics on Invalid Source Across All 5 Languages', () => {
    const invalidFixtures: Record<SupportedLanguage, { code: string; expectedErrorSnippet: string }> = {
      typescript: {
        code: `export function broken(a: number, { return a; }`,
        expectedErrorSnippet: 'Line',
      },
      javascript: {
        code: `function bad( { console.log("missing param paren"); }`,
        expectedErrorSnippet: 'Line',
      },
      python: {
        code: `def broken_func(a, b:\n    print(a + b)`,
        expectedErrorSnippet: 'Line',
      },
      java: {
        code: `public class Broken { public void test( { int x = 1; } }`,
        expectedErrorSnippet: 'Line',
      },
      csharp: {
        code: `public class Broken { public void Run() { if (true) { Console.WriteLine("unclosed"); } }`,
        expectedErrorSnippet: 'Unclosed',
      },
    };

    it.each(languages)('flags syntax errors with diagnostic line information for %s', (lang) => {
      const adapter = languageAdapterRegistry.getAdapter(lang);
      const { code, expectedErrorSnippet } = invalidFixtures[lang];
      const result = adapter.validateSyntax(code);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes(expectedErrorSnippet))).toBe(true);
    });
  });

  describe('4. Deterministic Defect Detection Across Fixtures (No Fake Findings)', () => {
    it('detects SQL injection in TypeScript/JavaScript via staticAnalyzer', () => {
      const tsSql = `const query = "SELECT * FROM users WHERE id = " + req.query.id;\ndb.query(query);`;
      const findings = runStaticAnalysis(tsSql, 'src/api.ts', 'typescript', 'rev-ts-sqli');
      const sqli = findings.find((f) => f.ruleId === 'SEC-002');
      expect(sqli).toBeDefined();
      expect(sqli?.severity).toBe('CRITICAL');
      expect(sqli?.startLine).toBe(1);
    });

    it('detects command injection in Python via pythonAdapter / AST analyzer', async () => {
      const pyAdapter = new PythonAdapter();
      const pyCmd = `import subprocess\noutput = subprocess.check_output(f"ping -c 1 {target}", shell=True)`;
      const findings = await pyAdapter.runStaticAnalysis(pyCmd, 'app.py', 'rev-py-cmd');
      const cmd = findings.find((f) => f.ruleId === 'PY-SEC-001');
      expect(cmd).toBeDefined();
      expect(cmd?.severity).toBe('CRITICAL');
      expect(cmd?.startLine).toBe(2);
    });

    it('detects resource leaks and string comparison defects in Java via javaAdapter', async () => {
      const javaAdapter = new JavaAdapter();
      const javaCode = `package com.example;
import java.io.FileInputStream;
public class Loader {
    public void load(String role) throws Exception {
        if (role == "ADMIN") {
            FileInputStream fis = new FileInputStream("secret.txt");
            fis.read();
        }
    }
}`;
      const findings = await javaAdapter.runStaticAnalysis(javaCode, 'Loader.java', 'rev-java-defects');
      const strEq = findings.find((f) => f.ruleId === 'JAVA-BUG-004');
      const resLeak = findings.find((f) => f.ruleId === 'JAVA-BUG-002');

      expect(strEq).toBeDefined();
      expect(strEq?.suggestedPatch).toContain('"ADMIN".equals(role)');

      expect(resLeak).toBeDefined();
      expect(resLeak?.startLine).toBe(6);
    });

    it('detects SQL injection in C# ADO.NET through staticAnalyzer', () => {
      const csSql = `var sql = "SELECT * FROM Users WHERE Name = '" + userInput + "'";\nvar cmd = new SqlCommand(sql, conn);`;
      const findings = runStaticAnalysis(csSql, 'Repo.cs', 'csharp', 'rev-cs-sqli');
      const sqli = findings.find((f) => f.ruleId === 'SEC-002');
      expect(sqli).toBeDefined();
      expect(sqli?.severity).toBe('CRITICAL');
    });

    it('verifies clean baselines across all 5 languages do not trigger false positive critical defects', async () => {
      const cleanFixtures = EVALUATION_FIXTURES.filter((f) => f.expectedDefects.length === 0);
      expect(cleanFixtures.length).toBeGreaterThan(0);

      for (const fix of cleanFixtures) {
        const adapter = languageAdapterRegistry.getAdapter(fix.language);
        let findings: ReviewFinding[] = [];

        if (adapter.runStaticAnalysis) {
          findings = await adapter.runStaticAnalysis(fix.code, `src/${fix.language}/clean`, 'rev-clean');
        } else {
          findings = runStaticAnalysis(fix.code, `src/${fix.language}/clean`, fix.language, 'rev-clean');
        }

        const criticals = findings.filter((f) => f.severity === 'CRITICAL');
        expect(criticals).toEqual([]);
      }
    });
  });

  describe('5. Finding Schema, Coordinate Clamping & Path Validation', () => {
    it('clamps out-of-range startLine and endLine coordinates to valid file bounds', () => {
      const totalLines = 15;
      const { startLine, endLine } = clampFindingCoordinates(-5, 999, totalLines);
      expect(startLine).toBe(1);
      expect(endLine).toBe(15);

      const inverted = clampFindingCoordinates(10, 4, totalLines);
      expect(inverted.startLine).toBe(10);
      expect(inverted.endLine).toBe(10); // Clamped so endLine >= startLine
    });

    it('sanitizes malicious or absolute file paths to prevent directory traversal', () => {
      expect(sanitizeFilePath('../../../etc/passwd', 'default.ts')).toBe('etc/passwd');
      expect(sanitizeFilePath('/var/log/secret.txt', 'default.ts')).toBe('var/log/secret.txt');
      expect(sanitizeFilePath('C:\\Windows\\System32\\cmd.exe', 'default.ts')).toBe('Windows/System32/cmd.exe');
      expect(sanitizeFilePath('   ', 'fallback.ts')).toBe('fallback.ts');
    });
  });

  describe('6. Test Generation & AST Syntax Verification Across All 5 Languages', () => {
    const dummyFinding: ReviewFinding = {
      id: 'chk-eval-finding-01',
      reviewId: 'rev-eval',
      title: 'Potential SQL Injection Flaw',
      category: 'SECURITY',
      severity: 'CRITICAL',
      confidence: 0.95,
      filePath: 'src/db.ts',
      startLine: 10,
      endLine: 12,
      codeExcerpt: 'query(sql)',
      description: 'SQL Injection via string concatenation',
      impact: 'Database compromise',
      evidence: ['query(sql)'],
      recommendedFix: 'Use parameterized queries',
      suggestedPatch: null,
      detectionSource: 'STATIC_ANALYZER',
      validationStatus: 'STATICALLY_CONFIRMED',
      introducedByChange: true,
      relatedFindingIds: [],
      createdAt: new Date().toISOString(),
    };

    it.each(languages)('generates syntactically valid test code that passes language AST verification for %s', (lang) => {
      const adapter = languageAdapterRegistry.getAdapter(lang);
      const generatedTest = adapter.generateFallbackTest(dummyFinding);

      expect(typeof generatedTest).toBe('string');
      expect(generatedTest.length).toBeGreaterThan(20);

      // Verify the generated test parses cleanly with the adapter's offline AST validator
      const syntax = adapter.validateSyntax(generatedTest);
      expect(syntax.valid).toBe(true);
      expect(syntax.errors).toEqual([]);
    });

    it.each(languages)('accurately rejects deliberately corrupted test code for %s', (lang) => {
      const adapter = languageAdapterRegistry.getAdapter(lang);
      const corruptedTest = `/* Corrupted test header */\n{{{{ unclosed broken syntax ::: !!`;
      const syntax = adapter.validateSyntax(corruptedTest);
      expect(syntax.valid).toBe(false);
      expect(syntax.errors.length).toBeGreaterThan(0);
    });
  });

  describe('7. Server Execution Sandbox Safety & Policy Enforcement', () => {
    it.each(languages)('refuses server-side execution of untrusted generated tests for %s', async (lang) => {
      const adapter = languageAdapterRegistry.getAdapter(lang);
      const testCode = adapter.generateFallbackTest({
        id: 'chk-test-01',
        reviewId: 'rev-01',
        title: 'Safety test',
        category: 'BUG',
        severity: 'MEDIUM',
        confidence: 0.9,
        filePath: 'app.ts',
        startLine: 1,
        endLine: 2,
        codeExcerpt: 'code',
        description: 'desc',
        impact: 'impact',
        evidence: [],
        recommendedFix: 'fix',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: true,
        relatedFindingIds: [],
        createdAt: new Date().toISOString(),
      });

      const generatedTest: GeneratedTest = {
        id: `test-gen-${lang}-01`,
        reviewId: 'rev-01',
        findingId: 'chk-test-01',
        language: lang,
        framework: adapter.testFramework,
        targetFunction: 'TestRemediation',
        testCode,
        validationStatus: 'SYNTAX_VALID',
        testType: 'DEFECT_REPRODUCTION',
        createdAt: new Date().toISOString(),
      };

      // Attempting sandbox execution on the server must enforce security policy restriction
      const execution = await executeTestInSandbox(generatedTest);
      expect(execution.status).toBe('SANDBOX_RESTRICTED');
      expect(execution.stdout).toContain('SERVER-SIDE EXECUTION DISABLED BY SECURITY POLICY');
      expect(execution.sandboxInfo.isIsolated).toBe(false);
    });

    it('immediately blocks malicious system operations (child_process, process.exit) regardless of language', () => {
      const maliciousPayloads = [
        "import cp from 'child_process'; cp.execSync('rm -rf /');",
        "process.exit(1);",
        "const key = process.env.GEMINI_API_KEY;",
        "const fs = require('fs'); fs.unlinkSync('/etc/hosts');",
      ];

      for (const payload of maliciousPayloads) {
        const safety = validateTestCodeSafety(payload, 'typescript');
        expect(safety.isSafe).toBe(false);
        expect(safety.securityViolations.length).toBeGreaterThan(0);
      }
    });
  });
});
