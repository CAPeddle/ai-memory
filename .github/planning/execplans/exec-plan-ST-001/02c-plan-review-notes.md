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
- 2026-05-05 — Resolution approved during `/plan`: revise Task 4.5 to use an explicit TDD red-green sequence, add `tests/AiMemory.Tests/SmokeTests.cs`, make the final xUnit v3 project executable via `<OutputType>Exe</OutputType>`, and broaden ST-001 so coding standards plus `/plan` and `/continue` prompts record the repo-wide TDD expectation.
- 2026-05-05T11:13:16.9060369+02:00 — Task 4.5 final verification (`dotnet test tests/AiMemory.Tests/AiMemory.Tests.csproj --no-build`) still failed after the approved red-green sequence completed as written:
  - Error: test execution aborted because `testhost.deps.json` could not resolve `Newtonsoft.Json` version `13.0.1` for the generated testhost process.
  - Gap: ExecPlan Task 4.5 defines the red-state xUnit executable-project failure and the green-state project shape, but it does not define the required package/runtime changes for this unexpected `dotnet test --no-build` host dependency failure.
  - Action: Escalated to plan-review; execution paused at Task 4.5 without further workaround attempts.
- 2026-05-05 — Resolution approved during `/plan`: keep `xunit.v3 3.2.2`, standardize `dotnet test` on the default VSTest bridge by adding `xunit.runner.visualstudio 3.1.5` and `Microsoft.NET.Test.Sdk 18.5.1`, keep `<OutputType>Exe</OutputType>`, and move the Task 4.5 TDD red checkpoint into `SmokeTests.cs` itself instead of relying on a planned configuration failure.
