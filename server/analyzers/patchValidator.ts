import { sanitizeFilePath } from '../security/pathValidator.js';

export interface PatchValidationResult {
  isValid: boolean;
  sanitizedPatch: string | null;
  error?: string;
}

/**
 * Validates and sanitizes a unified diff patch string.
 * Ensures the patch does not perform directory traversal, targets the expected file,
 * and conforms to valid unified diff format.
 */
export function validateAndSanitizePatch(
  rawPatch: string | null | undefined,
  expectedFilePath: string
): PatchValidationResult {
  if (!rawPatch || !rawPatch.trim()) {
    return { isValid: true, sanitizedPatch: null };
  }

  const patch = rawPatch.trim();
  const lines = patch.split(/\r?\n/);

  // Check for forbidden characters
  if (patch.includes('\0')) {
    return { isValid: false, sanitizedPatch: null, error: 'Patch contains null bytes' };
  }

  // Check for path traversal attempts in diff headers
  let foundOldHeader = false;
  let foundNewHeader = false;
  let foundHunk = false;

  for (const line of lines) {
    if (line.startsWith('--- ')) {
      foundOldHeader = true;
      const target = line.substring(4).trim().replace(/^[ab]\//, '');
      if (target.includes('..') || target.startsWith('/') || /^[a-zA-Z]:/.test(target)) {
        return {
          isValid: false,
          sanitizedPatch: null,
          error: `Patch header contains path traversal pattern: "${line}"`,
        };
      }
    } else if (line.startsWith('+++ ')) {
      foundNewHeader = true;
      const target = line.substring(4).trim().replace(/^[ab]\//, '');
      if (target.includes('..') || target.startsWith('/') || /^[a-zA-Z]:/.test(target)) {
        return {
          isValid: false,
          sanitizedPatch: null,
          error: `Patch header contains path traversal pattern: "${line}"`,
        };
      }
    } else if (line.startsWith('@@ ')) {
      foundHunk = true;
      // Validate hunk header format @@ -X,Y +A,B @@
      if (!/^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/.test(line)) {
        return {
          isValid: false,
          sanitizedPatch: null,
          error: `Malformed hunk header: "${line}"`,
        };
      }
    }
  }

  const cleanExpectedPath = sanitizeFilePath(expectedFilePath);

  // If valid headers exist, ensure headers reference the clean path
  let sanitizedPatch = patch;
  if (foundOldHeader && foundNewHeader) {
    sanitizedPatch = patch
      .replace(/^---\s+[^\r\n]+/m, `--- a/${cleanExpectedPath}`)
      .replace(/^\+\+\+\s+[^\r\n]+/m, `+++ b/${cleanExpectedPath}`);
  }

  return {
    isValid: foundHunk || patch.startsWith('---'),
    sanitizedPatch,
  };
}
