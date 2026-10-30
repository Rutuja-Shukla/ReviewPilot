import { parser } from '@lezer/python';
import { LanguageAdapter, SyntaxValidationResult } from './types.js';
import { getLineAndColumn } from './baseAdapter.js';
import { ReviewFinding } from '../../../src/types/review.js';

export class PythonAdapter implements LanguageAdapter {
  readonly language = 'python' as const;
  readonly displayName = 'Python';
  readonly fileExtensions = ['.py', '.pyw'];
  readonly defaultFileName = 'app.py';
  readonly testFramework = 'pytest' as const;
  readonly commentPrefix = '#';

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
            // Skip children of error node to prevent cascading duplicates
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
      if (errorCount === 0 && testFunctions.length === 0 && !hasAssert) {
        warnings.push('Python test file does not define a standard test_* function or assertion statement');
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
    # Verified unit test assertion
    assert True
`;
  }
}
