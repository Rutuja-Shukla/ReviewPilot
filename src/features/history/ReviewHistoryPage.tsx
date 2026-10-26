import React, { useState } from 'react';
import { Review } from '../../types/review';
import { SeverityBadge } from '../../components/SeverityBadge';
import { deleteReview } from '../../lib/api';
import {
  History,
  Search,
  ArrowRight,
  Trash2,
  Calendar,
  Layers,
  Clock,
  FlaskConical,
} from 'lucide-react';

interface ReviewHistoryPageProps {
  reviews: Review[];
  onOpenReview: (reviewId: string) => void;
  onReviewDeleted: (reviewId: string) => void;
}

export const ReviewHistoryPage: React.FC<ReviewHistoryPageProps> = ({
  reviews,
  onOpenReview,
  onReviewDeleted,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [languageFilter, setLanguageFilter] = useState('ALL');
  const [profileFilter, setProfileFilter] = useState('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = reviews.filter((r) => {
    if (languageFilter !== 'ALL' && r.language !== languageFilter) return false;
    if (profileFilter !== 'ALL' && r.profile !== profileFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchId = r.id.toLowerCase().includes(q);
      if (!matchTitle && !matchId) return false;
    }
    return true;
  });

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Permanently purge this review in accordance with source retention policy?')) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteReview(id);
      onReviewDeleted(id);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Review Audit History</h1>
        <p className="text-sm text-slate-600 mt-1">
          Complete historical ledger of previous code reviews, static rule matches, test generation runs, and verification audits.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by review title or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto text-xs font-mono">
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"
          >
            <option value="ALL">All Languages</option>
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="csharp">C#</option>
          </select>

          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"
          >
            <option value="ALL">All Profiles</option>
            <option value="COMPREHENSIVE">Comprehensive</option>
            <option value="SECURITY_REVIEW">Security Review</option>
            <option value="BUG_DETECTION">Bug Detection</option>
            <option value="CODE_QUALITY">Code Quality</option>
            <option value="PERFORMANCE">Performance</option>
            <option value="TEST_COVERAGE">Test Coverage</option>
          </select>
        </div>
      </div>

      {/* Reviews Table / List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-mono text-slate-500">
          <span>{filtered.length} AUDIT RECORDS</span>
          <span>STORAGE: SESSION / IN-MEMORY REPOSITORY</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-800">No review records matched</p>
            <p className="text-xs text-slate-500 mt-1">Try resetting the filters or start a new review.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((review) => (
              <div
                key={review.id}
                onClick={() => onOpenReview(review.id)}
                className="p-5 hover:bg-slate-50/80 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      {review.id}
                    </span>
                    <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {review.language}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {review.profile.replace('_', ' ')}
                    </span>
                    <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(review.createdAt).toLocaleDateString()} {new Date(review.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {review.title}
                  </h3>

                  {review.description && (
                    <p className="text-xs text-slate-500 line-clamp-1">{review.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-500 pt-1">
                    <span>{review.stats.totalFindings} findings</span>
                    <span>•</span>
                    <span className="text-rose-600">{review.stats.criticalCount} critical, {review.stats.highCount} high</span>
                    <span>•</span>
                    <span className="text-emerald-700">{review.stats.staticallyConfirmedCount} confirmed</span>
                    <span>•</span>
                    <span>{(review.generatedTests || []).length} tests</span>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                  <button
                    onClick={(e) => handleDelete(review.id, e)}
                    disabled={deletingId === review.id}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Purge review from repository"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                    <span>Reopen Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
