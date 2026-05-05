## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.7 — Update board and session log |
| **Last successful command** | `Select-String -Path ".github/planning/story-board.md" -Pattern "ST-001"` |
| **Expected outputs produced** | ST-001 moved to `## Review` on the board with completed acceptance criteria and a `Completed` date; `FollowUpSessionLog.txt` updated to the current session state and resume guidance |
| **Next task** | Story execution complete — awaiting PO review/acceptance in board `Review` |
| **Known blockers** | None |
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
| 2026-05-05T11:13:16.9060369+02:00 | Task 4.5 | blocked | `dotnet build tests/AiMemory.Tests/AiMemory.Tests.csproj --no-restore` succeeded after adding `<OutputType>Exe</OutputType>`, but both `dotnet test tests/AiMemory.Tests/AiMemory.Tests.csproj --no-build` attempts aborted because `testhost.deps.json` could not resolve `Newtonsoft.Json` version `13.0.1` | Escalate to plan-review and pause execution |
| 2026-05-05T11:13:16.9060369+02:00 | Plan-review | resolved | Query packet and ExecPlan updated: Task 4.5 now uses xunit.v3 + `xunit.runner.visualstudio` + `Microsoft.NET.Test.Sdk` boilerplate, and red-green moves to smoke-test content | Resume at Task 4.5 |
| 2026-05-05T11:51:04.5355607+02:00 | Task 4.5 | completed | Restore/build succeeded with revised test-project packages; red checkpoint produced exactly one failing smoke test; final green-state build/test succeeded with 1 passed, 0 failed | Start Task 4.5a |
| 2026-05-05T11:53:14.2365999+02:00 | Task 4.5a | completed | `Select-String` verification confirmed the new TDD guidance in coding standards plus `/plan` and `/continue` prompts | Start Task 4.6 |
| 2026-05-05T11:55:58.7568326+02:00 | Task 4.6 | completed | Removed root solution file, created `src/AiMemory.sln`, added Core/Server/Tests, and solution restore/build/test passed (1/1 smoke tests) | Start Task 4.7 |
| 2026-05-05T11:58:05.0828790+02:00 | Task 4.7 | completed | Board updated with ST-001 in Review and completed criteria; session log replaced with ST-001 execution outcomes and resume guidance | Await PO review/acceptance |
| — | — | — | — | — |

### Avoidance

- 2026-05-05: Use the repo-local `NuGet.config` together with explicit `--configfile NuGet.config --source https://api.nuget.org/v3/index.json` on every restore command in ST-001. If any restore still contacts a private feed, stop and escalate.
- 2026-05-05: Follow the revised Task 4.5 boilerplate exactly, including `xunit.runner.visualstudio` and `Microsoft.NET.Test.Sdk`; do not substitute an MTP-specific config path unless a new plan-review explicitly approves it.
- 2026-05-05: In revised Task 4.5, the red checkpoint is one intentionally failing smoke test result, not a project-configuration failure. Treat host/discovery/package aborts during the red run as blockers.
