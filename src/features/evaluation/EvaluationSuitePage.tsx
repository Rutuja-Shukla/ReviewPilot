import React, { useState } from 'react';
import { EvaluationRunSummary } from '../../types/review';
import { runEvaluations } from '../../lib/api';
import { Target, Play, Loader2, CheckCircle2, XCircle, Gauge, ChevronDown, ChevronUp } from 'lucide-react';

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

  const results = latestRun?.results.filter(r => catFilter === 'ALL' || r.category === catFilter) || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Code Review Evaluation Suite</h1>
          <p className="text-sm text-slate-600 mt-1">
            Empirical benchmark measuring precision, recall, false-positive resistance, and location accuracy across 20 deterministic defect fixtures.
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm transition-all cursor-pointer shrink-0"
        >
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
          <span>{isRunning ? 'Running 20 Fixtures...' : 'Run Evaluation Suite'}</span>
        </button>
      </div>

      {latestRun ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">Precision</span>
              <div className="mt-2 text-2xl font-bold text-indigo-600 font-mono">{latestRun.precision}%</div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono">True Positives / Total</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">Recall</span>
              <div className="mt-2 text-2xl font-bold text-emerald-600 font-mono">{latestRun.recall}%</div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono">Seeded Issues Found</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">F1 Score</span>
              <div className="mt-2 text-2xl font-bold text-slate-900 font-mono">{latestRun.f1Score}%</div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono">Harmonic Mean</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">False Positives</span>
              <div className="mt-2 text-2xl font-bold text-rose-600 font-mono">{latestRun.falsePositiveRate}%</div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono">Spurious Findings</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">Line Accuracy</span>
              <div className="mt-2 text-2xl font-bold text-teal-600 font-mono">{latestRun.locationAccuracy}%</div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono">±3 Line Proximity</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">Avg Latency</span>
              <div className="mt-2 text-2xl font-bold text-slate-700 font-mono">{latestRun.averageLatencyMs}ms</div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono">Per Fixture Run</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-mono">
              <div className="font-semibold text-slate-700 flex items-center gap-2">
                <span>BENCHMARK FIXTURES ({results.length})</span>
                <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  {latestRun.passedFixtures} / {latestRun.totalFixtures} PASSED
                </span>
              </div>
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="SECURITY">Security</option>
                <option value="BUG">Bug</option>
                <option value="CODE_QUALITY">Code Quality</option>
                <option value="PERFORMANCE">Performance</option>
              </select>
            </div>

            <div className="divide-y divide-slate-100">
              {results.map((res) => {
                const isOpen = expandedId === res.fixtureId;
                return (
                  <div key={res.fixtureId} className="p-4 hover:bg-slate-50/80 transition-colors">
                    <div onClick={() => setExpandedId(isOpen ? null : res.fixtureId)} className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-3 min-w-0">
                        {res.passed ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                            <XCircle className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-400">{res.fixtureId}</span>
                            <span className="text-xs font-semibold text-slate-900 truncate">{res.fixtureName}</span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-3 mt-0.5">
                            <span className="uppercase text-indigo-600 font-semibold">{res.category}</span>
                            <span>•</span>
                            <span>{res.findingsCount} detected ({res.matchedDefects} matched / {res.expectedDefectsCount} expected)</span>
                            <span>•</span>
                            <span>Accuracy: {res.locationAccuracyPercent}%</span>
                            <span>•</span>
                            <span>{res.executionTimeMs}ms</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${res.passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                          {res.passed ? 'PASSED' : 'DEFECT MISSED'}
                        </span>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mt-3 pt-3 border-t border-slate-100 pl-9 space-y-2 text-xs font-mono text-slate-600">
                        <div>
                          <span className="font-semibold text-slate-800">Detected Issues:</span>
                          {res.detectedTitles.length === 0 ? (
                            <span className="text-slate-400 ml-2">None detected</span>
                          ) : (
                            <ul className="list-disc pl-5 mt-1 space-y-0.5">
                              {res.detectedTitles.map((t, i) => <li key={i}>{t}</li>)}
                            </ul>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 pt-1">Notes: {res.notes}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <Gauge className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No evaluation runs recorded in this session</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Run the 20-fixture evaluation benchmark to empirically measure precision, recall, and adversarial prompt resistance.
          </p>
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Execute Benchmark Suite Now</span>
          </button>
        </div>
      )}
    </div>
  );
};
