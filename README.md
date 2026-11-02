# ReviewPilot: Multi-Language Code Review & Automated Testing Platform

ReviewPilot is a developer platform that pairs deterministic static analysis with server-side AI reasoning from Google Gemini models. It analyzes source files and unified git diffs, validates findings against actual source boundaries, synthesizes targeted reproduction unit tests, and validates syntax offline across TypeScript, JavaScript, Python, Java, and C#.

---

## 1. Supported Languages & File Types

| Language | Extensions | Primary Parser / Syntax Engine | Static Analysis Tooling | Target Test Framework | Project Layouts Supported |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TypeScript** | `.ts`, `.tsx`, `.mts`, `.cts` | `esbuild` (Offline ESM parser) | ReviewPilot TypeScript Rule Engine | Vitest | Single file, standard npm / tsconfig |
| **JavaScript** | `.js`, `.jsx`, `.mjs`, `.cjs` | `esbuild` (Offline JS parser) | ReviewPilot JavaScript Rule Engine | Vitest | Single file, Node.js packages |
| **Python** | `.py`, `.pyw` | `@lezer/python` (Offline AST parser) | Ruff (executed when in PATH) + Built-in AST Rules (`PY-SEC-001`..`004`, `PY-BUG-001`..`004`, `PY-RES-001`) | pytest | Standalone `.py` modules |
| **Java** | `.java` | `@lezer/java` (Offline AST parser) | Checkstyle / PMD (when in PATH) + Built-in AST Rules (`JAVA-SEC-001`..`004`, `JAVA-BUG-001`..`004`, `JAVA-QUAL-001`) | JUnit 5 | Standalone `.java`, single-module Maven (`pom.xml`), single-module Gradle (`build.gradle`) |
| **C#** | `.cs` | `@fluffy-spoon/csharp-parser` & Lexical Verifier | ReviewPilot C# Rule Engine (SQL concat, secrets, process execution) | xUnit | Standalone `.cs`, single-project `.csproj` |

---

## 2. Capability Matrix

| Capability | TypeScript | JavaScript | Python | Java | C# | Status Definition & Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Source Acceptance & Detection** | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Verified by `crossLanguageReadiness.test.ts` across filenames, content heuristics, and diff headers. |
| **Syntax / Parser Validation** | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Verified offline via `esbuild`, `@lezer/python`, `@lezer/java`, and `@fluffy-spoon/csharp-parser`. |
| **Deterministic Static Analysis** | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Verified via rule tests (`staticAnalyzer.test.ts`, `pythonSupport.test.ts`, `javaSupport.test.ts`). |
| **AI Contextual Review** | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Verified via `pipeline.test.ts` with server-side Gemini 3.8 Flash, strict schemas, and line clamping. |
| **Finding Schema & Coordinate Clamping** | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Verified via `clampFindingCoordinates` and path sanitization tests. |
| **Test Generation** | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Verified fallback and AI test generators producing valid Vitest, pytest, JUnit 5, and xUnit code. |
| **Test Syntax Validation** | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Verified that generated test code passes offline parser validation in each language. |
| **Test Execution in Main Server** | Unavailable by policy | Unavailable by policy | Unavailable by policy | Unavailable by policy | Unavailable by policy | Intentionally disabled on server; returns `SANDBOX_RESTRICTED` to prevent remote code execution. |
| **Isolated microVM Execution** | Unavailable in current env | Unavailable in current env | Unavailable in current env | Unavailable in current env | Unavailable in current env | Host container lacks microVM hypervisor (e.g., Firecracker / gVisor). Reported truthfully in UI. |
| **Missing-Dependency Handling** | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Implemented & verified | Detects absent Ruff, Checkstyle, javac, or dotnet binaries without fabricating findings or crashing. |

---

## 3. Safe Execution Architecture

ReviewPilot enforces a strict security invariant: **Untrusted user-submitted code and AI-generated tests are never executed inside the main application server process.**

```
[User Source / Generated Test]
           │
           ▼
[Lexical & Path Sanitization] ───► Size > 1MB or Traversal? ──► Rejection
           │
           ▼
[Offline AST Syntax Parser] ─────► Syntax Error? ──────────────► Diagnostics Only (No Execution)
           │
           ▼
[Security Policy Check] ─────────► ChildProcess / Network / Eval? ──► Blocked
           │
           ▼
[Execution Sandbox Adapter] ─────► microVM Isolation Present?
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
                   YES (Cloud Runner)                  NO (Current Host)
                   Ephemeral VM run                 Execution Safely Disabled
                                                    `SANDBOX_RESTRICTED`
                                                    Download / Copy for local run
```

When hypervisor microVM infrastructure is absent, ReviewPilot:
1. Validates test syntax and structural integrity offline.
2. Emits status `SANDBOX_RESTRICTED` with a clear explanation.
3. Provides one-click "Copy Test" and "Export" workflows for safe local execution in developer containers.

---

## 4. Analysis & Review Pipeline

```
1. Intake & Validation
   - File size ceiling: 1 MB limit enforced across all adapters.
   - Unified diff parser: Validates `diff --git`, `---`, `+++`, `@@` chunk headers.
   - Path sanitization: Strips `../` traversal sequences, Windows drive letters, and null bytes.

2. Deterministic Static Analyzers
   - Checks static security rules (hardcoded credentials, SQL injection, command execution, path traversal).
   - Python AST analyzer: Checks `shell=True`, mutable defaults, bare except, f-string SQLi, unclosed open().
   - Java AST analyzer: Checks JDBC string concatenation, `==` string comparisons, unclosed streams without try-with-resources.
   - Normalizers for Ruff (Python) and Checkstyle/PMD (Java) when binaries exist in PATH.

3. Contextual AI Review (Server-side Gemini 3.8 Flash)
   - Code is isolated in prompt boundaries (`<untrusted_source_code>`).
   - Line numbers are clamped strictly to valid 1..totalLines ranges.
   - Structured JSON response validated through Zod runtime schemas.
   - Static analysis findings and AI observations are stored separately to prevent false conflation.

4. Test Synthesis & Export
   - Synthesizes targeted regression tests reproducing reported findings.
   - Validates generated test grammar offline.
```

---

## 5. External Services vs Offline Capabilities

- **Offline (Zero External Calls)**:
  - Language detection from extensions, diff headers, and file heuristics.
  - Syntax parsing and AST validation via `esbuild`, `@lezer/python`, `@lezer/java`, and `@fluffy-spoon/csharp-parser`.
  - Deterministic static rule evaluation and unified diff patch validation.
  - Project layout detection (Maven `pom.xml`, Gradle `build.gradle`, C# `.csproj`).
  - Fallback test code generation.
- **External Service Required**:
  - Contextual AI reasoning and custom test synthesis require access to Google Gemini via the server-side `@google/genai` SDK using `GEMINI_API_KEY`.
  - When the API key is absent, ReviewPilot gracefully falls back to deterministic static checks without failing.

---

## 6. Known Limitations

1. **Host Compiler Binaries**: The current hosting environment does not include preinstalled JDK (`javac`), Python `ruff`, Java `checkstyle`/`pmd`, or .NET SDK (`dotnet`). ReviewPilot detects these absences and reports `primaryAvailable: false` with `status: FALLBACK` instead of faking results.
2. **Multi-Module Reactor Builds**: ReviewPilot analyzes standalone source files and single-module project files. Multi-module Maven reactor builds (multiple `pom.xml` files) and multi-project Visual Studio solutions (`.sln`) are recognized and flagged as `UNSUPPORTED_MULTI_MODULE` with advice to review individual submodules.
3. **Execution Sandboxing**: Server-side execution of untrusted test suites is disabled by design. Running tests requires copying or exporting the test file to a local runner or containerized CI pipeline.

---

## 7. Setup & Installation

### Prerequisites
- Node.js 20 or higher
- npm 9 or higher
- Optional local tools for enhanced linting: `ruff` (Python), `checkstyle` (Java), `dotnet` (C#)

### Environment Configuration
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```
Key configuration variables:
```bash
GEMINI_API_KEY=your_gemini_api_key_here  # Optional: enables AI review & test synthesis
PORT=3000                                 # Application port (default: 3000)
```

### Installation
```bash
npm install
```

---

## 8. Verification & Test Commands

Run the full automated test suite (10 test files, 197 unit and integration tests):
```bash
npm test
```

Run TypeScript compilation check:
```bash
npm run lint
```

Build the frontend bundle:
```bash
npm run build
```

Start the full-stack development server:
```bash
npm run dev
```
