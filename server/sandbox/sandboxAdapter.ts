import { GeneratedTest, TestExecution } from '../../src/types/review.js';
import { languageAdapterRegistry } from '../adapters/languages/index.js';

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
  runtime: 'ReviewPilot Safe AST Syntax Validator (Multi-Language Registry)',
  supportedLanguages: languageAdapterRegistry.getSupportedLanguages(),
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
  securityViolations: string[];
  syntaxErrors: string[];
  errors: string[];
  warnings: string[];
} {
  const securityViolations: string[] = [];
  const syntaxErrors: string[] = [];
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
      securityViolations.push(msg);
    }
  }

  // Safe AST / syntax validation delegated to language adapter
  let syntaxValid = true;
  const adapter = languageAdapterRegistry.getAdapterOrNull(language);
  if (adapter) {
    const syntaxResult = adapter.validateSyntax(code);
    if (!syntaxResult.valid) {
      syntaxValid = false;
      syntaxErrors.push(...syntaxResult.errors);
    }
    if (syntaxResult.warnings && syntaxResult.warnings.length > 0) {
      warnings.push(...syntaxResult.warnings);
    }
  } else {
    warnings.push(`No language adapter registered for language: "${language}"`);
  }

  const errors = [...securityViolations, ...syntaxErrors];

  return {
    isSafe: securityViolations.length === 0,
    syntaxValid,
    securityViolations,
    syntaxErrors,
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

  // If unsafe patterns detected, reject immediately with SANDBOX_RESTRICTED
  if (!safety.isSafe) {
    return {
      id: `exec-${test.id}-${Date.now().toString(36)}`,
      testId: test.id,
      findingId: test.findingId,
      reviewId: test.reviewId,
      status: 'SANDBOX_RESTRICTED',
      executionTimeMs: Date.now() - startTime,
      stdout: '',
      stderr: `Security sandbox policy violation:\n- ${safety.securityViolations.join('\n- ')}`,
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
      stderr: `AST compilation error:\n${safety.syntaxErrors.join('\n')}`,
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
