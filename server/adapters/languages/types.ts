import { SupportedLanguage, ReviewFinding } from '../../../src/types/review.js';
import type { StaticRule } from '../../analyzers/staticAnalyzer.js';

export interface SyntaxValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  astSummary?: {
    classes?: string[];
    methods?: string[];
    functions?: string[];
    tests?: string[];
  };
}

export interface LanguageAdapter {
  readonly language: SupportedLanguage;
  readonly displayName: string;
  readonly fileExtensions: string[];
  readonly defaultFileName: string;
  readonly testFramework: 'vitest' | 'jest' | 'pytest' | 'junit' | 'xunit';
  readonly commentPrefix: string;

  /**
   * Offline AST / syntax validator.
   * Runs deterministically without network calls and without executing untrusted instructions.
   */
  validateSyntax(code: string): SyntaxValidationResult;

  /**
   * Generates a targeted, self-contained unit test template targeting the given finding.
   */
  generateFallbackTest(finding: ReviewFinding): string;

  /**
   * Language-specific static rules, if any.
   */
  getStaticRules?(): StaticRule[];
}
