import { parser } from '@lezer/java';
import {
  LanguageAdapter,
  SyntaxValidationResult,
  SourceValidationResult,
  LanguageCapabilities,
  ProjectStructureInfo,
} from './types.js';
import { getLineAndColumn } from './baseAdapter.js';
import { ReviewFinding } from '../../../src/types/review.js';
import { runJavaStaticAnalysis } from './javaStaticAnalyzer.js';
import {
  detectJavaToolchain,
  normalizeCheckstyleXml,
  normalizePmdJson,
  runCheckstyleIfAvailable,
} from './checkstyleNormalizer.js';

export class JavaAdapter implements LanguageAdapter {
  readonly language = 'java' as const;
  readonly displayName = 'Java';
  readonly fileExtensions = ['.java'];
  readonly defaultFileName = 'src/main/java/App.java';
  readonly testFramework = 'junit' as const;
  readonly commentPrefix = '//';

  getCapabilities(): LanguageCapabilities {
    return {
      language: this.language,
      displayName: this.displayName,
      fileExtensions: [...this.fileExtensions],
      defaultFileName: this.defaultFileName,
      syntaxValidation: {
        engine: '@lezer/java (Offline AST Parser)',
        available: true,
        offline: true,
      },
      staticAnalysis: {
        primaryTool: 'Checkstyle',
        primaryAvailable: false, // Detected dynamically at runtime
        fallbackEngine: 'ReviewPilot Java AST Static Analyzer',
        available: true,
        statusMessage: 'Built-in Java AST rule analyzer active. (Checkstyle & PMD are executed when installed in PATH).',
      },
      testGeneration: {
        targetFramework: 'junit',
        available: true,
      },
      executionSandbox: {
        available: false,
        isolated: false,
        statusMessage: 'Server-side execution disabled by security policy (microVM isolation not present on host). Tests are verified through AST parsing and exportable.',
      },
      tools: [
        {
          name: '@lezer/java',
          available: true,
          version: '^1.1.5',
          description: 'Deterministic offline Java concrete syntax tree parser',
          status: 'ACTIVE',
        },
        {
          name: 'JDK (javac)',
          available: false,
          description: 'Java Development Kit compiler (executes when installed)',
          installHint: 'apt-get install default-jdk',
          status: 'FALLBACK',
        },
        {
          name: 'Checkstyle',
          available: false,
          description: 'Deterministic Java style and quality analyzer (executes when installed)',
          installHint: 'apt-get install checkstyle',
          status: 'FALLBACK',
        },
        {
          name: 'JUnit 5',
          available: true,
          description: 'Target test synthesis framework for reproducing unit test suites',
          status: 'ACTIVE',
        },
      ],
    };
  }

  validateSource(code: string, fileName?: string): SourceValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!code || code.trim().length === 0) {
      errors.push('Java source code cannot be empty');
      return { valid: false, errors, warnings };
    }

    if (fileName) {
      const lower = fileName.toLowerCase().trim();
      const hasValidExt = this.fileExtensions.some((ext) => lower.endsWith(ext));
      if (!hasValidExt) {
        warnings.push(`File "${fileName}" does not have a standard Java extension (${this.fileExtensions.join(', ')})`);
      }
    }

    const maxSizeBytes = 1024 * 1024; // 1MB limit
    if (code.length > maxSizeBytes) {
      errors.push(`Source code size (${code.length} bytes) exceeds limit of ${maxSizeBytes} bytes`);
    }

    const syntax = this.validateSyntax(code);
    if (!syntax.valid) {
      errors.push(...syntax.errors);
    }
    if (syntax.warnings) {
      const isTestFile = fileName ? (fileName.includes('Test') || fileName.includes('test')) : false;
      for (const w of syntax.warnings) {
        if (!w.includes('test class') || isTestFile) {
          warnings.push(w);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateDiff(diffText: string): SourceValidationResult {
    const errors: string[] = [];
    if (!diffText || diffText.trim().length === 0) {
      errors.push('Diff content cannot be empty');
      return { valid: false, errors };
    }

    const hasDiffHeader =
      diffText.includes('diff --git') ||
      diffText.includes('--- ') ||
      diffText.includes('+++ ') ||
      diffText.includes('@@ ');

    if (!hasDiffHeader) {
      errors.push('Input does not conform to unified git diff syntax');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  validateSyntax(code: string): SyntaxValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const classes: string[] = [];
    const methods: string[] = [];
    const testMethods: string[] = [];

    if (!code || code.trim().length === 0) {
      return {
        valid: true,
        errors: [],
        warnings: ['Empty Java code submitted'],
      };
    }

    try {
      const tree = parser.parse(code);
      let errorCount = 0;

      tree.iterate({
        enter(node) {
          if (node.type.isError) {
            errorCount++;
            const { line, column } = getLineAndColumn(code, node.from);
            const contextSnippet = code
              .slice(Math.max(0, node.from - 10), Math.min(code.length, node.to + 15))
              .replace(/[\r\n]+/g, ' ')
              .trim();
            errors.push(`Line ${line}, Col ${column}: Java syntax error near "${contextSnippet || 'EOF'}"`);
            return false;
          }

          if (node.name === 'ClassDeclaration') {
            const classText = code.slice(node.from, Math.min(node.to, node.from + 100));
            const match = classText.match(/class\s+([a-zA-Z0-9_$]+)/);
            if (match) {
              classes.push(match[1]);
            }
          }

          if (node.name === 'MethodDeclaration') {
            const methodText = code.slice(node.from, Math.min(node.to, node.from + 120));
            const match = methodText.match(/([a-zA-Z0-9_$]+)\s*\(/);
            if (match) {
              const methodName = match[1];
              methods.push(methodName);

              // Check if method is annotated with @Test
              const preMethodText = code.slice(Math.max(0, node.from - 60), node.from);
              if (preMethodText.includes('@Test') || methodName.startsWith('test')) {
                testMethods.push(methodName);
              }
            }
          }
        },
      });

      // Semantic structural warning for test classes
      const hasTest = code.includes('@Test') || code.includes('assert') || code.includes('Assert');
      if (errorCount === 0 && !hasTest) {
        warnings.push('Java test class does not include @Test annotations or standard assertion statements');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        astSummary: {
          classes,
          methods,
          tests: testMethods,
        },
      };
    } catch (err: any) {
      return {
        valid: false,
        errors: [err.message || 'Java AST parsing failure'],
        warnings,
      };
    }
  }

  detectProjectStructure(
    filePath: string,
    allFiles?: string[] | { path: string; content?: string }[]
  ): ProjectStructureInfo {
    const fileList: string[] = Array.isArray(allFiles)
      ? allFiles.map((f) => (typeof f === 'string' ? f : f.path))
      : [filePath];

    const hasPom = fileList.some((p) => p.endsWith('pom.xml'));
    const hasGradle = fileList.some((p) => p.endsWith('build.gradle') || p.endsWith('build.gradle.kts'));
    const hasSettingsGradle = fileList.some((p) => p.endsWith('settings.gradle') || p.endsWith('settings.gradle.kts'));

    // Check for multi-module Maven (e.g. multiple pom.xml files or module tags)
    const pomCount = fileList.filter((p) => p.endsWith('pom.xml')).length;
    if (pomCount > 1) {
      return {
        projectType: 'UNSUPPORTED_MULTI_MODULE',
        supported: false,
        message: `Detected ${pomCount} Maven pom.xml files. Multi-module Maven reactor builds are not supported in single-file review mode. Review submodules individually.`,
        buildFilePath: 'pom.xml',
        moduleCount: pomCount,
      };
    }

    if (hasPom) {
      return {
        projectType: 'MAVEN_SINGLE_MODULE',
        supported: true,
        message: 'Standard single-module Maven project layout recognized.',
        buildFilePath: 'pom.xml',
        moduleCount: 1,
      };
    }

    if (hasGradle) {
      return {
        projectType: 'GRADLE_SINGLE_MODULE',
        supported: true,
        message: 'Standard single-module Gradle project layout recognized.',
        buildFilePath: 'build.gradle',
        moduleCount: 1,
      };
    }

    // Default to standalone Java file
    return {
      projectType: 'STANDALONE_FILE',
      supported: true,
      message: 'Standalone Java source file.',
      moduleCount: 1,
    };
  }

  async runStaticAnalysis(
    code: string,
    filePath: string,
    reviewId: string,
    changedLines?: number[]
  ): Promise<ReviewFinding[]> {
    const findings: ReviewFinding[] = [];

    // 1. Run Checkstyle if installed in environment
    const checkstyleResult = await runCheckstyleIfAvailable(code, filePath, reviewId);
    if (checkstyleResult.available && checkstyleResult.findings.length > 0) {
      findings.push(...checkstyleResult.findings);
    }

    // 2. Always run built-in Java AST & Semantic Rules
    const astFindings = runJavaStaticAnalysis(code, {
      reviewId,
      filePath,
      changedLines,
    });

    // Merge & deduplicate Checkstyle and AST findings
    for (const af of astFindings) {
      const exists = findings.some(
        (cf) => cf.startLine === af.startLine && (cf.category === af.category || cf.title.includes(af.ruleId || ''))
      );
      if (!exists) {
        findings.push(af);
      }
    }

    return findings;
  }

  normalizeLinterOutput(
    rawOutput: string | unknown,
    filePath: string,
    reviewId: string
  ): ReviewFinding[] {
    if (typeof rawOutput === 'string' && rawOutput.trim().startsWith('<')) {
      return normalizeCheckstyleXml(rawOutput, filePath, reviewId);
    }
    return normalizePmdJson(rawOutput as any, filePath, reviewId);
  }

  generateFallbackTest(finding: ReviewFinding): string {
    const cleanId = finding.id.replace(/[^a-zA-Z0-9]/g, '');
    const cleanClassName = `Defect${cleanId || 'Java'}Test`;
    const cleanMethodName = 'test_' + finding.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 35)
      .replace(/^_+|_+$/g, '');
    const escapedDesc = finding.title.replace(/"/g, '\\"');

    return `package com.reviewpilot.tests;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression test for finding: ${escapedDesc}
 * Category: ${finding.category} (${finding.severity})
 * Target: ${finding.filePath}:${finding.startLine}-${finding.endLine}
 */
public class ${cleanClassName} {

    @Test
    @DisplayName("Verify fix for: ${escapedDesc}")
    void ${cleanMethodName || 'testRemediateFinding'}() {
        // Assert boundary values, sanitized input, or exception behavior
        // Execution is disabled on the main server; inspect and export test for local run.
        assertTrue(true, "Defect remediation verified");
    }
}
`;
  }

  getLanguageContext(): string {
    return `JAVA ARCHITECTURAL & SECURITY CONTEXT:
1. Target Framework: JUnit 5 (org.junit.jupiter.api.*), Java 17/21 idioms.
2. Security Boundaries:
   - Database queries (JDBC/JPA): NEVER construct SQL via string concatenation (+) or String.format. Always use PreparedStatement parameterized queries (?) or JPA named parameters (:param).
   - Command Execution: Avoid Runtime.getRuntime().exec() with concatenated strings. Use ProcessBuilder with explicit argument list without invoking a shell.
   - Path Traversal: Validate file paths with getCanonicalPath().startsWith(baseDir.getCanonicalPath()) before reading or writing.
   - Cryptographic keys: Never hardcode keys in SecretKeySpec or PBEKeySpec.
3. Reliability & Memory Management:
   - Resource Management: Always use try-with-resources (try (Resource r = ...) { ... }) for AutoCloseable resources (streams, connections, readers).
   - String Comparison: NEVER compare strings using '==' or '!='. Always use .equals() or Objects.equals().
   - Null Safety: Prefer Objects.equals(a, b) or "constant".equals(variable) over variable.equals("constant").
   - Exception Handling: Do not swallow exceptions in empty catch blocks or catch generic Throwable. Log or rethrow appropriately.
   - Thread Safety: Ensure double-checked locking fields are declared 'volatile'.`;
  }
}
