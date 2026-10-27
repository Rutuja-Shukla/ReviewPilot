import React, { useState } from 'react';
import { Review, GeneratedTest, TestExecution } from '../../types/review';
import { executeTest } from '../../lib/api';
import {
  FlaskConical,
  Play,
  Copy,
  Check,
  Loader2,
  Terminal,
  ShieldCheck,
  Code2,
} from 'lucide-react';

interface TestLabPageProps {
  reviews: Review[];
  onRefreshReview: (updatedReview: Review) => void;
}

export const TestLabPage: React.FC<TestLabPageProps> = ({ reviews, onRefreshReview }) => {
  // Aggregate all generated tests across all reviews
  const allTests: { test: GeneratedTest; review: Review }[] = [];
  for (const review of reviews) {
    for (const test of review.generatedTests || []) {
      allTests.push({ test, review });
    }
  }

  const [selectedTestId, setSelectedTestId] = useState<string | null>(
    allTests[0]?.test.id || null
  );
  const [copiedTestId, setCopiedTestId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [latestExecution, setLatestExecution] = useState<TestExecution | null>(null);

  const selectedItem = allTests.find((item) => item.test.id === selectedTestId);

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedTestId(id);
    setTimeout(() => setCopiedTestId(null), 2500);
  };

  const handleRunTest = async (test: GeneratedTest, review: Review) => {
    setIsExecuting(true);
    setLatestExecution(null);
    try {
      const execution = await executeTest(test);
      setLatestExecution(execution);
      const updatedReview: Review = {
        ...review,
        testExecutions: [...(review.testExecutions || []), execution],
      };
      if (execution.status === 'PASSED') {
        const targetFinding = updatedReview.findings.find((f) => f.id === test.findingId);
        if (targetFinding && targetFinding.validationStatus !== 'DISMISSED') {
          targetFinding.validationStatus = 'TEST_CONFIRMED';
        }
      }
      onRefreshReview(updatedReview);
    } catch (err: any) {
      alert(`Test execution failed: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-1px)] overflow-hidden bg-slate-100">
      {/* Top Header Bar */}
      <div className="h-12 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-purple-600" />
          <h1 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
            Test Lab · Automated Defect Reproduction Suites
          </h1>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 tabular-nums">
            {allTests.length} tests registered
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Host-Isolated Execution Policy</span>
        </div>
      </div>

      {allTests.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400">
          <div className="max-w-md space-y-3">
            <FlaskConical className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-700">No Unit Tests Generated Yet</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Open any review finding in the Review Workspace or Findings Explorer and click
              &quot;Generate Reproducing Test&quot; to synthesize targeted test cases.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane: Test Suites List */}
          <div className="w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-mono font-semibold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Test Suites ({allTests.length})</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {allTests.map(({ test, review }) => {
                const isSelected = selectedTestId === test.id;
                const pastExecutions = (review.testExecutions || []).filter(
                  (e) => e.testId === test.id
                );
                const lastExecution = pastExecutions[pastExecutions.length - 1];

                return (
                  <div
                    key={test.id}
                    onClick={() => {
                      setSelectedTestId(test.id);
                      setLatestExecution(lastExecution || null);
                    }}
                    className={`p-3 cursor-pointer transition-colors space-y-1.5 ${
                      isSelected
                        ? 'bg-purple-50/70 border-l-3 border-purple-600'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                        {test.framework}
                      </span>
                      {lastExecution && (
                        <span
                          className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded border ${
                            lastExecution.status === 'PASSED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : lastExecution.status === 'SANDBOX_RESTRICTED'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {lastExecution.status}
                        </span>
                      )}
                    </div>

                    <div className={`text-xs truncate ${isSelected ? 'font-semibold text-purple-950' : 'text-slate-800 font-medium'}`}>
                      {test.targetFunction || 'Test Suite'}
                    </div>

                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      {review.title} · {test.testType}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Pane: Active Test Suite & Terminal Output */}
          {selectedItem && (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 text-slate-200">
              {/* Suite Toolbar */}
              <div className="h-11 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs font-mono">
                  <Code2 className="w-3.5 h-3.5 text-purple-400" />
                  <span className="font-semibold text-white">{selectedItem.test.targetFunction}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-400 uppercase text-[11px]">{selectedItem.test.framework}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyCode(selectedItem.test.testCode, selectedItem.test.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 cursor-pointer"
                  >
                    {copiedTestId === selectedItem.test.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRunTest(selectedItem.test, selectedItem.review)}
                    disabled={isExecuting}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded transition-colors shadow-2xs cursor-pointer"
                  >
                    {isExecuting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-white" />
                    )}
                    <span>Run Test in Sandbox</span>
                  </button>
                </div>
              </div>

              {/* Code Preview */}
              <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-100 select-text bg-slate-900 border-b border-slate-800">
                <pre className="whitespace-pre leading-5">
                  {selectedItem.test.testCode}
                </pre>
              </div>

              {/* Sandbox Execution Terminal */}
              <div className="h-56 bg-slate-950 flex flex-col shrink-0 font-mono text-xs border-t border-slate-800">
                <div className="h-8 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400 select-none">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-300">Sandbox Output Log</span>
                  </div>
                  {latestExecution && (
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className={`font-semibold ${
                        latestExecution.status === 'PASSED'
                          ? 'text-emerald-400'
                          : latestExecution.status === 'SANDBOX_RESTRICTED'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}>
                        {latestExecution.status}
                      </span>
                      <span>·</span>
                      <span>{latestExecution.executionTimeMs}ms</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 p-3 overflow-y-auto space-y-1.5 text-[11px] select-text">
                  {isExecuting ? (
                    <div className="flex items-center gap-2 text-indigo-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Executing isolated test container...</span>
                    </div>
                  ) : latestExecution ? (
                    <div className="space-y-1">
                      <div className="text-slate-400">
                        Runtime: {latestExecution.sandboxInfo.runtime} | Isolated: {latestExecution.sandboxInfo.isIsolated ? 'true' : 'false'}
                      </div>
                      {latestExecution.stdout && (
                        <pre className="text-emerald-300/90 whitespace-pre-wrap">
                          {latestExecution.stdout}
                        </pre>
                      )}
                      {latestExecution.stderr && (
                        <pre className="text-rose-400/90 whitespace-pre-wrap">
                          {latestExecution.stderr}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <div className="text-slate-400">
                      Click &quot;Run Test in Sandbox&quot; above to execute in isolated test environment.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
