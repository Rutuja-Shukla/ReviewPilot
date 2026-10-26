import { EVALUATION_FIXTURES } from './fixtures.js';
import { runStaticAnalysis } from '../analyzers/staticAnalyzer.js';
import { EvaluationResult, EvaluationRunSummary } from '../../src/types/review.js';

export async function runEvaluationSuite(limit = 20): Promise<EvaluationRunSummary> {
  const fixturesToRun = EVALUATION_FIXTURES.slice(0, limit);
  const results: EvaluationResult[] = [];
  const startAllTime = Date.now();

  let totalExpected = 0;
  let totalMatched = 0;
  let totalReported = 0;
  let totalFalsePositives = 0;
  let accurateLocations = 0;

  for (const fixture of fixturesToRun) {
    const fixtureStartTime = Date.now();
    
    // Run deterministic static analyzer first
    const findings = runStaticAnalysis(fixture.code, `${fixture.id}.ts`, fixture.language, fixture.id);
    const durationMs = Date.now() - fixtureStartTime;

    const detectedTitles = findings.map(f => f.title);
    totalReported += findings.length;

    let matchedInFixture = 0;
    let locationAccurateInFixture = 0;

    for (const exp of fixture.expectedDefects) {
      totalExpected++;
      // Check if any finding matches keywords or category and close line
      const match = findings.find(f => {
        const catMatch = f.category === exp.category;
        const textToSearch = `${f.title} ${f.description} ${f.codeExcerpt}`.toLowerCase();
        const kwMatch = exp.keywords.some(kw => textToSearch.includes(kw.toLowerCase()));
        return catMatch || kwMatch;
      });

      if (match) {
        matchedInFixture++;
        totalMatched++;
        // Check line proximity (within 3 lines)
        if (Math.abs(match.startLine - exp.targetLine) <= 3) {
          locationAccurateInFixture++;
          accurateLocations++;
        }
      }
    }

    // False positives calculation: findings that don't match any expected defect
    const fpInFixture = Math.max(0, findings.length - fixture.expectedDefects.length);
    totalFalsePositives += fpInFixture;

    // A fixture passes if:
    // 1) When 0 expected defects: 0 critical/high findings
    // 2) When >0 expected defects: at least 1 expected defect detected
    let passed = false;
    if (fixture.expectedDefects.length === 0) {
      passed = findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length === 0;
    } else {
      passed = matchedInFixture > 0;
    }

    results.push({
      fixtureId: fixture.id,
      fixtureName: fixture.name,
      category: fixture.category,
      passed,
      findingsCount: findings.length,
      matchedDefects: matchedInFixture,
      expectedDefectsCount: fixture.expectedDefects.length,
      falsePositivesCount: fpInFixture,
      locationAccuracyPercent: fixture.expectedDefects.length > 0
        ? Math.round((locationAccurateInFixture / fixture.expectedDefects.length) * 100)
        : 100,
      executionTimeMs: durationMs,
      detectedTitles,
      notes: passed ? 'Evaluation criteria satisfied' : 'Fixture did not meet expected defect criteria',
    });
  }

  const passedFixtures = results.filter(r => r.passed).length;
  const precision = totalReported > 0 ? Math.round((totalMatched / totalReported) * 100) : 100;
  const recall = totalExpected > 0 ? Math.round((totalMatched / totalExpected) * 100) : 100;
  const f1 = (precision + recall) > 0 ? Math.round((2 * precision * recall) / (precision + recall)) : 0;
  const fpRate = totalReported > 0 ? Math.round((totalFalsePositives / totalReported) * 100) : 0;
  const locationAccuracy = totalMatched > 0 ? Math.round((accurateLocations / totalMatched) * 100) : 100;
  const averageLatencyMs = Math.round((Date.now() - startAllTime) / fixturesToRun.length);

  return {
    id: `eval-run-${Date.now().toString(36)}`,
    runAt: new Date().toISOString(),
    totalFixtures: fixturesToRun.length,
    passedFixtures,
    precision,
    recall,
    f1Score: f1,
    falsePositiveRate: fpRate,
    locationAccuracy,
    averageLatencyMs,
    estimatedTokens: fixturesToRun.length * 320,
    results,
  };
}
