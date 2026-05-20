# Query Packet — ST-001: Scaffold .NET solution and project structure

> Story: ST-001
> Created: 2026-05-04
> Updated: 2026-05-05 (plan-review remediation + TDD + test-runner correction scoped)
> Source: PO scoping during `/plan`
> Status: Approved — revised Phase 2 ExecPlan ready for /continue

## Intent

Create the foundational .NET solution structure that all subsequent ai-memory stories build upon. After this story, `dotnet build` compiles cleanly and `dotnet test` executes one passing placeholder smoke test. The structure enforces C# 12, .NET 8, nullable-as-errors, and implicit usings through a central `Directory.Build.props`.

Plan-review trigger on 2026-05-05: execution of Task 4.3 failed because the machine environment injects an authenticated private NuGet feed (`pkgs.dev.azure.com/kubusinfo/...`) that returned `401 Unauthorized` during restore. The remediation must make ST-001 deterministic at the repository level without depending on machine-specific feed authentication.

Second plan-review trigger on 2026-05-05: execution of Task 4.5 failed after restore because xUnit v3 test projects must be executable. The PO also directed that ST-001 testing follow TDD principles: encode an explicit red-green sequence, add one pure placeholder smoke test, and capture TDD as a broader repo expectation in coding standards plus the `/plan` and `/continue` prompts.

Third plan-review trigger on 2026-05-05: the revised Task 4.5 completed the executable-project change, but `dotnet test --no-build` still aborted because the generated testhost dependency graph could not resolve `Newtonsoft.Json` 13.0.1. The remediation must correct the earlier assumption that `xunit.v3` alone is sufficient for deterministic `dotnet test` execution on the pinned .NET 8 SDK path.

## Collaborative Scoping Decisions (2026-05-04)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Solution file location | `src/AiMemory.sln` | PO preference; keeps src/ self-contained |
| Directory.Build.props location | Repo root | Single file covers both `src/` and `tests/` project trees |
| Server project shape | Empty web app shell (`Program.cs` with `builder.Build()` + `app.Run()`) | Confirms the host runs; later stories add endpoints |
| Core project content | One placeholder file (`IMemoryService.cs` marker interface) | Ensures project compiles with at least one type |
| Test project packages | xunit.v3 3.2.2 + FluentAssertions 8.9.0 + NSubstitute 5.3.0 | Matches coding-standards; enables `dotnet test` immediately |
| NuGet scope | Pinned versions; no app-specific packages (MCP SDK, Sqlite added by later stories) | Keeps scope tight to ST-001 acceptance criteria |
| xUnit version | xunit.v3 (3.2.2) | v2 is deprecated; v3 uses Microsoft Testing Platform natively — no separate runner/SDK needed |
| FluentAssertions license | 8.9.0 (Xceed license) | Free for open-source; ai-memory is open-source |
| SDK pin | global.json at repo root, SDK 8.0.100, rollForward: latestPatch | Keeps builds on .NET 8 LTS |

## Plan-Review Remediation Decisions (2026-05-05)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| NuGet remediation scope | Commit `NuGet.config` as part of ST-001 | Package source policy becomes a tracked, reproducible repo artifact |
| NuGet source policy | Repo-local `NuGet.config` with `<clear />` and `nuget.org` only | Prevents inherited machine-level private feeds from breaking restore |
| Restore determinism | Use both committed `NuGet.config` and explicit restore commands in the ExecPlan | Keeps behavior explicit for a stateless executor |
| Resume shape | Add a dedicated remediation task before retrying Task 4.3 | Preserves completed Tasks 4.1 and 4.2 with a clear audit trail |
| Solution hygiene | Validate and clean up stray root `ai-memory.sln` if present | The approved solution path remains `src/AiMemory.sln` only |
| Board unblock timing | Clear `blocked_by: plan-review` immediately after revised plan approval | Lets `/continue` resume against the updated ExecPlan |
| Test project shape | Keep `xunit.v3 3.2.2`, but final `AiMemory.Tests.csproj` must set `<OutputType>Exe</OutputType>` | Required by xUnit v3 test-host behavior |
| Placeholder test scope | Add one pure smoke test that does not reference domain types | Proves discovery/execution without widening ST-001 into behavior design |
| TDD execution style | Task 4.5 must encode an explicit red-green sequence | PO requirement: testing should follow TDD principles |
| Governance capture | Broaden ST-001 to update coding standards plus `/plan` and `/continue` prompts | Record the repo-wide TDD expectation immediately rather than deferring it |

## Third Plan-Review Remediation Decisions (2026-05-05)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `dotnet test` runner path | Keep `xunit.v3 3.2.2`, and add `xunit.runner.visualstudio 3.1.5` plus `Microsoft.NET.Test.Sdk 18.5.1` to `AiMemory.Tests.csproj` | The pinned .NET 8 SDK uses VSTest for `dotnet test` by default; xUnit v3 docs recommend these packages for broad tooling compatibility on that path |
| Executable test-project shape | Keep `<OutputType>Exe</OutputType>` in the final test project | xUnit v3 projects remain stand-alone executables even when `dotnet test` runs through the VSTest bridge |
| TDD red checkpoint | Move the red step into `SmokeTests.cs` so the first `dotnet test` run completes with one failing assertion | Makes the red step a genuine test-first checkpoint instead of a configuration failure |
| MTP scope | Do not enable `TestingPlatformDotnetTestSupport`, `UseMicrosoftTestingPlatformRunner`, or other MTP-specific config in ST-001 | Avoids extra SDK-wide configuration while keeping the scaffold deterministic on the approved .NET 8 flow |
| Assumption correction | Update the query packet and ExecPlan anywhere they implied `xunit.v3` alone was enough for `dotnet test` | Prevents later `/continue` runs from repeating the invalid test-host assumption |

## Deliverables

1. `global.json` at repo root — pins .NET SDK to 8.0.100+ with latestPatch roll-forward
2. `Directory.Build.props` at repo root — sets LangVersion, TargetFramework, Nullable, ImplicitUsings, TreatWarningsAsErrors
3. `NuGet.config` at repo root — clears inherited package sources and allows only `nuget.org`
4. `src/AiMemory.sln` — references all three projects
5. `src/AiMemory.Core/AiMemory.Core.csproj` — class library, no dependencies
6. `src/AiMemory.Core/IMemoryService.cs` — placeholder marker interface
7. `src/AiMemory.Server/AiMemory.Server.csproj` — web SDK project, references Core
8. `src/AiMemory.Server/Program.cs` — minimal empty web host
9. `tests/AiMemory.Tests/AiMemory.Tests.csproj` — executable xunit.v3 test project that references Core and includes the VSTest bridge packages required for `dotnet test` on the pinned .NET 8 SDK
10. `tests/AiMemory.Tests/SmokeTests.cs` — one placeholder smoke test used in the TDD red-green path
11. `.github/instructions/coding-standards.instructions.md` — testing section updated to state the repo-wide TDD expectation
12. `.github/prompts/plan.prompt.md` — planning guidance updated to require explicit TDD sequencing for test-bearing work
13. `.github/prompts/continue.prompt.md` — execution guidance updated to require following planned red-green steps in order

## Scope

**In scope:**
- Solution, projects, props, global.json, repo-local `NuGet.config`, and minimal compilable source
- `dotnet build` and `dotnet test` pass from the solution root, with `dotnet test` executing one placeholder smoke test
- Explicit restore isolation from machine-level private package feeds
- Cleanup/validation so `src/AiMemory.sln` is the only solution file path produced by ST-001
- Coding standards plus `/plan` and `/continue` prompts capture the repo-wide TDD expectation

**Out of scope:**
- Any domain logic, endpoints, or database code
- CI/CD pipeline (no GitHub Actions)
- Docker or deployment artifacts
- NuGet packages beyond test infrastructure
- Changes to `.github/copilot-instructions.md` or backlog reprioritisation beyond the ST-001 board entry

## Design Constraints for Phase 2

1. `AiMemory.Core` must have **zero** package references (pure domain).
2. `AiMemory.Server` must reference `AiMemory.Core` via `<ProjectReference>`.
3. `AiMemory.Tests` must reference `AiMemory.Core` via `<ProjectReference>`.
4. `Directory.Build.props` must set `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` for nullable.
5. Namespace root: `AiMemory` (matches folder structure).
6. `AiMemory.Tests.csproj` must keep `<OutputType>Exe</OutputType>` and include `xunit.runner.visualstudio 3.1.5` plus `Microsoft.NET.Test.Sdk 18.5.1` so `dotnet test` works on the pinned .NET 8 SDK path.
7. `NuGet.config` must contain `<clear />` and a single `nuget.org` source entry.
8. Restore/build/test commands in the ExecPlan must use explicit restore commands and `--no-restore` or `--no-build` follow-ups where practical.
9. `src/AiMemory.sln` remains the only valid solution path; a root `ai-memory.sln` is treated as stray and must be removed if present.
10. Task 4.5 must use the final deterministic test-project shape from the start, and the explicit red checkpoint must come from a failing smoke test execution rather than a configuration error.
11. The placeholder smoke test must remain pure scaffolding; it should not reference `AiMemory.Core` types or assert domain behaviour.
12. ST-001 must update `.github/instructions/coding-standards.instructions.md`, `.github/prompts/plan.prompt.md`, and `.github/prompts/continue.prompt.md` to record the repo-wide TDD expectation.
13. ST-001 must not add MTP-specific `dotnet test` configuration, because the approved runner path for this scaffold is the default VSTest bridge.

## Risks

- Machine-level NuGet config can still surprise execution if the revised plan does not force repo-local source selection consistently.
- A stray root `ai-memory.sln` could mislead later tooling or reviewers if the revised plan does not validate and clean it up.
- Broadening ST-001 to governance docs increases drift risk unless the revised ExecPlan specifies exact insertion points and text for the TDD guidance updates.
- Test-runner assumptions can drift again unless the revised plan encodes the chosen xUnit v3 plus VSTest bridge shape explicitly in both boilerplate and failure handling.

## Recommended Next Step

Phase 2 revised again: update `.github/planning/execplans/exec-plan-ST-001.md` so Task 4.5 uses the deterministic xUnit v3 plus VSTest bridge project shape, shifts the explicit TDD red-green sequence into `SmokeTests.cs`, and keeps the governance-doc TDD updates already in scope before `/continue` resumes.
