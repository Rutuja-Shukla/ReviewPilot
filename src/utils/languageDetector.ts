import { SupportedLanguage } from '../types/review.js';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'typescript',
  'javascript',
  'python',
  'java',
  'csharp',
] as const;

const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  pyw: 'python',
  pyx: 'python',
  java: 'java',
  cs: 'csharp',
};

/**
 * Validates if a string is a supported language.
 */
export function isSupportedLanguage(lang: unknown): lang is SupportedLanguage {
  return typeof lang === 'string' && SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}

/**
 * Detects programming language from a file name or path based on extension.
 */
export function detectLanguageFromFilename(fileName: string): SupportedLanguage | null {
  if (!fileName || typeof fileName !== 'string') return null;
  const clean = fileName.trim().toLowerCase();
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1 || lastDot === clean.length - 1) return null;
  const ext = clean.substring(lastDot + 1);
  return EXTENSION_MAP[ext] || null;
}

/**
 * Detects programming language from unified git diff headers.
 * Looks for paths in "diff --git a/... b/...", "--- a/...", or "+++ b/..."
 */
export function detectLanguageFromDiff(diffText: string): SupportedLanguage | null {
  if (!diffText || typeof diffText !== 'string') return null;

  const headerMatches = diffText.match(/(?:diff --git a\/.*? b\/|---\s+[aiw]\/|\+\+\+\s+[biw]\/)([\w\-./\\]+)/g);
  if (headerMatches) {
    for (const match of headerMatches) {
      const parts = match.split(/\s+/);
      const filePath = parts[parts.length - 1].replace(/^[abiw]\//, '');
      const detected = detectLanguageFromFilename(filePath);
      if (detected) return detected;
    }
  }

  return null;
}

/**
 * Detects programming language from source code content heuristics (shebangs and strong keywords).
 */
export function detectLanguageFromContent(content: string): SupportedLanguage | null {
  if (!content || typeof content !== 'string') return null;

  const trimmed = content.trim();
  const firstLine = trimmed.split(/\r?\n/)[0] || '';

  // 1. Shebang line
  if (firstLine.startsWith('#!')) {
    if (firstLine.includes('python')) return 'python';
    if (firstLine.includes('node') || firstLine.includes('deno') || firstLine.includes('bun')) return 'typescript';
  }

  // 2. Strong Python heuristics
  if (
    /^\s*(?:import\s+(?:sys|os|json|typing|math|datetime)|from\s+[\w.]+\s+import|def\s+\w+\s*\(.*?\)\s*->|def\s+\w+\s*\(.*?\)\s*:|if\s+__name__\s*==\s*['"]__main__['"])/m.test(
      trimmed
    )
  ) {
    return 'python';
  }

  // 3. Strong C# heuristics
  if (
    /^\s*(?:using\s+System(?:[.;]|\s)|namespace\s+[\w.]+|public\s+class\s+\w+\s*:\s*\w+|Console\.WriteLine\s*\()/m.test(
      trimmed
    )
  ) {
    return 'csharp';
  }

  // 4. Strong Java heuristics
  if (
    /^\s*(?:package\s+[\w.]+|import\s+java\.|public\s+static\s+void\s+main\s*\(\s*String(?:\[\]|\s+\.\.\.)\s+\w+\)|System\.out\.println\s*\()/m.test(
      trimmed
    )
  ) {
    return 'java';
  }

  // 5. Strong TypeScript heuristics
  if (
    /\b(?:interface\s+\w+|type\s+\w+\s*=|as\s+const|<[A-Z]\w*>\s*\(|:\s*(?:string|number|boolean|any|unknown|void|Record<|Array<)[,;\s)>])/m.test(
      trimmed
    )
  ) {
    return 'typescript';
  }

  // 6. General JavaScript heuristics
  if (
    /\b(?:function\s+\w+\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|import\s+.*?from\s+['"]|export\s+default|module\.exports\s*=)/m.test(
      trimmed
    )
  ) {
    return 'javascript';
  }

  return null;
}

/**
 * Unified language detection taking filename, diffText, and code into account.
 * Single source of truth across the application.
 */
export function detectLanguage(input: {
  fileName?: string;
  diffText?: string;
  code?: string;
}): SupportedLanguage | null {
  if (input.fileName) {
    const fromFile = detectLanguageFromFilename(input.fileName);
    if (fromFile) return fromFile;
  }

  if (input.diffText) {
    const fromDiff = detectLanguageFromDiff(input.diffText);
    if (fromDiff) return fromDiff;
  }

  if (input.code) {
    // If it looks like a diff, try diff parser first
    if (input.code.startsWith('diff --git') || input.code.includes('--- a/') || input.code.includes('+++ b/')) {
      const fromDiff = detectLanguageFromDiff(input.code);
      if (fromDiff) return fromDiff;
    }

    const fromContent = detectLanguageFromContent(input.code);
    if (fromContent) return fromContent;
  }

  return null;
}
