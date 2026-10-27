import { describe, it, expect } from 'vitest';
import { validateTestCodeSafety, executeTestInSandbox } from '../../server/sandbox/sandboxAdapter';
import { GeneratedTest } from '../../src/types/review';

describe('Sandbox Adapter & AST Verification', () => {
  it('should validate clean TypeScript test code syntax', () => {
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

  it('should detect prohibited process and shell operations', () => {
    const dangerousCode = `import { execSync } from 'child_process';
process.exit(1);
const secret = process.env.API_KEY;`;
    const result = validateTestCodeSafety(dangerousCode, 'typescript');
    expect(result.isSafe).toBe(false);
    expect(result.errors.some((e) => e.includes('child_process'))).toBe(true);
    expect(result.errors.some((e) => e.includes('process.exit'))).toBe(true);
    expect(result.errors.some((e) => e.includes('process.env'))).toBe(true);
  });

  it('should identify invalid TypeScript syntax', () => {
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
  });

  it('should successfully compile valid test in sandbox', async () => {
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
    expect(execution.status).toBe('PASSED');
    expect(execution.stdout).toContain('ReviewPilot AST Sandbox');
    expect(execution.stdout).toContain('calculateDiscount');
  });
});
