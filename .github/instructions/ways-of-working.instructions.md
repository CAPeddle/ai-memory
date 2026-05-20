---
name: "Ways of Working"
summary: "Operational checklists, linting expectations, and quality gates for ai-memory development"
asset_type: "instruction"
status: "active"
owners:
  - "ai-memory-maintainers"
source_path: ".github/instructions/ways-of-working.instructions.md"
---

# Ways of Working — ai-memory

## Pre-Implementation Checklist

Before starting any implementation task:

- [ ] Read the ExecPlan task definition completely before writing code
- [ ] Identify which interfaces and design patterns apply (check `coding-standards.instructions.md` §Design Patterns)
- [ ] Write the failing test first (TDD red step) before any production code
- [ ] Confirm the new code respects SRP: one class = one responsibility
- [ ] Check for existing utilities/helpers that avoid code duplication (DRY)

## Analyzer Expectations

- All four analyzers (NetAnalyzers, StyleCop, SonarAnalyzer, Meziantou) run on every `dotnet build`
- `TreatWarningsAsErrors` is enabled — code must pass all analyzer rules to compile
- Suppressed rules are documented in `.editorconfig` with justification comments
- Before suppressing a rule, attempt to fix the violation first
- New suppressions must be logged in the active ExecPlan §6b Surprises & Discoveries

## Coverage Tracking

- Run coverage with: `dotnet test --collect:"XPlat Code Coverage"`
- Coverage reports are generated but do not gate the build
- Focus coverage on critical paths: search logic, repository operations, API validation
- Do not write tests solely to increase coverage numbers — tests must validate behaviour

## Code Review Quality Gate (Advisory)

Before moving work to Review:

- [ ] All tests pass: `dotnet test`
- [ ] No analyzer suppressions added without documentation
- [ ] New public APIs have XML doc comments
- [ ] No `// TODO` left without a linked story or explanation
- [ ] DRY check: no duplicated logic blocks > 5 lines across files

## Dependency Update Cadence

- Monthly: run `dotnet list package --outdated` from `src/` and review updates
- Security: apply CVE-flagged updates within 48 hours of disclosure
- Major version bumps: create a new story for migration (never inline during feature work)
- Record decisions in ExecPlan §6c Decision Log when deferring an update

---

For the full standards behind these checklists, see `.github/instructions/coding-standards.instructions.md`.
For research rationale, see `docs/investigations/se-best-practices.md`.
