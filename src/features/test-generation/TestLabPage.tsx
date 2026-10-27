import React, { useState } from 'react';
import { Review, GeneratedTest, TestExecution } from '../../types/review';
import { executeTest, generateTest } from '../../lib/api';
import {
  FlaskConical,
  Play,
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Code2,
  RefreshCw,
  Terminal,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

interface TestLabPageProps {
  reviews: Review[];
  onRefreshReview: (updatedReview: Review) => void;
}

export const TestLabPage: React.FC<TestLabPageProps> = ({ reviews, onRefreshReview }) => {
  // Aggregate all generated tests
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
  const [isRegenerating, setIsRegenerating] = useState(false);
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
      alert(`Execution failed: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRegenerate = async (test: GeneratedTest, review: Review) => {
    setIsRegenerating(true);
    try {
      const newTest = await generateTest(test.findingId, review.id);
      const updatedReview: Review = {
        ...review,
        generatedTests: review.generatedTests.map((t) => (t.id === test.id ? newTest : t)),
      };
      onRefreshReview(updatedReview);
      setSelectedTestId(newTest.id);
    } catch (err: any) {
      alert(`Regeneration failed: ${err.message}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Automated Test Lab</h1>
          <p className="text-sm text-slate-600 mt-1">
            Targeted unit test suites generated to isolate, reproduce, and verify remediation for reported defects.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
          <ShieldCheck className="w-4 h-4 text-amber-600" />
          <span>AST Safe Sandbox: Execution Disabled (Isolation Enforced)</span>
        </div>
      </div>

      {allTests.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
            <FlaskConical className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">No unit tests generated yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Open any finding in the Review Workspace and click "Generate Unit Test" to synthesize a focused reproduction test.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Test Suites List (1 col) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[650px]">
            <div className="p-4 border-b border-slate-200 bg-slate-50 text-xs font-semibold font-mono text-slate-700 flex items-center justify-between">
              <span>GENERATED TEST SUITES ({allTests.length})</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {allTests.map(({ test, review }) => {
                const isSelected = selectedTestId === test.id;
                const finding = review.findings.find((f) => f.id === test.findingId);

                return (
                  <div
                    key={test.id}
                    onClick={() => {
                      setSelectedTestId(test.id);
                      setLatestExecution(null);
                    }}
                    className={`p-4 cursor-pointer transition-all space-y-1.5 ${
                      isSelected
                        ? 'bg-purple-50/70 border-l-4 border-purple-600'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold uppercase">
                        {test.framework}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {test.validationStatus === 'SYNTAX_VALID' ? (
                          <span className="text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Valid
                          </span>
                        ) : (
                          <span className="text-rose-600 flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Syntax Error
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {finding ? finding.title : test.targetFunction}
                    </div>

                    <div className="text-[11px] text-slate-500 font-mono flex items-center justify-between">
                      <span className="truncate">{review.title}</span>
                      <span>{test.testType.replace('_', ' ')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Test Code & Execution Terminal (2 cols) */}
          {selectedItem && (
            <div className="lg:col-span-2 space-y-4">
              {/* Test Header & Actions */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 uppercase">
                      {selectedItem.test.framework}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      Target: {selectedItem.test.targetFunction}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-900 text-sm">
                    {selectedItem.test.testType === 'DEFECT_REPRODUCTION'
                      ? 'Defect Reproduction Suite'
                      : 'Boundary & Happy Path Verification'}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRegenerate(selectedItem.test, selectedItem.review)}
                    disabled={isRegenerating}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                    <span>Regenerate</span>
                  </button>

                  <button
                    onClick={() =>
                      handleCopyCode(selectedItem.test.testCode, selectedItem.test.id)
                    }
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                  >
                    {copiedTestId === selectedItem.test.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleRunTest(selectedItem.test, selectedItem.review)}
                    disabled={isExecuting}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Executing in Sandbox...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Run in Sandbox</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Code Viewer Panel */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
                <div className="h-10 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between text-xs font-mono text-slate-400">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-purple-400" />
                    <span className="text-slate-200">
                      test_{selectedItem.test.targetFunction}.spec.{selectedItem.test.language === 'python' ? 'py' : 'ts'}
                    </span>
                  </div>
                  <span>{selectedItem.test.testCode.split('\n').length} lines</span>
                </div>

                <pre className="p-4 font-mono text-xs text-slate-200 overflow-x-auto max-h-72 leading-relaxed selection:bg-purple-900">
                  {selectedItem.test.testCode}
                </pre>
              </div>

              {/* Sandbox Execution Terminal */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 shadow-sm overflow-hidden font-mono text-xs">
                <div className="h-10 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between text-slate-400">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-200">Sandbox Test Runner Output</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    AST Syntax Check + Boundary Policy
                  </span>
                </div>

                <div className="p-4 space-y-2 min-h-36">
                  {isExecuting ? (
                    <div className="flex items-center gap-2 text-indigo-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Validating AST safety rules and executing test harness...</span>
                    </div>
                  ) : latestExecution ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className={`font-semibold flex items-center gap-1.5 ${
                          latestExecution.status === 'PASSED'
                            ? 'text-emerald-400'
                            : latestExecution.status === 'SANDBOX_RESTRICTED'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}>
                          {latestExecution.status === 'PASSED' ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : latestExecution.status === 'SANDBOX_RESTRICTED' ? (
                            <ShieldAlert className="w-4 h-4 text-amber-400" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                          Status: {latestExecution.status === 'SANDBOX_RESTRICTED' ? 'SANDBOX_RESTRICTED (Safe Mode)' : latestExecution.status} ({latestExecution.executionTimeMs}ms)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {latestExecution.sandboxInfo.isolationMechanism}
                        </span>
                      </div>

                      {latestExecution.stdout && (
                        <pre className="text-slate-300 whitespace-pre-wrap">{latestExecution.stdout}</pre>
                      )}
                      {latestExecution.stderr && (
                        <pre className="text-rose-400 whitespace-pre-wrap">{latestExecution.stderr}</pre>
                      )}
                    </div>
                  ) : (
                    <div className="text-slate-500 text-center py-6">
                      Click "Run in Sandbox" above to execute this unit test against the verified isolated test runner.
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
