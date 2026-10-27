import React, { useState } from 'react';
import { EvaluationRunSummary } from '../../types/review';
import { runEvaluations } from '../../lib/api';
import { Target, Play, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface EvaluationSuitePageProps {
  latestRun: EvaluationRunSummary | null;
  onRunCompleted: (run: EvaluationRunSummary) => void;
}

export const EvaluationSuitePage: React.FC<EvaluationSuitePageProps> = ({
  latestRun,
  onRunCompleted,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>('ALL');

  const handleRun = async () => {
    setIsRunning(true);
    try {
      const summary = await runEvaluations();
      onRunCompleted(summary);
    } catch (err: any) {
      alert(`Evaluation failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const results = latestRun?.results.filter((r) => catFilter === 'ALL' || r.category === catFilter) || [];

  return (
    <div className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
            Code Review Evaluation Suite
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Empirical benchmark measuring precision, recall, false-positive resistance, and location accuracy across 20 deterministic defect fixtures.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded shadow-2xs transition-colors cursor-pointer shrink-0"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Running Fixtures...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Run Benchmark Suite</span>
            </>
          )}
        </button>
      </div>

      {latestRun ? (
        <div className="space-y-4">
          {/* Key Metric Indicators - Tabular Numbers, Zero-Pill Discipline */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-mono font-medium text-slate-500 uppercase tracking-wider">
                Precision
              </span>
              <div className="mt-1 text-2xl font-bold text-indigo-600 font-mono tabular-nums">
                {latestRun.precision}%
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400 font-mono">True Pos / Total</div>
            </div>

            <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-mono font-medium text-slate-500 uppercase tracking-wider">
                Recall
              </span>
              <div className="mt-1 text-2xl font-bold text-indigo-600 font-mono tabular-nums">
                {latestRun.recall}%
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400 font-mono">Detected / Expected</div>
            </div>

            <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-mono font-medium text-slate-500 uppercase tracking-wider">
                F1 Score
              </span>
              <div className="mt-1 text-2xl font-bold text-emerald-600 font-mono tabular-nums">
                {latestRun.f1Score}%
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400 font-mono">Harmonic Mean</div>
            </div>

            <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-mono font-medium text-slate-500 uppercase tracking-wider">
                False Positives
              </span>
              <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {latestRun.falsePositiveRate}%
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400 font-mono">FP Rate</div>
            </div>

            <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-mono font-medium text-slate-500 uppercase tracking-wider">
                Location Accuracy
              </span>
              <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {latestRun.locationAccuracy}%
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400 font-mono">Line Concordance</div>
            </div>

            <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-mono font-medium text-slate-500 uppercase tracking-wider">
                Avg Latency
              </span>
              <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {latestRun.averageLatencyMs}ms
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400 font-mono">
                {latestRun.passedFixtures}/{latestRun.totalFixtures} Passed
              </div>
            </div>
          </div>

          {/* Category Filter Bar */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex space-x-1">
              {['ALL', 'SECURITY', 'BUG', 'CODE_QUALITY', 'PERFORMANCE'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-mono rounded cursor-pointer transition-colors ${
                    catFilter === cat
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="text-xs font-mono text-slate-400 tabular-nums">
              Showing {results.length} fixtures
            </div>
          </div>

          {/* High-Density Fixture Table */}
          <div className="bg-white border border-slate-200 rounded shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50 text-[11px] font-mono text-slate-500 uppercase tracking-wider select-none">
                  <tr>
                    <th className="px-3.5 py-2.5 font-semibold">Fixture ID & Name</th>
                    <th className="px-3 py-2.5 font-semibold">Category</th>
                    <th className="px-3 py-2.5 font-semibold">Expected / Matched</th>
                    <th className="px-3 py-2.5 font-semibold">False Positives</th>
                    <th className="px-3 py-2.5 font-semibold">Accuracy</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3.5 py-2.5 font-semibold text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {results.map((res) => {
                    const isExpanded = expandedId === res.fixtureId;
                    return (
                      <React.Fragment key={res.fixtureId}>
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : res.fixtureId)}
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <td className="px-3.5 py-2.5 font-mono text-slate-900 font-medium">
                            <div>{res.fixtureName}</div>
                            <div className="text-[10px] text-slate-400">#{res.fixtureId}</div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 text-[11px]">
                            {res.category}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-slate-700">
                            {res.matchedDefects} / {res.expectedDefectsCount} matched
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-slate-700">
                            {res.falsePositivesCount > 0 ? (
                              <span className="text-amber-700 font-semibold">{res.falsePositivesCount}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-slate-700">
                            {res.locationAccuracyPercent}%
                          </td>
                          <td className="px-3 py-2.5">
                            {res.passed ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                PASSED
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                <XCircle className="w-3 h-3 text-rose-600" />
                                FAILED
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono text-slate-400">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 ml-auto" />
                            ) : (
                              <ChevronDown className="w-4 h-4 ml-auto" />
                            )}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={7} className="px-4 py-3 border-t border-slate-200">
                              <div className="space-y-2 text-xs font-mono">
                                <div className="text-slate-700">
                                  <span className="text-slate-400 uppercase text-[10px] block font-semibold">Notes & Ground Truth:</span>
                                  {res.notes || 'Executed against standard synthetic benchmark fixture.'}
                                </div>
                                {res.detectedTitles && res.detectedTitles.length > 0 && (
                                  <div>
                                    <span className="text-slate-400 uppercase text-[10px] block mb-1 font-semibold">Detected Findings:</span>
                                    <ul className="space-y-0.5 pl-3 list-disc text-slate-800">
                                      {res.detectedTitles.map((title, i) => (
                                        <li key={i}>{title}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-slate-400 bg-white border border-slate-200 rounded space-y-3">
          <Target className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-700">No Benchmark Runs Recorded</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Click &quot;Run Benchmark Suite&quot; above to execute the ground-truth defect fixtures and calculate precision, recall, and AST concordance.
          </p>
        </div>
      )}
    </div>
  );
};
