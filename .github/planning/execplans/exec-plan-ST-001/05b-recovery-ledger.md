## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.4 — Create AiMemory.Server project |
| **Last successful command** | `dotnet build src/AiMemory.Server/AiMemory.Server.csproj --no-restore` |
| **Expected outputs produced** | `global.json`, `Directory.Build.props`, `NuGet.config`, `src/AiMemory.Core/AiMemory.Core.csproj`, `src/AiMemory.Core/IMemoryService.cs`, `src/AiMemory.Server/AiMemory.Server.csproj`, `src/AiMemory.Server/Program.cs`, and a draft `tests/AiMemory.Tests/AiMemory.Tests.csproj`; Core and Server restore/build paths verified, and the revised TDD-based Task 4.5 path is now defined |
| **Next task** | Task 4.5 — Create AiMemory.Tests project via TDD red-green |
| **Known blockers** | None — the revised plan now defines the xUnit v3 executable project shape, the smoke test, and the expected red-green sequence |
| **Last updated** | 2026-05-05 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-05T08:57:07.0701489+02:00 | Task 4.1 | blocked | `global.json` created; verification failed with "A compatible .NET SDK was not found" (installed: 10.0.107, 10.0.203) | Install .NET 8 SDK and re-run Task 4.1 verification |
| 2026-05-05T09:06:32.0010060+02:00 | Task 4.1 | completed | `Test-Path global.json` returned `True`; `dotnet --version` returned `8.0.100` | Start Task 4.2 |
| 2026-05-05T09:07:22.3438562+02:00 | Task 4.2 | completed | `Test-Path Directory.Build.props` returned `True`; `Select-String` returned 5 required property matches | Start Task 4.3 |
| 2026-05-05T09:11:22.1510882+02:00 | Task 4.3 | blocked | `dotnet build src/AiMemory.Core/AiMemory.Core.csproj` failed with `401 Unauthorized` on private NuGet feed `pkgs.dev.azure.com/kubusinfo/...` | Escalate to plan-review and pause execution |
| 2026-05-05T10:06:41.9216168+02:00 | Task 4.2a | completed | `Test-Path NuGet.config` returned `True`; `Select-String` matched `<clear />` and `https://api.nuget.org/v3/index.json` | Start Task 4.3 |
| 2026-05-05T10:09:24.7224770+02:00 | Task 4.3 | completed | `src/AiMemory.Core` already matched boilerplate; `dotnet restore ... --configfile NuGet.config --source https://api.nuget.org/v3/index.json` and `dotnet build ... --no-restore` succeeded with 0 warnings and 0 errors | Start Task 4.4 |
| 2026-05-05T10:10:40.0349555+02:00 | Task 4.4 | completed | `dotnet restore src/AiMemory.Server/AiMemory.Server.csproj --configfile NuGet.config --source https://api.nuget.org/v3/index.json` returned `RESTORE_OK`; `dotnet build src/AiMemory.Server/AiMemory.Server.csproj --no-restore` succeeded with 0 warnings and 0 errors | Start Task 4.5 |
| 2026-05-05T10:11:56.7076569+02:00 | Task 4.5 | blocked | `dotnet restore tests/AiMemory.Tests/AiMemory.Tests.csproj --configfile NuGet.config --source https://api.nuget.org/v3/index.json` returned `RESTORE_OK`; `dotnet build tests/AiMemory.Tests/AiMemory.Tests.csproj --no-restore` failed because xUnit v3 requires `<OutputType>Exe</OutputType>` | Escalate to plan-review and pause execution |
| — | — | — | — | — |

### Avoidance

- 2026-05-05: Use the repo-local `NuGet.config` together with explicit `--configfile NuGet.config --source https://api.nuget.org/v3/index.json` on every restore command in ST-001. If any restore still contacts a private feed, stop and escalate.
- 2026-05-05: Do not add `<OutputType>Exe</OutputType>` or alter the pinned xUnit test package layout in `tests/AiMemory.Tests/AiMemory.Tests.csproj` without a plan-approved Task 4.5 revision.
- 2026-05-05: In revised Task 4.5, the initial test-project build failure is intentional. Treat only a failure message other than the expected xUnit executable-project error as a blocker.
