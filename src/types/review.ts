export type ReviewSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

export type ReviewCategory = 
  | 'BUG' 
  | 'SECURITY' 
  | 'CODE_QUALITY' 
  | 'PERFORMANCE' 
  | 'TEST_COVERAGE';

export type DetectionSource = 
  | 'STATIC_ANALYZER' 
  | 'AI_ANALYSIS' 
  | 'TEST_EXECUTION' 
  | 'MANUAL_REVIEW';

export type ValidationStatus = 
  | 'UNVERIFIED' 
  | 'STATICALLY_CONFIRMED' 
  | 'TEST_CONFIRMED' 
  | 'MANUALLY_VERIFIED' 
  | 'DISMISSED';

export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'csharp';

export type ReviewProfile = 
  | 'BUG_DETECTION' 
  | 'SECURITY_REVIEW' 
  | 'CODE_QUALITY' 
  | 'PERFORMANCE' 
  | 'TEST_COVERAGE' 
  | 'COMPREHENSIVE';

export interface DeveloperFeedback {
  dismissed: boolean;
  reason?: 'FALSE_POSITIVE' | 'INTENDED_BEHAVIOR' | 'ACCEPTED_RISK' | 'OUT_OF_SCOPE' | 'OTHER';
  comment?: string;
  verifiedByUser?: boolean;
  updatedAt: string;
}

export interface ReviewFinding {
  id: string;
  reviewId: string;
  title: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  confidence: number; // 0.0 - 1.0
  filePath: string;
  startLine: number;
  endLine: number;
  codeExcerpt: string;
  description: string;
  impact: string;
  evidence: string[];
  recommendedFix: string;
  suggestedPatch: string | null; // Unified diff format
  detectionSource: DetectionSource;
  validationStatus: ValidationStatus;
  introducedByChange: boolean;
  relatedFindingIds: string[];
  developerFeedback?: DeveloperFeedback;
  ruleId?: string;
  createdAt: string;
}

export interface SourceFile {
  id: string;
  reviewId: string;
  path: string;
  content: string;
  originalContent?: string;
  language: SupportedLanguage;
  isDiff?: boolean;
  changesCount: {
    additions: number;
    deletions: number;
  };
}

export interface GeneratedTest {
  id: string;
  findingId: string;
  reviewId: string;
  framework: 'vitest' | 'jest' | 'pytest' | 'junit' | 'xunit';
  language: SupportedLanguage;
  targetFunction: string;
  testCode: string;
  validationStatus: 'SYNTAX_VALID' | 'SYNTAX_ERROR' | 'UNCHECKED';
  validationErrors?: string[];
  testType: 'DEFECT_REPRODUCTION' | 'HAPPY_PATH' | 'EDGE_CASE';
  createdAt: string;
}

export interface TestExecution {
  id: string;
  testId: string;
  findingId: string;
  reviewId: string;
  status: 'PASSED' | 'FAILED' | 'ERROR' | 'SANDBOX_RESTRICTED';
  executionTimeMs: number;
  stdout: string;
  stderr: string;
  failureExplanation?: string;
  sandboxInfo: {
    isIsolated: boolean;
    runtime: string;
    isolationMechanism: string;
  };
  executedAt: string;
}

export interface ReviewStats {
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  staticallyConfirmedCount: number;
  testConfirmedCount: number;
  dismissedCount: number;
  testsGeneratedCount: number;
}

export interface Review {
  id: string;
  title: string;
  description?: string;
  language: SupportedLanguage;
  profile: ReviewProfile;
  inputType: 'snippet' | 'diff' | 'file';
  status: 'QUEUED' | 'ANALYZING_STATIC' | 'ANALYZING_AI' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
  files: SourceFile[];
  findings: ReviewFinding[];
  generatedTests: GeneratedTest[];
  testExecutions: TestExecution[];
  stats: ReviewStats;
  aiModelUsed?: string;
  analysisTimeMs?: number;
  createdAt: string;
  completedAt?: string;
}

export interface EvaluationFixture {
  id: string;
  name: string;
  description: string;
  category: ReviewCategory;
  language: SupportedLanguage;
  inputType: 'snippet' | 'diff';
  code: string;
  expectedDefects: {
    category: ReviewCategory;
    severity: ReviewSeverity;
    targetLine: number;
    keywords: string[];
    isUncertaintyExpected?: boolean;
    isNoIssueExpected?: boolean;
  }[];
  knownLimitations?: string;
  authorNote: string;
}

export interface EvaluationResult {
  fixtureId: string;
  fixtureName: string;
  category: ReviewCategory;
  passed: boolean;
  findingsCount: number;
  matchedDefects: number;
  expectedDefectsCount: number;
  falsePositivesCount: number;
  locationAccuracyPercent: number;
  executionTimeMs: number;
  detectedTitles: string[];
  notes: string;
}

export interface EvaluationRunSummary {
  id: string;
  runAt: string;
  totalFixtures: number;
  passedFixtures: number;
  precision: number; // 0 - 100%
  recall: number; // 0 - 100%
  f1Score: number;
  falsePositiveRate: number; // 0 - 100%
  locationAccuracy: number; // 0 - 100%
  averageLatencyMs: number;
  estimatedTokens: number;
  results: EvaluationResult[];
}

export interface AppSettings {
  retentionPeriod: 'session' | '24h' | '7d' | '30d';
  defaultProfile: ReviewProfile;
  maxInputSizeBytes: number;
  modelName: string;
  sandboxIsolationConfigured: boolean;
  allowManualVerification: boolean;
}

export interface ToolStatus {
  name: string;
  available: boolean;
  version?: string;
  description: string;
  installHint?: string;
  status: 'ACTIVE' | 'FALLBACK' | 'UNAVAILABLE';
}

export interface LanguageCapabilities {
  language: SupportedLanguage;
  displayName: string;
  fileExtensions: string[];
  defaultFileName: string;
  syntaxValidation: {
    engine: string;
    available: boolean;
    offline: boolean;
  };
  staticAnalysis: {
    primaryTool: string;
    primaryAvailable: boolean;
    fallbackEngine: string;
    available: boolean;
    statusMessage: string;
  };
  testGeneration: {
    targetFramework: 'vitest' | 'jest' | 'pytest' | 'junit' | 'xunit';
    available: boolean;
  };
  executionSandbox: {
    available: boolean;
    isolated: boolean;
    statusMessage: string;
  };
  tools: ToolStatus[];
}

