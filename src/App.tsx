import React, { useState, useEffect } from 'react';
import { Review, EvaluationRunSummary } from './types/review';
import { fetchReviews, fetchReview, fetchEvaluationRuns } from './lib/api';
import { Navigation, AppPage } from './components/Navigation';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { NewReviewPage } from './features/reviews/NewReviewPage';
import { ReviewWorkspacePage } from './features/reviews/ReviewWorkspacePage';
import { FindingsExplorerPage } from './features/findings/FindingsExplorerPage';
import { TestLabPage } from './features/test-generation/TestLabPage';
import { EvaluationSuitePage } from './features/evaluation/EvaluationSuitePage';
import { ReviewHistoryPage } from './features/history/ReviewHistoryPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [latestEvaluationRun, setLatestEvaluationRun] = useState<EvaluationRunSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load reviews and latest evaluation on boot
  useEffect(() => {
    async function init() {
      try {
        const loadedReviews = await fetchReviews();
        setReviews(loadedReviews);
        if (loadedReviews.length > 0) {
          setActiveReviewId(loadedReviews[0].id);
        }

        const evalRuns = await fetchEvaluationRuns();
        if (evalRuns && evalRuns.length > 0) {
          setLatestEvaluationRun(evalRuns[0]);
        }
      } catch (err) {
        console.error('Failed to initialize applet data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const activeReview = reviews.find((r) => r.id === activeReviewId) || reviews[0] || null;

  const handleReviewCreated = (newReview: Review) => {
    setReviews((prev) => [newReview, ...prev.filter((r) => r.id !== newReview.id)]);
    setActiveReviewId(newReview.id);
    setCurrentPage('workspace');
  };

  const handleRefreshReview = (updatedReview: Review) => {
    setReviews((prev) =>
      prev.map((r) => (r.id === updatedReview.id ? updatedReview : r))
    );
  };

  const handleOpenReview = (reviewId: string) => {
    setActiveReviewId(reviewId);
    setCurrentPage('workspace');
  };

  const handleOpenWorkspaceFinding = (reviewId: string, _findingId: string) => {
    setActiveReviewId(reviewId);
    setCurrentPage('workspace');
  };

  const handleReviewDeleted = (deletedId: string) => {
    setReviews((prev) => prev.filter((r) => r.id !== deletedId));
    if (activeReviewId === deletedId) {
      const remaining = reviews.filter((r) => r.id !== deletedId);
      setActiveReviewId(remaining[0]?.id || null);
    }
  };

  const totalFindingsCount = reviews.reduce((acc, r) => acc + (r.findings?.length || 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-slate-300 font-mono text-xs gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        <span>Initializing ReviewPilot Engine...</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 antialiased font-sans">
      {/* Sidebar Navigation */}
      <Navigation
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        activeReviewTitle={activeReview?.title}
        totalFindingsCount={totalFindingsCount}
      />

      {/* Main View Area */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {currentPage === 'dashboard' && (
          <DashboardPage
            reviews={reviews}
            onNavigateToNew={() => setCurrentPage('new-review')}
            onOpenReview={handleOpenReview}
            onNavigateToEvaluations={() => setCurrentPage('evaluation')}
          />
        )}

        {currentPage === 'new-review' && (
          <NewReviewPage onReviewCreated={handleReviewCreated} />
        )}

        {currentPage === 'workspace' && (
          activeReview ? (
            <ReviewWorkspacePage
              review={activeReview}
              onRefreshReview={handleRefreshReview}
              onOpenTestLab={() => setCurrentPage('test-lab')}
            />
          ) : (
            <div className="p-12 text-center text-slate-500">
              <p>No active review loaded. Start a new review from the sidebar.</p>
            </div>
          )
        )}

        {currentPage === 'findings' && (
          <FindingsExplorerPage
            reviews={reviews}
            onOpenWorkspaceFinding={handleOpenWorkspaceFinding}
            onRefreshReview={handleRefreshReview}
          />
        )}

        {currentPage === 'test-lab' && (
          <TestLabPage
            reviews={reviews}
            onRefreshReview={handleRefreshReview}
          />
        )}

        {currentPage === 'evaluation' && (
          <EvaluationSuitePage
            latestRun={latestEvaluationRun}
            onRunCompleted={(run) => setLatestEvaluationRun(run)}
          />
        )}

        {currentPage === 'history' && (
          <ReviewHistoryPage
            reviews={reviews}
            onOpenReview={handleOpenReview}
            onReviewDeleted={handleReviewDeleted}
          />
        )}

        {currentPage === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
