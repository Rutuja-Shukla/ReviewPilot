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

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <span className="text-xs font-mono text-slate-500">
              Lines {finding.startLine}-{finding.endLine}
            </span>
          </div>
          <div className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            Confidence: {Math.round(finding.confidence * 100)}%
          </div>
        </div>

        <h3 className="text-base font-bold text-slate-900 leading-snug">
          {finding.title}
        </h3>

        {/* Status Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <DetectionSourceBadge source={finding.detectionSource} />
          <ValidationStatusBadge status={finding.validationStatus} />
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
          <p>{finding.description}</p>
        </div>

        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg">
          <span className="font-semibold text-amber-900 block font-mono uppercase text-[11px] mb-1">
            Potential Impact
          </span>
          <p className="text-amber-800">{finding.impact}</p>
        </div>

        {/* Evidence */}
        <div>
          <span className="font-semibold text-slate-900 block font-mono uppercase text-[11px] mb-1">
            Concrete Evidence
          </span>
          <ul className="space-y-1">
            {finding.evidence.map((e, idx) => (
              <li key={idx} className="flex items-start gap-1.5 text-slate-600 font-mono text-[11px]">
                <span className="text-indigo-600 font-bold">•</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Code Excerpt */}
        {finding.codeExcerpt && (
          <div>
            <span className="font-semibold text-slate-900 block font-mono uppercase text-[11px] mb-1">
              Target Code Excerpt
            </span>
            <pre className="p-2.5 rounded bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto border border-slate-800">
              {finding.codeExcerpt}
            </pre>
          </div>
        )}

        {/* Recommended Fix */}
        <div>
          <span className="font-semibold text-slate-900 block font-mono uppercase text-[11px] mb-1">
            Remediation Plan
          </span>
          <p className="bg-indigo-50/50 p-2.5 rounded border border-indigo-100 text-indigo-950 font-medium">
            {finding.recommendedFix}
          </p>
        </div>

        {/* Suggested Patch Diff & Actions (Section 13 Controls) */}
        {finding.suggestedPatch && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900 font-mono uppercase text-[11px]">
                Suggested Patch (.patch)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCopyPatch(finding.suggestedPatch!, finding.id)}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-indigo-600 hover:text-indigo-700 cursor-pointer"
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
                      <span>Copy</span>
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
                  <span>Export</span>
                </button>
              </div>
            </div>

            <pre className="p-3 bg-slate-950 text-slate-100 rounded-lg font-mono text-[11px] overflow-x-auto border border-slate-800 leading-tight">
              {finding.suggestedPatch}
            </pre>
          </div>
        )}
      </div>

      {/* Action Buttons: Generate Test, Mark Reviewed, Dismiss */}
      <div className="pt-4 border-t border-slate-200 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onGenerateTest(finding)}
            disabled={isGeneratingTest}
            className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
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
            type="button"
            onClick={() => onToggleManualVerify(finding)}
            className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
              isReviewed
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title="Mark finding as reviewed by engineer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isReviewed ? 'Reviewed' : 'Mark Reviewed'}</span>
          </button>

          <button
            type="button"
            onClick={() => onDismissFinding(finding)}
            className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
              finding.validationStatus === 'DISMISSED'
                ? 'bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
            }`}
            title="Dismiss finding as false positive or accepted risk"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>{finding.validationStatus === 'DISMISSED' ? 'Restore' : 'Dismiss'}</span>
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
                type="button"
                onClick={onOpenTestLab}
                className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
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
                type="button"
                onClick={() => onExecuteTest(relevantTests[0])}
                disabled={isExecutingTest}
                className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
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
                  <span className={`font-semibold ${
                    testResult.status === 'PASSED'
                      ? 'text-emerald-400'
                      : testResult.status === 'SANDBOX_RESTRICTED'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}>
                    {testResult.status === 'SANDBOX_RESTRICTED' ? 'SANDBOX_RESTRICTED (Safe Mode)' : testResult.status} ({testResult.executionTimeMs}ms)
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
