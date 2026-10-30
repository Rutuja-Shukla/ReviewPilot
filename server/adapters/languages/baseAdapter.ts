/**
 * Shared AST and lexical verification utilities for language adapters.
 */

export interface DelimiterCheckResult {
  valid: boolean;
  errors: string[];
}

/**
 * Calculates 1-indexed line and column numbers from a character index offset.
 */
export function getLineAndColumn(code: string, offset: number): { line: number; column: number } {
  const boundedOffset = Math.max(0, Math.min(offset, code.length));
  const slice = code.slice(0, boundedOffset);
  const lines = slice.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

/**
 * Lexical delimiter and string quotation validator.
 * Safely parses structural blocks (braces, parentheses, brackets) while strictly ignoring
 * delimiters appearing inside comments or string literals.
 */
export function checkDelimitersAndQuotes(code: string): DelimiterCheckResult {
  const stack: { char: string; line: number; col: number }[] = [];
  const errors: string[] = [];
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let inVerbatimString = false;
  let inChar = false;
  let line = 1;
  let col = 0;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];
    col++;

    if (ch === '\n') {
      line++;
      col = 0;
      if (inLineComment) inLineComment = false;
      continue;
    }

    if (inLineComment) continue;

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
        col++;
      }
      continue;
    }

    if (inVerbatimString) {
      if (ch === '"') {
        if (next === '"') {
          i++; // Escaped quote inside verbatim string @""
          col++;
        } else {
          inVerbatimString = false;
        }
      }
      continue;
    }

    if (inString) {
      if (ch === '\\') {
        i++; // Escaped character
        col++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (inChar) {
      if (ch === '\\') {
        i++;
        col++;
      } else if (ch === '\'') {
        inChar = false;
      }
      continue;
    }

    // Start of comments or strings
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      col++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      col++;
      continue;
    }
    if (ch === '@' && next === '"') {
      inVerbatimString = true;
      i++;
      col++;
      continue;
    }
    if (ch === '$' && next === '@' && code[i + 2] === '"') {
      inVerbatimString = true;
      i += 2;
      col += 2;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '\'') {
      inChar = true;
      continue;
    }

    // Delimiters
    if (ch === '{' || ch === '(' || ch === '[') {
      stack.push({ char: ch, line, col });
    } else if (ch === '}' || ch === ')' || ch === ']') {
      const expected = ch === '}' ? '{' : ch === ')' ? '(' : '[';
      const last = stack.pop();
      if (!last || last.char !== expected) {
        errors.push(`Line ${line}, Col ${col}: Unexpected closing '${ch}'`);
      }
    }
  }

  if (inBlockComment) {
    errors.push('Unterminated block comment /* ... */');
  }
  if (inString || inVerbatimString) {
    errors.push('Unterminated string literal');
  }
  if (inChar) {
    errors.push('Unterminated character literal');
  }

  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    errors.push(`Line ${unclosed.line}, Col ${unclosed.col}: Unclosed '${unclosed.char}'`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
