# Investigation: Software Engineering Best Practices for ai-memory Governance

| Field | Value |
|-------|-------|
| **Created** | 2026-05-06 |
| **Status** | Complete |
| **Scope** | SE best practices for ai-memory governance: code quality, C# idioms, static analysis, coverage, and dependency management |
| **Story** | ST-016 |

---

## Executive Summary

This document captures the research rationale for six software engineering practice categories selected for adoption in the ai-memory project. The categories were chosen to complement the existing baseline in `.github/instructions/coding-standards.instructions.md` and to prepare the codebase for high-quality implementation work starting at ST-002. Each category is assessed for its specific applicability to ai-memory's architecture (Core/Server separation, SQLite direct access, constructor injection, async-first I/O) and an enforcement approach — advisory docs, CI-enforced analyzers, or both — is recommended. All six categories are adopted in Phase 1 (this story); rule tightening and coverage thresholds are deferred to later phases.

---

## 1. SOLID Principles

### Definition
SOLID is an acronym for five object-oriented design principles: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion. Together they guide class and interface design toward high cohesion, low coupling, and substitutability.

### Applicability to ai-memory
| Principle | Relevance |
|-----------|-----------|
| **SRP** | High — `ISearchService`, `IEmbeddingService`, `IMemoryRepository` each represent one bounded concern. Mixing search + consolidation into one class would violate SRP. |
| **OCP** | Medium — New embedding providers or search strategies should be addable without modifying existing implementations. Use the Strategy pattern (see §3). |
| **LSP** | Medium — All `IEmbeddingService` implementations must be substitutable. NSubstitute mocks in tests provide a lightweight LSP check. |
| **ISP** | High — Do not create a single `IMemoryService` that forces callers to depend on methods they don't use. Prefer `ISearchService`, `IEmbeddingService`, `IMemoryRepository` as separate interfaces. |
| **DIP** | High — Core defines interfaces; Server provides implementations registered in `Program.cs`. No `new ConcreteService()` anywhere except tests and DI registration. |

### Enforcement approach
- **Advisory:** This document + `coding-standards.instructions.md` §SOLID Principles
- **CI:** `SonarAnalyzer.CSharp` raises S3881/S4017 for interface design violations; `Microsoft.CodeAnalysis.NetAnalyzers` raises CA1040 for empty interfaces

### Examples
- ✅ Do: `IEmbeddingService.EmbedAsync(string text)` as a focused interface injected into `SearchService`
- ❌ Don't: A `MemoryManager` class that handles search, embedding, consolidation, and database migration

---

## 2. DRY (Don't Repeat Yourself)

### Definition
DRY states that every piece of knowledge in a system should have a single, unambiguous, authoritative representation. Duplication of logic leads to inconsistent updates and maintenance burden. Note: premature DRY (abstracting too early) is an anti-pattern with equal cost.

### Applicability to ai-memory
- SQL query patterns across repository methods should be extracted to helpers rather than duplicated
- Configuration binding for OpenAI, SQLite connection strings, and search parameters should follow a single pattern registered once in `Program.cs`
- Constants like `DefaultSearchLimit = 10` must exist in one place only (`AiMemory.Core`) and be referenced by all consumers
- Two code blocks that look similar but serve domain-distinct purposes (e.g., FTS5 search vs. vector search) should remain separate until a third use proves the abstraction warrant

### Enforcement approach
- **Advisory:** This document + `coding-standards.instructions.md` §DRY
- **CI:** `SonarAnalyzer.CSharp` S1168, S3415; `Meziantou.Analyzer` MA0016 (prefer `const`)

### Examples
- ✅ Do: `private const int DefaultSearchLimit = 10;` in `AiMemory.Core.SearchConstants`, referenced by `SearchService` and REST endpoint handler
- ❌ Don't: Literal `10` appearing in three separate files with no shared constant

---

## 3. Design Patterns

### Definition
Design patterns are reusable solutions to commonly occurring design problems. They are not formulas — they are vocabulary for communicating intent. Applying a pattern must solve a real problem; applying it without a problem adds complexity.

### Patterns applicable to ai-memory

| Pattern | Where used | Purpose |
|---------|-----------|---------|
| **Repository** | `IMemoryRepository` / `SqliteMemoryRepository` | Encapsulates all SQLite access. Services never execute SQL directly. |
| **Strategy** | `IEmbeddingService` with OpenAI and future ONNX implementations | Allows swapping embedding providers without changing consuming services. |
| **Factory** | `IDbConnectionFactory` | Encapsulates `SqliteConnection` creation and configuration. Services never open connections directly. |
| **Result** | `Result<T>` return type for expected failures | Distinguishes expected domain failures (not-found, duplicate) from unexpected exceptions. Avoids exception-driven flow for normal cases. |

### Enforcement approach
- **Advisory:** This document + `coding-standards.instructions.md` §Design Patterns
- **CI:** No analyzer enforces pattern selection directly; code review is the gate

### Examples
- ✅ Do: `SqliteMemoryRepository` implements `IMemoryRepository`; `SearchService` depends on `IMemoryRepository` via constructor injection
- ❌ Don't: `SearchService` takes `SqliteConnection` as a constructor parameter and builds queries inline

---

## 4. Static Analysis

### Definition
Static analysis examines source code without executing it to detect bugs, style violations, security vulnerabilities, and code quality issues. In the .NET ecosystem, Roslyn-based analyzer NuGet packages integrate into `dotnet build` and report violations as diagnostics.

### Analyzer package selection rationale

| Package | Prefix | Purpose | Why selected |
|---------|--------|---------|-------------|
| `Microsoft.CodeAnalysis.NetAnalyzers` | CA | .NET platform correctness, performance, security, and design rules | Built into .NET SDK; authoritative source for platform-level guidance |
| `StyleCop.Analyzers` | SA/SX | Formatting, documentation, and naming consistency | Ensures consistent style across AI-agent-authored code; complements `.editorconfig` |
| `SonarAnalyzer.CSharp` | S | Broad quality and security hotspots | Strong coverage of SOLID violations, null checks, exception handling, and SQL injection patterns relevant to this codebase |
| `Meziantou.Analyzer` | MA | Modern C# idioms, performance, and correctness | Catches patterns that are legal but suboptimal (e.g., `string.Concat` vs. interpolation, missing `ConfigureAwait`) |

### Build integration
All four packages are referenced in `Directory.Build.props` with `PrivateAssets="all"` (analyzer-only, not a runtime dependency). `EnforceCodeStyleInBuild=true` ensures `.editorconfig` style rules are enforced at build time. `TreatWarningsAsErrors=true` is already set — violations become build errors.

### Suppression strategy
When a violation is non-trivial to fix, lower severity to `suggestion` in `.editorconfig` with a dated comment. Do not suppress without documentation. Review suppressed rules in the next governance cycle.

### Enforcement approach
- **CI:** All four analyzers run on every `dotnet build`
- **Advisory:** This document explains why each package was chosen; `.github/instructions/ways-of-working.instructions.md` §Analyzer Expectations defines the suppression workflow

### Examples
- ✅ Do: Fix `CA1062` ("Validate parameter is non-null") by adding a null check or using nullable reference types
- ❌ Don't: Add `#pragma warning disable CA1062` without a corresponding `.editorconfig` suppression entry and §6b note

---

## 5. Code Coverage

### Definition
Code coverage measures the proportion of production code exercised by the test suite. Common metrics: line coverage, branch coverage, method coverage.

### Philosophy: coverage as signal, not target
High coverage of low-quality tests (tests that assert nothing meaningful, or test only the happy path) provides false confidence. A targeted 40% with high-signal tests on critical paths is preferable to 90% that includes trivial property getter tests.

**For ai-memory**, the critical paths requiring test coverage are:
1. SQLite FTS5 search (correctness of ranked results)
2. Vector similarity search (cosine distance, RRF fusion)
3. API input validation (RFC 7807 error responses)
4. Consolidation scoring (deduplication, promotion logic)

### Decision: track only (no hard threshold for Phase 1)
The PO confirmed that coverage should be collected and reviewed but must not gate the build in the initial phase. A threshold will be introduced in a later story once the codebase has meaningful test coverage to benchmark against.

### Coverage tooling
- Package: `coverlet.collector` added to `tests/AiMemory.Tests/AiMemory.Tests.csproj`
- Collection command: `dotnet test --collect:"XPlat Code Coverage"`
- Output format: Cobertura XML (`coverage.cobertura.xml`) under `TestResults/`
- Results directory: excluded from version control via `.gitignore`

### Enforcement approach
- **Advisory:** This document + `coding-standards.instructions.md` §Testing + `ways-of-working.instructions.md` §Coverage Tracking
- **CI:** Coverage is collected but does not gate the build

### Examples
- ✅ Do: Test `SearchService.SearchAsync` with both a seeded in-memory SQLite database (verifying ranked results) and a mock `IEmbeddingService`
- ❌ Don't: Test only the fact that `SearchAsync` returns a non-null result; that assertion provides no signal

---

## 6. Dependency Management

### Definition
Dependency management covers the selection, version pinning, and lifecycle maintenance of external NuGet packages. Poor practices lead to version conflicts, security vulnerabilities, and upgrade risk.

### Policy for ai-memory

| Rule | Detail |
|------|--------|
| **Pin exact versions** | All `PackageReference` entries use exact versions (e.g., `Version="8.9.0"`). No floating (`*`) or range (`[1.0,2.0)`) versions. |
| **Monthly audit** | Run `dotnet list package --outdated` from `c:\projects\ai-memory\src\` on the first working day of each month. |
| **Security updates** | CVE-flagged packages must be updated within 48 hours of public disclosure. Check [https://github.com/advisories](https://github.com/advisories) or NuGet security advisories. |
| **Major upgrades** | Create a dedicated story for major version migrations. Never inline a breaking major upgrade during feature work. |
| **License preference** | MIT or Apache-2.0. Any package with a non-standard license must be documented in `coding-standards.instructions.md` when added. |
| **Minimize transitive depth** | Prefer packages with few transitive dependencies. Run `dotnet list package --include-transitive` to audit the transitive closure. |

### Enforcement approach
- **Advisory:** This document + `coding-standards.instructions.md` §Dependency Management
- **CI:** No automated license check or dependency audit in Phase 1. Manual monthly audit is the process gate.

### Examples
- ✅ Do: `<PackageReference Include="FluentAssertions" Version="8.9.0" />`
- ❌ Don't: `<PackageReference Include="FluentAssertions" Version="*" />`

---

## Relationship to Existing Standards

This document extends the baseline in `.github/instructions/coding-standards.instructions.md`. The coding-standards file is the authoritative short-form reference for developers and AI agents. This investigation document provides:
- The rationale and trade-offs behind each rule
- The "why" that the coding-standards file omits for brevity
- Historical context for future governance reviews

When a rule in coding-standards conflicts with content here, the coding-standards file takes precedence (it reflects current approved decisions). This document reflects the research that informed those decisions.

---

## Adoption Timeline

| Phase | Story | Scope |
|-------|-------|-------|
| **Phase 1 (current)** | ST-016 | Install all four analyzers; add `.editorconfig`; document SOLID/DRY/patterns/coverage/deps; add WoW file. Suppress non-trivial analyzer violations with documented justification. |
| **Phase 2 (future)** | TBD | Review all suppressed rules. Convert suppressions to fixes or promote them to permanent exceptions with written rationale. |
| **Phase 3 (future)** | TBD | Introduce a code coverage threshold once the codebase has sufficient test coverage (post ST-003 through ST-007). |
