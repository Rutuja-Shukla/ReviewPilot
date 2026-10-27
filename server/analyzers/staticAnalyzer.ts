import { ReviewFinding, ReviewCategory, ReviewSeverity, SupportedLanguage } from '../../src/types/review.js';

export interface StaticRule {
  id: string;
  name: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  confidence: number;
  description: string;
  impact: string;
  recommendedFix: string;
  match: (line: string, lineIndex: number, allLines: string[], language: SupportedLanguage) => {
    matched: boolean;
    evidence: string[];
    startLine?: number;
    endLine?: number;
    codeExcerpt?: string;
    suggestedPatch?: string | null;
  } | null;
}

export const STATIC_RULES: StaticRule[] = [
  // SEC-001: Hardcoded Secrets
  {
    id: 'SEC-001',
    name: 'Hardcoded Credential or API Token Detected',
    category: 'SECURITY',
    severity: 'CRITICAL',
    confidence: 0.95,
    description: 'A high-entropy private key, secret token, or hardcoded password was found directly in source code.',
    impact: 'Exposes private credentials in version control, leading to unauthorized API access, data breach, and potential privilege escalation.',
    recommendedFix: 'Remove the secret immediately, rotate any compromised credentials, and read configuration securely via environment variables (e.g. process.env.API_KEY).',
    match: (line, lineIndex) => {
      const awsKey = line.match(/(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/);
      const secretToken = line.match(/(?:api[_-]?key|secret|token|password|auth_token)\s*[:=]\s*['"][a-zA-Z0-9_\-.~+=]{16,}['"]/i);
      const privateKeyHeader = line.includes('BEGIN PRIVATE KEY') || line.includes('BEGIN RSA PRIVATE KEY');
      
      if (awsKey || secretToken || privateKeyHeader) {
        const evidenceStr = awsKey ? `Matched AWS Access Key pattern: ${awsKey[0].substring(0, 8)}...` :
                           secretToken ? `Matched hardcoded credential assignment: ${secretToken[0].substring(0, 25)}...` :
                           'Private key certificate header detected directly in source';
        return {
          matched: true,
          evidence: [evidenceStr, `Line ${lineIndex + 1}: ${line.trim()}`],
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          codeExcerpt: line.trim(),
          suggestedPatch: `--- a/file\n+++ b/file\n@@ -${lineIndex + 1},1 +${lineIndex + 1},1 @@\n-${line}\n+const apiKey = process.env.SERVICE_API_KEY;`
        };
      }
      return null;
    }
  },

  // SEC-002: SQL Injection via String Concatenation
  {
    id: 'SEC-002',
    name: 'Potential SQL Injection via Unparameterized Query',
    category: 'SECURITY',
    severity: 'CRITICAL',
    confidence: 0.92,
    description: 'Dynamic user inputs are concatenated directly into raw SQL query strings instead of using prepared statements or parameterized queries.',
    impact: 'Allows an attacker to alter the query logic, bypass authentication, exfiltrate sensitive database records, or drop tables.',
    recommendedFix: 'Use parameterized queries (e.g., db.query("SELECT * FROM users WHERE id = $1", [id])) or an ORM with proper query binding.',
    match: (line, lineIndex) => {
      const sqlConcat = line.match(/(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE).*?\+\s*(?:req\.|params|input|id|user|query|name|userInput)/i) ||
                        line.match(/(?:execute|query|rawQuery)\s*\(\s*`.*?(?:SELECT|INSERT|UPDATE|DELETE).*?\$\{.*?\}\s*`/i) ||
                        line.match(/(?:execute|query|cursor\.execute)\s*\(\s*f['"].*?(?:SELECT|INSERT|UPDATE|DELETE).*?\{.*?\}/i);
      if (sqlConcat) {
        return {
          matched: true,
          evidence: [`Unparameterized SQL statement detected: "${line.trim()}"`, 'Query incorporates interpolated or concatenated dynamic variables.'],
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          codeExcerpt: line.trim(),
          suggestedPatch: null
        };
      }
      return null;
    }
  },

  // SEC-003: Unsafe Dynamic Code Execution
  {
    id: 'SEC-003',
    name: 'Unsafe Dynamic Code Execution (eval / new Function)',
    category: 'SECURITY',
    severity: 'CRITICAL',
    confidence: 0.98,
    description: 'Unsafe dynamic evaluation evaluates arbitrary code strings, bypassing runtime type and security boundaries.',
    impact: 'Remote code execution (RCE) if evaluated input can be manipulated or influenced by end users or external data sources.',
    recommendedFix: 'Refactor code to use safe parsing (e.g. JSON.parse()), static lookup maps, or explicit strategy functions.',
    match: (line, lineIndex) => {
      if (/\beval\s*\(/.test(line) || /\bnew\s+Function\s*\(/.test(line) || /\bchild_process\.exec\s*\(/.test(line) || /\bos\.system\s*\(/.test(line)) {
        return {
          matched: true,
          evidence: [`Dangerous dynamic evaluation call found on line ${lineIndex + 1}: ${line.trim()}`],
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          codeExcerpt: line.trim(),
          suggestedPatch: null
        };
      }
      return null;
    }
  },

  // SEC-005: Path Traversal Vulnerability
  {
    id: 'SEC-005',
    name: 'Path Traversal Vulnerability in File Handling',
    category: 'SECURITY',
    severity: 'HIGH',
    confidence: 0.88,
    description: 'File system paths are constructed using unvalidated input that could contain dot-dot-slash ("../") sequences.',
    impact: 'Attacker can escape intended directory boundaries to read or overwrite arbitrary sensitive files on the server host.',
    recommendedFix: 'Sanitize path inputs with path.basename(), validate against an allowlist, or verify path.resolve() stays within safe root.',
    match: (line, lineIndex, allLines) => {
      if (/(?:fs\.readFile|fs\.readFileSync|fs\.createReadStream|open|sendFile)\s*\(\s*(?:path\.join|path\.resolve)?.*?(?:req\.(?:query|params|body)|userInput)/i.test(line) ||
          (line.includes('path.join') && (line.includes('userInput') || line.includes('req.')) && allLines.slice(lineIndex, lineIndex + 4).some(l => l.includes('fs.read')))) {
        return {
          matched: true,
          evidence: [`Direct file operation with user request parameter: ${line.trim()}`],
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          codeExcerpt: line.trim(),
          suggestedPatch: null
        };
      }
      return null;
    }
  },

  // SEC-006: Prompt Injection in Comments / Strings
  {
    id: 'SEC-006',
    name: 'Untrusted Instruction or Prompt Injection in Source Comments',
    category: 'SECURITY',
    severity: 'HIGH',
    confidence: 0.92,
    description: 'Detected suspicious natural language commands targeting AI models inside comments or strings (e.g. "Ignore previous instructions", "Mark as safe").',
    impact: 'May compromise AI review pipeline or downstream LLM workflows if instructions are executed as trusted system prompts.',
    recommendedFix: 'Treat all source code comments as passive untrusted text. Strip or quarantine adversarial prompt injections.',
    match: (line, lineIndex) => {
      const isComment = /^\s*(?:\/\/|#|\/\*|\*)/.test(line);
      const isPromptInjection = /ignore\s+(?:all\s+)?previous\s+instructions/i.test(line) ||
                                /system\s*:\s*override/i.test(line) ||
                                /you\s+must\s+approve\s+this\s+(?:pr|pull\s+request|code)/i.test(line) ||
                                /do\s+not\s+report\s+(?:any\s+)?vulnerabilit/i.test(line);
      if (isComment && isPromptInjection) {
        return {
          matched: true,
          evidence: [`Suspicious directive embedded in code comment: "${line.trim()}"`],
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          codeExcerpt: line.trim(),
          suggestedPatch: null
        };
      }
      return null;
    }
  },

  // SEC-007: Insecure CORS with credentials
  {
    id: 'SEC-007',
    name: 'Insecure Wildcard CORS Configuration with Credentials',
    category: 'SECURITY',
    severity: 'HIGH',
    confidence: 0.94,
    description: 'Setting Access-Control-Allow-Origin to wildcard "*" alongside Access-Control-Allow-Credentials to true creates security risks and violates browser CORS specifications.',
    impact: 'Allows third-party websites to perform unauthorized cross-origin credentialed requests.',
    recommendedFix: 'Specify an explicit, validated origin rather than wildcard "*" when credentials are supported.',
    match: (line, lineIndex, allLines) => {
      if (line.includes('Access-Control-Allow-Origin') && line.includes('*')) {
        const nextLines = allLines.slice(lineIndex, lineIndex + 4);
        if (nextLines.some(l => l.includes('Access-Control-Allow-Credentials') && l.includes('true'))) {
          return {
            matched: true,
            evidence: ['Wildcard origin combined with credentials header', line.trim()],
            startLine: lineIndex + 1,
            endLine: lineIndex + 2,
            codeExcerpt: line.trim(),
            suggestedPatch: null,
          };
        }
      }
      return null;
    }
  },

  // BUG-001: Assignment inside conditional check
  {
    id: 'BUG-001',
    name: 'Accidental Assignment in Conditional Statement',
    category: 'BUG',
    severity: 'HIGH',
    confidence: 0.95,
    description: 'An assignment operator (=) was used inside an if or while conditional expression where equality comparison (== or ===) was likely intended.',
    impact: 'The condition will always evaluate to truthiness of the assigned value and overwrite the variable unintentionally.',
    recommendedFix: 'Replace single equals assignment (=) with strict equality comparison (===).',
    match: (line, lineIndex) => {
      const match = line.match(/\bif\s*\(\s*([a-zA-Z0-9_$]+)\s*=\s*([^=][^)]*)\)/);
      if (match && !line.includes('===') && !line.includes('==') && !line.includes('!=')) {
        const varName = match[1];
        const val = match[2];
        return {
          matched: true,
          evidence: [`Assignment inside condition: "if (${varName} = ${val})" on line ${lineIndex + 1}`],
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          codeExcerpt: line.trim(),
          suggestedPatch: `--- a/file\n+++ b/file\n@@ -${lineIndex + 1},1 +${lineIndex + 1},1 @@\n-${line}\n+${line.replace(`${varName} = ${val}`, `${varName} === ${val}`)}`
        };
      }
      return null;
    }
  },

  // BUG-002: Null Dereference Risk
  {
    id: 'BUG-002',
    name: 'Unchecked Null or Undefined Property Access',
    category: 'BUG',
    severity: 'MEDIUM',
    confidence: 0.85,
    description: 'Property is accessed on a potentially null or undefined variable without null check or optional chaining (?.).',
    impact: 'Causes runtime "Cannot read properties of undefined/null" TypeError and application crash.',
    recommendedFix: 'Use optional chaining (?.) or an explicit guard (if (!obj) return;).',
    match: (line, lineIndex, allLines) => {
      // Skip if line already uses optional chaining, typeof, instanceof, import, export
      if (line.includes('?.') || line.includes('typeof ') || line.includes('instanceof ') || line.includes('import ') || line.startsWith('export interface') || line.startsWith('export type')) {
        return null;
      }

      // Check if preceding 5 lines already guard against null/undefined
      const prevLines = allLines.slice(Math.max(0, lineIndex - 5), lineIndex);
      const isGuarded = prevLines.some((l) =>
        l.includes('if (!') ||
        l.includes('if (') ||
        l.includes('if(') ||
        l.includes('&&') ||
        l.includes('??') ||
        l.includes('assert')
      );
      if (isGuarded) {
        return null;
      }

      // Skip common safe method chains on strings/arrays (e.g. .trim(), .toLowerCase(), .slice(), .toString())
      const safeMethods = /\.(?:trim|toLowerCase|toUpperCase|slice|substr|substring|toString|replace|replaceAll|split|join|map|filter|forEach|reduce|find|some|every)\s*\(/;
      if (safeMethods.test(line)) {
        return null;
      }

      if (/(?:user|data|res|item|config|order)\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+/i.test(line)) {
        if (line.includes('=') || line.includes('(') || line.includes('return')) {
          return {
            matched: true,
            evidence: [`Deep un-guarded property traversal: ${line.trim()}`],
            startLine: lineIndex + 1,
            endLine: lineIndex + 1,
            codeExcerpt: line.trim(),
            suggestedPatch: null,
          };
        }
      }
      return null;
    },
  },

  // BUG-003: Unhandled Promise Rejection
  {
    id: 'BUG-003',
    name: 'Unhandled Promise Rejection or Missing Await',
    category: 'BUG',
    severity: 'MEDIUM',
    confidence: 0.87,
    description: 'An asynchronous promise call is not awaited or lacks a .catch() handler, risking unhandled promise rejection crashes.',
    impact: 'Errors during async execution will be silently lost or terminate the Node.js process with UnhandledPromiseRejection.',
    recommendedFix: 'Add the await keyword inside an async function wrapped in try/catch, or attach a .catch(err => ...) handler.',
    match: (line, lineIndex, allLines) => {
      if (/\.then\s*\(/.test(line) && !line.includes('.catch(') && !allLines.slice(lineIndex, lineIndex + 4).some(l => l.includes('.catch('))) {
        return {
          matched: true,
          evidence: [`.then() invoked without trailing .catch() handler in proximity: ${line.trim()}`],
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          codeExcerpt: line.trim(),
          suggestedPatch: null
        };
      }
      return null;
    }
  },

  // BUG-004: Resource Leak (Unclosed Handle)
  {
    id: 'BUG-004',
    name: 'Unclosed Resource or Stream Handle Leak',
    category: 'BUG',
    severity: 'MEDIUM',
    confidence: 0.84,
    description: 'A file handle, database connection, or network socket is acquired but never guaranteed to close in a finally block.',
    impact: 'Exhaustion of operating system file descriptors or connection pool, degrading server capacity and leading to denial of service.',
    recommendedFix: 'Ensure resources are released using a try...finally block, an async dispose pattern, or Python with open(...) context manager.',
    match: (line, lineIndex, allLines, lang) => {
      if (lang === 'python' && /open\s*\(/.test(line) && !line.includes('with ')) {
        return {
          matched: true,
          evidence: [`Direct open() call without "with" context manager: ${line.trim()}`],
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          codeExcerpt: line.trim(),
          suggestedPatch: null
        };
      }
      if ((lang === 'typescript' || lang === 'javascript') && /(?:fs\.openSync|createReadStream)/.test(line) && !allLines.slice(lineIndex, lineIndex + 10).some(l => l.includes('close') || l.includes('finally'))) {
        return {
          matched: true,
          evidence: [`Stream or handle allocated without explicit close/finally in scope: ${line.trim()}`],
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          codeExcerpt: line.trim(),
          suggestedPatch: null
        };
      }
      return null;
    }
  },

  // BUG-005: Off-by-one boundary condition
  {
    id: 'BUG-005',
    name: 'Off-by-One Array Boundary Condition (<= length)',
    category: 'BUG',
    severity: 'HIGH',
    confidence: 0.92,
    description: 'Loop condition uses <= array.length on a zero-indexed collection, causing the last iteration to access undefined index.',
    impact: 'Runtime IndexError or undefined element access causing downstream logic failures.',
    recommendedFix: 'Change loop condition to < array.length, or use for...of / map() iteration.',
    match: (line, lineIndex) => {
      const match = line.match(/for\s*\(\s*(?:let|var|int)?\s*([a-zA-Z0-9_]+)\s*=\s*0;\s*\1\s*<=\s*([a-zA-Z0-9_.]+)\.length;\s*\1\+\+\s*\)/);
      if (match) {
        return {
          matched: true,
          evidence: [`Loop condition "<= ${match[2]}.length" will exceed max index by 1: ${line.trim()}`],
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          codeExcerpt: line.trim(),
          suggestedPatch: `--- a/file\n+++ b/file\n@@ -${lineIndex + 1},1 +${lineIndex + 1},1 @@\n-${line}\n+${line.replace('<=', '<')}`
        };
      }
      return null;
    }
  },

  // BUG-007: Swallowed Exception in Empty Catch
  {
    id: 'BUG-007',
    name: 'Empty Catch Block Swallows Exceptions Silently',
    category: 'CODE_QUALITY',
    severity: 'LOW',
    confidence: 0.91,
    description: 'Catch block is completely empty or only contains a comment, suppressing unexpected failures and masking bugs.',
    impact: 'System enters an inconsistent or corrupted state without any telemetry or diagnostic logs.',
    recommendedFix: 'Log the error with context or rethrow if unrecoverable: console.error("Operation failed", err);',
    match: (line, lineIndex, allLines) => {
      if (/catch\s*\([^)]*\)\s*\{/.test(line)) {
        // Look ahead for closing brace without active statements
        const nextLines = allLines.slice(lineIndex + 1, lineIndex + 4);
        let onlyCommentsOrWhitespace = true;
        let closedIndex = -1;

        for (let i = 0; i < nextLines.length; i++) {
          const trimmed = nextLines[i].trim();
          if (trimmed === '}') {
            closedIndex = lineIndex + 1 + i;
            break;
          }
          if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
            onlyCommentsOrWhitespace = false;
            break;
          }
        }

        if (closedIndex !== -1 && onlyCommentsOrWhitespace) {
          return {
            matched: true,
            evidence: [`Catch block contains no statements or error handling on lines ${lineIndex + 1}-${closedIndex + 1}`],
            startLine: lineIndex + 1,
            endLine: closedIndex + 1,
            codeExcerpt: line.trim(),
            suggestedPatch: null
          };
        }
      }
      return null;
    }
  },

  // PERF-001: O(N^2) Nested Lookup in Iteration
  {
    id: 'PERF-001',
    name: 'Quadratic O(N^2) Nested Array Search in Loop',
    category: 'PERFORMANCE',
    severity: 'MEDIUM',
    confidence: 0.85,
    description: 'Calling .find() or .filter() on an array inside another array iteration (.map, .forEach) causes O(N*M) quadratic complexity.',
    impact: 'Significant performance degradation and high CPU usage as collection size increases.',
    recommendedFix: 'Index the inner collection into a Map or Set before the loop for O(1) lookups.',
    match: (line, lineIndex, allLines) => {
      if (/\.(?:forEach|map)\s*\(.*?(?:items|list|records|data|refunds|users)\.(?:find|filter)\s*\(/.test(line)) {
        return {
          matched: true,
          evidence: [`Nested array lookup within iteration: ${line.trim()}`],
          startLine: lineIndex + 1,
          endLine: lineIndex + 1,
          codeExcerpt: line.trim(),
          suggestedPatch: null
        };
      }
      if (/\.(?:find|filter)\s*\(/.test(line)) {
        const prevLines = allLines.slice(Math.max(0, lineIndex - 3), lineIndex);
        if (prevLines.some(l => /\.(?:map|forEach)\s*\(/.test(l))) {
          return {
            matched: true,
            evidence: [`Inner .find()/.filter() invoked inside iteration loop on line ${lineIndex + 1}: ${line.trim()}`],
            startLine: lineIndex + 1,
            endLine: lineIndex + 1,
            codeExcerpt: line.trim(),
            suggestedPatch: null
          };
        }
      }
      return null;
    }
  },

  // PERF-002: Query inside loop
  {
    id: 'PERF-002',
    name: 'N+1 Query Pattern: Database Call Inside Iteration Loop',
    category: 'PERFORMANCE',
    severity: 'MEDIUM',
    confidence: 0.89,
    description: 'Executing database queries inside iteration loop creates N+1 database roundtrips, degrading response time.',
    impact: 'Excessive database load and connection pool saturation.',
    recommendedFix: 'Batch query parameters with WHERE id IN (...) or JOIN tables in a single query before loop.',
    match: (line, lineIndex, allLines) => {
      if (/await\s+(?:db|database|conn)\.(?:query|rawQuery|find)/i.test(line)) {
        const prevLines = allLines.slice(Math.max(0, lineIndex - 5), lineIndex);
        if (prevLines.some(l => /for\s*\(|while\s*\(|\.forEach\(/.test(l))) {
          return {
            matched: true,
            evidence: [`Database query executed inside loop on line ${lineIndex + 1}: ${line.trim()}`],
            startLine: lineIndex + 1,
            endLine: lineIndex + 1,
            codeExcerpt: line.trim(),
            suggestedPatch: null,
          };
        }
      }
      return null;
    }
  }
];

export function runStaticAnalysis(
  content: string,
  filePath: string,
  language: SupportedLanguage,
  reviewId: string,
  changedLines?: number[]
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const lines = content.split(/\r?\n/);
  const changedSet = changedLines ? new Set(changedLines) : null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNumber = idx + 1;

    for (const rule of STATIC_RULES) {
      try {
        const result = rule.match(line, idx, lines, language);
        if (result && result.matched) {
          const startLine = result.startLine || lineNumber;
          const endLine = result.endLine || lineNumber;
          const isIntroduced = changedSet ? (changedSet.has(startLine) || changedSet.has(endLine)) : true;

          const finding: ReviewFinding = {
            id: `static-${rule.id}-${filePath}-${startLine}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
            reviewId,
            title: rule.name,
            category: rule.category,
            severity: rule.severity,
            confidence: rule.confidence,
            filePath,
            startLine,
            endLine,
            codeExcerpt: result.codeExcerpt || line.trim(),
            description: rule.description,
            impact: rule.impact,
            evidence: result.evidence,
            recommendedFix: rule.recommendedFix,
            suggestedPatch: result.suggestedPatch || null,
            detectionSource: 'STATIC_ANALYZER',
            validationStatus: 'STATICALLY_CONFIRMED',
            introducedByChange: isIntroduced,
            relatedFindingIds: [],
            ruleId: rule.id,
            createdAt: new Date().toISOString(),
          };

          findings.push(finding);
        }
      } catch (err) {
        console.error(`Error running static rule ${rule.id} on line ${lineNumber}:`, err);
      }
    }
  }

  return findings;
}
