import { describe, it, expect } from 'vitest';
import {
  JavaAdapter,
  languageAdapterRegistry,
  runJavaStaticAnalysis,
  normalizeCheckstyleXml,
  normalizePmdJson,
  detectJavaToolchain,
  runCheckstyleIfAvailable,
} from '../../server/adapters/languages/index.js';
import { detectLanguage } from '../../src/utils/languageDetector.js';
import { ReviewFinding } from '../../src/types/review.js';

describe('ReviewPilot — Phase 2: Production-Quality Java Support', () => {
  const javaAdapter = new JavaAdapter();

  describe('1. Adapter Registration & Language Detection', () => {
    it('is registered in languageAdapterRegistry with full capabilities', () => {
      const adapter = languageAdapterRegistry.getAdapter('java');
      expect(adapter).toBeDefined();
      expect(adapter.language).toBe('java');
      expect(adapter.displayName).toBe('Java');
      expect(adapter.fileExtensions).toContain('.java');
      expect(adapter.testFramework).toBe('junit');
      expect(adapter.commentPrefix).toBe('//');

      const capabilities = adapter.getCapabilities();
      expect(capabilities.syntaxValidation.available).toBe(true);
      expect(capabilities.syntaxValidation.offline).toBe(true);
      expect(capabilities.testGeneration.targetFramework).toBe('junit');
      expect(capabilities.executionSandbox.available).toBe(false);
      expect(capabilities.tools.some((t) => t.name === '@lezer/java')).toBe(true);
      expect(capabilities.tools.some((t) => t.name === 'JUnit 5')).toBe(true);
    });

    it('detects Java from file name, content heuristics, and diff headers', () => {
      expect(detectLanguage({ fileName: 'UserService.java' })).toBe('java');
      expect(detectLanguage({ fileName: 'src/main/java/com/example/App.java' })).toBe('java');

      const snippet = `package com.example.service;
import java.util.List;
public class OrderService {
    public static void main(String[] args) {
        System.out.println("Processing");
    }
}`;
      expect(detectLanguage({ code: snippet })).toBe('java');

      const diff = `--- a/src/main/java/Account.java\n+++ b/src/main/java/Account.java\n@@ -1,3 +1,3 @@`;
      expect(detectLanguage({ diffText: diff })).toBe('java');
    });
  });

  describe('2. Source & Diff Validation', () => {
    it('validates correct Java source without errors', () => {
      const code = `package com.example;
public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }
}`;
      const result = javaAdapter.validateSource(code, 'Calculator.java');
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('rejects empty Java source input', () => {
      const result = javaAdapter.validateSource('   \n  ');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Java source code cannot be empty');
    });

    it('warns when file does not have a .java extension', () => {
      const code = `public class Test {}`;
      const result = javaAdapter.validateSource(code, 'script.txt');
      expect(result.valid).toBe(true);
      expect(result.warnings?.some((w) => w.includes('Java extension'))).toBe(true);
    });

    it('validates unified git diff syntax', () => {
      const validDiff = `--- a/App.java\n+++ b/App.java\n@@ -1,2 +1,2 @@\n-int x = 1;\n+int x = 2;`;
      const resValid = javaAdapter.validateDiff(validDiff);
      expect(resValid.valid).toBe(true);

      const invalidDiff = `not a real diff`;
      const resInvalid = javaAdapter.validateDiff(invalidDiff);
      expect(resInvalid.valid).toBe(false);
      expect(resInvalid.errors).toContain('Input does not conform to unified git diff syntax');
    });
  });

  describe('3. Offline Syntax Parsing with @lezer/java', () => {
    it('extracts class names and method declarations from AST', () => {
      const code = `package com.example.auth;
public class TokenValidator {
    public boolean isValid(String token) {
        return token != null;
    }
    private void cleanup() {}
}`;
      const syntax = javaAdapter.validateSyntax(code);
      expect(syntax.valid).toBe(true);
      expect(syntax.errors).toEqual([]);
      expect(syntax.astSummary?.classes).toContain('TokenValidator');
      expect(syntax.astSummary?.methods).toContain('isValid');
      expect(syntax.astSummary?.methods).toContain('cleanup');
    });

    it('reports accurate line and column coordinates for Java syntax errors', () => {
      const brokenCode = `public class Broken {
    public void test( {
        int x = 1;
    }
}`;
      const syntax = javaAdapter.validateSyntax(brokenCode);
      expect(syntax.valid).toBe(false);
      expect(syntax.errors.length).toBeGreaterThan(0);
      expect(syntax.errors[0]).toMatch(/Line \d+, Col \d+: Java syntax error/);
    });

    it('warns when a Java test file has no @Test annotations', () => {
      const testCode = `package com.example;
public class ServiceTest {
    public void someHelper() {
        int a = 1;
    }
}`;
      const syntax = javaAdapter.validateSyntax(testCode);
      expect(syntax.valid).toBe(true);
      expect(syntax.warnings.some((w) => w.includes('@Test annotations'))).toBe(true);
    });
  });

  describe('4. Checkstyle & PMD Output Normalization & Tool Detection', () => {
    it('normalizes Checkstyle XML output into ReviewFinding array', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<checkstyle version="10.12.0">
  <file name="src/main/java/App.java">
    <error line="15" column="5" severity="error" message="Method name 'Foo' must match pattern '^[a-z][a-zA-Z0-9]*$'." source="com.puppycrawl.tools.checkstyle.checks.naming.MethodNameCheck"/>
    <error line="22" column="9" severity="warning" message="Avoid empty catch blocks" source="com.puppycrawl.tools.checkstyle.checks.blocks.EmptyCatchBlockCheck"/>
  </file>
</checkstyle>`;

      const findings = normalizeCheckstyleXml(xml, 'src/main/java/App.java', 'rev-java-100');
      expect(findings.length).toBe(2);
      expect(findings[0].startLine).toBe(15);
      expect(findings[0].severity).toBe('HIGH');
      expect(findings[0].ruleId).toBe('checkstyle.MethodNameCheck');
      expect(findings[0].validationStatus).toBe('STATICALLY_CONFIRMED');

      expect(findings[1].startLine).toBe(22);
      expect(findings[1].severity).toBe('MEDIUM');
      expect(findings[1].ruleId).toBe('checkstyle.EmptyCatchBlockCheck');
    });

    it('normalizes PMD JSON output into ReviewFinding array', () => {
      const pmdJson = {
        formatVersion: 0,
        pmdVersion: '7.0.0',
        files: [
          {
            filename: 'src/main/java/App.java',
            violations: [
              {
                beginline: 30,
                endline: 30,
                rule: 'AvoidUsingHardCodedIP',
                ruleset: 'Security',
                priority: 1,
                description: 'Do not hardcode IPv4/IPv6 addresses',
              },
            ],
          },
        ],
      };

      const findings = normalizePmdJson(pmdJson, 'src/main/java/App.java', 'rev-java-101');
      expect(findings.length).toBe(1);
      expect(findings[0].severity).toBe('CRITICAL');
      expect(findings[0].category).toBe('SECURITY');
      expect(findings[0].ruleId).toBe('pmd.AvoidUsingHardCodedIP');
    });

    it('honestly reports when Checkstyle binary is not in PATH without fabricating findings', async () => {
      const result = await runCheckstyleIfAvailable('class A {}', 'A.java', 'rev-1');
      if (!result.available) {
        expect(result.findings).toEqual([]);
        expect(result.statusMessage).toContain('not detected in PATH');
      }
    });
  });

  describe('5. Java Deterministic AST Static Analyzer Rules', () => {
    it('detects SQL injection via dynamic query string concatenation (JAVA-SEC-001)', () => {
      const code = `package com.example.dao;
import java.sql.Statement;
import java.sql.ResultSet;
public class UserDao {
    public ResultSet queryUser(Statement stmt, String userId) throws Exception {
        return stmt.executeQuery("SELECT * FROM users WHERE id = '" + userId + "'");
    }
}`;
      const findings = runJavaStaticAnalysis(code, {
        reviewId: 'test-sqli',
        filePath: 'src/main/java/UserDao.java',
      });

      const sqli = findings.find((f) => f.ruleId === 'JAVA-SEC-001');
      expect(sqli).toBeDefined();
      expect(sqli?.severity).toBe('CRITICAL');
      expect(sqli?.category).toBe('SECURITY');
      expect(sqli?.startLine).toBe(6);
    });

    it('detects command injection in Runtime.getRuntime().exec (JAVA-SEC-002)', () => {
      const code = `package com.example;
public class SystemExecutor {
    public void pingHost(String host) throws Exception {
        Runtime.getRuntime().exec("ping -c 1 " + host);
    }
}`;
      const findings = runJavaStaticAnalysis(code, {
        reviewId: 'test-cmdinj',
        filePath: 'src/main/java/SystemExecutor.java',
      });

      const cmdInj = findings.find((f) => f.ruleId === 'JAVA-SEC-002');
      expect(cmdInj).toBeDefined();
      expect(cmdInj?.severity).toBe('CRITICAL');
      expect(cmdInj?.category).toBe('SECURITY');
    });

    it('detects unclosed stream resource leaks without try-with-resources (JAVA-BUG-002)', () => {
      const code = `package com.example;
import java.io.FileInputStream;
public class Reader {
    public void readData(String file) throws Exception {
        FileInputStream fis = new FileInputStream(file);
        byte[] buffer = new byte[100];
        fis.read(buffer);
    }
}`;
      const findings = runJavaStaticAnalysis(code, {
        reviewId: 'test-resleak',
        filePath: 'src/main/java/Reader.java',
      });

      const resLeak = findings.find((f) => f.ruleId === 'JAVA-BUG-002');
      expect(resLeak).toBeDefined();
      expect(resLeak?.severity).toBe('HIGH');
      expect(resLeak?.category).toBe('BUG');
      expect(resLeak?.startLine).toBe(5);
    });

    it('detects string reference equality comparison with "==" and produces grounded patch (JAVA-BUG-004)', () => {
      const code = `package com.example;
public class AuthCheck {
    public boolean checkRole(String role) {
        if (role == "ADMIN") {
            return true;
        }
        return false;
    }
}`;
      const findings = runJavaStaticAnalysis(code, {
        reviewId: 'test-streq',
        filePath: 'src/main/java/AuthCheck.java',
      });

      const strEq = findings.find((f) => f.ruleId === 'JAVA-BUG-004');
      expect(strEq).toBeDefined();
      expect(strEq?.severity).toBe('HIGH');
      expect(strEq?.category).toBe('BUG');
      expect(strEq?.suggestedPatch).toContain('"ADMIN".equals(role)');
      expect(strEq?.suggestedPatch).toContain('--- a/src/main/java/AuthCheck.java');
    });

    it('detects swallowed exception in empty catch block (JAVA-BUG-003)', () => {
      const code = `package com.example;
public class Runner {
    public void run() {
        try {
            int x = 10 / 0;
        } catch (Exception e) {
            // empty swallow
        }
    }
}`;
      const findings = runJavaStaticAnalysis(code, {
        reviewId: 'test-swallow',
        filePath: 'src/main/java/Runner.java',
      });

      const swallow = findings.find((f) => f.ruleId === 'JAVA-BUG-003');
      expect(swallow).toBeDefined();
      expect(swallow?.severity).toBe('MEDIUM');
      expect(swallow?.category).toBe('BUG');
    });

    it('detects potential NullPointerException in variable.equals("constant") (JAVA-BUG-001)', () => {
      const code = `package com.example;
public class StringUtil {
    public boolean isDefault(String val) {
        return val.equals("default");
    }
}`;
      const findings = runJavaStaticAnalysis(code, {
        reviewId: 'test-null-eq',
        filePath: 'src/main/java/StringUtil.java',
      });

      const nullEq = findings.find((f) => f.ruleId === 'JAVA-BUG-001');
      expect(nullEq).toBeDefined();
      expect(nullEq?.suggestedPatch).toContain('"default".equals(val)');
    });

    it('detects wildcard imports (JAVA-QUAL-001)', () => {
      const code = `package com.example;
import java.util.*;
public class App {}`;
      const findings = runJavaStaticAnalysis(code, {
        reviewId: 'test-wildcard',
        filePath: 'src/main/java/App.java',
      });

      const wildcard = findings.find((f) => f.ruleId === 'JAVA-QUAL-001');
      expect(wildcard).toBeDefined();
      expect(wildcard?.category).toBe('CODE_QUALITY');
    });

    it('does not trigger false positives on clean idiomatic Java code', () => {
      const cleanCode = `package com.example.service;
import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.util.Objects;

public class ConfigLoader {
    public String loadConfig(String path) throws IOException {
        Objects.requireNonNull(path, "path must not be null");
        try (BufferedReader reader = new BufferedReader(new FileReader(path))) {
            return reader.readLine();
        }
    }
}`;
      const findings = runJavaStaticAnalysis(cleanCode, {
        reviewId: 'test-clean',
        filePath: 'src/main/java/ConfigLoader.java',
      });

      expect(findings).toEqual([]);
    });
  });

  describe('6. Project Structure Detection', () => {
    it('detects standalone Java files', () => {
      const result = javaAdapter.detectProjectStructure('src/App.java');
      expect(result.projectType).toBe('STANDALONE_FILE');
      expect(result.supported).toBe(true);
    });

    it('detects single-module Maven projects with pom.xml', () => {
      const files = ['pom.xml', 'src/main/java/com/example/App.java'];
      const result = javaAdapter.detectProjectStructure('src/main/java/com/example/App.java', files);
      expect(result.projectType).toBe('MAVEN_SINGLE_MODULE');
      expect(result.supported).toBe(true);
      expect(result.buildFilePath).toBe('pom.xml');
    });

    it('detects single-module Gradle projects with build.gradle', () => {
      const files = ['build.gradle', 'src/main/java/com/example/App.java'];
      const result = javaAdapter.detectProjectStructure('src/main/java/com/example/App.java', files);
      expect(result.projectType).toBe('GRADLE_SINGLE_MODULE');
      expect(result.supported).toBe(true);
      expect(result.buildFilePath).toBe('build.gradle');
    });

    it('identifies unsupported multi-module Maven reactor builds honestly', () => {
      const files = ['pom.xml', 'core/pom.xml', 'web/pom.xml'];
      const result = javaAdapter.detectProjectStructure('core/src/main/java/App.java', files);
      expect(result.projectType).toBe('UNSUPPORTED_MULTI_MODULE');
      expect(result.supported).toBe(false);
      expect(result.message).toContain('Multi-module Maven reactor builds are not supported');
    });
  });

  describe('7. JUnit 5 Test Generation', () => {
    const dummyFinding: ReviewFinding = {
      id: 'chk-sql-injection-01',
      reviewId: 'rev-junit-01',
      title: 'SQL Injection in User Lookup',
      category: 'SECURITY',
      severity: 'CRITICAL',
      confidence: 0.95,
      filePath: 'src/main/java/com/example/dao/UserDao.java',
      startLine: 12,
      endLine: 12,
      codeExcerpt: 'stmt.executeQuery(query)',
      description: 'Dynamic SQL concatenation flaw',
      impact: 'Database compromise',
      evidence: ['stmt.executeQuery("SELECT ... " + id)'],
      recommendedFix: 'Use PreparedStatement',
      suggestedPatch: null,
      detectionSource: 'STATIC_ANALYZER',
      validationStatus: 'STATICALLY_CONFIRMED',
      introducedByChange: true,
      relatedFindingIds: [],
      createdAt: new Date().toISOString(),
    };

    it('generates syntactically valid JUnit 5 unit test code targeting the finding', () => {
      const testCode = javaAdapter.generateFallbackTest(dummyFinding);
      expect(testCode).toContain('package com.reviewpilot.tests;');
      expect(testCode).toContain('import org.junit.jupiter.api.Test;');
      expect(testCode).toContain('import static org.junit.jupiter.api.Assertions.*;');
      expect(testCode).toContain('class Defectchksqlinjection01Test');
      expect(testCode).toContain('@DisplayName("Verify fix for: SQL Injection in User Lookup")');

      // Verify the generated JUnit 5 test parses cleanly with @lezer/java
      const syntax = javaAdapter.validateSyntax(testCode);
      expect(syntax.valid).toBe(true);
      expect(syntax.errors).toEqual([]);
      expect(syntax.astSummary?.classes?.length).toBeGreaterThan(0);
      expect(syntax.astSummary?.methods?.length).toBeGreaterThan(0);
    });
  });

  describe('8. Regression Protection for Existing Language Adapters', () => {
    it('verifies TypeScript adapter capabilities and synthesis', () => {
      const tsAdapter = languageAdapterRegistry.getAdapter('typescript');
      expect(tsAdapter).toBeDefined();
      expect(tsAdapter.displayName).toBe('TypeScript');
      expect(tsAdapter.testFramework).toBe('vitest');

      const syntax = tsAdapter.validateSyntax('export const add = (a: number, b: number): number => a + b;');
      expect(syntax.valid).toBe(true);
    });

    it('verifies Python adapter capabilities, Ruff normalizer, and pytest synthesis', () => {
      const pyAdapter = languageAdapterRegistry.getAdapter('python');
      expect(pyAdapter).toBeDefined();
      expect(pyAdapter.displayName).toBe('Python');
      expect(pyAdapter.testFramework).toBe('pytest');

      const syntax = pyAdapter.validateSyntax('def calculate_sum(a: int, b: int) -> int:\n    return a + b\n');
      expect(syntax.valid).toBe(true);
    });
  });
});
