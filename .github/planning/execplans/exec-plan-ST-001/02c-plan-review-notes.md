## §2c. Plan Review Notes

- 2026-05-05T09:11:22.1510882+02:00 — Task 4.3 verification (`dotnet build src/AiMemory.Core/AiMemory.Core.csproj`) failed due an environment-level private NuGet feed authentication error:
  - Source: `https://pkgs.dev.azure.com/kubusinfo/_packaging/Shared-Resources/nuget/v3/index.json`
  - Error: `401 (Unauthorized)` from NuGet restore in `NuGet.targets`
  - Gap: ExecPlan failure handling for Task 4.3 covers SDK/nullable issues only; it does not define behavior for machine-level NuGet source auth conflicts.
  - Action: Escalated to plan-review; execution paused at Task 4.3.
- 2026-05-05 — Resolution drafted during `/plan`: add Task 4.2a for repo-local `NuGet.config`, use explicit restore commands before build/test, clean up stray root `ai-memory.sln`, and resume `/continue` from Task 4.2a.
- 2026-05-05T10:11:56.7076569+02:00 — Task 4.5 verification (`dotnet build tests/AiMemory.Tests/AiMemory.Tests.csproj --no-restore`) failed after a successful restore because the approved `AiMemory.Tests.csproj` boilerplate omits an xUnit v3 requirement:
  - Error: `xUnit.net v3 test projects must be executable (set project property '<OutputType>Exe</OutputType>')`
  - Gap: ExecPlan Task 4.5 pins `xunit.v3 3.2.2` but does not define the required `<OutputType>Exe</OutputType>` setting or any alternative package layout.
  - Action: Escalated to plan-review; execution paused at Task 4.5.
