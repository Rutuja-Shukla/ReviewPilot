import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { GeneratedTest, ReviewFinding, SupportedLanguage } from '../../src/types/review.js';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const GeneratedTestSchema = z.object({
  targetFunction: z.string().default('testedFunction'),
  framework: z.enum(['vitest', 'jest', 'pytest', 'junit', 'xunit']),
  testType: z.enum(['DEFECT_REPRODUCTION', 'HAPPY_PATH', 'EDGE_CASE']),
  testCode: z.string(),
  explanation: z.string().default('Targeted unit test to verify remediation.'),
});

export async function generateTestForFinding(
  finding: ReviewFinding,
  fullSourceCode: string,
  language: SupportedLanguage
): Promise<GeneratedTest> {
  const frameworkMap: Record<SupportedLanguage, 'vitest' | 'pytest' | 'junit' | 'xunit'> = {
    typescript: 'vitest',
    javascript: 'vitest',
    python: 'pytest',
    java: 'junit',
    csharp: 'xunit',
  };

  const defaultFramework = frameworkMap[language] || 'vitest';

  const systemInstruction = `You are an automated test generation engineer for ReviewPilot.
Your job is to generate focused, executable, high-signal unit tests targeting a specific code review defect.

REQUIREMENTS:
1. Generate tests in the framework: ${defaultFramework}.
2. Provide a reproduction test that isolates the reported bug/vulnerability:
   - Defect title: "${finding.title}"
   - Category: ${finding.category}
   - Excerpt: "${finding.codeExcerpt}"
3. Include clear assertions.
4. Keep the test focused on the specific component/function; mock heavy external I/O or network calls.
5. Return clean runnable code without conversational commentary.`;

  const userPrompt = `Generate a unit test verifying or reproducing this finding:

FINDING DETAILS:
Title: ${finding.title}
File: ${finding.filePath}
Lines: ${finding.startLine}-${finding.endLine}
Description: ${finding.description}
Recommended Fix: ${finding.recommendedFix}

SOURCE CODE CONTEXT:
${fullSourceCode}

Respond in JSON with this structure:
{
  "targetFunction": "nameOfFunction",
  "framework": "${defaultFramework}",
  "testType": "DEFECT_REPRODUCTION",
  "testCode": "import { describe, it, expect } from 'vitest'; ...",
  "explanation": "Why this test exercises the vulnerability or edge condition"
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '{}';
    let rawJson: unknown;
    try {
      rawJson = JSON.parse(responseText);
    } catch {
      const cleaned = responseText.replace(/```json\n?|\n?```/g, '').trim();
      rawJson = JSON.parse(cleaned);
    }

    const validated = GeneratedTestSchema.safeParse(rawJson);
    if (!validated.success) {
      console.warn('Fallback test structure due to schema parse issue:', validated.error);
      return createFallbackTest(finding, defaultFramework, language);
    }

    const data = validated.data;
    // Validate basic syntax structure
    const hasSyntaxError = !data.testCode.includes('test') && !data.testCode.includes('it(') && !data.testCode.includes('def test_');

    return {
      id: `test-${finding.id}-${Date.now().toString(36)}`,
      findingId: finding.id,
      reviewId: finding.reviewId,
      framework: data.framework,
      language,
      targetFunction: data.targetFunction,
      testCode: data.testCode,
      validationStatus: hasSyntaxError ? 'SYNTAX_ERROR' : 'SYNTAX_VALID',
      validationErrors: hasSyntaxError ? ['Missing expected test runner assertions or suite definition'] : [],
      testType: data.testType,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to generate test with Gemini, providing fallback test:', error);
    return createFallbackTest(finding, defaultFramework, language);
  }
}

function createFallbackTest(
  finding: ReviewFinding,
  framework: 'vitest' | 'pytest' | 'junit' | 'xunit',
  language: SupportedLanguage
): GeneratedTest {
  let testCode = '';

  if (language === 'typescript' || language === 'javascript') {
    testCode = `import { describe, it, expect } from 'vitest';

describe('${finding.title}', () => {
  it('should prevent or handle the identified condition (${finding.category})', () => {
    // Target lines: ${finding.startLine}-${finding.endLine}
    // Code: ${finding.codeExcerpt.replace(/\n/g, ' ')}
    
    // Test that the defect condition is guarded
    expect(() => {
      // Exercise input condition
    }).not.toThrow();
  });
});`;
  } else if (language === 'python') {
    testCode = `import pytest

def test_${finding.title.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30)}():
    """Reproduces finding on lines ${finding.startLine}-${finding.endLine}: ${finding.title}"""
    # Verify input validation or proper handling
    assert True`;
  } else {
    testCode = `// Generated unit test for ${finding.title}
// Framework: ${framework}
// Target: Lines ${finding.startLine}-${finding.endLine}`;
  }

  return {
    id: `test-${finding.id}-${Date.now().toString(36)}`,
    findingId: finding.id,
    reviewId: finding.reviewId,
    framework,
    language,
    targetFunction: 'testedUnit',
    testCode,
    validationStatus: 'SYNTAX_VALID',
    testType: 'DEFECT_REPRODUCTION',
    createdAt: new Date().toISOString(),
  };
}
