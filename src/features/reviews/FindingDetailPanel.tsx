import React from 'react';
import { ReviewFinding, GeneratedTest, TestExecution } from '../../types/review';
import { SeverityBadge } from '../../components/SeverityBadge';
import { DetectionSourceBadge, ValidationStatusBadge } from '../../components/StatusBadge';
import { exportPatch } from '../../lib/api';
import {
  Copy,
  Download,
  Check,
  FlaskConical,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  CheckCheck,
  Terminal,
} from 'lucide-react';

interface FindingDetailPanelProps {
  finding: ReviewFinding;
  actionSuccessMessage: string | null;
  copiedPatchId: string | null;
  onCopyPatch: (patch: string, id: string) => void;
  isGeneratingTest: boolean;
  onGenerateTest: (finding: ReviewFinding) => void;
  onToggleManualVerify: (finding: ReviewFinding) => void;
  onDismissFinding: (finding: ReviewFinding) => void;
  relevantTests: GeneratedTest[];
  onOpenTestLab: () => void;
  isExecutingTest: boolean;
  onExecuteTest: (test: GeneratedTest) => void;
  testResult: TestExecution | null;
}

export const FindingDetailPanel: React.FC<FindingDetailPanelProps> = ({
  finding,
  actionSuccessMessage,
  copiedPatchId,
  onCopyPatch,
  isGeneratingTest,
  onGenerateTest,
  onToggleManualVerify,
  onDismissFinding,
  relevantTests,
  onOpenTestLab,
  isExecutingTest,
  onExecuteTest,
  testResult,
}) => {
  const isReviewed = finding.validationStatus === 'MANUALLY_VERIFIED';

  const handleExportPatch = (patch: string, findingId: string) => {
    exportPatch(patch, `reviewpilot-${findingId}.patch`);
  };

  // Render patch diff with clean syntax lines
  const renderPatchDiff = (patch: string) => {
    const patchLines = patch.split('\n');
    return (
      <div className="bg-slate-950 rounded border border-slate-800 font-mono text-[11px] overflow-x-auto p-2.5 max-h-56 leading-relaxed select-text">
        {patchLines.map((line, idx) => {
          let lineClass = 'text-slate-300';
          if (line.startsWith('@@')) {
            lineClass = 'text-sky-400 font-semibold';
          } else if (line.startsWith('+') && !line.startsWith('+++')) {
            lineClass = 'text-emerald-400 bg-emerald-950/40 -mx-2.5 px-2.5';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineClass = 'text-rose-400 bg-rose-950/40 -mx-2.5 px-2.5';
          }
          return (
            <div key={idx} className={lineClass}>
              {line || ' '}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-slate-800">
      {/* Finding Header */}
      <div className="space-y-1.5 pb-3 border-b border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <SeverityBadge severity={finding.severity} size="sm" />
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
              Lines {finding.startLine}–{finding.endLine || finding.startLine}
            </span>
          </div>
          <div className="text-[11px] font-mono font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 tabular-nums">
            {Math.round(finding.confidence * 100)}% confidence
          </div>
        </div>

        <h3 className="text-sm font-bold text-slate-900 leading-snug">
          {finding.title}
        </h3>

        {/* Quiet Metadata Line (Zero-Pill Discipline) */}
        <div className="text-[11px] font-mono text-slate-500 flex flex-wrap items-center gap-2">
          <span>{finding.category}</span>
          <span>·</span>
          <span>{finding.filePath}</span>
          <span>·</span>
          <DetectionSourceBadge source={finding.detectionSource} />
          <span>·</span>
          <ValidationStatusBadge status={finding.validationStatus} />
        </div>
      </div>

      {actionSuccessMessage && (
        <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Description & Impact */}
      <div className="space-y-3 text-xs leading-relaxed">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Defect Analysis
          </div>
          <p className="text-slate-800">{finding.description}</p>
        </div>

        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-900 mb-0.5">
            Security / Reliability Impact
          </div>
          <p className="text-amber-800 text-xs">{finding.impact}</p>
        </div>

        {/* Concrete Evidence */}
        {finding.evidence && finding.evidence.length > 0 && (
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Evidence & Grounding
            </div>
            <ul className="space-y-1 font-mono text-[11px] text-slate-600">
              {finding.evidence.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-indigo-600 font-bold shrink-0">›</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Code Excerpt */}
        {finding.codeExcerpt && (
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Offending Code
            </div>
            <pre className="p-2 bg-slate-900 text-slate-200 font-mono text-[11px] rounded border border-slate-800 overflow-x-auto">
              {finding.codeExcerpt}
            </pre>
          </div>
        )}

        {/* Recommended Remediation */}
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Recommended Remediation
          </div>
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-slate-800 font-sans text-xs">
            {finding.recommendedFix}
          </div>
        </div>

        {/* Suggested Unified Patch */}
        {finding.suggestedPatch && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Suggested Patch (.patch)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCopyPatch(finding.suggestedPatch!, finding.id)}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  title="Copy patch to clipboard"
                >
                  {copiedPatchId === finding.id ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy patch</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleExportPatch(finding.suggestedPatch!, finding.id)}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 hover:text-slate-800 cursor-pointer"
                  title="Download .patch file"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {renderPatchDiff(finding.suggestedPatch)}
          </div>
        )}
      </div>

      {/* Primary Action Buttons: Generate Test, Mark Reviewed, Dismiss */}
      <div className="pt-3 border-t border-slate-200 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onGenerateTest(finding)}
            disabled={isGeneratingTest}
            className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
          >
            {isGeneratingTest ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating Test...</span>
              </>
            ) : (
              <>
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Generate Reproducing Test</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onToggleManualVerify(finding)}
            className={`py-1.5 px-3 rounded text-xs font-medium border flex items-center gap-1 transition-colors cursor-pointer ${
              isReviewed
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title="Mark finding as verified by developer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isReviewed ? 'Verified' : 'Verify'}</span>
          </button>

          <button
            type="button"
            onClick={() => onDismissFinding(finding)}
            className={`py-1.5 px-3 rounded text-xs font-medium border flex items-center gap-1 transition-colors cursor-pointer ${
              finding.validationStatus === 'DISMISSED'
                ? 'bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
            }`}
            title="Dismiss finding as accepted risk or false positive"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>{finding.validationStatus === 'DISMISSED' ? 'Restore' : 'Dismiss'}</span>
          </button>
        </div>

        {/* Embedded Test Execution View */}
        {relevantTests.length > 0 && (
          <div className="p-3 rounded bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono font-semibold text-slate-800">
              <span className="flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-purple-600" />
                <span>{relevantTests[0].framework.toUpperCase()} Test Suite</span>
              </span>
              <button
                type="button"
                onClick={onOpenTestLab}
                className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
              >
                Open in Test Lab →
              </button>
            </div>

            <pre className="p-2 rounded bg-slate-900 text-slate-200 font-mono text-[10px] overflow-x-auto max-h-28 border border-slate-800">
              {relevantTests[0].testCode}
            </pre>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] font-mono text-slate-500">
                Isolation: Safe Mock Sandbox
              </span>
              <button
                type="button"
                onClick={() => onExecuteTest(relevantTests[0])}
                disabled={isExecutingTest}
                className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isExecutingTest ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3 fill-white" />
                )}
                <span>Run Sandbox Test</span>
              </button>
            </div>

            {testResult && (
              <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${
                    testResult.status === 'PASSED'
                      ? 'text-emerald-400'
                      : testResult.status === 'SANDBOX_RESTRICTED'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}>
                    {testResult.status === 'SANDBOX_RESTRICTED' ? 'SANDBOX_RESTRICTED (Safe Isolation)' : testResult.status} ({testResult.executionTimeMs}ms)
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
  );
};
