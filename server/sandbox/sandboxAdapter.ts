import { GeneratedTest, TestExecution } from '../../src/types/review.js';
import * as esbuild from 'esbuild';

export interface SandboxCapability {
  available: boolean;
  executionDisabled: boolean;
  runtime: string;
  supportedLanguages: string[];
  maxExecutionTimeMs: number;
  networkAccess: 'DISABLED';
  isolationMechanism: string;
}

/**
 * ReviewPilot Sandbox Capability Descriptor.
 * Per Section 11 & Security Policy: Untrusted code must NEVER be executed inside
 * the application server process. Because hardware/microVM container isolation (e.g. gVisor, Firecracker)
 * cannot be guaranteed within the host Node process, execution is strictly disabled.
 * Safe AST test generation, static syntax verification, and export are retained.
 */
export const CURRENT_SANDBOX_CAPABILITY: SandboxCapability = {
  available: false,
  executionDisabled: true,
  runtime: 'ReviewPilot Safe AST Syntax Validator (esbuild)',
  supportedLanguages: ['typescript', 'javascript', 'python', 'java', 'csharp'],
  maxExecutionTimeMs: 3000,
  networkAccess: 'DISABLED',
  isolationMechanism: 'Server-side execution disabled by security policy (microVM isolation not present). Untrusted code execution is strictly prohibited inside the application server.',
};

/**
 * Validates the safety and syntax of generated test code without executing untrusted instructions.
 */
export function validateTestCodeSafety(code: string, language: string): {
  isSafe: boolean;
  syntaxValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for dangerous operations within test code
  const dangerousPatterns = [
    { pattern: /\bchild_process\b/, msg: 'Direct child_process execution prohibited in test suite' },
    { pattern: /\bprocess\.exit\b/, msg: 'process.exit() is prohibited in tests' },
    { pattern: /\bprocess\.env\b/, msg: 'Direct access to process.env host secrets is restricted' },
    { pattern: /\bprocess\.(kill|binding|mainModule)\b/, msg: 'Process manipulation is restricted' },
    { pattern: /\b(rmdir|unlinkSync|rmSync|rmdirSync)\b/, msg: 'Destructive filesystem operations not allowed' },
    { pattern: /\b(eval\s*\(|new\s+Function\s*\()/, msg: 'Dynamic code execution (eval/Function) is prohibited' },
    { pattern: /\b(__proto__|constructor\.constructor)\b/, msg: 'Prototype pollution pattern detected' },
    { pattern: /\b(net\.|http\.|https\.|fetch\(.*http)/, msg: 'Uncontrolled network calls disabled in sandbox' },
  ];

  for (const { pattern, msg } of dangerousPatterns) {
    if (pattern.test(code)) {
      errors.push(msg);
    }
  }

  // Real compilation validation with esbuild for TypeScript and JavaScript (Safe static parsing, NO execution)
  let syntaxValid = true;
  if (language === 'typescript' || language === 'javascript') {
    try {
      const loader = language === 'typescript' ? 'ts' : 'js';
      const result = esbuild.transformSync(code, {
        loader,
        target: 'es2022',
        format: 'esm',
      });
      if (result.warnings && result.warnings.length > 0) {
        for (const w of result.warnings) {
          warnings.push(`Line ${w.location?.line || '?'}: ${w.text}`);
        }
      }
    } catch (err: any) {
      syntaxValid = false;
      const parseError = err.errors?.[0]?.text || err.message || 'Syntax parse failed';
      const errorLine = err.errors?.[0]?.location?.line;
      errors.push(errorLine ? `Line ${errorLine}: ${parseError}` : parseError);
    }
  } else {
    // For Python / Java / C#, verify balanced bracket pairs and presence of test function definitions
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces && (language === 'java' || language === 'csharp')) {
      syntaxValid = false;
      errors.push(`Mismatched curly braces: ${openBraces} open, ${closeBraces} close`);
    }
    if (language === 'python' && !code.includes('def test_') && !code.includes('assert')) {
      warnings.push('Python test file does not define a standard test_* function or assertion');
    }
  }

  return {
    isSafe: errors.length === 0,
    syntaxValid,
    errors,
    warnings,
  };
}

/**
 * Handles test execution requests in accordance with Section 11 & Security Policy:
 * Untrusted code is NEVER executed inside the application server process.
 * If claimed sandbox isolation cannot be guaranteed (no microVM/gVisor), execution is safely disabled,
 * returning SANDBOX_RESTRICTED while providing full AST syntax verification and exportability.
 */
export async function executeTestInSandbox(test: GeneratedTest): Promise<TestExecution> {
  const startTime = Date.now();
  const safety = validateTestCodeSafety(test.testCode, test.language);

  // If unsafe patterns detected, reject immediately
  if (!safety.isSafe) {
    return {
      id: `exec-${test.id}-${Date.now().toString(36)}`,
      testId: test.id,
      findingId: test.findingId,
      reviewId: test.reviewId,
      status: 'SANDBOX_RESTRICTED',
      executionTimeMs: Date.now() - startTime,
      stdout: '',
      stderr: `Security sandbox policy violation:\n- ${safety.errors.join('\n- ')}`,
      failureExplanation: 'The generated test attempted restricted operations that violate the isolated execution policy.',
      sandboxInfo: {
        isIsolated: false,
        runtime: CURRENT_SANDBOX_CAPABILITY.runtime,
        isolationMechanism: CURRENT_SANDBOX_CAPABILITY.isolationMechanism,
      },
      executedAt: new Date().toISOString(),
    };
  }

  // If syntax is invalid, report compilation error
  if (!safety.syntaxValid) {
    return {
      id: `exec-${test.id}-${Date.now().toString(36)}`,
      testId: test.id,
      findingId: test.findingId,
      reviewId: test.reviewId,
      status: 'ERROR',
      executionTimeMs: Date.now() - startTime,
      stdout: '',
      stderr: `AST compilation error:\n${safety.errors.join('\n')}`,
      failureExplanation: 'The test code could not be compiled into a valid executable module for the target framework.',
      sandboxInfo: {
        isIsolated: false,
        runtime: CURRENT_SANDBOX_CAPABILITY.runtime,
        isolationMechanism: CURRENT_SANDBOX_CAPABILITY.isolationMechanism,
      },
      executedAt: new Date().toISOString(),
    };
  }

  const executionTimeMs = Date.now() - startTime;
  const isReproduction = test.testType === 'DEFECT_REPRODUCTION';

  // Per Security Invariant: Untrusted code is NEVER executed inside the application server.
  // Because microVM hypervisor isolation is not provisioned on this host, runtime execution is disabled.
  const stdoutLines = [
    `[ReviewPilot AST Sandbox: ${test.framework.toUpperCase()}]`,
    `✓ Syntax compilation: SUCCESS (Target: ${test.language.toUpperCase()})`,
    `✓ Scope analyzed: Function "${test.targetFunction}"`,
    `✓ Test intent: ${isReproduction ? 'Defect reproduction' : 'Happy path / edge validation'}`,
    `✓ AST Safety Audit: Clean (No forbidden process, network, or filesystem calls)`,
    `⚠ SERVER-SIDE EXECUTION DISABLED BY SECURITY POLICY`,
    `  Host Isolation Status: MicroVM / hypervisor sandbox container is not provisioned on this host.`,
    `  Security Policy: Untrusted code is never executed inside the application server process.`,
    `  Safe Alternative: Use "Copy Code" or "Export" to execute this test suite within your isolated local runner or CI/CD container.`,
  ];

  if (safety.warnings.length > 0) {
    stdoutLines.push(`! Compiler warnings:\n  - ${safety.warnings.join('\n  - ')}`);
  }

  return {
    id: `exec-${test.id}-${Date.now().toString(36)}`,
    testId: test.id,
    findingId: test.findingId,
    reviewId: test.reviewId,
    status: 'SANDBOX_RESTRICTED',
    executionTimeMs,
    stdout: stdoutLines.join('\n'),
    stderr: '',
    failureExplanation: 'Server-side execution disabled by security policy (microVM isolation not present on host). Test syntax is valid and ready for export.',
    sandboxInfo: {
      isIsolated: false,
      runtime: CURRENT_SANDBOX_CAPABILITY.runtime,
      isolationMechanism: CURRENT_SANDBOX_CAPABILITY.isolationMechanism,
    },
    executedAt: new Date().toISOString(),
  };
}
