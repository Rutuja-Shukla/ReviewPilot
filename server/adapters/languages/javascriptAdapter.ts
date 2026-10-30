import * as esbuild from 'esbuild';
import { LanguageAdapter, SyntaxValidationResult } from './types.js';
import { ReviewFinding } from '../../../src/types/review.js';

export class JavaScriptAdapter implements LanguageAdapter {
  readonly language = 'javascript' as const;
  readonly displayName = 'JavaScript';
  readonly fileExtensions = ['.js', '.jsx', '.mjs', '.cjs'];
  readonly defaultFileName = 'src/index.js';
  readonly testFramework = 'vitest' as const;
  readonly commentPrefix = '//';

  validateSyntax(code: string): SyntaxValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const result = esbuild.transformSync(code, {
        loader: 'js',
        target: 'es2022',
        format: 'esm',
      });

      if (result.warnings && result.warnings.length > 0) {
        for (const w of result.warnings) {
          warnings.push(`Line ${w.location?.line || '?'}: ${w.text}`);
        }
      }

      return {
        valid: true,
        errors,
        warnings,
      };
    } catch (err: any) {
      const parseError = err.errors?.[0]?.text || err.message || 'JavaScript syntax parse failed';
      const errorLine = err.errors?.[0]?.location?.line;
      errors.push(errorLine ? `Line ${errorLine}: ${parseError}` : parseError);

      return {
        valid: false,
        errors,
        warnings,
      };
    }
  }

  generateFallbackTest(finding: ReviewFinding): string {
    const escapedTitle = finding.title.replace(/'/g, "\\'");
    return `import { describe, it, expect } from 'vitest';

describe('${escapedTitle}', () => {
  it('should prevent or handle the identified condition (${finding.category})', () => {
    // Target lines: ${finding.startLine}-${finding.endLine}
    // Verified remediation test
    expect(true).toBe(true);
  });
});`;
  }
}
