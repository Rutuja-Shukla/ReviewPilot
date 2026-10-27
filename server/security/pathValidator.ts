import path from 'path';

/**
 * Validates and sanitizes a file path to prevent directory traversal attacks (e.g., ../../etc/passwd).
 * Ensures paths are strictly relative, normalized to POSIX format, and cannot escape the project root.
 */
export function sanitizeFilePath(rawPath: string | undefined | null, fallbackName: string = 'source.ts'): string {
  if (!rawPath || typeof rawPath !== 'string') {
    return fallbackName;
  }

  // 1. Remove null bytes (\0) which can bypass string checks in native APIs
  let sanitized = rawPath.replace(/\0/g, '').trim();

  if (!sanitized) {
    return fallbackName;
  }

  // 2. Reject or strip URL schemes if present (e.g., file://, http://)
  sanitized = sanitized.replace(/^[a-zA-Z]+:\/\//, '');

  // 3. Strip Windows drive letters (e.g., C:\, D:/)
  sanitized = sanitized.replace(/^[a-zA-Z]:[/\\]/, '');

  // 4. Normalize backslashes to forward slashes
  sanitized = sanitized.replace(/\\/g, '/');

  // 5. Strip leading slashes to prevent absolute path interpretation
  sanitized = sanitized.replace(/^\/+/, '');

  // 6. Normalize path using path.posix.normalize
  sanitized = path.posix.normalize(sanitized);

  // 7. Check for traversal sequences after normalization
  if (
    sanitized === '..' ||
    sanitized.startsWith('../') ||
    sanitized.includes('/../') ||
    sanitized.endsWith('/..')
  ) {
    // If traversal detected, sanitize by removing .. segments or fallback
    const segments = sanitized.split('/').filter(s => s && s !== '..' && s !== '.');
    if (segments.length === 0) {
      return fallbackName;
    }
    sanitized = segments.join('/');
  }

  // 8. Enforce reasonable path length limit
  if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255);
  }

  // 9. Strip any remaining dangerous characters (keep standard alphanumeric, dots, slashes, dashes, underscores)
  sanitized = sanitized.replace(/[^a-zA-Z0-9_\-./]/g, '_');

  return sanitized || fallbackName;
}

/**
 * Asserts that a file path is safe and does not contain directory traversal attempts.
 * Throws an Error if a traversal pattern or null byte is detected.
 */
export function assertSafeFilePath(rawPath: string): void {
  if (typeof rawPath !== 'string') {
    throw new Error('Invalid file path: path must be a string');
  }

  if (rawPath.includes('\0')) {
    throw new Error('Path traversal security error: null byte detected in path');
  }

  const normalized = rawPath.replace(/\\/g, '/');
  if (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..')
  ) {
    throw new Error(`Path traversal security error: forbidden path pattern in "${rawPath}"`);
  }
}
