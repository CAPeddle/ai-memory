---
title: A documented command silently breaks when its project is excluded from the build and CI
date: 2026-08-04
category: workflow-issues
module: governance-tooling
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "A project lives outside the main solution file but is documented in CLAUDE.md or AGENTS.md"
  - "Root Directory.Build.props exists and applies to all projects under the repo tree"
  - "No CI job executes `dotnet build` on tooling or auxiliary projects"
  - "TreatWarningsAsErrors is set and multiple analyzers are configured"
symptoms:
  - "A CLAUDE.md-documented command fails with analyzer violations after a period of neglect"
  - "Running `dotnet run --project tools/SomeTool` surfaces 20+ error CS, SA, or S violations on the first run in months"
  - "Violations list StyleCop, SonarAnalyzer, Meziantou, and NetAnalyzer findings accumulated across many commits"
  - "The command appeared to work at some earlier point; no one changed the project recently"
tags:
  - dotnet
  - analyzers
  - ci
  - governance
  - tooling
  - directory-build-props
---

# A documented command silently breaks when its project is excluded from the build and CI

## Context

`dotnet run --project tools/GovernanceAssetValidator -- validate .` is documented in CLAUDE.md as a command agents and developers should run to validate governance frontmatter. The command stopped building at HEAD despite the project code not having changed recently.

The failure mode: `tools/GovernanceAssetValidator/` was not in `src/AiMemory.sln`, and no CI job ran `dotnet build` on it. The root `Directory.Build.props` was present and configured `TreatWarningsAsErrors=true` with four analyzers (NetAnalyzers, StyleCop, SonarAnalyzer, Meziantou). Because nothing ever executed `dotnet build` on this project, the analyzers ran but their output was never checked — ~25 violations accumulated unobserved across many commits until the command failed completely on first use.

## What Didn't Work

**Version drift and environment investigation.** Initial diagnosis from CE code review named a P0 "SDK mismatch": `dotnet-version: '8.0.x'` in CI vs `rollForward: latestPatch` from `8.0.100` in `global.json`. This consumed investigation time checking `dotnet --list-sdks` and whether the SDK version resolved on the local machine was compatible.

This was the wrong path. SDK version was not the cause. The command failed on any machine with a valid SDK because the *project itself had accumulated analyzer violations*, not because the SDK version differed. `dotnet --list-sdks` resolving an `8.0.1xx` entry confirms the environment is not the problem — if you land here first, check whether the project is in the solution and in CI before investigating version resolution.

## Guidance

**Every project that a documentation file names as runnable must be in the solution file and in CI.**

A project outside the solution is a blind spot. `Directory.Build.props` applies to all projects in the repo tree regardless of solution membership — so a project inherits the analyzer configuration and `TreatWarningsAsErrors` that every other project in the repo builds under, but because nothing ever invokes `dotnet build` on it (either in the solution's build or in CI), violations accumulate without any signal.

When you add a project to `Directory.Build.props`'s coverage without adding it to the solution and CI:

```
Root Directory.Build.props
├── TreatWarningsAsErrors=true          ← applies to every project under /
├── NetAnalyzers                        ← applies to every project under /
├── StyleCop                            ← applies to every project under /
├── SonarAnalyzer                       ← applies to every project under /
└── Meziantou                           ← applies to every project under /

tools/GovernanceAssetValidator/         ← inherits all of the above
    (not in src/AiMemory.sln)           ← never built by `dotnet build src/`
    (no CI job)                         ← never enforced
    → violations accumulate silently
```

**The fix, applied to ST-089:**

1. **No suppressions.** The violations were fixed structurally: `Program.cs` went from 457 lines (a single file containing all types) to a thin entry-point stub, with each type extracted to its own file. No `NoWarn` flags, no new `.editorconfig` suppressions. Suppressions would recreate the exclusion at the code level.

2. **Add to the solution.** Add the project reference to `src/AiMemory.sln` so `dotnet build src/AiMemory.sln` covers it.

3. **Wire a CI job.** A `dotnet-build` job in `.github/workflows/ci.yml` that runs `dotnet build src/AiMemory.sln` now enforces the analyzer rules on every push.

4. **Verify locally before committing.** After adding to the solution: `dotnet build src/AiMemory.sln` should exit 0. If it exits 1 with analyzer violations, fix them structurally — do not add suppression attributes or `<NoWarn>` entries.

## Why This Matters

A documented command that fails silently is worse than an undocumented one. An agent or developer following CLAUDE.md will run the command, hit the failure, and spend time on environment diagnosis (SDK version, global.json, rollForward policy) before realising the project itself is the problem. The violations in this case accumulated to ~25 across StyleCop, SonarAnalyzer, Meziantou, and NetAnalyzers because the project was edited over many commits with no feedback loop.

CI enforcement is what makes `TreatWarningsAsErrors=true` meaningful for auxiliary projects. Without it, the setting exists in name only for any project outside the solution.

## When to Apply

- When adding a new project under the repo root that will be referenced in CLAUDE.md, AGENTS.md, or any runnable-commands section of project documentation
- When auditing existing documentation commands: check that every `dotnet run --project <path>` target appears in the solution (`grep -r '<path>' src/*.sln`)
- When a `dotnet run --project tools/SomeTool` command starts failing with a large batch of analyzer violations — the project likely accumulated violations while outside the enforced build path

**Quick audit:**
```bash
# Find dotnet run --project references in project docs
grep -r "dotnet run --project" CLAUDE.md AGENTS.md .github/ docs/ 2>/dev/null

# Confirm each referenced project is in the solution
dotnet sln src/AiMemory.sln list
```

## Examples

**Before (silent accumulation):**
```xml
<!-- src/AiMemory.sln — project NOT listed -->
<!-- tools/GovernanceAssetValidator/GovernanceAssetValidator.csproj — absent -->

<!-- CI: no dotnet-build job -->
```

Running `dotnet run --project tools/GovernanceAssetValidator -- validate .` after several months:
```
error SA1101: Prefix local calls with this. (×8)
error S1172: Remove unused parameter. (×3)
error MA0004: Use ConfigureAwait(false). (×6)
...
Build FAILED — 25 error(s)
```

**After (enforced):**
```xml
<!-- src/AiMemory.sln -->
Project("{...}") = "GovernanceAssetValidator",
  "..\..\tools\GovernanceAssetValidator\GovernanceAssetValidator.csproj", "{...}"
EndProject
```

```yaml
# .github/workflows/ci.yml
- name: Build
  run: dotnet build src/AiMemory.sln
```

`dotnet build src/AiMemory.sln` now catches violations on every CI run. The validate command builds and exits 0.

## Related

- `docs/solutions/workflow-issues/verification-expires-when-the-verified-surface-changes.md` — companion failure mode: a verification result expiring when the surface it covered changes
- ST-089 (story): GovernanceAssetValidator excluded from solution and CI
- ST-090 (story): Seven frontmatter gaps cleared after the validator was unblocked
