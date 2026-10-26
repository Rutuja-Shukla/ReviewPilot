import React, { useState, useRef, useEffect } from 'react';
import { Review, ReviewFinding, GeneratedTest, TestExecution, ReviewSeverity } from '../../types/review';
import { SeverityBadge } from '../../components/SeverityBadge';
import { DetectionSourceBadge, ValidationStatusBadge } from '../../components/StatusBadge';
import { generateTest, executeTest, exportReview, updateFindingFeedback } from '../../lib/api';
import {
  FileCode2,
  Copy,
  Download,
  Check,
  FlaskConical,
  Play,
  Loader2,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  FileCheck,
  XCircle,
  ExternalLink,
  ChevronRight,
  Filter,
  CheckCheck,
  Code,
  Terminal,
} from 'lucide-react';

interface ReviewWorkspacePageProps {
  review: Review;
  onRefreshReview: (updatedReview: Review) => void;
  onOpenTestLab: () => void;
}

export const ReviewWorkspacePage: React.FC<ReviewWorkspacePageProps> = ({
  review,
  onRefreshReview,
  onOpenTestLab,
}) => {
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(
    review.findings[0]?.id || null
  );
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [copiedPatchId, setCopiedPatchId] = useState<string | null>(null);
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [isExecutingTest, setIsExecutingTest] = useState(false);
  const [testResult, setTestResult] = useState<TestExecution | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'md' | 'json' | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const codeViewerRef = useRef<HTMLDivElement>(null);

  const selectedFinding = review.findings.find((f) => f.id === selectedFindingId);

  // Filter findings
  const filteredFindings = review.findings.filter((f) => {
    if (severityFilter === 'ALL') return true;
    return f.severity === severityFilter;
  });

  // Source file for current view
  const activeFile = review.files[0] || {
    id: '1',
    reviewId: review.id,
    path: 'source.ts',
    content: '// No source code loaded',
    language: review.language,
    changesCount: { additions: 0, deletions: 0 },
  };

  const fileLines = activeFile.content.split('\n');

  // Map line numbers to findings
  const lineToFindingsMap = new Map<number, ReviewFinding[]>();
  for (const f of review.findings) {
    for (let l = f.startLine; l <= (f.endLine || f.startLine); l++) {
      const existing = lineToFindingsMap.get(l) || [];
      existing.push(f);
      lineToFindingsMap.set(l, existing);
    }
  }

  // Auto-scroll code view when selecting finding
  useEffect(() => {
    if (selectedFinding && codeViewerRef.current) {
      const lineEl = document.getElementById(`source-line-${selectedFinding.startLine}`);
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedFindingId]);

  const handleCopyPatch = (patch: string, id: string) => {
    navigator.clipboard.writeText(patch);
    setCopiedPatchId(id);
    setTimeout(() => setCopiedPatchId(null), 2500);
  };

  const handleGenerateTest = async (finding: ReviewFinding) => {
    setIsGeneratingTest(true);
    setActionSuccessMessage(null);
    try {
      const newTest = await generateTest(finding.id, review.id);
      const updatedReview: Review = {
        ...review,
        generatedTests: [...(review.generatedTests || []), newTest],
        stats: {
          ...review.stats,
          testsGeneratedCount: (review.stats.testsGeneratedCount || 0) + 1,
        },
      };
      onRefreshReview(updatedReview);
      setActionSuccessMessage('Targeted unit test generated successfully!');
      setTimeout(() => setActionSuccessMessage(null), 3000);
    } catch (err: any) {
      alert(`Test generation error: ${err.message}`);
    } finally {
      setIsGeneratingTest(false);
    }
  };

  const handleExecuteGeneratedTest = async (test: GeneratedTest) => {
    setIsExecutingTest(true);
    setTestResult(null);
    try {
      const execution = await executeTest(test);
      setTestResult(execution);
      const updatedReview: Review = {
        ...review,
        testExecutions: [...(review.testExecutions || []), execution],
      };
      // If passed, mark finding as TEST_CONFIRMED
      if (execution.status === 'PASSED') {
        const targetFinding = updatedReview.findings.find((f) => f.id === test.findingId);
        if (targetFinding && targetFinding.validationStatus !== 'DISMISSED') {
          targetFinding.validationStatus = 'TEST_CONFIRMED';
        }
      }
      onRefreshReview(updatedReview);
    } catch (err: any) {
      alert(`Test execution error: ${err.message}`);
    } finally {
      setIsExecutingTest(false);
    }
  };

  const handleToggleManualVerify = async (finding: ReviewFinding) => {
    const isCurrentlyVerified = finding.validationStatus === 'MANUALLY_VERIFIED';
    try {
      const updated = await updateFindingFeedback(finding.id, review.id, {
        verifiedByUser: !isCurrentlyVerified,
      });
      const updatedReview: Review = {
        ...review,
        findings: review.findings.map((f) => (f.id === finding.id ? updated : f)),
      };
      onRefreshReview(updatedReview);
    } catch (err: any) {
      alert(`Failed to update verification: ${err.message}`);
    }
  };

  const handleDismissFinding = async (finding: ReviewFinding) => {
    const isCurrentlyDismissed = finding.validationStatus === 'DISMISSED';
    try {
      const updated = await updateFindingFeedback(finding.id, review.id, {
        dismissed: !isCurrentlyDismissed,
        reason: !isCurrentlyDismissed ? 'ACCEPTED_RISK' : undefined,
      });
      const updatedReview: Review = {
        ...review,
        findings: review.findings.map((f) => (f.id === finding.id ? updated : f)),
      };
      onRefreshReview(updatedReview);
    } catch (err: any) {
      alert(`Failed to dismiss finding: ${err.message}`);
    }
  };

  const handleExport = async (format: 'md' | 'json') => {
    setExportingFormat(format);
    try {
      await exportReview(review.id, format === 'md' ? 'markdown' : 'json');
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExportingFormat(null);
    }
  };

  // Find generated tests for selected finding
  const relevantTests = (review.generatedTests || []).filter(
    (t) => t.findingId === selectedFinding?.id
  );

  return (
    <div className="flex flex-col h-[calc(100vh-1px)] overflow-hidden bg-slate-100">
      {/* Top Workspace Action Bar */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 text-sm truncate">
              {review.title}
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 uppercase">
              {review.language}
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
              {review.profile.replace('_', ' ')}
            </span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>•</span>
            <span>{review.stats.totalFindings} findings</span>
            <span>•</span>
            <span>{review.analysisTimeMs ? `${review.analysisTimeMs}ms` : 'Completed'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleExport('md')}
            disabled={exportingFormat !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
            title="Export review report as Markdown"
          >
            <Download className="w-3.5 h-3.5" />
            Export Markdown
          </button>

          <button
            onClick={() => handleExport('json')}
            disabled={exportingFormat !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
            title="Export review record as JSON"
          >
            <Code className="w-3.5 h-3.5" />
            JSON
          </button>
        </div>
      </header>

      {/* Main Split Layout: Left Source Code, Right Findings & Fixes */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Source Code / Diff Panel */}
        <div className="flex-1 flex flex-col bg-slate-950 border-r border-slate-800 overflow-hidden">
          {/* File Tab Header */}
          <div className="h-10 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between text-xs font-mono text-slate-300">
            <div className="flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-indigo-400" />
              <span className="font-medium text-white">{activeFile.path}</span>
              {activeFile.isDiff && (
                <span className="text-[11px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                  DIFF VIEW
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400">
              {fileLines.length} lines • {review.findings.length} findings anchored
            </div>
          </div>

          {/* Line-Numbered Source Viewer */}
          <div
            ref={codeViewerRef}
            className="flex-1 overflow-auto font-mono text-xs text-slate-200 select-text"
          >
            <div className="p-2 min-w-full inline-block">
              {fileLines.map((lineContent, index) => {
                const lineNum = index + 1;
                const findingsOnLine = lineToFindingsMap.get(lineNum) || [];
                const isSelectedFindingLine =
                  selectedFinding &&
                  lineNum >= selectedFinding.startLine &&
                  lineNum <= (selectedFinding.endLine || selectedFinding.startLine);

                const hasCritical = findingsOnLine.some((f) => f.severity === 'CRITICAL');
                const hasHigh = findingsOnLine.some((f) => f.severity === 'HIGH');
                const hasMedium = findingsOnLine.some((f) => f.severity === 'MEDIUM');

                const isDiffAdd = activeFile.isDiff && lineContent.startsWith('+');
                const isDiffDel = activeFile.isDiff && lineContent.startsWith('-');

                return (
                  <div
                    key={lineNum}
                    id={`source-line-${lineNum}`}
                    className={`flex items-start group leading-6 transition-colors ${
                      isSelectedFindingLine
                        ? 'bg-indigo-950/80 border-l-2 border-indigo-400'
                        : hasCritical
                        ? 'bg-rose-950/30 border-l-2 border-rose-500'
                        : hasHigh
                        ? 'bg-orange-950/20 border-l-2 border-orange-500'
                        : hasMedium
                        ? 'bg-amber-950/20'
                        : isDiffAdd
                        ? 'bg-emerald-950/30 text-emerald-300'
                        : isDiffDel
                        ? 'bg-rose-950/30 text-rose-300'
                        : 'hover:bg-slate-900/60'
                    }`}
                  >
                    {/* Line Number */}
                    <div className="w-12 text-right pr-4 text-slate-400 select-none text-[11px] shrink-0 font-mono">
                      {lineNum}
                    </div>

                    {/* Inline Marker */}
                    <div className="w-5 shrink-0 flex items-center justify-center">
                      {hasCritical ? (
                        <span className="w-2 h-2 rounded-full bg-rose-500" title="Critical finding on this line" />
                      ) : hasHigh ? (
                        <span className="w-2 h-2 rounded-full bg-orange-500" title="High finding on this line" />
                      ) : hasMedium ? (
                        <span className="w-2 h-2 rounded-full bg-amber-500" title="Medium finding on this line" />
                      ) : null}
                    </div>

                    {/* Code Text */}
                    <pre className="flex-1 overflow-x-auto whitespace-pre font-mono">
                      {lineContent || ' '}
                    </pre>

                    {/* Quick Finding Jump Pill */}
                    {findingsOnLine.length > 0 && (
                      <div className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setSelectedFindingId(findingsOnLine[0].id)}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700"
                        >
                          View Finding
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Findings List & Finding Details Panel */}
        <div className="w-[520px] flex flex-col bg-white border-l border-slate-200 overflow-hidden shrink-0">
          {/* Severity Filter Header */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 font-mono">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>FINDINGS ({filteredFindings.length})</span>
            </div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded px-2 py-1 font-mono focus:outline-none"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="HIGH">High Only</option>
              <option value="MEDIUM">Medium Only</option>
              <option value="LOW">Low Only</option>
            </select>
          </div>

          {/* Compact Findings Accordion List */}
          <div className="h-52 overflow-y-auto border-b border-slate-200 divide-y divide-slate-100">
            {filteredFindings.map((finding) => {
              const isSelected = selectedFindingId === finding.id;
              return (
                <div
                  key={finding.id}
                  onClick={() => setSelectedFindingId(finding.id)}
                  className={`p-3 cursor-pointer transition-all flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'bg-indigo-50/70 border-l-4 border-indigo-600'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={finding.severity} size="sm" />
                      <span className="text-xs font-mono text-slate-500">
                        Line {finding.startLine}
                      </span>
                    </div>
                    <div className={`text-xs font-medium truncate ${isSelected ? 'text-indigo-950 font-semibold' : 'text-slate-800'}`}>
                      {finding.title}
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'text-indigo-600 translate-x-0.5' : 'text-slate-400'}`} />
                </div>
              );
            })}
          </div>

          {/* Finding Detail Panel */}
          {selectedFinding ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Header */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={selectedFinding.severity} />
                    <span className="text-xs font-mono text-slate-500">
                      Lines {selectedFinding.startLine}-{selectedFinding.endLine}
                    </span>
                  </div>
                  <div className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    Confidence: {Math.round(selectedFinding.confidence * 100)}%
                  </div>
                </div>

                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {selectedFinding.title}
                </h3>

                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <DetectionSourceBadge source={selectedFinding.detectionSource} />
                  <ValidationStatusBadge status={selectedFinding.validationStatus} />
                </div>
              </div>

              {actionSuccessMessage && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCheck className="w-4 h-4 text-emerald-600" />
                  {actionSuccessMessage}
                </div>
              )}

              {/* Description & Impact */}
              <div className="space-y-3 text-xs leading-relaxed text-slate-700">
                <div>
                  <span className="font-semibold text-slate-900 block font-mono uppercase text-[11px] mb-1">
                    Defect Analysis
                  </span>
                  <p>{selectedFinding.description}</p>
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg">
                  <span className="font-semibold text-amber-900 block font-mono uppercase text-[11px] mb-1">
                    Potential Impact
                  </span>
                  <p className="text-amber-800">{selectedFinding.impact}</p>
                </div>

                {/* Evidence */}
                <div>
                  <span className="font-semibold text-slate-900 block font-mono uppercase text-[11px] mb-1">
                    Concrete Evidence
                  </span>
                  <ul className="space-y-1">
                    {selectedFinding.evidence.map((e, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-slate-600 font-mono text-[11px]">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Code Excerpt */}
                {selectedFinding.codeExcerpt && (
                  <div>
                    <span className="font-semibold text-slate-900 block font-mono uppercase text-[11px] mb-1">
                      Target Code Excerpt
                    </span>
                    <pre className="p-2.5 rounded bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto border border-slate-800">
                      {selectedFinding.codeExcerpt}
                    </pre>
                  </div>
                )}

                {/* Recommended Fix */}
                <div>
                  <span className="font-semibold text-slate-900 block font-mono uppercase text-[11px] mb-1">
                    Remediation Plan
                  </span>
                  <p className="bg-indigo-50/50 p-2.5 rounded border border-indigo-100 text-indigo-950 font-medium">
                    {selectedFinding.recommendedFix}
                  </p>
                </div>

                {/* Suggested Patch Diff */}
                {selectedFinding.suggestedPatch && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 font-mono uppercase text-[11px]">
                        Suggested Patch (.patch)
                      </span>
                      <button
                        onClick={() =>
                          handleCopyPatch(selectedFinding.suggestedPatch!, selectedFinding.id)
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-indigo-600 hover:text-indigo-700"
                      >
                        {copiedPatchId === selectedFinding.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Unified Diff</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-3 bg-slate-950 text-slate-100 rounded-lg font-mono text-[11px] overflow-x-auto border border-slate-800 leading-tight">
                      {selectedFinding.suggestedPatch}
                    </pre>
                  </div>
                )}
              </div>

              {/* Action Buttons: Generate Test, Manual Verification, Dismiss */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleGenerateTest(selectedFinding)}
                    disabled={isGeneratingTest}
                    className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    {isGeneratingTest ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating Unit Test...</span>
                      </>
                    ) : (
                      <>
                        <FlaskConical className="w-3.5 h-3.5" />
                        <span>Generate Unit Test</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleToggleManualVerify(selectedFinding)}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                      selectedFinding.validationStatus === 'MANUALLY_VERIFIED'
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{selectedFinding.validationStatus === 'MANUALLY_VERIFIED' ? 'Verified' : 'Verify'}</span>
                  </button>

                  <button
                    onClick={() => handleDismissFinding(selectedFinding)}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                      selectedFinding.validationStatus === 'DISMISSED'
                        ? 'bg-slate-100 text-slate-700 border-slate-300'
                        : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{selectedFinding.validationStatus === 'DISMISSED' ? 'Restore' : 'Dismiss'}</span>
                  </button>
                </div>

                {/* Relevant Tests Section if generated */}
                {relevantTests.length > 0 && (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono font-semibold text-slate-800">
                      <span className="flex items-center gap-1.5">
                        <FlaskConical className="w-3.5 h-3.5 text-purple-600" />
                        Targeted Test ({relevantTests[0].framework.toUpperCase()})
                      </span>
                      <button
                        onClick={onOpenTestLab}
                        className="text-[11px] text-indigo-600 hover:underline"
                      >
                        Open Test Lab
                      </button>
                    </div>

                    <pre className="p-2 rounded bg-slate-900 text-slate-200 font-mono text-[10px] overflow-x-auto max-h-32">
                      {relevantTests[0].testCode}
                    </pre>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-mono text-slate-500">
                        Type: {relevantTests[0].testType}
                      </span>
                      <button
                        onClick={() => handleExecuteGeneratedTest(relevantTests[0])}
                        disabled={isExecutingTest}
                        className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {isExecutingTest ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3 fill-white" />
                        )}
                        <span>Run in Sandbox</span>
                      </button>
                    </div>

                    {testResult && (
                      <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-300 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold ${testResult.status === 'PASSED' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {testResult.status} ({testResult.executionTimeMs}ms)
                          </span>
                          <span className="text-slate-400">{testResult.sandboxInfo.runtime}</span>
                        </div>
                        {testResult.stdout && <pre className="text-slate-400 whitespace-pre-wrap">{testResult.stdout}</pre>}
                        {testResult.stderr && <pre className="text-rose-400 whitespace-pre-wrap">{testResult.stderr}</pre>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 p-8 text-center text-slate-400 flex flex-col items-center justify-center">
              <FileCheck className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-xs">Select a finding from the list above or click a marked line in the code viewer.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
