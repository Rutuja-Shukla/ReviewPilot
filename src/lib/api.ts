import {
  Review,
  ReviewFinding,
  GeneratedTest,
  TestExecution,
  AppSettings,
  EvaluationRunSummary,
  SupportedLanguage,
  ReviewProfile,
} from '../types/review';

export async function fetchReviews(): Promise<Review[]> {
  const res = await fetch('/api/reviews');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to fetch reviews');
  return data.reviews;
}

export async function fetchReview(reviewId: string): Promise<Review> {
  const res = await fetch(`/api/reviews/${reviewId}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to fetch review');
  return data.review;
}

export async function createReview(params: {
  title?: string;
  description?: string;
  language: SupportedLanguage;
  profile: ReviewProfile;
  inputType: 'snippet' | 'diff' | 'file';
  code: string;
  fileName?: string;
}): Promise<Review> {
  const res = await fetch('/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to create review');
  return data.review;
}

export async function deleteReview(reviewId: string): Promise<void> {
  const res = await fetch(`/api/reviews/${reviewId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to delete review');
}

export async function generateTest(findingId: string, reviewId: string): Promise<GeneratedTest> {
  const res = await fetch(`/api/findings/${findingId}/generate-tests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewId }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to generate test');
  return data.test;
}

export async function updateFindingFeedback(
  findingId: string,
  reviewId: string,
  feedback: {
    dismissed?: boolean;
    reason?: string;
    comment?: string;
    verifiedByUser?: boolean;
  }
): Promise<ReviewFinding> {
  const res = await fetch(`/api/findings/${findingId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewId, ...feedback }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to update feedback');
  return data.finding;
}

export async function executeTest(test: GeneratedTest): Promise<TestExecution> {
  const res = await fetch('/api/tests/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to execute test');
  return data.execution;
}

export async function runEvaluations(): Promise<EvaluationRunSummary> {
  const res = await fetch('/api/evaluations/run', { method: 'POST' });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to run evaluations');
  return data.summary;
}

export async function fetchEvaluationRuns(): Promise<EvaluationRunSummary[]> {
  const res = await fetch('/api/evaluations');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to fetch evaluation runs');
  return data.runs;
}

export async function fetchSettings(): Promise<{ settings: AppSettings; sandboxCapability: any }> {
  const res = await fetch('/api/settings');
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to fetch settings');
  return { settings: data.settings, sandboxCapability: data.sandboxCapability };
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to update settings');
  return data.settings;
}

export async function exportReview(reviewId: string, format: 'markdown' | 'json'): Promise<void> {
  const res = await fetch(`/api/reviews/${reviewId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format }),
  });
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reviewpilot-${reviewId}.${format === 'json' ? 'json' : 'md'}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
