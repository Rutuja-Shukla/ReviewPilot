import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ReviewFinding, ReviewCategory, ReviewSeverity } from '../../../src/types/review.js';
import { sanitizeFilePath } from '../../security/pathValidator.js';

const execFileAsync = promisify(execFile);

let cachedRuffAvailability: boolean | null = null;
let cachedRuffVersion: string | null = null;

/**
 * Checks if the Ruff linter binary is installed and executable in the environment PATH.
 * Never throws; returns false if ruff is missing.
 */
export async function checkRuffAvailable(): Promise<{ available: boolean; version?: string }> {
  if (cachedRuffAvailability !== null) {
    return { available: cachedRuffAvailability, version: cachedRuffVersion || undefined };
  }

  try {
    const { stdout } = await execFileAsync('ruff', ['--version'], { timeout: 2000 });
    const version = stdout.trim();
    cachedRuffAvailability = true;
    cachedRuffVersion = version;
    return { available: true, version };
  } catch {
    cachedRuffAvailability = false;
    cachedRuffVersion = null;
    return { available: false };
  }
}

/**
 * Raw Ruff diagnostic item matching `ruff check --output-format=json`.
 */
export interface RawRuffDiagnostic {
  code: string;
  message: string;
  location?: {
    row: number;
    column: number;
  };
  end_location?: {
    row: number;
    column: number;
  };
  filename?: string;
  url?: string;
  fix?: {
    applicability?: string;
    message?: string;
    edits?: Array<{
      content: string;
      location: { row: number; column: number };
      end_location: { row: number; column: number };
    }>;
  };
}

/**
 * Maps Ruff rule codes to ReviewPilot ReviewCategory.
 */
export function mapRuffCategory(code: string): ReviewCategory {
  const upper = (code || '').toUpperCase();
  if (upper.startsWith('S')) return 'SECURITY'; // flake8-bandit
  if (upper.startsWith('B')) return 'BUG'; // flake8-bugbear
  if (upper.startsWith('F7') || upper.startsWith('F8')) return 'BUG'; // Pyflakes fatal/undefined
  if (upper.startsWith('E722')) return 'BUG'; // bare except
  if (upper.startsWith('PERF')) return 'PERFORMANCE'; // perflint
  if (upper.startsWith('PT')) return 'TEST_COVERAGE'; // flake8-pytest-style
  return 'CODE_QUALITY';
}

/**
 * Maps Ruff rule codes to ReviewPilot ReviewSeverity.
 */
export function mapRuffSeverity(code: string): ReviewSeverity {
  const upper = (code || '').toUpperCase();
  // Critical security risks
  if (['S602', 'S608', 'S105', 'S106', 'S301', 'S102'].includes(upper)) {
    return 'CRITICAL';
  }
  // High severity risks (other bandit security rules, syntax bugs, bare excepts, mutable defaults)
  if (upper.startsWith('S') || ['B006', 'B008', 'E722', 'F821', 'F706'].includes(upper)) {
    return 'HIGH';
  }
  // Medium severity (bugbear, undefined vars, broad exceptions)
  if (upper.startsWith('B') || upper.startsWith('F8') || upper.startsWith('E7')) {
    return 'MEDIUM';
  }
  // Low severity (unused imports, style warnings)
  if (['F401', 'F841', 'W291', 'W293'].includes(upper) || upper.startsWith('E')) {
    return 'LOW';
  }
  return 'INFORMATIONAL';
}

/**
 * Normalizes raw Ruff JSON output into ReviewFinding items.
 * Robust against invalid JSON, missing properties, and out-of-bound locations.
 */
export function normalizeRuffOutput(
  rawOutput: string | unknown,
  filePath: string,
  reviewId: string,
  sourceCode?: string
): ReviewFinding[] {
  if (!rawOutput) return [];

  let diagnostics: RawRuffDiagnostic[] = [];

  if (typeof rawOutput === 'string') {
    const trimmed = rawOutput.trim();
    if (!trimmed || trimmed === '[]') return [];
    try {
      diagnostics = JSON.parse(trimmed);
    } catch {
      // If output is not valid JSON, fail safe and return empty
      return [];
    }
  } else if (Array.isArray(rawOutput)) {
    diagnostics = rawOutput as RawRuffDiagnostic[];
  } else {
    return [];
  }

  if (!Array.isArray(diagnostics)) return [];

  const sourceLines = sourceCode ? sourceCode.split(/\r?\n/) : [];
  const totalLines = Math.max(1, sourceLines.length);
  const cleanPath = sanitizeFilePath(filePath, 'app.py');

  const findings: ReviewFinding[] = [];

  for (let i = 0; i < diagnostics.length; i++) {
    const diag = diagnostics[i];
    if (!diag || typeof diag !== 'object' || !diag.code || !diag.message) {
      continue;
    }

    const rawRow = typeof diag.location?.row === 'number' ? diag.location.row : 1;
    const rawEndRow = typeof diag.end_location?.row === 'number' ? diag.end_location.row : rawRow;
    const startLine = Math.max(1, Math.min(rawRow, totalLines));
    const endLine = Math.max(startLine, Math.min(rawEndRow, totalLines));

    const category = mapRuffCategory(diag.code);
    const severity = mapRuffSeverity(diag.code);

    let codeExcerpt = '';
    if (sourceLines.length > 0) {
      codeExcerpt = sourceLines.slice(startLine - 1, endLine).join('\n').trim();
    }
    if (!codeExcerpt) {
      codeExcerpt = `Line ${startLine}: ${diag.message}`;
    }

    let suggestedPatch: string | null = null;
    if (diag.fix && Array.isArray(diag.fix.edits) && diag.fix.edits.length > 0 && sourceLines.length > 0) {
      const edit = diag.fix.edits[0];
      const editRow = edit.location?.row || startLine;
      const originalLine = sourceLines[editRow - 1] || '';
      suggestedPatch = `--- a/${cleanPath}\n+++ b/${cleanPath}\n@@ -${editRow},1 +${editRow},1 @@\n-${originalLine}\n+${edit.content.trimEnd()}`;
    }

    const impactDesc =
      category === 'SECURITY'
        ? 'May allow command execution, data exfiltration, or unauthorized privilege elevation.'
        : category === 'BUG'
        ? 'Can trigger runtime exceptions, unexpected mutable state leakage, or incorrect conditional execution.'
        : 'Violates Python clean-code standards and degrades maintainability.';

    const ruleUrl = diag.url ? ` Reference: ${diag.url}` : '';

    findings.push({
      id: `static-ruff-${diag.code}-${startLine}-${reviewId}-${i + 1}`,
      reviewId,
      title: `[Ruff ${diag.code}] ${diag.message}`,
      category,
      severity,
      confidence: 0.96,
      filePath: cleanPath,
      startLine,
      endLine,
      codeExcerpt,
      description: `${diag.message}.${ruleUrl}`,
      impact: impactDesc,
      evidence: [
        `Ruff static analysis rule ${diag.code} triggered on line ${startLine}.`,
        `Diagnostic: "${diag.message}"`,
      ],
      recommendedFix: diag.fix?.message || `Refactor the line to satisfy Ruff rule ${diag.code}.`,
      suggestedPatch,
      detectionSource: 'STATIC_ANALYZER',
      validationStatus: 'STATICALLY_CONFIRMED',
      introducedByChange: true,
      relatedFindingIds: [],
      ruleId: `RUFF-${diag.code}`,
      createdAt: new Date().toISOString(),
    });
  }

  return findings;
}

/**
 * Runs Ruff linter on Python code if available on the system.
 * If Ruff is not available, returns available: false without throwing.
 */
export async function runRuffIfAvailable(
  code: string,
  filePath: string,
  reviewId: string
): Promise<{ available: boolean; findings: ReviewFinding[]; statusMessage: string }> {
  const toolCheck = await checkRuffAvailable();
  if (!toolCheck.available) {
    return {
      available: false,
      findings: [],
      statusMessage: 'Ruff linter is not installed on this host. Using ReviewPilot Python AST analyzer.',
    };
  }

  try {
    // Run ruff using stdin
    const child = execFile(
      'ruff',
      ['check', '--output-format=json', '--stdin-filename', filePath, '-'],
      { timeout: 5000, maxBuffer: 1024 * 1024 },
      () => {}
    );

    let stdout = '';
    child.stdout?.on('data', (data) => {
      stdout += data;
    });

    child.stdin?.write(code);
    child.stdin?.end();

    await new Promise((resolve) => child.on('close', resolve));

    const findings = normalizeRuffOutput(stdout, filePath, reviewId, code);
    return {
      available: true,
      findings,
      statusMessage: `Ruff ${toolCheck.version || ''} executed successfully.`,
    };
  } catch (err: any) {
    return {
      available: true,
      findings: [],
      statusMessage: `Ruff check execution failed: ${err.message || 'unknown error'}`,
    };
  }
}
