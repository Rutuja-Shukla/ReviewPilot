import React from 'react';
import { Review } from '../../types/review';
import { SeverityBadge } from '../../components/SeverityBadge';
import {
  FileCode2,
  AlertOctagon,
  FlaskConical,
  CheckCircle2,
  ArrowRight,
  PlusCircle,
  Clock,
  Target,
  ExternalLink,
} from 'lucide-react';

interface DashboardPageProps {
  reviews: Review[];
  onNavigateToNew: () => void;
  onOpenReview: (reviewId: string) => void;
  onNavigateToEvaluations: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  reviews,
  onNavigateToNew,
  onOpenReview,
  onNavigateToEvaluations,
}) => {
  // Compute aggregate statistics from actual stored reviews
  const totalReviews = reviews.length;
  const completedReviews = reviews.filter((r) => r.status === 'COMPLETED').length;
  
  let totalFindings = 0;
  let criticalCount = 0;
  let highCount = 0;
  let testsGenerated = 0;
  let testsExecuted = 0;
  let testsPassed = 0;
  let staticallyConfirmed = 0;

  for (const r of reviews) {
    totalFindings += r.stats.totalFindings;
    criticalCount += r.stats.criticalCount;
    highCount += r.stats.highCount;
    testsGenerated += r.stats.testsGeneratedCount;
    staticallyConfirmed += r.stats.staticallyConfirmedCount;

    if (r.testExecutions) {
      testsExecuted += r.testExecutions.length;
      testsPassed += r.testExecutions.filter((te) => te.status === 'PASSED').length;
    }
  }

  const testPassRate = testsExecuted > 0 ? Math.round((testsPassed / testsExecuted) * 100) : 0;

  return (
    <div className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
            Code Review Command Center
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Deterministic AST analysis, verified Gemini findings, and sandbox test generation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNavigateToEvaluations}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
          >
            <Target className="w-3.5 h-3.5 text-indigo-600" />
            <span>Benchmark Suite</span>
          </button>
          <button
            type="button"
            onClick={onNavigateToNew}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New Review</span>
          </button>
        </div>
      </div>

      {/* Aggregate Metric Cards - High Density, Tabular Numbers, Zero Pill Clutter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Reviews Card */}
        <div className="bg-white p-3.5 rounded border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-mono font-medium text-slate-500 uppercase tracking-wider">
            Reviews
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {completedReviews}
            </span>
            <span className="text-xs text-slate-500 font-mono">/ {totalReviews}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Completed analysis</span>
          </div>
        </div>

        {/* High / Critical Severity Card */}
        <div className="bg-white p-3.5 rounded border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-mono font-medium text-rose-700 uppercase tracking-wider">
            High & Critical Defects
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600 font-mono tabular-nums">
              {criticalCount + highCount}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({criticalCount} crit · {highCount} high)
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono">
            {staticallyConfirmed} confirmed by AST
          </div>
        </div>

        {/* Tests Generated */}
        <div className="bg-white p-3.5 rounded border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-mono font-medium text-slate-500 uppercase tracking-wider">
            Reproducing Unit Tests
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {testsGenerated}
            </span>
            <span className="text-xs text-slate-500 font-mono">generated</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono">
            Vitest & Pytest suites
          </div>
        </div>

        {/* Test Execution Pass Rate */}
        <div className="bg-white p-3.5 rounded border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-mono font-medium text-slate-500 uppercase tracking-wider">
            Sandbox Pass Rate
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {testsExecuted > 0 ? `${testPassRate}%` : 'N/A'}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              ({testsPassed}/{testsExecuted} passed)
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-mono">
            Deterministic verification
          </div>
        </div>
      </div>

      {/* High-Density Recent Reviews Table */}
      <div className="bg-white border border-slate-200 rounded shadow-2xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider font-mono">
              Recent Code Reviews
            </span>
            <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-1.5 py-0.2 rounded">
              {reviews.length} total
            </span>
          </div>
          <button
            type="button"
            onClick={onNavigateToNew}
            className="text-xs font-mono text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>+ Submit new code</span>
          </button>
        </div>

        {reviews.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <FileCode2 className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-xs">No reviews submitted yet.</div>
            <button
              type="button"
              onClick={onNavigateToNew}
              className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
            >
              Start your first review →
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-[11px] font-mono text-slate-500 uppercase tracking-wider select-none">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold">Review Title & ID</th>
                  <th className="px-3 py-2.5 font-semibold">Language</th>
                  <th className="px-3 py-2.5 font-semibold">Profile</th>
                  <th className="px-3 py-2.5 font-semibold">Findings Breakdown</th>
                  <th className="px-3 py-2.5 font-semibold">Tests</th>
                  <th className="px-3 py-2.5 font-semibold">Duration</th>
                  <th className="px-3.5 py-2.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {reviews.map((r) => {
                  const hasCritical = r.stats.criticalCount > 0;
                  const hasHigh = r.stats.highCount > 0;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => onOpenReview(r.id)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                    >
                      <td className="px-3.5 py-2.5">
                        <div className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {r.title}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          #{r.id.slice(0, 8)} · {new Date(r.createdAt).toLocaleDateString()} {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700 uppercase text-[11px]">
                        {r.language}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 font-mono text-[11px]">
                        {r.profile.replace('_', ' ')}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
                          <span className="font-semibold text-slate-900">
                            {r.stats.totalFindings}
                          </span>
                          <span className="text-slate-400">·</span>
                          {hasCritical && (
                            <span className="text-rose-600 font-semibold" title="Critical defects">
                              {r.stats.criticalCount} crit
                            </span>
                          )}
                          {hasHigh && (
                            <span className="text-orange-600 font-semibold" title="High defects">
                              {r.stats.highCount} high
                            </span>
                          )}
                          {!hasCritical && !hasHigh && (
                            <span className="text-slate-500">
                              {r.stats.mediumCount + r.stats.lowCount} quality
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-slate-600">
                        {r.stats.testsGeneratedCount > 0 ? (
                          <span className="text-indigo-600 font-medium">
                            {r.stats.testsGeneratedCount} generated
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-500 text-[11px] tabular-nums">
                        {r.analysisTimeMs ? `${r.analysisTimeMs}ms` : 'Completed'}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenReview(r.id);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                        >
                          <span>Open</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Profiles Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3.5 bg-white rounded border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-900 font-mono uppercase tracking-wider mb-1">
            Security Review Engine
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Deterministic AST scans for SQL injection, buffer overflows, prototype pollution, command injection, and insecure cryptography.
          </p>
        </div>

        <div className="p-3.5 bg-white rounded border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-900 font-mono uppercase tracking-wider mb-1">
            Bug & Reliability Scanner
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Detects unhandled promises, null dereferences, accidental assignments in conditionals, and off-by-one boundary conditions.
          </p>
        </div>

        <div className="p-3.5 bg-white rounded border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-900 font-mono uppercase tracking-wider mb-1">
            Targeted Test Generation
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Generates precise reproducing unit tests in Vitest or Pytest, executed in a strict host-isolated environment.
          </p>
        </div>
      </div>
    </div>
  );
};
