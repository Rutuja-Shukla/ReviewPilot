import { parseGitDiff } from '../analyzers/diffParser.js';
import { runStaticAnalysis } from '../analyzers/staticAnalyzer.js';
import { analyzeCodeWithGemini } from '../ai/geminiReviewService.js';
import { reviewRepository } from '../repositories/reviewRepository.js';
import { sanitizeFilePath } from '../security/pathValidator.js';
import { validateAndSanitizePatch } from '../analyzers/patchValidator.js';
import {
  Review,
  ReviewFinding,
  ReviewProfile,
  SourceFile,
  SupportedLanguage,
} from '../../src/types/review.js';
import { isSupportedLanguage } from '../../src/utils/languageDetector.js';
import { languageAdapterRegistry } from '../adapters/languages/index.js';

export interface CreateReviewParams {
  title?: string;
  description?: string;
  language: SupportedLanguage;
  profile: ReviewProfile;
  inputType: 'snippet' | 'diff' | 'file';
  code: string;
  fileName?: string;
}

const MAX_INPUT_LINES = 20000;

export async function createAndExecuteReview(params: CreateReviewParams): Promise<Review> {
  const startTime = Date.now();
  const reviewId = `rev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const title = params.title?.trim() || `${params.language.toUpperCase()} ${params.inputType.toUpperCase()} Review`;
  
  // Sanitize input file name against path traversal using adapter default filename
  const adapter = languageAdapterRegistry.getAdapterOrNull(params.language);
  const defaultFileName = adapter?.defaultFileName || 'src/index.ts';
  const cleanFileName = sanitizeFilePath(params.fileName, defaultFileName);

  // Input validation - Empty code and supported language checks
  if (!params.code || params.code.trim().length === 0) {
    throw new Error('Source code or diff is required');
  }

  if (!isSupportedLanguage(params.language)) {
    throw new Error(`Unsupported language: ${String(params.language)}`);
  }

  // Input validation - Size and line limits to guard against DoS
  const settings = reviewRepository.getSettings();
  if (params.code.length > settings.maxInputSizeBytes) {
    throw new Error(`Input size (${params.code.length} bytes) exceeds limit of ${settings.maxInputSizeBytes} bytes`);
  }

  const linesCount = params.code.split(/\r?\n/).length;
  if (linesCount > MAX_INPUT_LINES) {
    throw new Error(`Input exceeds maximum line limit of ${MAX_INPUT_LINES} lines (received ${linesCount})`);
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
          path: cleanFileName,
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
        path: cleanFileName,
        content: params.code,
        language: params.language,
        isDiff: false,
        changesCount: { additions: linesCount, deletions: 0 },
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

  return runAnalysisPipeline(review, changedLinesMap, startTime);
}

export async function reAnalyzeReview(reviewId: string, profileOverride?: ReviewProfile): Promise<Review> {
  const review = reviewRepository.getReviewById(reviewId);
  if (!review) {
    throw new Error('Review not found');
  }

  const startTime = Date.now();
  if (profileOverride) {
    review.profile = profileOverride;
  }

  review.status = 'ANALYZING_STATIC';
  reviewRepository.saveReview(review);

  const changedLinesMap: Record<string, number[]> = {};
  return runAnalysisPipeline(review, changedLinesMap, startTime);
}

async function runAnalysisPipeline(
  review: Review,
  changedLinesMap: Record<string, number[]>,
  startTime: number
): Promise<Review> {
  // Stage 3: Deterministic Static Analysis
  const staticFindings: ReviewFinding[] = [];
  for (const file of review.files) {
    const changedLines = changedLinesMap[file.path];
    const fileFindings = runStaticAnalysis(file.content, file.path, file.language, review.id, changedLines);
    
    // Validate patches on static findings
    for (const f of fileFindings) {
      if (f.suggestedPatch) {
        const patchCheck = validateAndSanitizePatch(f.suggestedPatch, f.filePath);
        f.suggestedPatch = patchCheck.isValid ? patchCheck.sanitizedPatch : null;
      }
    }
    staticFindings.push(...fileFindings);
  }

  review.status = 'ANALYZING_AI';
  reviewRepository.saveReview(review);

  // Stage 4: AI Contextual Review with Gemini
  const aiFindings: ReviewFinding[] = [];
  const aiModelUsed = 'gemini-3.8-flash';

  for (const file of review.files) {
    try {
      const geminiResult = await analyzeCodeWithGemini({
        reviewId: review.id,
        language: file.language,
        profile: review.profile,
        fileName: file.path,
        sourceCode: file.content,
        diffText: file.isDiff ? file.content : undefined,
        changedLines: changedLinesMap[file.path],
      });
      aiFindings.push(...geminiResult.findings);
    } catch (aiErr) {
      console.warn(`Gemini analysis skipped for ${file.path}:`, aiErr);
    }
  }

  // Stage 5: Normalization & Deduplication
  const mergedFindings = deduplicateFindings(staticFindings, aiFindings);

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

export function deduplicateFindings(
  staticFindings: ReviewFinding[],
  aiFindings: ReviewFinding[]
): ReviewFinding[] {
  const merged: ReviewFinding[] = [...staticFindings];

  const domainKeywords = [
    ['sql', 'inject', 'query'],
    ['secret', 'key', 'token', 'credential', 'password'],
    ['eval', 'exec', 'function', 'dynamic'],
    ['traversal', 'path', 'directory'],
    ['prompt', 'instruction', 'override'],
    ['cors', 'origin', 'credential'],
    ['assign', 'condition', 'equality'],
    ['null', 'undefined', 'dereference', 'optional'],
    ['promise', 'await', 'rejection', 'async'],
    ['leak', 'stream', 'handle', 'resource', 'close'],
    ['loop', 'bound', 'length', 'off-by-one'],
    ['catch', 'swallow', 'exception', 'empty'],
    ['n+1', 'database', 'iteration'],
    ['complexity', 'nested', 'find', 'filter'],
  ];

  for (const af of aiFindings) {
    const duplicate = merged.find((existing) => {
      if (existing.filePath !== af.filePath) return false;

      // Line proximity or interval overlap
      const linesOverlap =
        Math.max(existing.startLine, af.startLine) <= Math.min(existing.endLine, af.endLine) + 1 ||
        Math.abs(existing.startLine - af.startLine) <= 2;

      if (!linesOverlap) return false;

      // Direct category match
      if (existing.category === af.category) return true;

      // Category in title or vice versa
      const existingTitle = existing.title.toLowerCase();
      const afTitle = af.title.toLowerCase();
      if (existingTitle.includes(af.category.toLowerCase()) || afTitle.includes(existing.category.toLowerCase())) {
        return true;
      }

      // Semantic keyword intersection
      const existingText = `${existingTitle} ${existing.description.toLowerCase()}`;
      const afText = `${afTitle} ${af.description.toLowerCase()}`;

      for (const group of domainKeywords) {
        const matchesExisting = group.some((kw) => existingText.includes(kw));
        const matchesAi = group.some((kw) => afText.includes(kw));
        if (matchesExisting && matchesAi) {
          return true;
        }
      }

      return false;
    });

    if (duplicate) {
      // Dual confirmation elevates confidence
      duplicate.confidence = Math.min(0.99, Math.max(duplicate.confidence, af.confidence, 0.95));
      duplicate.evidence = Array.from(new Set([...duplicate.evidence, ...af.evidence]));
      if (!duplicate.suggestedPatch && af.suggestedPatch) {
        duplicate.suggestedPatch = af.suggestedPatch;
      }
      duplicate.validationStatus = 'STATICALLY_CONFIRMED';
      if (!duplicate.relatedFindingIds.includes(af.id)) {
        duplicate.relatedFindingIds.push(af.id);
      }
    } else {
      // AI finding retains pure AI source and UNVERIFIED status until tested/reviewed
      af.detectionSource = 'AI_ANALYSIS';
      af.validationStatus = 'UNVERIFIED';
      merged.push(af);
    }
  }

  return merged;
}
