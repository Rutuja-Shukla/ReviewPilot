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
  Sparkles,
  Target,
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
  // Compute aggregate statistics from actual stored reviews (no fabricated data!)
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
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Engineering Overview</h1>
          <p className="text-sm text-slate-600 mt-1">
            Real-time telemetry across deterministic static analysis, Gemini contextual findings, and automated test validations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateToEvaluations}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Target className="w-4 h-4 text-indigo-600" />
            Run Evaluation Suite
          </button>
          <button
            onClick={onNavigateToNew}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/30"
          >
            <PlusCircle className="w-4 h-4" />
            Start New Review
          </button>
        </div>
      </div>

      {/* Aggregate Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Reviews Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
              Reviews Completed
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileCode2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 font-mono">{completedReviews}</span>
            <span className="text-xs text-slate-500">of {totalReviews} submitted</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            100% Deterministic & AI Pipeline
          </div>
        </div>

        {/* High / Critical Severity Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider font-mono">
              High & Critical Issues
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-rose-600 font-mono">
              {criticalCount + highCount}
            </span>
            <span className="text-xs text-slate-500">
              ({criticalCount} critical, {highCount} high)
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono">
            {staticallyConfirmed} statically confirmed
          </div>
        </div>

        {/* Tests Generated */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
              Generated Unit Tests
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <FlaskConical className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 font-mono">{testsGenerated}</span>
            <span className="text-xs text-slate-500">defect reproductions</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono">
            Targeted Vitest / Pytest suites
          </div>
        </div>

        {/* Test Execution Pass Rate */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
              Sandbox Test Pass Rate
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-600 font-mono">
              {testsExecuted > 0 ? `${testPassRate}%` : 'N/A'}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {testsPassed}/{testsExecuted} runs
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono">
            Isolated AST & Syntax checks
          </div>
        </div>
      </div>

      {/* Two Column Layout: Recent Reviews & Quick Action Presets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Reviews (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Recent Review Activity</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit history of code analyses, static rule matches, and AI reviews.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">{reviews.length} total records</span>
          </div>

          {reviews.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
                <FileCode2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">No review records found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Submit a Git diff or code snippet to trigger your first automated analysis.
              </p>
              <button
                onClick={onNavigateToNew}
                className="mt-4 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Start Your First Review
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onOpenReview(r.id)}
                  className="p-4 hover:bg-slate-50/80 transition-colors cursor-pointer flex items-center justify-between group"
                >
                  <div className="space-y-1.5 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 text-sm truncate group-hover:text-indigo-600 transition-colors">
                        {r.title}
                      </span>
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                        {r.language}
                      </span>
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {r.profile.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(r.createdAt).toLocaleDateString()} at{' '}
                        {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span>{r.stats.totalFindings} findings</span>
                      {r.analysisTimeMs && <span>{r.analysisTimeMs}ms</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1">
                      {r.stats.criticalCount > 0 && (
                        <SeverityBadge severity="CRITICAL" size="sm" />
                      )}
                      {r.stats.highCount > 0 && (
                        <SeverityBadge severity="HIGH" size="sm" />
                      )}
                      {r.stats.criticalCount === 0 && r.stats.highCount === 0 && (
                        <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          CLEAN / LOW
                        </span>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Platform Architecture & Guidelines */}
        <div className="space-y-6">
          {/* Engineering Tenets Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-indigo-600">
              <Sparkles className="w-5 h-5" />
              <h3 className="font-semibold text-slate-900 text-sm">ReviewPilot Verification Model</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              ReviewPilot rejects speculative AI hallucination. Every issue is categorized by empirical confidence and verification status:
            </p>
            <div className="space-y-2.5 text-xs font-mono">
              <div className="p-2 rounded bg-slate-50 border border-slate-200">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-700" />
                  1. Static Rule Check
                </div>
                <div className="text-slate-500 text-[11px] mt-0.5">
                  Deterministic regex & AST pattern verification.
                </div>
              </div>

              <div className="p-2 rounded bg-indigo-50/50 border border-indigo-200/60">
                <div className="font-semibold text-indigo-950 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600" />
                  2. AI Contextual Reasoning
                </div>
                <div className="text-slate-600 text-[11px] mt-0.5">
                  Gemini analyzes business logic, edge conditions, & race hazards.
                </div>
              </div>

              <div className="p-2 rounded bg-emerald-50/50 border border-emerald-200/60">
                <div className="font-semibold text-emerald-950 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  3. Test Confirmation
                </div>
                <div className="text-slate-600 text-[11px] mt-0.5">
                  Targeted unit tests reproduce defect behavior in isolated sandbox.
                </div>
              </div>
            </div>
          </div>

          {/* Quick Benchmark Card */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-5 rounded-xl text-white shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase text-indigo-300 font-semibold">
                Evaluation Benchmark
              </span>
              <Target className="w-4 h-4 text-indigo-400" />
            </div>
            <h4 className="font-semibold text-sm">20 Regression Fixture Suite</h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Measure precision, recall, false-positive resistance, and line accuracy on standard defects.
            </p>
            <button
              onClick={onNavigateToEvaluations}
              className="w-full mt-2 py-2 px-3 text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              Run 20-Fixture Evaluation
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
