/**
 * Sanitizes untrusted user inputs before feeding them to AI prompts (prompt injection defense),
 * and sanitizes AI outputs before storing or presenting them (model-output injection / XSS defense).
 */

/**
 * Neutralizes prompt injection breakout sequences and control directives in user-submitted code or diffs.
 */
export function sanitizeForPrompt(input: string | undefined | null): string {
  if (!input || typeof input !== 'string') return '';

  return input
    // Escape our designated XML tags so user code cannot prematurely terminate the enclosure
    .replace(/<\/untrusted_source_code>/gi, '&lt;/untrusted_source_code&gt;')
    .replace(/<untrusted_source_code>/gi, '&lt;untrusted_source_code&gt;')
    .replace(/<\/untrusted_diff>/gi, '&lt;/untrusted_diff&gt;')
    .replace(/<untrusted_diff>/gi, '&lt;untrusted_diff&gt;')
    .replace(/<\/system>/gi, '&lt;/system&gt;')
    .replace(/<system>/gi, '&lt;system&gt;')
    // Neutralize standard LLM jailbreak / special instruction tokens
    .replace(/\[INST\]/gi, '&#91;INST&#93;')
    .replace(/\[\/INST\]/gi, '&#91;/INST&#93;')
    .replace(/<<SYS>>/gi, '&lt;&lt;SYS&gt;&gt;')
    .replace(/<<\/SYS>>/gi, '&lt;&lt;/SYS&gt;&gt;')
    .replace(/<\|im_start\|>/gi, '&lt;|im_start|&gt;')
    .replace(/<\|im_end\|>/gi, '&lt;|im_end|&gt;')
    .replace(/<\|endoftext\|>/gi, '&lt;|endoftext|&gt;');
}

/**
 * Strips dangerous HTML tags, javascript: protocols, and event handlers from model outputs
 * to prevent stored XSS or model-output injection.
 */
export function sanitizeHtmlContent(input: string | undefined | null): string {
  if (!input || typeof input !== 'string') return '';

  return input
    // Remove script tags and contents, plus unclosed or standalone script tags
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?script\b[^>]*>/gi, '')
    // Remove dangerous elements
    .replace(/<\/?(iframe|object|embed|applet|meta|link|style|base|form)\b[^>]*>/gi, '')
    // Remove javascript: and vbscript: URIs
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/vbscript\s*:/gi, 'blocked:')
    .replace(/data\s*:\s*text\/html/gi, 'blocked:')
    // Remove inline event handlers (onerror=, onload=, onclick=, etc.)
    .replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');
}

/**
 * Sanitizes all string fields of a finding object received from an AI model.
 */
export function sanitizeFindingFields<T extends {
  title?: string;
  description?: string;
  impact?: string;
  evidence?: string[];
  recommendedFix?: string;
  suggestedPatch?: string | null;
}>(finding: T): T {
  return {
    ...finding,
    title: sanitizeHtmlContent(finding.title || ''),
    description: sanitizeHtmlContent(finding.description || ''),
    impact: sanitizeHtmlContent(finding.impact || ''),
    evidence: Array.isArray(finding.evidence)
      ? finding.evidence.map(e => sanitizeHtmlContent(e))
      : [],
    recommendedFix: sanitizeHtmlContent(finding.recommendedFix || ''),
    suggestedPatch: finding.suggestedPatch ? sanitizeHtmlContent(finding.suggestedPatch) : null,
  };
}
