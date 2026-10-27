import { describe, it, expect } from 'vitest';
import { validateTestCodeSafety, executeTestInSandbox, CURRENT_SANDBOX_CAPABILITY } from '../../server/sandbox/sandboxAdapter';
import { GeneratedTest } from '../../src/types/review';

describe('Sandbox Adapter & AST Verification Security Policy', () => {
  it('should verify that CURRENT_SANDBOX_CAPABILITY reports server execution as disabled', () => {
    expect(CURRENT_SANDBOX_CAPABILITY.available).toBe(false);
    expect(CURRENT_SANDBOX_CAPABILITY.executionDisabled).toBe(true);
    expect(CURRENT_SANDBOX_CAPABILITY.isolationMechanism).toContain('Server-side execution disabled by security policy');
  });

  it('should validate clean TypeScript test code syntax without executing', () => {
    const validCode = `import { describe, it, expect } from 'vitest';

describe('Calculator', () => {
  it('adds numbers', () => {
    expect(1 + 2).toBe(3);
  });
});`;
    const result = validateTestCodeSafety(validCode, 'typescript');
    expect(result.isSafe).toBe(true);
    expect(result.syntaxValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect prohibited process and shell operations in test code', () => {
    const dangerousCode = `import { execSync } from 'child_process';
process.exit(1);
const secret = process.env.API_KEY;`;
    const result = validateTestCodeSafety(dangerousCode, 'typescript');
    expect(result.isSafe).toBe(false);
    expect(result.errors.some((e) => e.includes('child_process'))).toBe(true);
    expect(result.errors.some((e) => e.includes('process.exit'))).toBe(true);
    expect(result.errors.some((e) => e.includes('process.env'))).toBe(true);
  });

  it('should detect prototype pollution attempts in test code', () => {
    const maliciousCode = `const obj = {};
obj.__proto__.polluted = true;
const fn = constructor.constructor('return process')();`;
    const result = validateTestCodeSafety(maliciousCode, 'typescript');
    expect(result.isSafe).toBe(false);
    expect(result.errors.some((e) => e.includes('Prototype pollution'))).toBe(true);
  });

  it('should identify invalid TypeScript syntax in AST check', () => {
    const malformedCode = `describe('broken syntax' () => {
      let x = ;
    }`;
    const result = validateTestCodeSafety(malformedCode, 'typescript');
    expect(result.syntaxValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should return SANDBOX_RESTRICTED execution status for unsafe tests', async () => {
    const unsafeTest: GeneratedTest = {
      id: 'test-unsafe-1',
      findingId: 'finding-1',
      reviewId: 'review-1',
      framework: 'vitest',
      language: 'typescript',
      targetFunction: 'handleAuth',
      testCode: `import child_process from 'child_process';\nchild_process.execSync('ls');`,
      validationStatus: 'SYNTAX_VALID',
      testType: 'DEFECT_REPRODUCTION',
      createdAt: new Date().toISOString(),
    };

    const execution = await executeTestInSandbox(unsafeTest);
    expect(execution.status).toBe('SANDBOX_RESTRICTED');
    expect(execution.stderr).toContain('Security sandbox policy violation');
    expect(execution.sandboxInfo.isIsolated).toBe(false);
  });

  it('should enforce execution-disabled security policy for valid tests (safe dry-run AST check)', async () => {
    const validTest: GeneratedTest = {
      id: 'test-valid-1',
      findingId: 'finding-1',
      reviewId: 'review-1',
      framework: 'vitest',
      language: 'typescript',
      targetFunction: 'calculateDiscount',
      testCode: `import { describe, it, expect } from 'vitest';
describe('calculateDiscount', () => {
  it('handles zero quantity', () => {
    expect(0).toBe(0);
  });
});`,
      validationStatus: 'SYNTAX_VALID',
      testType: 'DEFECT_REPRODUCTION',
      createdAt: new Date().toISOString(),
    };

    const execution = await executeTestInSandbox(validTest);
    // Untrusted code is never executed inside the application server
    expect(execution.status).toBe('SANDBOX_RESTRICTED');
    expect(execution.stdout).toContain('Syntax compilation: SUCCESS');
    expect(execution.stdout).toContain('SERVER-SIDE EXECUTION DISABLED BY SECURITY POLICY');
    expect(execution.stdout).toContain('calculateDiscount');
    expect(execution.sandboxInfo.isIsolated).toBe(false);
  });
});
