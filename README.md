# ReviewPilot: AI Code Review & Automated Testing Platform

**ReviewPilot** is a production-grade, full-stack AI-assisted code review and automated testing platform designed for engineering teams. It bridges deterministic static analysis with contextual reasoning from Google Gemini models, synthesizes targeted unit test reproduction suites, executes safe sandbox AST validations, and produces actionable unified diff patches.

---

## 1. System Architecture

ReviewPilot separates concerns into explicit architectural layers:

```
├── Presentation Layer
│   ├── Navigation & Overview Dashboard (real aggregated telemetry)
│   ├── New Review Intake (snippets, git diffs, file uploads, presets)
│   ├── Review Workspace (split-pane line-anchored code & diff viewer)
│   ├── Findings Explorer (multi-factor search, filters, dismissal tracking)
│   ├── Test Lab (synthesized test suite viewer & AST sandbox terminal)
│   ├── Evaluation Suite (20-fixture empirical benchmark suite)
│   └── Settings & Privacy (data retention policies, sandbox disclosures)
│
├── API & Server Layer (Node.js / Express / TypeScript)
│   ├── REST endpoints under /api/*
│   ├── Strict request & response schemas
│   ├── In-memory repository with retention policy enforcement
│   └── Error handling & health probes
│
├── Deterministic Analysis Engine
│   ├── Unified Git Diff Parser (hunk line mapping, additions/deletions)
│   └── Multi-Language Rule Engine (SEC-001..007, BUG-001..007, PERF-001..002)
│
├── AI Contextual Review & Test Generation
│   ├── Server-side @google/genai SDK (gemini-3.8-flash)
│   ├── Untrusted code prompt boundary isolation (<untrusted_source_code>)
│   ├── Zod runtime schema validation & recovery
│   └── Targeted test synthesis (Vitest, Jest, pytest, JUnit, xUnit)
│
├── Safe Sandbox Adapter
│   ├── AST & syntax tree validation
│   ├── Execution boundaries (timeout limits, memory limits, no arbitrary shell)
│   └── Transparent capability & isolation disclosures
│
└── Evaluation & Regression Harness
    ├── 20 comprehensive test fixtures across real-world defect categories
    └── Precision, recall, false-positive rate, and line accuracy metrics
```

---

## 2. Directory Structure

```
├── server.ts                             # Full-stack server entry point (Express + Vite)
├── package.json                          # Dependencies & scripts
├── metadata.json                         # ReviewPilot metadata & server capabilities
├── vite.config.ts                        # Vite configuration
├── server/
│   ├── ai/
│   │   ├── geminiReviewService.ts        # Server-side Gemini review integration
│   │   └── geminiTestService.ts          # Automated unit test generation service
│   ├── analyzers/
│   │   ├── diffParser.ts                 # Unified git diff parser with line mapping
│   │   └── staticAnalyzer.ts             # Deterministic rules (Security, Bugs, Perf)
│   ├── evaluation/
│   │   ├── fixtures.ts                   # 20 benchmark fixtures for code review evaluation
│   │   └── evaluationRunner.ts           # Evaluation runner with precision/recall math
│   ├── repositories/
│   │   └── reviewRepository.ts           # Repository abstraction with seeded demo data
│   ├── routes/
│   │   └── api.ts                        # Complete REST API routes
│   ├── sandbox/
│   │   └── sandboxAdapter.ts             # Safe AST validator & sandbox adapter
│   └── types/                            # Server types
├── src/
│   ├── App.tsx                           # Main React application & routing
│   ├── components/
│   │   ├── Navigation.tsx                # Technical sidebar navigation
│   │   ├── SeverityBadge.tsx             # Accessible severity indicators
│   │   └── StatusBadge.tsx               # Detection source & validation status badges
│   ├── features/
│   │   ├── dashboard/DashboardPage.tsx   # Overview dashboard with real telemetry
│   │   ├── reviews/
│   │   │   ├── NewReviewPage.tsx         # Intake form with 1-click test scenarios
│   │   │   └── ReviewWorkspacePage.tsx   # Split-pane diff & findings workspace
│   │   ├── findings/FindingsExplorerPage.tsx # Search, filter, and false-positive dismissal
│   │   ├── test-generation/TestLabPage.tsx   # Generated tests & sandbox execution
│   │   ├── evaluation/EvaluationSuitePage.tsx # 20-fixture evaluation benchmark
│   │   ├── history/ReviewHistoryPage.tsx     # Audit ledger with purge action
│   │   └── settings/SettingsPage.tsx         # Privacy, retention, and model settings
│   ├── lib/api.ts                        # Typed client API helper
│   └── types/review.ts                   # Domain models & TypeScript interfaces
└── tests/
    └── unit/
        ├── diffParser.test.ts            # Unit tests for Git diff parser
        └── staticAnalyzer.test.ts        # Unit tests for deterministic rules
```

---

## 3. Supported Languages & Analyzers

| Language | Static Analyzer Rules | AI Contextual Reasoning | Test Framework |
| :--- | :--- | :--- | :--- |
| **TypeScript / JavaScript** | ✅ Full rules (Secrets, Injection, Eval, Nulls, Boundaries, Async) | ✅ Gemini 3.8 Flash | Vitest / Jest |
| **Python** | ✅ Resource leaks, eval, prompt injection, SQL injection | ✅ Gemini 3.8 Flash | pytest |
| **Java** | ✅ SQL concat, hardcoded tokens, prompt injection | ✅ Gemini 3.8 Flash | JUnit |
| **C#** | ✅ SQL concat, hardcoded tokens, prompt injection | ✅ Gemini 3.8 Flash | xUnit / NUnit |

---

## 4. Empirical Evaluation Benchmark (20 Fixtures)

ReviewPilot includes a standardized regression suite comprising 20 small, clearly-labeled test fixtures:
1. **Clean Baseline**: User registration with Bcrypt and parameterized queries (precision test).
2. **Null Dereference**: Deep optional chaining bug.
3. **Assignment in Conditional**: Accidental `=` instead of `===`.
4. **Off-by-One**: Array iteration `<= length`.
5. **Swallowed Exception**: Empty catch block on payment path.
6. **Redundant Queries**: N+1 query executed inside iteration loop.
7. **Resource Leak**: Unclosed file descriptor without finally block.
8. **Async Race Hazard**: Non-atomic read-modify-write inventory stock update.
9. **SQL Injection**: String concatenation in query string.
10. **Missing Authorization**: Privileged tenant deletion lacking role check.
11. **Quadratic Complexity**: Nested `.find()` inside `.map()`.
12. **Inadequate Test Coverage**: Negative numbers and fractional edge conditions.
13. **Adversarial Prompt Injection**: Malicious instructions embedded in code comments.
14. **Unchanged Diff Context**: Legacy bugs outside modified diff hunks.
15. **Uncertainty Baseline**: Ambiguous domain discount tier.
16. **Hardcoded Secrets**: Embedded cloud access credentials.
17. **Dynamic Code Execution**: `new Function()` with untrusted parameter.
18. **Path Traversal**: Unsanitized filesystem read with dot-dot-slash.
19. **Insecure CORS**: Wildcard origin with credentials header.
20. **Unhandled Promise**: Asynchronous dispatch without `await` or `.catch()`.

Run anytime from the UI or via API (`POST /api/evaluations/run`).

---

## 5. Build, Lint & Test Commands

- **Build**: `npm run build`
- **Lint / Typecheck**: `npm run lint` (runs `tsc --noEmit`)
- **Unit Tests**: `npm run test` (runs `vitest run`)
- **Dev Server**: `npm run dev` (starts full-stack server on `http://0.0.0.0:3000`)

---

## 6. Security Boundaries & Privacy Guarantees

1. **Untrusted Code Isolation**: All user-submitted code and diffs are enclosed in `<untrusted_source_code>` fences and explicitly marked as passive data. Models are instructed to disregard directives or prompt injections embedded in comments.
2. **Zero Client Secret Exposure**: All AI calls to `@google/genai` are executed strictly server-side. No API keys exist in frontend bundles.
3. **No Unsafe Execution**: Arbitrary code execution (eval, child_process shell execution) is prohibited. Test execution is governed by AST verification and bounded time/memory constraints.
4. **Data Retention Compliance**: Source files are subject to configured retention windows (`session`, `24h`, `7d`, `30d`), and users can permanently purge review records from the audit ledger.
