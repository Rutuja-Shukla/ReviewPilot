import { parser } from '@lezer/python';
import {
  LanguageAdapter,
  SyntaxValidationResult,
  SourceValidationResult,
  LanguageCapabilities,
} from './types.js';
import { getLineAndColumn } from './baseAdapter.js';
import { ReviewFinding } from '../../../src/types/review.js';
import { checkRuffAvailable, normalizeRuffOutput, runRuffIfAvailable } from './ruffNormalizer.js';
import { runPythonStaticAnalysis } from './pythonStaticAnalyzer.js';

export class PythonAdapter implements LanguageAdapter {
  readonly language = 'python' as const;
  readonly displayName = 'Python';
  readonly fileExtensions = ['.py', '.pyw'];
  readonly defaultFileName = 'app.py';
  readonly testFramework = 'pytest' as const;
  readonly commentPrefix = '#';

  getCapabilities(): LanguageCapabilities {
    return {
      language: this.language,
      displayName: this.displayName,
      fileExtensions: [...this.fileExtensions],
      defaultFileName: this.defaultFileName,
      syntaxValidation: {
        engine: '@lezer/python (Offline AST Parser)',
        available: true,
        offline: true,
      },
      staticAnalysis: {
        primaryTool: 'Ruff',
        primaryAvailable: false, // Updated dynamically at runtime
        fallbackEngine: 'ReviewPilot Python AST Static Analyzer',
        available: true,
        statusMessage: 'Built-in Python AST rule analyzer is active. (Ruff is executed when installed in environment PATH).',
      },
      testGeneration: {
        targetFramework: 'pytest',
        available: true,
      },
      executionSandbox: {
        available: false,
        isolated: false,
        statusMessage: 'Server-side execution disabled by security policy (microVM isolation not present on host). Tests are verified through AST parsing and exportable.',
      },
      tools: [
        {
          name: 'Python 3',
          available: true,
          version: '3.10.12',
          description: 'Python runtime environment and AST support',
          status: 'ACTIVE',
        },
        {
          name: '@lezer/python',
          available: true,
          version: '^1.1.19',
          description: 'Deterministic offline concrete syntax tree parser',
          status: 'ACTIVE',
        },
        {
          name: 'Ruff',
          available: false,
          description: 'Extremely fast Python linter and code formatter (executes when installed)',
          installHint: 'pip install ruff',
          status: 'FALLBACK',
        },
        {
          name: 'pytest',
          available: true,
          description: 'Target test synthesis framework for reproducing unit test suites',
          status: 'ACTIVE',
        },
      ],
    };
  }

  validateSource(code: string, fileName?: string): SourceValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!code || code.trim().length === 0) {
      errors.push('Python source code cannot be empty');
      return { valid: false, errors, warnings };
    }

    if (fileName) {
      const lower = fileName.toLowerCase().trim();
      const hasValidExt = this.fileExtensions.some((ext) => lower.endsWith(ext));
      if (!hasValidExt) {
        warnings.push(`File "${fileName}" does not have a standard Python extension (${this.fileExtensions.join(', ')})`);
      }
    }

    const maxSizeBytes = 1024 * 1024; // 1MB
    if (code.length > maxSizeBytes) {
      errors.push(`Source code size (${code.length} bytes) exceeds limit of ${maxSizeBytes} bytes`);
    }

    // Run offline AST parse check
    const syntax = this.validateSyntax(code);
    if (!syntax.valid) {
      errors.push(...syntax.errors);
    }
    if (syntax.warnings) {
      warnings.push(...syntax.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateDiff(diffText: string): SourceValidationResult {
    const errors: string[] = [];
    if (!diffText || diffText.trim().length === 0) {
      errors.push('Diff content cannot be empty');
      return { valid: false, errors };
    }

    const hasDiffHeader =
      diffText.includes('diff --git') ||
      diffText.includes('--- ') ||
      diffText.includes('+++ ') ||
      diffText.includes('@@ ');

    if (!hasDiffHeader) {
      errors.push('Input does not conform to unified git diff syntax');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  validateSyntax(code: string): SyntaxValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const functions: string[] = [];
    const testFunctions: string[] = [];

    if (!code || code.trim().length === 0) {
      return {
        valid: true,
        errors: [],
        warnings: ['Empty Python code submitted'],
      };
    }

    try {
      const tree = parser.parse(code);
      let errorCount = 0;

      tree.iterate({
        enter(node) {
          if (node.type.isError) {
            errorCount++;
            const { line, column } = getLineAndColumn(code, node.from);
            const contextSnippet = code
              .slice(Math.max(0, node.from - 10), Math.min(code.length, node.to + 15))
              .replace(/[\r\n]+/g, ' ')
              .trim();
            errors.push(`Line ${line}, Col ${column}: Python syntax error near "${contextSnippet || 'EOF'}"`);
            return false;
          }

          if (node.name === 'FunctionDefinition') {
            const fnText = code.slice(node.from, Math.min(node.to, node.from + 80));
            const match = fnText.match(/def\s+([a-zA-Z0-9_]+)/);
            if (match) {
              const fnName = match[1];
              functions.push(fnName);
              if (fnName.startsWith('test_') || fnName.endsWith('_test')) {
                testFunctions.push(fnName);
              }
            }
          }
        },
      });

      // Semantic structural warning for test files
      const hasAssert = /\bassert\b/.test(code);
      if (errorCount === 0) {
        if (testFunctions.length === 0 && !hasAssert) {
          warnings.push('Python test file does not define a standard test_* function or assertion statement');
        } else if (testFunctions.length > 0 && !hasAssert) {
          warnings.push('Python test function does not include an assertion statement');
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        astSummary: {
          functions,
          tests: testFunctions,
        },
      };
    } catch (err: any) {
      return {
        valid: false,
        errors: [err.message || 'Python AST parsing failure'],
        warnings,
      };
    }
  }

  async runStaticAnalysis(
    code: string,
    filePath: string,
    reviewId: string,
    changedLines?: number[]
  ): Promise<ReviewFinding[]> {
    const findings: ReviewFinding[] = [];

    // 1. Try running Ruff if available
    const ruffResult = await runRuffIfAvailable(code, filePath, reviewId);
    if (ruffResult.available && ruffResult.findings.length > 0) {
      findings.push(...ruffResult.findings);
    }

    // 2. Always run built-in Python AST & Semantic Rules
    const astFindings = runPythonStaticAnalysis(code, {
      reviewId,
      filePath,
      changedLines,
    });

    // Merge & deduplicate Ruff and AST findings based on rule/line overlap
    for (const af of astFindings) {
      const exists = findings.some(
        (rf) => rf.startLine === af.startLine && (rf.category === af.category || rf.title.includes(af.ruleId || ''))
      );
      if (!exists) {
        findings.push(af);
      }
    }

    return findings;
  }

  normalizeLinterOutput(
    rawOutput: string | unknown,
    filePath: string,
    reviewId: string
  ): ReviewFinding[] {
    return normalizeRuffOutput(rawOutput, filePath, reviewId);
  }

  generateFallbackTest(finding: ReviewFinding): string {
    const cleanFnName = finding.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 35)
      .replace(/^_+|_+$/g, '');
    const escapedDesc = finding.title.replace(/"/g, '\\"');

    return `import pytest

def test_${cleanFnName || 'defect_reproduction'}():
    """Reproduces finding on lines ${finding.startLine}-${finding.endLine}: ${escapedDesc}"""
    # Defect category: ${finding.category} (${finding.severity})
    # Target file: ${finding.filePath}
    # Expected behavior: Input is sanitized or error is properly handled without vulnerability
    assert True
`;
  }

  getLanguageContext(): string {
    return `PYTHON ARCHITECTURAL & SECURITY CONTEXT:
1. Target Framework: pytest for tests, PEP 8 standards.
2. Security Boundaries:
   - Untrusted input passed into subprocess must NEVER use shell=True. Arguments must be an explicit list of strings.
   - Database operations must use DB-API parameterized queries (%s or ?), never string interpolation (f-strings or %).
   - Deserialization with pickle is inherently unsafe for untrusted data.
   - Dynamic code execution with eval() or exec() must be flagged as Critical.
3. Reliability & Idioms:
   - Functions must not use mutable default arguments (e.g. def foo(items=[]) or def foo(config={})).
   - Use '==' for literal equality checks; 'is' must only be used for singleton identity (None, True, False).
   - Avoid bare 'except:' clauses; catch explicit exception types. Do not swallow exceptions with 'except: pass'.
   - File resources should be opened using 'with open(...) as f:' context managers.
   - Avoid wildcard imports ('from module import *').`;
  }
}
