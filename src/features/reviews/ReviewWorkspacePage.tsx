import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Review, ReviewFinding, GeneratedTest, TestExecution } from '../../types/review';
import { SeverityBadge } from '../../components/SeverityBadge';
import { SourceCodeViewer } from './SourceCodeViewer';
import { FindingDetailPanel } from './FindingDetailPanel';
import { generateTest, executeTest, exportReview, updateFindingFeedback, reAnalyzeReview } from '../../lib/api';
import {
  Download,
  FileCheck,
  ChevronRight,
  Filter,
  Code,
  RotateCcw,
  Search,
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
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [copiedPatchId, setCopiedPatchId] = useState<string | null>(null);
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [isExecutingTest, setIsExecutingTest] = useState(false);
  const [isReAnalyzing, setIsReAnalyzing] = useState(false);
  const [testResult, setTestResult] = useState<TestExecution | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'md' | 'json' | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const codeViewerRef = useRef<HTMLDivElement>(null);

  // Filter findings
  const filteredFindings = review.findings.filter((f) => {
    if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchTitle = f.title.toLowerCase().includes(q);
      const matchDesc = f.description.toLowerCase().includes(q);
      const matchLine = f.startLine.toString().includes(q);
      if (!matchTitle && !matchDesc && !matchLine) return false;
    }
    return true;
  });

  const selectedFinding = review.findings.find((f) => f.id === selectedFindingId) || filteredFindings[0];

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
  }, [selectedFindingId, selectedFinding]);

  // Keyboard navigation: j (next finding), k (previous finding)
  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger if user is focused inside an input/textarea
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (filteredFindings.length === 0) return;

      const currentIndex = filteredFindings.findIndex((f) => f.id === selectedFindingId);

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < filteredFindings.length - 1 ? currentIndex + 1 : 0;
        setSelectedFindingId(filteredFindings[nextIndex].id);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredFindings.length - 1;
        setSelectedFindingId(filteredFindings[prevIndex].id);
      }
    },
    [filteredFindings, selectedFindingId]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

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
      setActionSuccessMessage(isCurrentlyVerified ? 'Verification reset' : 'Marked as reviewed');
      setTimeout(() => setActionSuccessMessage(null), 2500);
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

  const handleReAnalyze = async () => {
    setIsReAnalyzing(true);
    try {
      const reAnalyzed = await reAnalyzeReview(review.id);
      onRefreshReview(reAnalyzed);
      setActionSuccessMessage('Review re-analyzed successfully');
      setTimeout(() => setActionSuccessMessage(null), 2500);
    } catch (err: any) {
      alert(`Re-analysis failed: ${err.message}`);
    } finally {
      setIsReAnalyzing(false);
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

  const relevantTests = (review.generatedTests || []).filter(
    (t) => t.findingId === selectedFinding?.id
  );

  return (
    <div className="flex flex-col h-[calc(100vh-1px)] overflow-hidden bg-slate-100">
      {/* Top Workspace Action Bar */}
      <header className="h-12 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-semibold text-slate-900 text-xs truncate max-w-xs md:max-w-md font-sans">
            {review.title}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 uppercase">
            {review.language}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
            {review.profile.replace('_', ' ')}
          </span>
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
            <span>·</span>
            <span className="tabular-nums">{review.findings.length} findings</span>
            <span>·</span>
            <span className="tabular-nums">{review.analysisTimeMs ? `${review.analysisTimeMs}ms` : 'Completed'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleReAnalyze}
            disabled={isReAnalyzing}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="Re-run static checks & Gemini analysis"
          >
            <RotateCcw className={`w-3 h-3 ${isReAnalyzing ? 'animate-spin' : ''}`} />
            <span>Re-analyze</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('md')}
            disabled={exportingFormat !== null}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="Export review report as Markdown"
          >
            <Download className="w-3 h-3" />
            <span>Markdown</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('json')}
            disabled={exportingFormat !== null}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="Export review record as JSON"
          >
            <Code className="w-3 h-3" />
            <span>JSON</span>
          </button>
        </div>
      </header>

      {/* Main Split Layout: Left Source Code, Right Findings & Fixes */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Source Code / Diff Panel */}
        <SourceCodeViewer
          activeFile={activeFile}
          fileLines={fileLines}
          lineToFindingsMap={lineToFindingsMap}
          selectedFinding={selectedFinding}
          onSelectFinding={setSelectedFindingId}
          codeViewerRef={codeViewerRef}
          totalFindingsCount={review.findings.length}
        />

        {/* Right: Findings List & Detail Panel */}
        <div className="w-[480px] lg:w-[540px] flex flex-col bg-white border-l border-slate-200 overflow-hidden shrink-0">
          {/* Findings Filter Bar with Search & Severity */}
          <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter findings..."
                className="w-full text-xs bg-white border border-slate-300 rounded px-2 py-0.5 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded px-2 py-0.5 font-mono focus:outline-none shrink-0"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* High-Density Findings List */}
          <div className="h-48 overflow-y-auto border-b border-slate-200 divide-y divide-slate-100 select-none">
            {filteredFindings.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No findings match the current filter.
              </div>
            ) : (
              filteredFindings.map((finding) => {
                const isSelected = selectedFinding?.id === finding.id;
                return (
                  <div
                    key={finding.id}
                    onClick={() => setSelectedFindingId(finding.id)}
                    className={`p-2.5 cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                      isSelected
                        ? 'bg-indigo-50/80 border-l-3 border-indigo-600'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={finding.severity} size="sm" />
                        <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                          Line {finding.startLine}
                        </span>
                      </div>
                      <div className={`text-xs truncate ${isSelected ? 'text-indigo-950 font-semibold' : 'text-slate-800 font-medium'}`}>
                        {finding.title}
                      </div>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 mt-1 transition-transform ${isSelected ? 'text-indigo-600 translate-x-0.5' : 'text-slate-400'}`} />
                  </div>
                );
              })
            )}
          </div>

          {/* Selected Finding Detail Panel */}
          {selectedFinding ? (
            <FindingDetailPanel
              finding={selectedFinding}
              actionSuccessMessage={actionSuccessMessage}
              copiedPatchId={copiedPatchId}
              onCopyPatch={handleCopyPatch}
              isGeneratingTest={isGeneratingTest}
              onGenerateTest={handleGenerateTest}
              onToggleManualVerify={handleToggleManualVerify}
              onDismissFinding={handleDismissFinding}
              relevantTests={relevantTests}
              onOpenTestLab={onOpenTestLab}
              isExecutingTest={isExecutingTest}
              onExecuteTest={handleExecuteGeneratedTest}
              testResult={testResult}
            />
          ) : (
            <div className="flex-1 p-6 text-center text-slate-400 flex flex-col items-center justify-center">
              <FileCheck className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-xs">Select a finding above or click an anchored line in the source viewer.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
