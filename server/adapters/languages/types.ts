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

export interface SourceValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface ToolStatus {
  name: string;
  available: boolean;
  version?: string;
  description: string;
  installHint?: string;
  status: 'ACTIVE' | 'FALLBACK' | 'UNAVAILABLE';
}

export interface LanguageCapabilities {
  language: SupportedLanguage;
  displayName: string;
  fileExtensions: string[];
  defaultFileName: string;
  syntaxValidation: {
    engine: string;
    available: boolean;
    offline: boolean;
  };
  staticAnalysis: {
    primaryTool: string;
    primaryAvailable: boolean;
    fallbackEngine: string;
    available: boolean;
    statusMessage: string;
  };
  testGeneration: {
    targetFramework: 'vitest' | 'jest' | 'pytest' | 'junit' | 'xunit';
    available: boolean;
  };
  executionSandbox: {
    available: boolean;
    isolated: boolean;
    statusMessage: string;
  };
  tools: ToolStatus[];
}

export interface LanguageAdapter {
  readonly language: SupportedLanguage;
  readonly displayName: string;
  readonly fileExtensions: string[];
  readonly defaultFileName: string;
  readonly testFramework: 'vitest' | 'jest' | 'pytest' | 'junit' | 'xunit';
  readonly commentPrefix: string;

  /**
   * Explicit capabilities and dependency status for this language.
   */
  getCapabilities(): LanguageCapabilities;

  /**
   * Validates source code structure and file name conventions.
   */
  validateSource(code: string, fileName?: string): SourceValidationResult;

  /**
   * Validates diff structure for this language.
   */
  validateDiff?(diffText: string): SourceValidationResult;

  /**
   * Offline AST / syntax validator.
   * Runs deterministically without network calls and without executing untrusted instructions.
   */
  validateSyntax(code: string): SyntaxValidationResult;

  /**
   * Runs language-specific static analysis tools and AST rules.
   */
  runStaticAnalysis?(
    code: string,
    filePath: string,
    reviewId: string,
    changedLines?: number[]
  ): Promise<ReviewFinding[]>;

  /**
   * Normalizes third-party linter (e.g. Ruff) outputs into ReviewFinding structures.
   */
  normalizeLinterOutput?(
    rawOutput: string | unknown,
    filePath: string,
    reviewId: string
  ): ReviewFinding[];

  /**
   * Generates a targeted, self-contained unit test template targeting the given finding.
   */
  generateFallbackTest(finding: ReviewFinding): string;

  /**
   * Language-specific contextual prompt guidance for AI reviews.
   */
  getLanguageContext?(): string;

  /**
   * Language-specific static rules, if any.
   */
  getStaticRules?(): StaticRule[];
}
