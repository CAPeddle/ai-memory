# Query Packet — ST-001: Scaffold .NET solution and project structure

> Story: ST-001
> Created: 2026-05-04
> Updated: 2026-05-04 (Phase 1 scoping complete)
> Source: PO scoping during `/plan`
> Status: Scoped — Phase 2 ExecPlan authored

## Intent

Create the foundational .NET solution structure that all subsequent ai-memory stories build upon. After this story, `dotnet build` compiles cleanly and `dotnet test` executes (with zero tests passing trivially). The structure enforces C# 12, .NET 8, nullable-as-errors, and implicit usings through a central `Directory.Build.props`.

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

## Deliverables

1. `global.json` at repo root — pins .NET SDK to 8.0.100+ with latestPatch roll-forward
2. `Directory.Build.props` at repo root — sets LangVersion, TargetFramework, Nullable, ImplicitUsings, TreatWarningsAsErrors
3. `src/AiMemory.sln` — references all three projects
4. `src/AiMemory.Core/AiMemory.Core.csproj` — class library, no dependencies
5. `src/AiMemory.Core/IMemoryService.cs` — placeholder marker interface
6. `src/AiMemory.Server/AiMemory.Server.csproj` — web SDK project, references Core
7. `src/AiMemory.Server/Program.cs` — minimal empty web host
8. `tests/AiMemory.Tests/AiMemory.Tests.csproj` — xunit.v3 project, references Core

## Scope

**In scope:**
- Solution, projects, props, global.json, and minimal compilable source
- `dotnet build` and `dotnet test` pass from the solution root

**Out of scope:**
- Any domain logic, endpoints, or database code
- CI/CD pipeline (no GitHub Actions)
- Docker or deployment artifacts
- NuGet packages beyond test infrastructure

## Design Constraints for Phase 2

1. `AiMemory.Core` must have **zero** package references (pure domain).
2. `AiMemory.Server` must reference `AiMemory.Core` via `<ProjectReference>`.
3. `AiMemory.Tests` must reference `AiMemory.Core` via `<ProjectReference>`.
4. `Directory.Build.props` must set `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` for nullable.
5. Namespace root: `AiMemory` (matches folder structure).
6. xunit.v3 does not require Microsoft.NET.Test.Sdk or xunit.runner.visualstudio.

## Risks

- None significant; this is deterministic scaffolding with no external dependencies beyond the .NET 8 SDK.

## Recommended Next Step

Phase 2 complete: `.github/planning/execplans/exec-plan-ST-001.md` authored and marked Ready.
