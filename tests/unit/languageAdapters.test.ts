import { describe, it, expect } from 'vitest';
import {
  languageAdapterRegistry,
  LanguageAdapterRegistry,
  TypeScriptAdapter,
  JavaScriptAdapter,
  PythonAdapter,
  JavaAdapter,
  CSharpAdapter,
} from '../../server/adapters/languages/index.js';
import { validateTestCodeSafety, executeTestInSandbox } from '../../server/sandbox/sandboxAdapter.js';
import { ReviewFinding } from '../../src/types/review.js';

describe('Language Adapter Registry & Offline AST Parsers', () => {
  const dummyFinding: ReviewFinding = {
    id: 'f-101',
    reviewId: 'rev-test',
    title: 'SQL Injection in Query Builder',
    category: 'SECURITY',
    severity: 'CRITICAL',
    confidence: 0.95,
    filePath: 'server/db.ts',
    startLine: 12,
    endLine: 14,
    codeExcerpt: 'db.query("SELECT * FROM users WHERE id = " + id);',
    description: 'Dynamic concatenated variable passed directly into SQL statement.',
    impact: 'Exposes arbitrary database records and allows data tampering.',
    evidence: ['Line 12: string concatenation into query'],
    recommendedFix: 'Use parameterized queries or ORM bindings.',
    suggestedPatch: null,
    detectionSource: 'STATIC_ANALYZER',
    validationStatus: 'STATICALLY_CONFIRMED',
    introducedByChange: true,
    relatedFindingIds: [],
    createdAt: new Date().toISOString(),
  };

  describe('LanguageAdapterRegistry', () => {
    it('registers all 5 default language adapters on initialization', () => {
      const supported = languageAdapterRegistry.getSupportedLanguages();
      expect(supported).toContain('typescript');
      expect(supported).toContain('javascript');
      expect(supported).toContain('python');
      expect(supported).toContain('java');
      expect(supported).toContain('csharp');
      expect(supported.length).toBe(5);
    });

    it('retrieves adapters by language and throws descriptive error for unregistered languages', () => {
      const tsAdapter = languageAdapterRegistry.getAdapter('typescript');
      expect(tsAdapter).toBeInstanceOf(TypeScriptAdapter);
      expect(tsAdapter.displayName).toBe('TypeScript');
      expect(tsAdapter.testFramework).toBe('vitest');

      const pyAdapter = languageAdapterRegistry.getAdapter('python');
      expect(pyAdapter).toBeInstanceOf(PythonAdapter);
      expect(pyAdapter.displayName).toBe('Python');
      expect(pyAdapter.testFramework).toBe('pytest');

      const javaAdapter = languageAdapterRegistry.getAdapter('java');
      expect(javaAdapter).toBeInstanceOf(JavaAdapter);
      expect(javaAdapter.displayName).toBe('Java');
      expect(javaAdapter.testFramework).toBe('junit');

      const csAdapter = languageAdapterRegistry.getAdapter('csharp');
      expect(csAdapter).toBeInstanceOf(CSharpAdapter);
      expect(csAdapter.displayName).toBe('C#');
      expect(csAdapter.testFramework).toBe('xunit');

      expect(() => languageAdapterRegistry.getAdapter('rust' as any)).toThrow(
        'No language adapter registered for language: "rust"'
      );
      expect(languageAdapterRegistry.getAdapterOrNull('rust')).toBeNull();
      expect(languageAdapterRegistry.hasAdapter('python')).toBe(true);
      expect(languageAdapterRegistry.hasAdapter('ruby')).toBe(false);
    });

    it('allows registering custom language adapters into a new registry instance', () => {
      const customRegistry = new LanguageAdapterRegistry();
      const mockGoAdapter = {
        language: 'go' as any,
        displayName: 'Go',
        fileExtensions: ['.go'],
        defaultFileName: 'main.go',
        testFramework: 'gotest' as any,
        commentPrefix: '//',
        validateSyntax: () => ({ valid: true, errors: [], warnings: [] }),
        generateFallbackTest: () => 'func TestRemediation(t *testing.T) {}',
      };

      customRegistry.register(mockGoAdapter);
      expect(customRegistry.hasAdapter('go')).toBe(true);
      expect(customRegistry.getAdapter('go' as any).displayName).toBe('Go');
    });
  });

  describe('TypeScript & JavaScript Adapters', () => {
    const tsAdapter = new TypeScriptAdapter();
    const jsAdapter = new JavaScriptAdapter();

    it('validates correct TypeScript and generates vitest fallback tests', () => {
      const validTs = `
        export interface User { id: string; name: string; }
        export function greet(u: User): string {
          return \`Hello \${u.name}\`;
        }
      `;
      const result = tsAdapter.validateSyntax(validTs);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);

      const fallback = tsAdapter.generateFallbackTest(dummyFinding);
      expect(fallback).toContain("import { describe, it, expect } from 'vitest'");
      expect(fallback).toContain('SQL Injection in Query Builder');
    });

    it('catches syntax errors in TypeScript with line numbers', () => {
      const badTs = `
        export function broken( {
          return 42;
        }
      `;
      const result = tsAdapter.validateSyntax(badTs);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/Line \d+/);
    });

    it('validates correct JavaScript and catches JS syntax errors', () => {
      const validJs = `const x = [1, 2, 3].map(n => n * 2);`;
      expect(jsAdapter.validateSyntax(validJs).valid).toBe(true);

      const badJs = `const x = function( { return 1; };`;
      const result = jsAdapter.validateSyntax(badJs);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Python Adapter (Offline AST via @lezer/python)', () => {
    const pyAdapter = new PythonAdapter();

    it('validates clean Python syntax and recognizes test functions', () => {
      const cleanPython = `
import pytest

def add(a: int, b: int) -> int:
    return a + b

def test_add_positive():
    assert add(2, 3) == 5

def test_add_negative():
    assert add(-1, -1) == -2
`;
      const result = pyAdapter.validateSyntax(cleanPython);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.astSummary?.functions).toContain('add');
      expect(result.astSummary?.tests).toContain('test_add_positive');
      expect(result.astSummary?.tests).toContain('test_add_negative');
    });

    it('accurately identifies syntax errors, unclosed parentheses, and indentation flaws with line diagnostics', () => {
      const malformedPython = `
def calculate_total(items:
    total = 0
    return total
`;
      const result = pyAdapter.validateSyntax(malformedPython);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/Line \d+, Col \d+: Python syntax error/);
    });

    it('warns when a Python test file has no test functions or assertions', () => {
      const noTestsPy = `
x = 10
y = 20
z = x + y
`;
      const result = pyAdapter.validateSyntax(noTestsPy);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'Python test file does not define a standard test_* function or assertion statement'
      );
    });

    it('generates a syntactically valid pytest fallback test targeting the finding', () => {
      const fallback = pyAdapter.generateFallbackTest(dummyFinding);
      expect(fallback).toContain('import pytest');
      expect(fallback).toContain('def test_sql_injection_in_query_builder():');
      expect(fallback).toContain('assert True');

      // Ensure the generated fallback itself passes Python AST verification
      const verify = pyAdapter.validateSyntax(fallback);
      expect(verify.valid).toBe(true);
      expect(verify.astSummary?.tests?.length).toBeGreaterThan(0);
    });
  });

  describe('Java Adapter (Offline AST via @lezer/java)', () => {
    const javaAdapter = new JavaAdapter();

    it('validates clean Java syntax and recognizes classes, methods, and test annotations', () => {
      const cleanJava = `
package com.example.service;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class CalculatorTest {

    @Test
    public void testAddition() {
        int result = 2 + 3;
        assertEquals(5, result);
    }
}
`;
      const result = javaAdapter.validateSyntax(cleanJava);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.astSummary?.classes).toContain('CalculatorTest');
      expect(result.astSummary?.methods).toContain('testAddition');
    });

    it('detects Java syntax errors and unclosed structural elements with line and column reporting', () => {
      const malformedJava = `
public class BrokenService {
    public void runProcess( {
        int x = 10;
    }
}
`;
      const result = javaAdapter.validateSyntax(malformedJava);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/Line \d+, Col \d+: Java syntax error/);
    });

    it('warns when a Java test class lacks @Test annotations or assertions', () => {
      const nonTestJava = `
public class PlainDataHolder {
    private String name;
    public String getName() { return this.name; }
}
`;
      const result = javaAdapter.validateSyntax(nonTestJava);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'Java test class does not include @Test annotations or standard assertion statements'
      );
    });

    it('generates a syntactically valid JUnit 5 test class for the finding', () => {
      const fallback = javaAdapter.generateFallbackTest(dummyFinding);
      expect(fallback).toContain('package com.reviewpilot.tests;');
      expect(fallback).toContain('import org.junit.jupiter.api.Test;');
      expect(fallback).toContain('public class Defectf101Test');
      expect(fallback).toContain('@Test');

      // Verify the generated fallback passes Java AST verification
      const verify = javaAdapter.validateSyntax(fallback);
      expect(verify.valid).toBe(true);
      expect(verify.astSummary?.classes).toContain('Defectf101Test');
    });
  });

  describe('C# Adapter (Offline AST & Lexical Verifier)', () => {
    const csAdapter = new CSharpAdapter();

    it('validates clean C# syntax and recognizes classes, methods, and xUnit attributes', () => {
      const cleanCSharp = `
using System;
using Xunit;

namespace ReviewPilot.Tests
{
    public class OrderProcessorTests
    {
        [Fact]
        public void CalculateDiscount_AppliesCorrectPercentage()
        {
            var discount = 0.15;
            Assert.True(discount > 0.10);
        }
    }
}
`;
      const result = csAdapter.validateSyntax(cleanCSharp);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.astSummary?.classes).toContain('OrderProcessorTests');
      expect(result.astSummary?.methods).toContain('CalculateDiscount_AppliesCorrectPercentage');
    });

    it('handles verbatim strings with nested braces and block comments without false delimiter errors', () => {
      const csharpWithVerbatim = `
using System;

public class TemplateRenderer
{
    /* Block comment with { braces and } unclosed characters ( */
    private string rawTemplate = @"
    {
        ""user"": ""admin"",
        ""query"": ""SELECT * FROM table""
    }";

    public string Render()
    {
        return rawTemplate;
    }
}
`;
      const result = csAdapter.validateSyntax(csharpWithVerbatim);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.astSummary?.classes).toContain('TemplateRenderer');
    });

    it('detects unclosed braces and quotes in C# code with exact line locations', () => {
      const unclosedBrace = `
public class IncompleteService
{
    public void Process()
    {
        if (true) {
            Console.WriteLine("Missing closing brace");
    }
}
`;
      const result = csAdapter.validateSyntax(unclosedBrace);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("Unclosed '{'"))).toBe(true);
    });

    it('detects unterminated strings in C#', () => {
      const unclosedString = `
public class TestService
{
    public string message = "unterminated string;
}
`;
      const result = csAdapter.validateSyntax(unclosedString);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unterminated string literal');
    });

    it('generates a syntactically valid xUnit test class for the finding', () => {
      const fallback = csAdapter.generateFallbackTest(dummyFinding);
      expect(fallback).toContain('using System;');
      expect(fallback).toContain('using Xunit;');
      expect(fallback).toContain('public class Defectf101Tests');
      expect(fallback).toContain('[Fact]');
      expect(fallback).toContain('Assert.True(true');

      // Verify the generated fallback passes C# AST verification
      const verify = csAdapter.validateSyntax(fallback);
      expect(verify.valid).toBe(true);
      expect(verify.astSummary?.classes).toContain('Defectf101Tests');
    });
  });

  describe('Sandbox & Test Safety Integration', () => {
    it('validates test code across all 5 languages using language adapters', () => {
      const testCases = [
        {
          language: 'typescript',
          code: "import { describe, it, expect } from 'vitest'; describe('test', () => { it('runs', () => expect(1).toBe(1)); });",
          shouldBeValid: true,
        },
        {
          language: 'python',
          code: 'import pytest\ndef test_feature():\n    assert 2 + 2 == 4\n',
          shouldBeValid: true,
        },
        {
          language: 'java',
          code: 'import org.junit.jupiter.api.Test;\npublic class AppTest { @Test public void testX() { assert true; } }',
          shouldBeValid: true,
        },
        {
          language: 'csharp',
          code: 'using Xunit;\npublic class UnitTests { [Fact] public void TestOne() { Assert.True(true); } }',
          shouldBeValid: true,
        },
      ];

      for (const tc of testCases) {
        const safety = validateTestCodeSafety(tc.code, tc.language);
        expect(safety.isSafe).toBe(true);
        expect(safety.syntaxValid).toBe(tc.shouldBeValid);
      }
    });

    it('blocks dangerous operations (child_process, process.exit) regardless of language', () => {
      const unsafePython = `
import pytest
import os

def test_exploit():
    # Attempt prohibited subprocess execution
    import child_process
    assert True
`;
      const safety = validateTestCodeSafety(unsafePython, 'python');
      expect(safety.isSafe).toBe(false);
      expect(safety.errors).toContain('Direct child_process execution prohibited in test suite');
    });

    it('executeTestInSandbox accurately reports syntax errors from language adapter without executing code', async () => {
      const brokenTest = {
        id: 'test-broken-py',
        findingId: 'f-1',
        reviewId: 'rev-1',
        framework: 'pytest' as const,
        language: 'python' as const,
        targetFunction: 'brokenFn',
        testCode: 'def test_syntax_fail( :\n    assert True',
        validationStatus: 'UNCHECKED' as const,
        testType: 'DEFECT_REPRODUCTION' as const,
        createdAt: new Date().toISOString(),
      };

      const execution = await executeTestInSandbox(brokenTest);
      expect(execution.status).toBe('ERROR');
      expect(execution.stderr).toContain('AST compilation error:');
      expect(execution.stderr).toContain('Python syntax error');
    });

    it('executeTestInSandbox enforces security policy restriction for valid tests', async () => {
      const validTest = {
        id: 'test-valid-cs',
        findingId: 'f-2',
        reviewId: 'rev-2',
        framework: 'xunit' as const,
        language: 'csharp' as const,
        targetFunction: 'CalculateDiscount',
        testCode: 'using Xunit;\npublic class SafeTest { [Fact] public void TestX() { Assert.True(true); } }',
        validationStatus: 'SYNTAX_VALID' as const,
        testType: 'DEFECT_REPRODUCTION' as const,
        createdAt: new Date().toISOString(),
      };

      const execution = await executeTestInSandbox(validTest);
      expect(execution.status).toBe('SANDBOX_RESTRICTED');
      expect(execution.stdout).toContain('Syntax compilation: SUCCESS (Target: CSHARP)');
      expect(execution.stdout).toContain('SERVER-SIDE EXECUTION DISABLED BY SECURITY POLICY');
      expect(execution.stdout).toContain('AST Safety Audit: Clean');
    });
  });
});
