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
  MessageSquare,
  Sparkles,
  ChevronRight,
  ShieldAlert,
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
  const severityRank: Record<string, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    INFORMATIONAL: 1,
  };

  filtered.sort((a, b) => {
    if (sortBy === 'severity') {
      const diff = (severityRank[b.finding.severity] || 0) - (severityRank[a.finding.severity] || 0);
      if (diff !== 0) return diff;
      return b.finding.confidence - a.finding.confidence;
    }
    if (sortBy === 'confidence') {
      return b.finding.confidence - a.finding.confidence;
    }
    return new Date(b.finding.createdAt).getTime() - new Date(a.finding.createdAt).getTime();
  });

  const handleConfirmDismiss = async () => {
    if (!dismissingFinding) return;
    try {
      const updated = await updateFindingFeedback(
        dismissingFinding.finding.id,
        dismissingFinding.reviewId,
        {
          dismissed: true,
          reason: dismissReason,
          comment: dismissComment,
        }
      );

      const targetReview = reviews.find((r) => r.id === dismissingFinding.reviewId);
      if (targetReview) {
        const updatedReview: Review = {
          ...targetReview,
          findings: targetReview.findings.map((f) => (f.id === updated.id ? updated : f)),
        };
        onRefreshReview(updatedReview);
      }
      setDismissingFinding(null);
      setDismissComment('');
    } catch (err: any) {
      alert(`Failed to dismiss finding: ${err.message}`);
    }
  };

  const handleRestoreFinding = async (findingId: string, reviewId: string) => {
    try {
      const updated = await updateFindingFeedback(findingId, reviewId, {
        dismissed: false,
      });
      const targetReview = reviews.find((r) => r.id === reviewId);
      if (targetReview) {
        const updatedReview: Review = {
          ...targetReview,
          findings: targetReview.findings.map((f) => (f.id === updated.id ? updated : f)),
        };
        onRefreshReview(updatedReview);
      }
    } catch (err: any) {
      alert(`Failed to restore finding: ${err.message}`);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Findings Explorer</h1>
        <p className="text-sm text-slate-600 mt-1">
          Search, filter, track developer verification, and record false-positive dismissals across all code reviews.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title, description, file path, or review..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            <span className="text-xs font-mono text-slate-500 uppercase">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono focus:outline-none"
            >
              <option value="severity">Severity Rank</option>
              <option value="confidence">Confidence Score</option>
              <option value="date">Date Detected</option>
            </select>
          </div>
        </div>

        {/* Secondary Filter Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs font-mono">
          <div>
            <label className="block text-[11px] text-slate-500 uppercase mb-1">Severity</label>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
              <option value="INFORMATIONAL">Informational</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase mb-1">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              <option value="BUG">Bug</option>
              <option value="SECURITY">Security</option>
              <option value="CODE_QUALITY">Code Quality</option>
              <option value="PERFORMANCE">Performance</option>
              <option value="TEST_COVERAGE">Test Coverage</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase mb-1">Validation Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="STATICALLY_CONFIRMED">Statically Confirmed</option>
              <option value="TEST_CONFIRMED">Test Confirmed</option>
              <option value="MANUALLY_VERIFIED">Manually Verified</option>
              <option value="UNVERIFIED">Unverified (Hypothesis)</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase mb-1">
              Min Confidence: {Math.round(minConfidence * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="w-full accent-indigo-600 mt-2"
            />
          </div>
        </div>
      </div>

      {/* Findings Results Table / List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between text-xs font-mono text-slate-500">
          <span>SHOWING {filtered.length} FINDINGS</span>
          <span>FILTERED OUT OF {allFindingsWithReview.length} TOTAL</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <HelpCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-800">No matching findings found</p>
            <p className="text-xs text-slate-500 mt-1">Try broadening your search or adjusting the filter criteria.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(({ finding, review }) => (
              <div
                key={finding.id}
                className="p-5 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={finding.severity} size="sm" />
                    <DetectionSourceBadge source={finding.detectionSource} />
                    <ValidationStatusBadge status={finding.validationStatus} />
                    <span className="text-xs font-mono text-slate-500">
                      Confidence: {Math.round(finding.confidence * 100)}%
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 hover:text-indigo-600 transition-colors">
                      {finding.title}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">
                      {finding.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-500">
                    <span className="text-slate-700 font-semibold">{finding.filePath}:{finding.startLine}</span>
                    <span>•</span>
                    <span>Review: {review.title}</span>
                    <span>•</span>
                    <span>Category: {finding.category}</span>
                  </div>

                  {finding.developerFeedback?.dismissed && (
                    <div className="p-2 rounded bg-slate-100 border border-slate-200 text-xs font-mono text-slate-600 flex items-center gap-2">
                      <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        Dismissed ({finding.developerFeedback.reason || 'No reason specified'}): {finding.developerFeedback.comment || 'No comment provided'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  {finding.validationStatus === 'DISMISSED' ? (
                    <button
                      onClick={() => handleRestoreFinding(finding.id, review.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                    >
                      Restore Finding
                    </button>
                  ) : (
                    <button
                      onClick={() => setDismissingFinding({ finding, reviewId: review.id })}
                      className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                    >
                      Dismiss...
                    </button>
                  )}

                  <button
                    onClick={() => onOpenWorkspaceFinding(review.id, finding.id)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors flex items-center gap-1 shadow-xs"
                  >
                    <span>Inspect</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dismissal Reason Modal */}
      {dismissingFinding && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Dismiss Finding
            </h3>
            <p className="text-xs text-slate-600">
              Record engineer feedback regarding why this finding is dismissed. Dismissals are tracked and do not delete the finding from audit logs.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1 font-mono uppercase text-[11px]">
                  Dismissal Reason
                </label>
                <select
                  value={dismissReason}
                  onChange={(e) => setDismissReason(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono focus:outline-none"
                >
                  <option value="FALSE_POSITIVE">False Positive (Analyzer mistake)</option>
                  <option value="ACCEPTED_RISK">Accepted Risk (Business trade-off)</option>
                  <option value="INTENDED_BEHAVIOR">Intended Behavior (Expected design)</option>
                  <option value="OUT_OF_SCOPE">Out of Scope (Addressed in separate PR)</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 font-mono uppercase text-[11px]">
                  Engineer Comment (Optional)
                </label>
                <textarea
                  rows={3}
                  value={dismissComment}
                  onChange={(e) => setDismissComment(e.target.value)}
                  placeholder="e.g. Input is already validated upstream in gateway middleware..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDismissingFinding(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDismiss}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
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
