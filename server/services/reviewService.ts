import { parseGitDiff } from '../analyzers/diffParser.js';
import { runStaticAnalysis } from '../analyzers/staticAnalyzer.js';
import { analyzeCodeWithGemini } from '../ai/geminiReviewService.js';
import { reviewRepository } from '../repositories/reviewRepository.js';
import {
  Review,
  ReviewFinding,
  ReviewProfile,
  SourceFile,
  SupportedLanguage,
} from '../../src/types/review.js';

export interface CreateReviewParams {
  title?: string;
  description?: string;
  language: SupportedLanguage;
  profile: ReviewProfile;
  inputType: 'snippet' | 'diff' | 'file';
  code: string;
  fileName?: string;
}

export async function createAndExecuteReview(params: CreateReviewParams): Promise<Review> {
  const startTime = Date.now();
  const reviewId = `rev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const title = params.title?.trim() || `${params.language.toUpperCase()} ${params.inputType.toUpperCase()} Review`;
  const fileName = params.fileName || (params.language === 'python' ? 'app.py' : params.language === 'java' ? 'App.java' : params.language === 'csharp' ? 'Program.cs' : 'src/index.ts');

  // Input validation
  const settings = reviewRepository.getSettings();
  if (params.code.length > settings.maxInputSizeBytes) {
    throw new Error(`Input size (${params.code.length} bytes) exceeds limit of ${settings.maxInputSizeBytes} bytes`);
  }

  let sourceFiles: SourceFile[] = [];
  let changedLinesMap: Record<string, number[]> = {};

  if (params.inputType === 'diff') {
    const parsedDiff = parseGitDiff(params.code);
    if (parsedDiff.length > 0) {
      sourceFiles = parsedDiff.map((file, idx) => {
        changedLinesMap[file.newPath] = file.changedLines;
        return {
          id: `file-${idx + 1}`,
          reviewId,
          path: file.newPath,
          content: file.fullNewContent || params.code,
          language: params.language,
          isDiff: true,
          changesCount: {
            additions: file.additions,
            deletions: file.deletions,
          },
        };
      });
    } else {
      // Single file diff fallback
      sourceFiles = [
        {
          id: 'file-1',
          reviewId,
          path: fileName,
          content: params.code,
          language: params.language,
          isDiff: true,
          changesCount: { additions: 1, deletions: 0 },
        },
      ];
    }
  } else {
    // Snippet or uploaded file
    sourceFiles = [
      {
        id: 'file-1',
        reviewId,
        path: fileName,
        content: params.code,
        language: params.language,
        isDiff: false,
        changesCount: { additions: params.code.split('\n').length, deletions: 0 },
      },
    ];
  }

  // Initial Review record
  const review: Review = {
    id: reviewId,
    title,
    description: params.description,
    language: params.language,
    profile: params.profile,
    inputType: params.inputType,
    status: 'ANALYZING_STATIC',
    files: sourceFiles,
    findings: [],
    generatedTests: [],
    testExecutions: [],
    stats: {
      totalFindings: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      infoCount: 0,
      staticallyConfirmedCount: 0,
      testConfirmedCount: 0,
      dismissedCount: 0,
      testsGeneratedCount: 0,
    },
    createdAt: new Date().toISOString(),
  };

  reviewRepository.saveReview(review);

  // Stage 3: Deterministic Static Analysis
  const staticFindings: ReviewFinding[] = [];
  for (const file of sourceFiles) {
    const changedLines = changedLinesMap[file.path];
    const fileFindings = runStaticAnalysis(file.content, file.path, file.language, reviewId, changedLines);
    staticFindings.push(...fileFindings);
  }

  review.status = 'ANALYZING_AI';
  reviewRepository.saveReview(review);

  // Stage 4: AI Contextual Review with Gemini
  const aiFindings: ReviewFinding[] = [];
  let aiModelUsed = 'gemini-3.8-flash';

  for (const file of sourceFiles) {
    try {
      const geminiResult = await analyzeCodeWithGemini({
        reviewId,
        language: file.language,
        profile: params.profile,
        fileName: file.path,
        sourceCode: file.content,
        diffText: params.inputType === 'diff' ? params.code : undefined,
        changedLines: changedLinesMap[file.path],
      });
      aiFindings.push(...geminiResult.findings);
    } catch (aiErr) {
      console.warn(`Gemini analysis skipped for ${file.path}:`, aiErr);
    }
  }

  // Stage 5: Normalization & Deduplication
  const mergedFindings: ReviewFinding[] = [];

  // Add static findings first
  for (const sf of staticFindings) {
    mergedFindings.push(sf);
  }

  // Merge AI findings, deduplicating if overlapping on same line & category
  for (const af of aiFindings) {
    const duplicate = mergedFindings.find(
      (existing) =>
        existing.filePath === af.filePath &&
        Math.abs(existing.startLine - af.startLine) <= 1 &&
        (existing.category === af.category || existing.title.toLowerCase().includes(af.category.toLowerCase()))
    );

    if (duplicate) {
      // Elevate confidence, merge evidence, mark as STATICALLY_CONFIRMED
      duplicate.confidence = Math.max(duplicate.confidence, af.confidence);
      duplicate.evidence = Array.from(new Set([...duplicate.evidence, ...af.evidence]));
      if (!duplicate.suggestedPatch && af.suggestedPatch) {
        duplicate.suggestedPatch = af.suggestedPatch;
      }
      duplicate.validationStatus = 'STATICALLY_CONFIRMED';
    } else {
      mergedFindings.push(af);
    }
  }

  // Sort by severity priority: CRITICAL > HIGH > MEDIUM > LOW > INFORMATIONAL
  const severityRank: Record<string, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    INFORMATIONAL: 1,
  };
  mergedFindings.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));

  review.findings = mergedFindings;
  review.status = 'COMPLETED';
  review.completedAt = new Date().toISOString();
  review.analysisTimeMs = Date.now() - startTime;
  review.aiModelUsed = aiModelUsed;

  reviewRepository.recalculateStats(review);
  reviewRepository.saveReview(review);

  return review;
}
