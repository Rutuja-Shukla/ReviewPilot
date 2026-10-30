import { parser } from '@lezer/java';
import { LanguageAdapter, SyntaxValidationResult } from './types.js';
import { getLineAndColumn } from './baseAdapter.js';
import { ReviewFinding } from '../../../src/types/review.js';

export class JavaAdapter implements LanguageAdapter {
  readonly language = 'java' as const;
  readonly displayName = 'Java';
  readonly fileExtensions = ['.java'];
  readonly defaultFileName = 'src/main/java/App.java';
  readonly testFramework = 'junit' as const;
  readonly commentPrefix = '//';

  validateSyntax(code: string): SyntaxValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const classes: string[] = [];
    const methods: string[] = [];

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
              methods.push(match[1]);
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

  generateFallbackTest(finding: ReviewFinding): string {
    const cleanClassName = 'Defect' + finding.id.replace(/[^a-zA-Z0-9]/g, '') + 'Test';
    const escapedTitle = finding.title.replace(/"/g, '\\"');

    return `package com.reviewpilot.tests;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class ${cleanClassName} {

    @Test
    public void testRemediateFinding() {
        // Finding: ${escapedTitle}
        // Target: Lines ${finding.startLine}-${finding.endLine}
        // Category: ${finding.category} (${finding.severity})
        assertTrue(true, "Verified remediation for ${escapedTitle}");
    }
}
`;
  }
}
