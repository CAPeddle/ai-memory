# ExecPlan — ST-016: Research software engineering best practices for governance adoption

> Status: ✅ Ready for /continue
> Story: ST-016
> Created: 2026-05-05
> Parent: `.github/planning/query-packets/QP-016-se-best-practices-governance.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. The sections §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective must be kept up to date as work proceeds.

---

## §1. Background & Context

The ai-memory project currently has a baseline coding-standards instruction file (`.github/instructions/coding-standards.instructions.md`) covering naming conventions, architecture layering rules, database access patterns, error handling, testing framework choices, and API style. However, broader software engineering principles — SOLID, DRY, design patterns, static analysis, code coverage tracking, and dependency management — are not yet codified in governance.

This story institutionalizes these practices **before** the main implementation work (ST-002 through ST-010) begins. The goal is dual enforcement: advisory documentation that AI coding agents read during planning/execution, plus CI-enforced static analyzers that catch violations at build time.

**Key terms:**
- **WoW (Ways of Working):** An operational instruction file defining checklist-driven execution guidance, linting expectations, and code review quality gates.
- **Analyzer:** A Roslyn-based NuGet package that runs during `dotnet build` and reports code quality violations as warnings or errors.
- **.editorconfig:** A cross-editor configuration file that defines formatting rules and C# code style preferences, consumed by both IDEs and build-time analyzers.
- **TreatWarningsAsErrors:** Already enabled in `Directory.Build.props` — all analyzer warnings become build errors unless severity is lowered per-rule.

**Current state of relevant files:**
- `Directory.Build.props`: sets net8.0, C# 12, Nullable enable, ImplicitUsings enable, TreatWarningsAsErrors true. No analyzer packages.
- `.editorconfig`: does not exist.
- `.github/instructions/`: contains `coding-standards.instructions.md` and `session-resilience.instructions.md`.
- `docs/investigations/se-best-practices.md`: does not exist.
- `tests/AiMemory.Tests/AiMemory.Tests.csproj`: has xunit.v3, FluentAssertions, NSubstitute. No coverage tooling.

---

## §2. Definition of Done

- After running `dotnet build`, the solution compiles with zero errors and zero warnings (analyzer warnings either fixed or suppressed with documented justification)
- After running `dotnet test --collect:"XPlat Code Coverage"`, a coverage report file is produced under `TestResults/`
- After inspecting `.editorconfig`, it contains charset/indent/whitespace rules plus C# naming rules matching existing coding-standards conventions
- After inspecting `.github/instructions/coding-standards.instructions.md`, it contains new sections for SOLID, DRY, Design Patterns, and Dependency Management
- After inspecting `.github/instructions/ways-of-working.instructions.md`, it contains Pre-Implementation Checklist, Analyzer Expectations, Coverage Tracking, Code Review Quality Gate, and Dependency Update Cadence sections
- After inspecting `docs/investigations/se-best-practices.md`, it contains research rationale for all six practice categories with applicability assessment

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ✅ Ready

---

## §2c. Plan Review Notes

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| SOLID principles documented (QP-016) | `coding-standards.instructions.md` SOLID section + `se-best-practices.md` rationale | Task 4.1, Task 4.5 | Section heading + non-empty content in both files |
| DRY rules documented (QP-016) | `coding-standards.instructions.md` DRY section + `se-best-practices.md` rationale | Task 4.1, Task 4.5 | Section heading + non-empty content in both files |
| Design patterns documented (QP-016) | `coding-standards.instructions.md` Design Patterns section + `se-best-practices.md` rationale | Task 4.1, Task 4.5 | Section heading + non-empty content in both files |
| Static analysis enforced (QP-016) | `.editorconfig` + `Directory.Build.props` with 4 analyzers | Task 4.2, Task 4.3 | `dotnet build` passes; analyzer packages present in props |
| Code coverage tracked (QP-016) | `coverlet.collector` in test csproj + WoW instructions | Task 4.4, Task 4.6 | `dotnet test --collect:"XPlat Code Coverage"` produces output |
| Dependency management policy (QP-016) | `coding-standards.instructions.md` section + `se-best-practices.md` rationale | Task 4.1, Task 4.5 | Section heading + non-empty content |
| WoW file with checklist (QP-016) | `.github/instructions/ways-of-working.instructions.md` | Task 4.6 | File exists with valid frontmatter and 5 required sections |
| .editorconfig standard scope (QP-016) | `.editorconfig` at repo root | Task 4.2 | File contains charset, indent, whitespace, C# naming rules |

---

## §3. Preconditions

- .NET 8 SDK installed (verify: `dotnet --version` shows 8.x)
- Solution builds cleanly: `dotnet build` from `c:\projects\ai-memory\` returns 0 errors
- No prior story in progress (WIP limit respected)

**Analyzer suppression strategy (prescribed by PO):**
When new analyzer packages produce warnings that break the build (due to TreatWarningsAsErrors), the executor must:
1. First attempt to fix the violation if trivial (< 5 minutes)
2. If non-trivial, suppress the specific rule in `.editorconfig` with severity `suggestion` or `none`
3. Add a comment in the `.editorconfig` next to each suppression noting: `# Suppressed: [rule ID] — will tighten in future story`
4. Document all suppressions in §6b Surprises & Discoveries

**Asset catalog:** New files created by this story do NOT need immediate registration in the asset catalog. Deferred to next governance review cycle.

---

## §4. Task Definitions

### Task 4.1: Create investigation doc `docs/investigations/se-best-practices.md`

**Objective:** Document research rationale for each of the six SE practice categories, their applicability to ai-memory, and the recommended enforcement approach.

**Input:** The six practice categories from QP-016, existing coding-standards file for current state reference.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Create file `docs/investigations/se-best-practices.md`
2. Add a header section with metadata: title, created date, status (Complete), scope (SE best practices for ai-memory governance)
3. Add an Executive Summary section (3–5 sentences: what was researched, what was decided, how it integrates)
4. For each of the six categories below, add a section with:
   - **Definition:** 2–3 sentences explaining the principle
   - **Applicability to ai-memory:** How this applies to the specific codebase (Core/Server/Tests structure, SQLite access, DI, async patterns)
   - **Enforcement approach:** Whether enforced via docs (advisory), analyzers (CI), or both
   - **Examples:** One "do" and one "don't" example relevant to ai-memory's domain

   Categories:
   a. **SOLID Principles** — Focus on SRP (small focused services), ISP (fine-grained interfaces like ISearchService, IEmbeddingService), DIP (constructor injection everywhere). Note: OCP and LSP are relevant but less critical at current project size.
   b. **DRY (Don't Repeat Yourself)** — Focus on extracting shared logic into Core services, avoiding duplicate SQL queries, reusing configuration patterns. Note: premature DRY (abstracting too early) is also an anti-pattern.
   c. **Design Patterns** — Focus on patterns already implied by architecture: Repository (IMemoryRepository), Strategy (IEmbeddingService implementations), Factory (IDbConnectionFactory), Result pattern for error handling. Note: don't force patterns where simple code suffices.
   d. **Static Analysis** — Document why each of the four analyzer packages was chosen:
      - Microsoft.CodeAnalysis.NetAnalyzers: .NET platform rules, CA prefixed
      - StyleCop.Analyzers: SA/SX prefixed, formatting and documentation consistency
      - SonarAnalyzer.CSharp: S prefixed, security and quality hotspots
      - Meziantou.Analyzer: MA prefixed, modern C# idioms and performance
   e. **Code Coverage** — Document decision to track only (no threshold). Explain rationale: coverage is a signal not a target; high coverage of low-quality tests is worse than targeted coverage of critical paths. Note the command to generate reports.
   f. **Dependency Management** — Document policy: pin exact versions in csproj, review updates monthly, prefer packages with active maintenance and no known CVEs, keep transitive dependency count low, use `dotnet list package --outdated` for audit.

5. Add a "Relationship to Existing Standards" section explaining how this doc extends (not replaces) coding-standards.instructions.md
6. Add an "Adoption Timeline" section: Phase 1 (this story) installs tooling and docs; Phase 2 (future) tightens suppressed rules; Phase 3 (future) adds coverage thresholds.

**Expected output:** File `docs/investigations/se-best-practices.md` with all sections populated, no placeholder text.

**Requirement mapping:** SOLID, DRY, Design Patterns, Static Analysis, Code Coverage, Dependency Management rationale requirements from §2d.

**Verification:**
```powershell
Test-Path "docs/investigations/se-best-practices.md"
Select-String -Path "docs/investigations/se-best-practices.md" -Pattern "SOLID|DRY|Design Patterns|Static Analysis|Code Coverage|Dependency Management" | Measure-Object
```
Expected result: File exists; at least 6 pattern matches (one per category heading).

**Failure handling:** If research reveals a category is inapplicable to ai-memory, document the finding with rationale rather than omitting the section entirely.

---

### Task 4.2: Create `.editorconfig` at repo root

**Objective:** Establish consistent editor formatting and C# style rules that IDEs and build-time analyzers will consume.

**Input:** Naming conventions from existing coding-standards.instructions.md.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Create file `.editorconfig` at repository root with the following content:

```ini
# EditorConfig — ai-memory
# See https://editorconfig.org

root = true

[*]
charset = utf-8
indent_style = space
indent_size = 4
end_of_line = crlf
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[*.{json,yml,yaml}]
indent_size = 2

[*.cs]
# Naming rules — match coding-standards.instructions.md
dotnet_naming_rule.private_fields_must_be_camel_case.severity = warning
dotnet_naming_rule.private_fields_must_be_camel_case.symbols = private_fields
dotnet_naming_rule.private_fields_must_be_camel_case.style = underscore_camel_case

dotnet_naming_symbols.private_fields.applicable_kinds = field
dotnet_naming_symbols.private_fields.applicable_accessibilities = private, private_protected
dotnet_naming_symbols.private_fields.required_modifiers =

dotnet_naming_style.underscore_camel_case.required_prefix = _
dotnet_naming_style.underscore_camel_case.capitalization = camel_case

dotnet_naming_rule.interfaces_must_begin_with_i.severity = warning
dotnet_naming_rule.interfaces_must_begin_with_i.symbols = interfaces
dotnet_naming_rule.interfaces_must_begin_with_i.style = begins_with_i

dotnet_naming_symbols.interfaces.applicable_kinds = interface
dotnet_naming_symbols.interfaces.applicable_accessibilities = *

dotnet_naming_style.begins_with_i.required_prefix = I
dotnet_naming_style.begins_with_i.capitalization = pascal_case

dotnet_naming_rule.constants_must_be_pascal_case.severity = warning
dotnet_naming_rule.constants_must_be_pascal_case.symbols = constants
dotnet_naming_rule.constants_must_be_pascal_case.style = pascal_case_style

dotnet_naming_symbols.constants.applicable_kinds = field
dotnet_naming_symbols.constants.required_modifiers = const

dotnet_naming_style.pascal_case_style.capitalization = pascal_case

dotnet_naming_rule.async_methods_must_end_with_async.severity = suggestion
dotnet_naming_rule.async_methods_must_end_with_async.symbols = async_methods
dotnet_naming_rule.async_methods_must_end_with_async.style = ends_with_async

dotnet_naming_symbols.async_methods.applicable_kinds = method
dotnet_naming_symbols.async_methods.required_modifiers = async

dotnet_naming_style.ends_with_async.required_suffix = Async
dotnet_naming_style.ends_with_async.capitalization = pascal_case

# Code style preferences
csharp_style_var_for_built_in_types = true:suggestion
csharp_style_var_when_type_is_apparent = true:suggestion
csharp_style_var_elsewhere = true:suggestion
csharp_prefer_braces = true:warning
csharp_style_expression_bodied_methods = when_on_single_line:suggestion
csharp_style_expression_bodied_properties = true:suggestion
csharp_style_expression_bodied_accessors = true:suggestion
csharp_using_directive_placement = outside_namespace:warning
dotnet_sort_system_directives_first = true
```

2. Verify the content matches coding-standards naming conventions (private fields: `_camelCase`, interfaces: `I` prefix, constants: `PascalCase`, async methods: `Async` suffix).

**Expected output:** `.editorconfig` file at repo root with formatting + C# naming + style rules.

**Requirement mapping:** ".editorconfig standard scope" from §2d.

**Verification:**
```powershell
dotnet build
```
Expected result: Build succeeds with 0 errors. If new warnings appear from the style rules, handle per §3 suppression strategy.

**Failure handling:** If a naming rule conflicts with existing code, lower its severity to `suggestion` in the `.editorconfig` and document in §6b.

---

### Task 4.3: Add analyzer packages to `Directory.Build.props`

**Objective:** Enable four static analysis packages across all projects via the central build props file.

**Input:** Current `Directory.Build.props` content (see §1 Background).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Open `Directory.Build.props`
2. Add the following within the existing `<Project>` element, after the `<PropertyGroup>`:

```xml
  <PropertyGroup>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.CodeAnalysis.NetAnalyzers" Version="9.0.0" PrivateAssets="all" />
    <PackageReference Include="StyleCop.Analyzers" Version="1.2.0-beta.556" PrivateAssets="all" />
    <PackageReference Include="SonarAnalyzer.CSharp" Version="10.8.0.117992" PrivateAssets="all" />
    <PackageReference Include="Meziantou.Analyzer" Version="2.0.187" PrivateAssets="all" />
  </ItemGroup>
```

3. Run `dotnet restore` to pull the packages.
4. Run `dotnet build` and capture output.
5. If warnings appear (they will become errors due to TreatWarningsAsErrors):
   a. For each error, check if it's a trivial fix (naming, missing using, etc.) — fix if < 5 min.
   b. For non-trivial violations, add a suppression line in `.editorconfig` under `[*.cs]`:
      ```ini
      # Suppressed: [RULE_ID] — will tighten in future story
      dotnet_diagnostic.RULE_ID.severity = suggestion
      ```
   c. Re-run `dotnet build` after each batch of suppressions until it passes cleanly.
6. Document all suppressions and fixes in §6b Surprises & Discoveries.

**Note on versions:** Use the latest stable versions available at execution time. The versions above are reference targets — the executor should check NuGet for current stable releases. For StyleCop, use the latest beta (1.2.0-beta series) as the stable 1.1.x only supports up to C# 10.

**Expected output:** `Directory.Build.props` with two new PropertyGroup entries and one ItemGroup with four analyzer packages. Build passes cleanly.

**Requirement mapping:** "Static analysis enforced" from §2d.

**Verification:**
```powershell
dotnet build
$LASTEXITCODE -eq 0
```
Expected result: Exit code 0, no errors. Any remaining suggestions are acceptable (only errors block).

**Failure handling:** If a specific analyzer package fails to restore (network, version mismatch), remove it temporarily, document in §6b, and proceed with the remaining packages. Do not let one failed package block the entire task.

---

### Task 4.4: Add coverage tracking to test project

**Objective:** Enable code coverage collection without enforcing a threshold.

**Input:** Current `tests/AiMemory.Tests/AiMemory.Tests.csproj`.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Open `tests/AiMemory.Tests/AiMemory.Tests.csproj`
2. Add to the existing `<ItemGroup>` containing package references:
   ```xml
   <PackageReference Include="coverlet.collector" Version="6.0.4" PrivateAssets="all" />
   ```
3. Run `dotnet restore`
4. Run coverage collection:
   ```powershell
   dotnet test --collect:"XPlat Code Coverage"
   ```
5. Confirm a coverage XML file is produced under `tests/AiMemory.Tests/TestResults/*/coverage.cobertura.xml`
6. Add `**/TestResults/` to `.gitignore` if not already present (create `.gitignore` if needed with standard .NET entries: `bin/`, `obj/`, `TestResults/`, `.vs/`)

**Expected output:** Coverage report generated successfully. `.gitignore` updated.

**Requirement mapping:** "Code coverage tracked" from §2d.

**Verification:**
```powershell
dotnet test --collect:"XPlat Code Coverage"
Get-ChildItem -Recurse -Filter "coverage.cobertura.xml" | Select-Object -First 1
```
Expected result: At least one `coverage.cobertura.xml` file found.

**Failure handling:** If coverlet fails on the current test framework version, try `coverlet.msbuild` as an alternative. Document the switch in §6c Decision Log.

---

### Task 4.5: Update `coding-standards.instructions.md`

**Objective:** Add SOLID, DRY, Design Patterns, and Dependency Management sections to the existing coding-standards file.

**Input:** Current content of `.github/instructions/coding-standards.instructions.md` (read first), research from Task 4.1.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Read the current file to identify insertion point (after the existing "MCP Style" section, before EOF)
2. Append the following four new sections:

**## SOLID Principles**
- **SRP:** Each class/service has one reason to change. Services like `ISearchService` handle search only; don't combine search + consolidation.
- **ISP:** Prefer small, focused interfaces. `IMemoryRepository` for CRUD, `ISearchService` for search, `IEmbeddingService` for embeddings — not one mega-interface.
- **DIP:** Depend on abstractions. Core defines interfaces; Server provides implementations. Never `new` up a service directly — always inject via constructor.
- **OCP:** Design services to be extended (new embedding providers, new search strategies) without modifying existing code where practical.
- **LSP:** Any implementation of an interface must be substitutable without altering correctness. Test with NSubstitute mocks to verify.

**## DRY (Don't Repeat Yourself)**
- Extract shared query patterns into helper methods on the repository rather than duplicating SQL across services.
- Reuse configuration-binding patterns — don't hand-parse settings in multiple places.
- Avoid premature DRY: if two blocks look similar but serve different domain purposes, keep them separate until a third use proves the abstraction.
- Prefer a single source of truth for constants (e.g., `DefaultSearchLimit` in one place, referenced elsewhere).

**## Design Patterns**
- **Repository:** `IMemoryRepository` encapsulates data access. All SQL lives in repository implementations — never in services.
- **Strategy:** `IEmbeddingService` allows swapping embedding providers (OpenAI, local ONNX) without changing consuming code.
- **Factory:** `IDbConnectionFactory` creates and configures database connections. Services never open connections directly.
- **Result:** Use `Result<T>` for operations that can fail expectedly (duplicate insert, not-found). Reserve exceptions for truly exceptional conditions.
- **Don't force it:** Only apply a pattern when it solves a real problem in this codebase. Simpler code > pattern compliance.

**## Dependency Management**
- Pin exact package versions in `.csproj` files (no floating versions like `*` or version ranges).
- Review NuGet updates monthly: `dotnet list package --outdated`.
- Prefer packages with: active maintenance, no known CVEs, compatible license (MIT/Apache-2.0 preferred).
- Minimize transitive dependency count — fewer dependencies = smaller attack surface.
- Document any package with a non-MIT/Apache license in this file when added.

3. Add a reference line at the bottom: `For rationale behind these practices, see docs/investigations/se-best-practices.md. For operational checklists, see .github/instructions/ways-of-working.instructions.md.`

**Expected output:** Updated coding-standards file with four new sections and cross-references.

**Requirement mapping:** SOLID, DRY, Design Patterns, Dependency Management requirements from §2d.

**Verification:**
```powershell
Select-String -Path ".github/instructions/coding-standards.instructions.md" -Pattern "^## SOLID|^## DRY|^## Design Patterns|^## Dependency Management" | Measure-Object
```
Expected result: Count = 4 (all four section headings present).

**Failure handling:** If the file structure has changed since §1 was written, find the appropriate insertion point (end of file, after last existing section). Do not overwrite existing content.

---

### Task 4.6: Create `.github/instructions/ways-of-working.instructions.md`

**Objective:** Create an operational WoW file with checklist-driven execution guidance, linting expectations, and code quality gates.

**Input:** Decisions from QP-016, content from Tasks 4.1–4.5.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Create file `.github/instructions/ways-of-working.instructions.md`
2. Add YAML frontmatter:
```yaml
---
name: "Ways of Working"
summary: "Operational checklists, linting expectations, and quality gates for ai-memory development"
asset_type: "instruction"
status: "active"
owners:
  - "ai-memory-maintainers"
source_path: ".github/instructions/ways-of-working.instructions.md"
---
```

3. Add the following sections:

**# Ways of Working — ai-memory**

**## Pre-Implementation Checklist**
Before starting any implementation task:
- [ ] Read the ExecPlan task definition completely before writing code
- [ ] Identify which interfaces and design patterns apply (check coding-standards.md §Design Patterns)
- [ ] Write the failing test first (TDD red step) before any production code
- [ ] Confirm the new code respects SRP: one class = one responsibility
- [ ] Check for existing utilities/helpers that avoid code duplication (DRY)

**## Analyzer Expectations**
- All four analyzers (NetAnalyzers, StyleCop, SonarAnalyzer, Meziantou) run on every `dotnet build`
- `TreatWarningsAsErrors` is enabled — code must pass all analyzer rules to compile
- Suppressed rules are documented in `.editorconfig` with justification comments
- Before suppressing a rule, attempt to fix the violation first
- New suppressions must be logged in the active ExecPlan §6b Surprises & Discoveries

**## Coverage Tracking**
- Run coverage with: `dotnet test --collect:"XPlat Code Coverage"`
- Coverage reports are generated but do not gate the build
- Focus coverage on critical paths: search logic, repository operations, API validation
- Do not write tests solely to increase coverage numbers — tests must validate behaviour

**## Code Review Quality Gate (Advisory)**
Before moving work to Review:
- [ ] All tests pass: `dotnet test`
- [ ] No analyzer suppressions added without documentation
- [ ] New public APIs have XML doc comments
- [ ] No `// TODO` left without a linked story or explanation
- [ ] DRY check: no duplicated logic blocks > 5 lines across files

**## Dependency Update Cadence**
- Monthly: run `dotnet list package --outdated` and review updates
- Security: apply CVE-flagged updates within 48 hours of disclosure
- Major version bumps: create a new story for migration (never inline during feature work)
- Record decisions in ExecPlan §6c Decision Log when deferring an update

4. Cross-reference: "For the full standards behind these checklists, see `.github/instructions/coding-standards.instructions.md`. For research rationale, see `docs/investigations/se-best-practices.md`."

**Expected output:** New WoW file with valid frontmatter and all five required sections.

**Requirement mapping:** "WoW file with checklist" from §2d.

**Verification:**
```powershell
Test-Path ".github/instructions/ways-of-working.instructions.md"
Select-String -Path ".github/instructions/ways-of-working.instructions.md" -Pattern "Pre-Implementation Checklist|Analyzer Expectations|Coverage Tracking|Code Review Quality Gate|Dependency Update Cadence" | Measure-Object
```
Expected result: File exists; count = 5 (all section headings present).

**Failure handling:** If YAML frontmatter validation fails (e.g., asset catalog schema requires additional fields), check the schema in `.github/planning/asset-catalog.md` and add missing fields.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — Create investigation doc |
| **Known blockers** | None |
| **Last updated** | — |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| — | — | — | — | — |

### Avoidance

(Append dated entries here. Do not delete prior guidance.)

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Install all 4 analyzers, suppress non-trivial violations in .editorconfig | Before Task 4.3 | 🟢 Active |
| 2 | If analyzer package count causes excessive noise, reduce to NetAnalyzers + StyleCop only | Before Task 4.3 | ⬜ Reserve |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)
- More than 20 rule suppressions needed → switch to Approach #2 (fewer analyzers)

---

## §6. Execution Log

(Populated during execution — timestamped entries of significant actions)

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

---

## §6c. Decision Log

(Record every decision made during execution with rationale.)

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

(Summarise at completion: what was achieved, what remains, lessons learned.)
