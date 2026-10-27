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
    if (!confirm('Permanently purge this review from local audit storage?')) {
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
    <div className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-4">
      {/* Page Header */}
      <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
            Review History & Audits
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit logs of past code reviews, verified findings, generated test suites, and inspection runs.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500 tabular-nums">
          {filtered.length} of {reviews.length} reviews
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 w-full relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search reviews by title or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono focus:bg-white focus:outline-none"
          >
            <option value="ALL">All Languages</option>
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="go">Go</option>
            <option value="rust">Rust</option>
            <option value="c">C / C++</option>
          </select>

          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono focus:bg-white focus:outline-none"
          >
            <option value="ALL">All Profiles</option>
            <option value="SECURITY_REVIEW">Security Audit</option>
            <option value="BUG_HUNTER">Bug Hunter</option>
            <option value="FULL_ENGINE">Full Engine</option>
            <option value="PERFORMANCE">Performance</option>
          </select>
        </div>
      </div>

      {/* High-Density Review Table */}
      <div className="bg-white border border-slate-200 rounded shadow-2xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <History className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-xs">No reviews match the search query.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-[11px] font-mono text-slate-500 uppercase tracking-wider select-none">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold">Review Title & ID</th>
                  <th className="px-3 py-2.5 font-semibold">Language</th>
                  <th className="px-3 py-2.5 font-semibold">Profile</th>
                  <th className="px-3 py-2.5 font-semibold">Findings</th>
                  <th className="px-3 py-2.5 font-semibold">Tests</th>
                  <th className="px-3 py-2.5 font-semibold">Analyzed At</th>
                  <th className="px-3.5 py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filtered.map((r) => {
                  const hasCritical = r.stats.criticalCount > 0;
                  const hasHigh = r.stats.highCount > 0;
                  const isDeleting = deletingId === r.id;

                  return (
                    <tr
                      key={r.id}
                      onClick={() => onOpenReview(r.id)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                    >
                      <td className="px-3.5 py-2.5">
                        <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {r.title}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          #{r.id}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700 uppercase text-[11px]">
                        {r.language}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600 text-[11px]">
                        {r.profile.replace('_', ' ')}
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{r.stats.totalFindings}</span>
                          {hasCritical && (
                            <span className="text-rose-600 font-semibold">
                              ({r.stats.criticalCount} crit)
                            </span>
                          )}
                          {hasHigh && !hasCritical && (
                            <span className="text-orange-600 font-semibold">
                              ({r.stats.highCount} high)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-slate-600">
                        {r.stats.testsGeneratedCount > 0 ? (
                          <span className="text-purple-700 font-medium">
                            {r.stats.testsGeneratedCount} tests
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleDateString()} {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onOpenReview(r.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                          >
                            <span>Inspect</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(r.id, e)}
                            disabled={isDeleting}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                            title="Delete review"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
    </div>
  );
};
