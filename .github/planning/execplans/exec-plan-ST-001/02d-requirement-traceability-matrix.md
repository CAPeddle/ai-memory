## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Solution builds with `dotnet build` (board AC) | `src/AiMemory.sln` references all projects; all compile | Task 4.6 | `dotnet build src/AiMemory.sln` exit 0 |
| Three projects exist (board AC) | Core, Server, Tests `.csproj` files | Tasks 4.3, 4.4, 4.5 | `Test-Path` for each csproj |
| Directory.Build.props sets C# 12, .NET 8, nullable, implicit usings (board AC) | `Directory.Build.props` at repo root | Task 4.2 | `Select-String` for all five properties |
| `dotnet test` runs and executes a placeholder smoke test (board AC, PO remediation choice) | Final executable `tests/AiMemory.Tests/AiMemory.Tests.csproj` and `tests/AiMemory.Tests/SmokeTests.cs` | Tasks 4.5, 4.6 | `dotnet test src/AiMemory.sln` exit 0 and reports 1 test passed |
| SDK pinned to .NET 8 (PO decision) | `global.json` at repo root | Task 4.1 | `dotnet --version` returns 8.0.x |
| Repo-local package source policy excludes inherited private feeds (plan-review resolution) | `NuGet.config` at repo root with `<clear />` + `nuget.org` only | Task 4.2a | `Select-String` confirms source entries; restore commands use `--configfile NuGet.config --source https://api.nuget.org/v3/index.json` |
| Core has zero dependencies (coding standards) | `AiMemory.Core.csproj` has no `<PackageReference>` | Task 4.3 | Inspect csproj — no PackageReference elements |
| Server references Core (coding standards) | `AiMemory.Server.csproj` has `<ProjectReference>` to Core | Task 4.4 | Inspect csproj content |
| Tests follow the approved TDD scaffold path (PO remediation choice) | Task 4.5 includes an explicit red checkpoint before the final green-state test-project file and smoke test | Task 4.5 | Expected failing build message observed before final green-state build/test succeeds |
| Repo guidance states that testing follows TDD principles (PO remediation choice) | `.github/instructions/coding-standards.instructions.md`, `.github/prompts/plan.prompt.md`, `.github/prompts/continue.prompt.md` | Task 4.5a | `Select-String` finds the inserted TDD guidance in all three files |
| Only `src/AiMemory.sln` exists as the ST-001 solution path (PO scope lock) | Root `ai-memory.sln` absent; `src/AiMemory.sln` present | Task 4.6 | `Test-Path ai-memory.sln` is `False`; `Test-Path src/AiMemory.sln` is `True` |
