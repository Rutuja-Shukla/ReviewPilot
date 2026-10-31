import { parser } from '@lezer/python';
import { ReviewFinding } from '../../../src/types/review.js';
import { getLineAndColumn } from './baseAdapter.js';
import { sanitizeFilePath } from '../../security/pathValidator.js';

export interface PythonAnalyzerOptions {
  reviewId: string;
  filePath: string;
  changedLines?: number[];
}

/**
 * Deterministic Python Static Analyzer powered by @lezer/python AST parsing and syntax rules.
 * Runs offline with zero external dependencies and guaranteed safety.
 */
export function runPythonStaticAnalysis(
  code: string,
  options: PythonAnalyzerOptions
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const lines = code.split(/\r?\n/);
  const totalLines = Math.max(1, lines.length);
  const cleanPath = sanitizeFilePath(options.filePath, 'app.py');
  const changedSet = options.changedLines ? new Set(options.changedLines) : null;

  const isLineChanged = (lineNum: number) => {
    return changedSet ? changedSet.has(lineNum) : true;
  };

  // 1. AST Traversal using @lezer/python
  try {
    const tree = parser.parse(code);

    tree.iterate({
      enter(node) {
        // Syntax error nodes in Python code
        if (node.type.isError) {
          const { line, column } = getLineAndColumn(code, node.from);
          const snippet = code.slice(Math.max(0, node.from - 10), Math.min(code.length, node.to + 15)).replace(/\n/g, ' ').trim();
          findings.push({
            id: `static-py-syntax-${line}-${options.reviewId}`,
            reviewId: options.reviewId,
            title: `Python Syntax Error near "${snippet || 'EOF'}"`,
            category: 'BUG',
            severity: 'HIGH',
            confidence: 0.99,
            filePath: cleanPath,
            startLine: line,
            endLine: line,
            codeExcerpt: lines[line - 1] || snippet,
            description: `Syntax parsing failure detected at line ${line}, column ${column}. The code contains invalid or malformed Python grammar.`,
            impact: 'Module cannot be imported or executed by Python runtime.',
            evidence: [`AST error token encountered at line ${line}, column ${column}`],
            recommendedFix: 'Correct the syntax error or missing delimiter.',
            suggestedPatch: null,
            detectionSource: 'STATIC_ANALYZER',
            validationStatus: 'STATICALLY_CONFIRMED',
            introducedByChange: isLineChanged(line),
            relatedFindingIds: [],
            ruleId: 'PY-SYNTAX-001',
            createdAt: new Date().toISOString(),
          });
          return false;
        }

        // Rule PY-BUG-001: Mutable default parameter (ParamList containing = [] or = {})
        if (node.name === 'ParamList') {
          const { line } = getLineAndColumn(code, node.from);
          const paramText = code.slice(node.from, node.to);
          const mutableMatch = paramText.match(/([a-zA-Z0-9_]+)\s*(?::\s*[^,=]+)?\s*=\s*(\[\]|\{\})/);
          if (mutableMatch) {
            const paramName = mutableMatch[1];
            const originalLine = lines[line - 1] || '';
            const fixedLine = originalLine.replace(mutableMatch[0], `${paramName}=None`);
            const patch = `--- a/${cleanPath}\n+++ b/${cleanPath}\n@@ -${line},1 +${line},1 @@\n-${originalLine}\n+${fixedLine}\n+    if ${paramName} is None:\n+        ${paramName} = ${mutableMatch[2]}`;

            findings.push({
              id: `static-py-bug-mutable-${line}-${options.reviewId}`,
              reviewId: options.reviewId,
              title: `Mutable Default Argument in Function Definition ("${paramName}")`,
              category: 'BUG',
              severity: 'HIGH',
              confidence: 0.95,
              filePath: cleanPath,
              startLine: line,
              endLine: line,
              codeExcerpt: originalLine.trim(),
              description: `Default argument "${paramName}" is initialized with a mutable container (${mutableMatch[2]}). In Python, default arguments are evaluated once at function definition time, leading to shared state mutation across calls.`,
              impact: 'State from previous calls persists into subsequent invocations, causing subtle data corruption bugs.',
              evidence: [`Mutable default parameter detected: "${mutableMatch[0]}" on line ${line}`],
              recommendedFix: `Use None as the default value (e.g. "${paramName}=None") and initialize "${paramName} = ${mutableMatch[2]}" inside the function body.`,
              suggestedPatch: patch,
              detectionSource: 'STATIC_ANALYZER',
              validationStatus: 'STATICALLY_CONFIRMED',
              introducedByChange: isLineChanged(line),
              relatedFindingIds: [],
              ruleId: 'PY-BUG-001',
              createdAt: new Date().toISOString(),
            });
          }
        }

        // Rule PY-BUG-002: Identity comparison with literal ('is' with string/number)
        if (node.name === 'BinaryExpression') {
          const exprText = code.slice(node.from, node.to);
          const matchIsLiteral = exprText.match(/\b([a-zA-Z0-9_.]+)\s+is\s+(['"][^'"]*['"]|\d+)/);
          if (matchIsLiteral && !matchIsLiteral[2].includes('None') && !matchIsLiteral[2].includes('True') && !matchIsLiteral[2].includes('False')) {
            const { line } = getLineAndColumn(code, node.from);
            const originalLine = lines[line - 1] || '';
            const fixedLine = originalLine.replace(`${matchIsLiteral[1]} is ${matchIsLiteral[2]}`, `${matchIsLiteral[1]} == ${matchIsLiteral[2]}`);

            findings.push({
              id: `static-py-bug-identity-${line}-${options.reviewId}`,
              reviewId: options.reviewId,
              title: `Identity Comparison ("is") Used With Literal Constant`,
              category: 'BUG',
              severity: 'HIGH',
              confidence: 0.94,
              filePath: cleanPath,
              startLine: line,
              endLine: line,
              codeExcerpt: originalLine.trim(),
              description: `Expression "${matchIsLiteral[0]}" compares value identity using 'is' instead of value equality ('=='). In Python, 'is' checks memory address identity; comparing with string or numeric literals can yield unpredictable results depending on compiler intern pools.`,
              impact: 'Equality checks may unexpectedly evaluate to False on different interpreter versions or string instances.',
              evidence: [`Line ${line}: "${matchIsLiteral[0]}"`],
              recommendedFix: `Replace 'is' with '==' (e.g. "${matchIsLiteral[1]} == ${matchIsLiteral[2]}").`,
              suggestedPatch: `--- a/${cleanPath}\n+++ b/${cleanPath}\n@@ -${line},1 +${line},1 @@\n-${originalLine}\n+${fixedLine}`,
              detectionSource: 'STATIC_ANALYZER',
              validationStatus: 'STATICALLY_CONFIRMED',
              introducedByChange: isLineChanged(line),
              relatedFindingIds: [],
              ruleId: 'PY-BUG-002',
              createdAt: new Date().toISOString(),
            });
          }
        }
      },
    });
  } catch (err: any) {
    console.warn('Python AST parse warning in static analyzer:', err);
  }

  // 2. Line-Level & Semantic Pattern Checks
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNum = idx + 1;
    const trimmed = line.trim();

    if (trimmed.startsWith('#') || trimmed.length === 0) continue;

    // Rule PY-SEC-001: Subprocess command injection via shell=True
    if (
      /subprocess\.(?:Popen|run|call|check_call|check_output)\s*\(.*?\bshell\s*=\s*True/i.test(line) ||
      /\bos\.system\s*\(.*?(?:\+|f['"]|%|\.format\()/i.test(line)
    ) {
      findings.push({
        id: `static-py-sec-shell-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'Command Injection Risk via Subprocess shell=True / os.system',
        category: 'SECURITY',
        severity: 'CRITICAL',
        confidence: 0.95,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: 'Executing system commands with shell=True or os.system using dynamic arguments allows command substitution and arbitrary remote shell execution.',
        impact: 'Remote code execution (RCE) on the server host under the application privileges.',
        evidence: [`Command invocation with shell=True detected on line ${lineNum}: "${trimmed}"`],
        recommendedFix: 'Pass arguments as an explicit list of strings without shell=True (e.g. subprocess.run(["ping", "-c", "1", host], check=True)).',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'PY-SEC-001',
        createdAt: new Date().toISOString(),
      });
    }

    // Rule PY-SEC-002: SQL Injection in Python DB-API
    if (
      /(?:cursor\.execute|db\.execute|rawQuery)\s*\(\s*f['"].*?(?:SELECT|INSERT|UPDATE|DELETE).*?\{/i.test(line) ||
      /(?:cursor\.execute|db\.execute)\s*\(\s*['"].*?(?:SELECT|INSERT|UPDATE|DELETE).*?['"]\s*%\s*[a-zA-Z0-9_]/i.test(line) ||
      /(?:cursor\.execute|db\.execute)\s*\(\s*['"].*?(?:SELECT|INSERT|UPDATE|DELETE).*?['"]\s*\+\s*[a-zA-Z0-9_]/i.test(line)
    ) {
      findings.push({
        id: `static-py-sec-sqli-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'SQL Injection via Unparameterized Python Query String',
        category: 'SECURITY',
        severity: 'CRITICAL',
        confidence: 0.94,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: 'Python database query concatenates or interpolates variables directly into raw SQL statements rather than using prepared statement parameters.',
        impact: 'Attackers can bypass authentication, exfiltrate sensitive database records, or modify database tables.',
        evidence: [`String interpolation inside SQL query on line ${lineNum}: "${trimmed}"`],
        recommendedFix: 'Use parameterized queries provided by the DB driver (e.g. cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))).',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'PY-SEC-002',
        createdAt: new Date().toISOString(),
      });
    }

    // Rule PY-SEC-003: Dynamic code execution (eval/exec)
    if (/\b(?:eval|exec)\s*\(.*?(?:req|input|data|param|user)/i.test(line)) {
      findings.push({
        id: `static-py-sec-eval-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'Dangerous Dynamic Code Execution (eval/exec)',
        category: 'SECURITY',
        severity: 'CRITICAL',
        confidence: 0.97,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: 'Dynamic execution with eval() or exec() processes untrusted input, granting arbitrary code execution capabilities.',
        impact: 'Full remote code execution vulnerability.',
        evidence: [`eval/exec call found on line ${lineNum}: "${trimmed}"`],
        recommendedFix: 'Use ast.literal_eval() for parsing primitive types or use explicit lookup dispatch dictionaries.',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'PY-SEC-003',
        createdAt: new Date().toISOString(),
      });
    }

    // Rule PY-SEC-004: Insecure Deserialization via pickle
    if (/\bpickle\.(?:loads|load)\s*\(/i.test(line)) {
      findings.push({
        id: `static-py-sec-pickle-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'Insecure Deserialization via Python pickle',
        category: 'SECURITY',
        severity: 'CRITICAL',
        confidence: 0.96,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: 'The pickle module is not secure against erroneous or maliciously constructed data. Unpickling untrusted data can execute arbitrary Python bytecode (__reduce__).',
        impact: 'Remote code execution upon deserialization.',
        evidence: [`pickle.load/loads call on line ${lineNum}: "${trimmed}"`],
        recommendedFix: 'Never unpickle untrusted data. Use safer serialization formats such as JSON, Protocol Buffers, or HMAC signing.',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'PY-SEC-004',
        createdAt: new Date().toISOString(),
      });
    }

    // Rule PY-BUG-003: Bare except clause
    if (/^\s*except\s*:\s*$/m.test(line)) {
      findings.push({
        id: `static-py-bug-bareexcept-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'Bare "except:" Clause Catches SystemExit and KeyboardInterrupt',
        category: 'BUG',
        severity: 'HIGH',
        confidence: 0.95,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: 'A bare "except:" clause catches BaseException, which includes SystemExit, KeyboardInterrupt, and GeneratorExit, preventing clean process shutdowns.',
        impact: 'Hides critical operational failures, interrupts, and mask bugs.',
        evidence: [`Bare except statement on line ${lineNum}: "${trimmed}"`],
        recommendedFix: 'Catch specific exception classes (e.g. except Exception: or except ValueError:).',
        suggestedPatch: `--- a/${cleanPath}\n+++ b/${cleanPath}\n@@ -${lineNum},1 +${lineNum},1 @@\n-${line}\n+${line.replace('except:', 'except Exception:')}`,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'PY-BUG-003',
        createdAt: new Date().toISOString(),
      });
    }

    // Rule PY-BUG-004: Swallowed Exception with pass
    if (
      /^\s*except.*?:/m.test(line) &&
      lines[idx + 1] &&
      /^\s*pass\s*$/m.test(lines[idx + 1])
    ) {
      findings.push({
        id: `static-py-bug-swallow-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'Exception Silently Swallowed with "pass"',
        category: 'BUG',
        severity: 'MEDIUM',
        confidence: 0.90,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum + 1,
        codeExcerpt: `${trimmed}\n${lines[idx + 1].trim()}`,
        description: 'The exception block completely swallows exceptions with "pass" without logging, metrics, or error recovery.',
        impact: 'Hides unexpected failures, causing silent data inconsistency downstream.',
        evidence: [`Except block followed immediately by pass on lines ${lineNum}-${lineNum + 1}`],
        recommendedFix: 'Log the error with logger.exception(...) or handle the failure explicitly.',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'PY-BUG-004',
        createdAt: new Date().toISOString(),
      });
    }

    // Rule PY-RES-001: Unclosed open() call without with
    if (
      /^\s*([a-zA-Z0-9_]+)\s*=\s*open\s*\(/m.test(line) &&
      !line.includes('with ') &&
      !lines.slice(idx, Math.min(lines.length, idx + 15)).some(l => l.includes('.close()'))
    ) {
      findings.push({
        id: `static-py-res-open-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'File Resource Opened Without "with" Context Manager',
        category: 'BUG',
        severity: 'MEDIUM',
        confidence: 0.88,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: 'File handle is opened using raw open() assignment without a "with" statement or guaranteed .close() cleanup.',
        impact: 'Causes file descriptor leaks on error, leading to EMFILE exhaustion under load.',
        evidence: [`Raw open() call without context manager on line ${lineNum}: "${trimmed}"`],
        recommendedFix: 'Use a "with open(...) as f:" context manager to guarantee deterministic closure.',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'PY-RES-001',
        createdAt: new Date().toISOString(),
      });
    }

    // Rule PY-QUAL-001: Wildcard import
    if (/^\s*from\s+[\w.]+\s+import\s+\*/m.test(line)) {
      findings.push({
        id: `static-py-qual-wildcard-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'Wildcard Import ("from module import *")',
        category: 'CODE_QUALITY',
        severity: 'LOW',
        confidence: 0.95,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: 'Wildcard imports pollute the local namespace, obscure symbol origins, and risk unintentional name shadowing.',
        impact: 'Reduces readability and increases the risk of variable shadowing bugs.',
        evidence: [`Wildcard import on line ${lineNum}: "${trimmed}"`],
        recommendedFix: 'Import explicit names or import the module directly (e.g. import module).',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'PY-QUAL-001',
        createdAt: new Date().toISOString(),
      });
    }
  }

  return findings;
}
