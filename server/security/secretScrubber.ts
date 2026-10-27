/**
 * Redacts secrets, access tokens, API keys, and internal server paths from error messages,
 * strings, and diagnostic outputs.
 */

const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Google / Gemini API Keys (prioritized so AIza keys aren't caught by generic query string rule)
  { pattern: /\bAIza[0-9A-Za-z\-_]{8,50}\b/g, replacement: '[REDACTED_GEMINI_API_KEY]' },

  // GitHub Personal Access Tokens (classic, fine-grained, and oauth)
  { pattern: /\bghp_[a-zA-Z0-9]{20,255}\b/g, replacement: '[REDACTED_GITHUB_PAT]' },
  { pattern: /\bgithub_pat_[a-zA-Z0-9_]{20,255}\b/g, replacement: '[REDACTED_GITHUB_PAT]' },
  { pattern: /\bgho_[a-zA-Z0-9]{20,255}\b/g, replacement: '[REDACTED_GITHUB_OAUTH]' },
  
  // OpenAI & Anthropic API Keys
  { pattern: /\bsk-[a-zA-Z0-9]{20,60}\b/g, replacement: '[REDACTED_API_KEY]' },
  { pattern: /\bsk-ant-[a-zA-Z0-9_\-]{20,120}\b/g, replacement: '[REDACTED_ANTHROPIC_KEY]' },
  
  // AWS Keys
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[REDACTED_AWS_KEY_ID]' },
  
  // Generic password / token assignments in query strings or headers
  { pattern: /(key|secret|token|password|auth|bearer)\s*[:=]\s*['"]?[a-zA-Z0-9_\-\.]{8,}['"]?/gi, replacement: '$1=[REDACTED]' },

  // Internal workspace paths
  { pattern: /\/app\/applet\//g, replacement: './' },
];

/**
 * Scrubs known secret patterns and tokens from an arbitrary string.
 */
export function scrubSecrets(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let result = input;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Sanitizes an error object or message into a safe user-facing message,
 * ensuring no sensitive environment variables, credentials, or host filesystem paths are leaked.
 */
export function sanitizeErrorMessage(error: unknown, fallback: string = 'Internal server error'): string {
  if (!error) return fallback;

  let rawMessage = '';
  if (error instanceof Error) {
    rawMessage = error.message;
  } else if (typeof error === 'string') {
    rawMessage = error;
  } else if (typeof error === 'object' && 'message' in (error as any)) {
    rawMessage = String((error as any).message);
  } else {
    return fallback;
  }

  // Strip stack trace if present in message
  if (rawMessage.includes('\n    at ')) {
    rawMessage = rawMessage.split('\n    at ')[0].trim();
  }

  // Scrub any secrets embedded in the message
  const scrubbed = scrubSecrets(rawMessage);

  return scrubbed || fallback;
}
