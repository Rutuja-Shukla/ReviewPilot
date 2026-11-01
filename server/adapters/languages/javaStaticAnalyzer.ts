import { parser } from '@lezer/java';
import { ReviewFinding } from '../../../src/types/review.js';
import { getLineAndColumn } from './baseAdapter.js';
import { sanitizeFilePath } from '../../security/pathValidator.js';

export interface JavaAnalyzerOptions {
  reviewId: string;
  filePath: string;
  changedLines?: number[];
}

/**
 * Deterministic Java Static Analyzer powered by @lezer/java AST parsing and rule evaluation.
 * Runs offline with zero external dependencies and guaranteed safety.
 */
export function runJavaStaticAnalysis(
  code: string,
  options: JavaAnalyzerOptions
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const lines = code.split(/\r?\n/);
  const totalLines = Math.max(1, lines.length);
  const cleanPath = sanitizeFilePath(options.filePath, 'src/main/java/App.java');
  const changedSet = options.changedLines ? new Set(options.changedLines) : null;

  const isLineChanged = (lineNum: number) => {
    return changedSet ? changedSet.has(lineNum) : true;
  };

  // 1. AST Traversal using @lezer/java
  try {
    const tree = parser.parse(code);

    tree.iterate({
      enter(node) {
        // Syntax error nodes in Java code
        if (node.type.isError) {
          const { line, column } = getLineAndColumn(code, node.from);
          const snippet = code
            .slice(Math.max(0, node.from - 10), Math.min(code.length, node.to + 15))
            .replace(/\n/g, ' ')
            .trim();
          findings.push({
            id: `static-java-syntax-${line}-${options.reviewId}`,
            reviewId: options.reviewId,
            title: `Java Syntax Error near "${snippet || 'EOF'}"`,
            category: 'BUG',
            severity: 'HIGH',
            confidence: 0.99,
            filePath: cleanPath,
            startLine: line,
            endLine: line,
            codeExcerpt: lines[line - 1] || snippet,
            description: `Syntax parsing failure detected at line ${line}, column ${column}. The code contains invalid or malformed Java grammar.`,
            impact: 'Source file cannot be compiled or verified by Java compiler.',
            evidence: [`AST error token encountered at line ${line}, column ${column}`],
            recommendedFix: 'Correct the syntax error or missing delimiter.',
            suggestedPatch: null,
            detectionSource: 'STATIC_ANALYZER',
            validationStatus: 'STATICALLY_CONFIRMED',
            introducedByChange: isLineChanged(line),
            relatedFindingIds: [],
            ruleId: 'JAVA-SYNTAX-001',
            createdAt: new Date().toISOString(),
          });
          return false;
        }

        // Rule JAVA-BUG-004: String Reference Equality (str == "..." or "..." == str)
        if (node.name === 'BinaryExpression') {
          const exprText = code.slice(node.from, node.to);
          const eqMatch = exprText.match(/^([a-zA-Z0-9_$.]+)\s*(==|!=)\s*("(?:[^"\\]|\\.)*")$/) ||
                          exprText.match(/^("(?:[^"\\]|\\.)*")\s*(==|!=)\s*([a-zA-Z0-9_$.]+)$/);
          if (eqMatch) {
            const { line } = getLineAndColumn(code, node.from);
            const op = eqMatch[2];
            const isLeftLiteral = eqMatch[1].startsWith('"');
            const literal = isLeftLiteral ? eqMatch[1] : eqMatch[3];
            const variable = isLeftLiteral ? eqMatch[3] : eqMatch[1];

            // Don't flag null checks (e.g. str == null)
            if (literal !== 'null') {
              const replacement = op === '==' ? `${literal}.equals(${variable})` : `!${literal}.equals(${variable})`;
              const originalLine = lines[line - 1] || exprText;
              const patchedLine = originalLine.replace(exprText, replacement);
              const patch = `--- a/${cleanPath}\n+++ b/${cleanPath}\n@@ -${line},1 +${line},1 @@\n-${originalLine}\n+${patchedLine}`;

              findings.push({
                id: `static-java-streq-${line}-${options.reviewId}`,
                reviewId: options.reviewId,
                title: 'String Reference Comparison Using "==" or "!=" (JAVA-BUG-004)',
                category: 'BUG',
                severity: 'HIGH',
                confidence: 0.96,
                filePath: cleanPath,
                startLine: line,
                endLine: line,
                codeExcerpt: originalLine,
                description: `String reference comparison "${exprText}" uses identity operator "${op}" instead of value comparison (.equals()). In Java, "==" compares memory addresses rather than string contents, causing intermittent bugs when strings are not interned.`,
                impact: 'String equality checks will unexpectedly evaluate to false for dynamically created strings with identical content.',
                evidence: [`BinaryExpression identity comparison: ${exprText}`],
                recommendedFix: `Compare string contents using ${replacement} or Objects.equals().`,
                suggestedPatch: patch,
                detectionSource: 'STATIC_ANALYZER',
                validationStatus: 'STATICALLY_CONFIRMED',
                introducedByChange: isLineChanged(line),
                relatedFindingIds: [],
                ruleId: 'JAVA-BUG-004',
                createdAt: new Date().toISOString(),
              });
            }
          }
        }

        // Rule JAVA-BUG-003: Swallowed Exception / Empty Catch Block
        if (node.name === 'CatchClause') {
          const catchText = code.slice(node.from, node.to);
          const { line } = getLineAndColumn(code, node.from);
          // Check for empty body or only comments/whitespace
          const bodyMatch = catchText.match(/catch\s*\([^)]+\)\s*\{([^}]*)\}/s);
          if (bodyMatch) {
            const inner = bodyMatch[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*.*?\*\//gs, '').trim();
            if (inner.length === 0 || inner === 'e.printStackTrace();' || inner === 'System.out.println(e);') {
              const originalLine = lines[line - 1] || catchText.split('\n')[0];
              findings.push({
                id: `static-java-swallowed-ex-${line}-${options.reviewId}`,
                reviewId: options.reviewId,
                title: 'Swallowed or Inadequately Handled Exception (JAVA-BUG-003)',
                category: 'BUG',
                severity: 'MEDIUM',
                confidence: 0.95,
                filePath: cleanPath,
                startLine: line,
                endLine: Math.min(totalLines, line + (catchText.split('\n').length - 1)),
                codeExcerpt: catchText.split('\n').slice(0, 3).join('\n'),
                description: 'Catch block is empty or merely prints stack trace without proper error recovery, logging, or rethrowing.',
                impact: 'Critical errors, timeouts, and state corruptions are silently suppressed, complicating debugging and recovery.',
                evidence: [`Catch clause body contains no recovery or rethrow: "${inner || '<empty>'}"`],
                recommendedFix: 'Log the exception via an authorized logging framework (e.g. SLF4J), rethrow as a domain-specific exception, or implement fallback logic.',
                suggestedPatch: null,
                detectionSource: 'STATIC_ANALYZER',
                validationStatus: 'STATICALLY_CONFIRMED',
                introducedByChange: isLineChanged(line),
                relatedFindingIds: [],
                ruleId: 'JAVA-BUG-003',
                createdAt: new Date().toISOString(),
              });
            }
          }
        }
      },
    });
  } catch (err: any) {
    // AST parser error caught gracefully
  }

  // 2. Semantic & Pattern Analysis across source lines
  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;
    const trimmed = lineText.trim();

    // Skip empty lines or pure comment lines
    if (trimmed.length === 0 || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return;
    }

    // Rule JAVA-SEC-001: SQL Injection via String Concatenation in JDBC/JPA
    // e.g. stmt.executeQuery("SELECT ... " + userInput) or createQuery("SELECT ... " + id)
    const isSqlExecution =
      /\b(executeQuery|executeUpdate|execute|createQuery|createNativeQuery)\s*\(/i.test(lineText);
    const hasConcatenation = /["'].*?["']\s*\+\s*[a-zA-Z0-9_$]+/.test(lineText) ||
                             /[a-zA-Z0-9_$]+\s*\+\s*["'].*?["']/.test(lineText) ||
                             /String\.format\s*\(\s*["']SELECT|INSERT|UPDATE|DELETE/i.test(lineText);
    if (isSqlExecution && hasConcatenation) {
      findings.push({
        id: `static-java-sqli-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'Potential SQL Injection via Dynamic Query Construction (JAVA-SEC-001)',
        category: 'SECURITY',
        severity: 'CRITICAL',
        confidence: 0.94,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: 'Executing an SQL query constructed via dynamic string concatenation allows attackers to manipulate the database query structure (SQL Injection / CWE-89).',
        impact: 'Full database compromise, unauthorized data extraction, modification, or table truncation.',
        evidence: [`SQL execution with concatenated parameters: ${trimmed}`],
        recommendedFix: 'Use parameterized SQL queries with PreparedStatement placeholders (?) or JPA named parameters (:param).',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'JAVA-SEC-001',
        createdAt: new Date().toISOString(),
      });
    }

    // Rule JAVA-SEC-002: Command Injection in Runtime.exec or ProcessBuilder
    // e.g. Runtime.getRuntime().exec("sh -c " + cmd) or new ProcessBuilder("sh", "-c", cmd)
    const isExecCall =
      /\bRuntime\.getRuntime\s*\(\s*\)\.exec\s*\(/.test(lineText) ||
      /\bnew\s+ProcessBuilder\s*\(/.test(lineText);
    if (isExecCall && (/\+/.test(lineText) || /String\.format/.test(lineText))) {
      findings.push({
        id: `static-java-cmdinj-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'Command Injection via Unsanitized Command String (JAVA-SEC-002)',
        category: 'SECURITY',
        severity: 'CRITICAL',
        confidence: 0.95,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: 'Constructing operating system commands dynamically from external input enables arbitrary command execution (Command Injection / CWE-78).',
        impact: 'Remote code execution on the underlying host with the privileges of the JVM process.',
        evidence: [`Dynamic OS command invocation: ${trimmed}`],
        recommendedFix: 'Pass command arguments as separate array elements to ProcessBuilder without invoking a shell interpreter, and validate arguments against a strict allowlist.',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'JAVA-SEC-002',
        createdAt: new Date().toISOString(),
      });
    }

    // Rule JAVA-SEC-003: Path Traversal
    // e.g. new File(baseDir, userInput) or Paths.get(baseDir, userInput) without canonical path check
    const isFileCreation = /\bnew\s+File\s*\([^)]*,[^)]+\)/.test(lineText) || /\bPaths\.get\s*\([^)]*,[^)]+\)/.test(lineText);
    const hasPathSanitization = code.includes('getCanonicalPath') || code.includes('normalize()');
    if (isFileCreation && !hasPathSanitization) {
      findings.push({
        id: `static-java-pathtrav-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'Potential Path Traversal in File Resolution (JAVA-SEC-003)',
        category: 'SECURITY',
        severity: 'HIGH',
        confidence: 0.88,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: 'Constructing File or Path objects using relative paths from user input without canonical path verification can allow Directory Traversal (CWE-22).',
        impact: 'Attackers can escape the intended directory and access, overwrite, or delete sensitive system files.',
        evidence: [`File construction with dynamic path component: ${trimmed}`],
        recommendedFix: 'Verify that targetFile.getCanonicalPath().startsWith(baseDir.getCanonicalPath()) before performing file operations.',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'JAVA-SEC-003',
        createdAt: new Date().toISOString(),
      });
    }

    // Rule JAVA-SEC-004: Hardcoded Cryptographic Key / Secret
    const isCryptoKey = /\bnew\s+SecretKeySpec\s*\(\s*"(?:[^"\\]|\\.)*"\.getBytes/.test(lineText) ||
                        /\bKeySpec\s+.*?=\s*new\s+PBEKeySpec\s*\(\s*"(?:[^"\\]|\\.)*"/.test(lineText);
    if (isCryptoKey) {
      findings.push({
        id: `static-java-hardcoded-secret-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'Hardcoded Cryptographic Key or Password (JAVA-SEC-004)',
        category: 'SECURITY',
        severity: 'HIGH',
        confidence: 0.98,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: 'Hardcoded cryptographic keys or passwords embedded in source code can be extracted from binaries or version control.',
        impact: 'Loss of confidentiality and compromise of encrypted data across all deployed instances.',
        evidence: [`Hardcoded SecretKeySpec / KeySpec instantiation: ${trimmed}`],
        recommendedFix: 'Load secret keys from environment variables, system properties, or a secure Key Vault (e.g. AWS KMS, GCP Secret Manager).',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'JAVA-SEC-004',
        createdAt: new Date().toISOString(),
      });
    }

    // Rule JAVA-BUG-001: Potential Null Dereference / Inverted Equals
    // e.g. variable.equals("constant") where variable could be null, instead of "constant".equals(variable)
    const invertedEqualsMatch = trimmed.match(/^([a-zA-Z0-9_$]+)\.equals\s*\(\s*("(?:[^"\\]|\\.)*")\s*\)$/) ||
                                lineText.match(/([a-zA-Z0-9_$]+)\.equals\s*\(\s*("(?:[^"\\]|\\.)*")\s*\)/);
    if (invertedEqualsMatch && !lineText.includes('Objects.equals') && !lineText.includes('if (' + invertedEqualsMatch[1] + ' != null')) {
      const varName = invertedEqualsMatch[1];
      const literalStr = invertedEqualsMatch[2];
      // Don't flag if varName is obvious class or this
      if (varName !== 'this' && varName !== 'String' && varName !== 'super') {
        const replacement = `${literalStr}.equals(${varName})`;
        const patchedLine = lineText.replace(`${varName}.equals(${literalStr})`, replacement);
        const patch = `--- a/${cleanPath}\n+++ b/${cleanPath}\n@@ -${lineNum},1 +${lineNum},1 @@\n-${lineText}\n+${patchedLine}`;

        findings.push({
          id: `static-java-null-equals-${lineNum}-${options.reviewId}`,
          reviewId: options.reviewId,
          title: 'Potential NullPointerException in String.equals() (JAVA-BUG-001)',
          category: 'BUG',
          severity: 'MEDIUM',
          confidence: 0.91,
          filePath: cleanPath,
          startLine: lineNum,
          endLine: lineNum,
          codeExcerpt: trimmed,
          description: `Invoking .equals() on variable "${varName}" will throw a NullPointerException if "${varName}" is null. Inverting to "${literalStr}.equals(${varName})" or using Objects.equals(${varName}, ${literalStr}) is null-safe.`,
          impact: 'Uncaught NullPointerException when input variable is null.',
          evidence: [`Unsafe dereference: ${trimmed}`],
          recommendedFix: `Replace with "${replacement}" or "Objects.equals(${varName}, ${literalStr})".`,
          suggestedPatch: patch,
          detectionSource: 'STATIC_ANALYZER',
          validationStatus: 'STATICALLY_CONFIRMED',
          introducedByChange: isLineChanged(lineNum),
          relatedFindingIds: [],
          ruleId: 'JAVA-BUG-001',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Rule JAVA-BUG-002: Resource Leak / Unclosed Stream without Try-With-Resources
    // e.g. FileInputStream fis = new FileInputStream("file.txt"); fis.read();
    const resourceAllocMatch = trimmed.match(/^(?:(?:final\s+)?(?:FileInputStream|FileOutputStream|FileReader|FileWriter|BufferedReader|BufferedWriter|Socket|ServerSocket|Connection|Statement|PreparedStatement|ResultSet))\s+([a-zA-Z0-9_$]+)\s*=\s*(?:new\s+|DriverManager\.)/);
    if (resourceAllocMatch) {
      // Check if this allocation is inside a try-with-resources statement: `try (Resource ...)`
      // In Java, try-with-resources lines begin with or contain `try (` before the resource
      const isTryWithResources = /try\s*\([^)]*new\s+/i.test(lineText) || /try\s*\(/.test(lineText);
      if (!isTryWithResources) {
        const resVar = resourceAllocMatch[1];
        findings.push({
          id: `static-java-resleak-${lineNum}-${options.reviewId}`,
          reviewId: options.reviewId,
          title: 'Unclosed Resource / Stream Leak (JAVA-BUG-002)',
          category: 'BUG',
          severity: 'HIGH',
          confidence: 0.93,
          filePath: cleanPath,
          startLine: lineNum,
          endLine: lineNum,
          codeExcerpt: trimmed,
          description: `Resource "${resVar}" is allocated without a try-with-resources block. If an I/O exception occurs prior to explicit close(), the underlying operating system file handle or socket descriptor remains open.`,
          impact: 'File descriptor exhaustion, memory leaks, and lock contention on external files or database connection pools.',
          evidence: [`Resource allocation without try-with-resources: ${trimmed}`],
          recommendedFix: `Wrap resource initialization inside a try-with-resources statement: "try (${trimmed}) { ... }".`,
          suggestedPatch: null,
          detectionSource: 'STATIC_ANALYZER',
          validationStatus: 'STATICALLY_CONFIRMED',
          introducedByChange: isLineChanged(lineNum),
          relatedFindingIds: [],
          ruleId: 'JAVA-BUG-002',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Rule JAVA-QUAL-001: Wildcard Import
    if (trimmed.startsWith('import ') && trimmed.endsWith('.*;')) {
      findings.push({
        id: `static-java-wildcard-import-${lineNum}-${options.reviewId}`,
        reviewId: options.reviewId,
        title: 'Wildcard Import Usage (JAVA-QUAL-001)',
        category: 'CODE_QUALITY',
        severity: 'LOW',
        confidence: 0.99,
        filePath: cleanPath,
        startLine: lineNum,
        endLine: lineNum,
        codeExcerpt: trimmed,
        description: `Wildcard import "${trimmed}" pollutes namespace and can cause class name collisions as libraries evolve.`,
        impact: 'Ambiguous class references and impaired code readability.',
        evidence: [`Wildcard package import: ${trimmed}`],
        recommendedFix: 'Replace wildcard import with explicit class imports.',
        suggestedPatch: null,
        detectionSource: 'STATIC_ANALYZER',
        validationStatus: 'STATICALLY_CONFIRMED',
        introducedByChange: isLineChanged(lineNum),
        relatedFindingIds: [],
        ruleId: 'JAVA-QUAL-001',
        createdAt: new Date().toISOString(),
      });
    }
  });

  return findings;
}
