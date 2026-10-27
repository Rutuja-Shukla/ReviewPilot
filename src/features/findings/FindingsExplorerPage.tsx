import React, { useState } from 'react';
import { Review, ReviewFinding, ReviewSeverity, ReviewCategory } from '../../types/review';
import { SeverityBadge } from '../../components/SeverityBadge';
import { DetectionSourceBadge, ValidationStatusBadge } from '../../components/StatusBadge';
import { updateFindingFeedback } from '../../lib/api';
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

interface FindingsExplorerPageProps {
  reviews: Review[];
  onOpenWorkspaceFinding: (reviewId: string, findingId: string) => void;
  onRefreshReview: (updatedReview: Review) => void;
}

export const FindingsExplorerPage: React.FC<FindingsExplorerPageProps> = ({
  reviews,
  onOpenWorkspaceFinding,
  onRefreshReview,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'severity' | 'confidence' | 'date'>('severity');

  // Dismissal modal state
  const [dismissingFinding, setDismissingFinding] = useState<{ finding: ReviewFinding; reviewId: string } | null>(null);
  const [dismissReason, setDismissReason] = useState<'FALSE_POSITIVE' | 'INTENDED_BEHAVIOR' | 'ACCEPTED_RISK' | 'OUT_OF_SCOPE' | 'OTHER'>('FALSE_POSITIVE');
  const [dismissComment, setDismissComment] = useState('');

  // Collect all findings across all reviews
  const allFindingsWithReview: { finding: ReviewFinding; review: Review }[] = [];
  for (const review of reviews) {
    for (const f of review.findings) {
      allFindingsWithReview.push({ finding: f, review });
    }
  }

  // Filter findings
  const filtered = allFindingsWithReview.filter(({ finding, review }) => {
    if (selectedSeverity !== 'ALL' && finding.severity !== selectedSeverity) return false;
    if (selectedCategory !== 'ALL' && finding.category !== selectedCategory) return false;
    if (finding.confidence < minConfidence) return false;
    if (statusFilter !== 'ALL' && finding.validationStatus !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchTitle = finding.title.toLowerCase().includes(q);
      const matchDesc = finding.description.toLowerCase().includes(q);
      const matchFile = finding.filePath.toLowerCase().includes(q);
      const matchReview = review.title.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchFile && !matchReview) return false;
    }
    return true;
  });

  // Sort findings
  const severityOrder: Record<ReviewSeverity, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    INFORMATIONAL: 1,
  };

  filtered.sort((a, b) => {
    if (sortBy === 'severity') {
      return severityOrder[b.finding.severity] - severityOrder[a.finding.severity];
    }
    if (sortBy === 'confidence') {
      return b.finding.confidence - a.finding.confidence;
    }
    return new Date(b.review.createdAt).getTime() - new Date(a.review.createdAt).getTime();
  });

  const handleToggleVerify = async (finding: ReviewFinding, reviewId: string) => {
    const isCurrentlyVerified = finding.validationStatus === 'MANUALLY_VERIFIED';
    try {
      const updated = await updateFindingFeedback(finding.id, reviewId, {
        verifiedByUser: !isCurrentlyVerified,
      });
      const targetReview = reviews.find((r) => r.id === reviewId);
      if (targetReview) {
        onRefreshReview({
          ...targetReview,
          findings: targetReview.findings.map((f) => (f.id === finding.id ? updated : f)),
        });
      }
    } catch (err: any) {
      alert(`Feedback error: ${err.message}`);
    }
  };

  const handleConfirmDismiss = async () => {
    if (!dismissingFinding) return;
    try {
      const updated = await updateFindingFeedback(
        dismissingFinding.finding.id,
        dismissingFinding.reviewId,
        {
          dismissed: true,
          reason: dismissReason,
          comment: dismissComment.trim() || undefined,
        }
      );
      const targetReview = reviews.find((r) => r.id === dismissingFinding.reviewId);
      if (targetReview) {
        onRefreshReview({
          ...targetReview,
          findings: targetReview.findings.map((f) =>
            f.id === dismissingFinding.finding.id ? updated : f
          ),
        });
      }
      setDismissingFinding(null);
      setDismissComment('');
    } catch (err: any) {
      alert(`Dismissal failed: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-4">
      {/* Page Header */}
      <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
            Findings Explorer
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-repository triage for AST static defects, Gemini detections, and verified patches.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500 tabular-nums">
          Showing {filtered.length} of {allFindingsWithReview.length} findings
        </div>
      </div>

      {/* Filter & Control Bar */}
      <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {/* Search Input */}
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search findings by title, file, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Severity Filter */}
          <div>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded font-mono focus:bg-white focus:outline-none"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="HIGH">High Only</option>
              <option value="MEDIUM">Medium Only</option>
              <option value="LOW">Low Only</option>
              <option value="INFORMATIONAL">Info Only</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded font-mono focus:bg-white focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              <option value="SECURITY">Security</option>
              <option value="BUG">Bug & Reliability</option>
              <option value="PERFORMANCE">Performance</option>
              <option value="STYLE">Style & Quality</option>
              <option value="CONCURRENCY">Concurrency</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded font-mono focus:bg-white focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="UNVERIFIED">Unverified Only</option>
              <option value="STATICALLY_CONFIRMED">Statically Confirmed</option>
              <option value="TEST_CONFIRMED">Test Confirmed</option>
              <option value="MANUALLY_VERIFIED">Manually Verified</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
          </div>
        </div>

        {/* Secondary Bar: Confidence & Sort */}
        <div className="flex flex-wrap items-center justify-between text-xs pt-1 border-t border-slate-100 gap-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-500 uppercase">Min Confidence:</span>
            {[0, 0.7, 0.85, 0.95].map((conf) => (
              <button
                key={conf}
                type="button"
                onClick={() => setMinConfidence(conf)}
                className={`px-2 py-0.5 text-xs font-mono rounded cursor-pointer transition-colors ${
                  minConfidence === conf
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {conf === 0 ? 'Any' : `≥ ${Math.round(conf * 100)}%`}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-500 uppercase">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs bg-slate-50 border border-slate-300 rounded px-2 py-0.5 font-mono focus:outline-none"
            >
              <option value="severity">Severity (High to Low)</option>
              <option value="confidence">Confidence Score</option>
              <option value="date">Review Date</option>
            </select>
          </div>
        </div>
      </div>

      {/* High-Density Findings Table */}
      <div className="bg-white border border-slate-200 rounded shadow-2xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-xs">No findings match the selected criteria.</div>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedSeverity('ALL');
                setSelectedCategory('ALL');
                setStatusFilter('ALL');
                setMinConfidence(0);
              }}
              className="text-xs text-indigo-600 hover:underline cursor-pointer"
            >
              Reset all filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-[11px] font-mono text-slate-500 uppercase tracking-wider select-none">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold w-24">Severity</th>
                  <th className="px-3 py-2.5 font-semibold">Defect & Category</th>
                  <th className="px-3 py-2.5 font-semibold">File & Location</th>
                  <th className="px-3 py-2.5 font-semibold">Detection Source</th>
                  <th className="px-3 py-2.5 font-semibold">Validation Status</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Confidence</th>
                  <th className="px-3.5 py-2.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filtered.map(({ finding, review }) => {
                  const isVerified = finding.validationStatus === 'MANUALLY_VERIFIED';
                  const isDismissed = finding.validationStatus === 'DISMISSED';

                  return (
                    <tr
                      key={finding.id}
                      onClick={() => onOpenWorkspaceFinding(review.id, finding.id)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                    >
                      <td className="px-3.5 py-2.5">
                        <SeverityBadge severity={finding.severity} size="sm" />
                      </td>
                      <td className="px-3 py-2.5 min-w-[240px]">
                        <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {finding.title}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          {finding.category} · In review: <span className="text-slate-700">{review.title}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                        <div>{finding.filePath}</div>
                        <div className="text-slate-400 text-[10px] tabular-nums">
                          Lines {finding.startLine}–{finding.endLine || finding.startLine}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <DetectionSourceBadge source={finding.detectionSource} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <ValidationStatusBadge status={finding.validationStatus} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700">
                        {Math.round(finding.confidence * 100)}%
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleToggleVerify(finding, review.id)}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border cursor-pointer ${
                              isVerified
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                            title="Mark verified"
                          >
                            {isVerified ? 'Verified' : 'Verify'}
                          </button>
                          {!isDismissed ? (
                            <button
                              type="button"
                              onClick={() => setDismissingFinding({ finding, reviewId: review.id })}
                              className="px-2 py-0.5 rounded text-[10px] font-medium border bg-white text-slate-500 border-slate-200 hover:bg-slate-50 cursor-pointer"
                              title="Dismiss finding"
                            >
                              Dismiss
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleConfirmDismiss()}
                              className="px-2 py-0.5 rounded text-[10px] font-medium border bg-slate-100 text-slate-600 border-slate-200 cursor-pointer"
                            >
                              Restore
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenWorkspaceFinding(review.id, finding.id)}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 cursor-pointer"
                            title="Open in Workspace"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dismissal Reason Modal */}
      {dismissingFinding && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-slate-300 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Dismiss Finding
              </h3>
              <button
                type="button"
                onClick={() => setDismissingFinding(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-mono cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-900">
                {dismissingFinding.finding.title}
              </p>
              <p className="text-[11px] font-mono text-slate-400">
                {dismissingFinding.finding.filePath}:{dismissingFinding.finding.startLine}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-mono font-medium text-slate-700 uppercase">
                Triage Reason:
              </label>
              <select
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value as any)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded p-2 font-mono focus:bg-white focus:outline-none"
              >
                <option value="FALSE_POSITIVE">False Positive (Analyzer Inaccuracy)</option>
                <option value="INTENDED_BEHAVIOR">Intended Engineering Behavior</option>
                <option value="ACCEPTED_RISK">Accepted Risk / Compensating Controls</option>
                <option value="OUT_OF_SCOPE">Out of Scope for this Subsystem</option>
                <option value="OTHER">Other Reason</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-mono font-medium text-slate-700 uppercase">
                Audit Justification (Optional):
              </label>
              <textarea
                value={dismissComment}
                onChange={(e) => setDismissComment(e.target.value)}
                placeholder="Reasoning recorded in audit trail..."
                rows={3}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded p-2 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDismissingFinding(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDismiss}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer"
              >
                Confirm Dismissal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
