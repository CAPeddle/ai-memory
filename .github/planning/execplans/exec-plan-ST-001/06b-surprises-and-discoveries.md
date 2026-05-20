## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

- Observation: `global.json` pin to SDK 8.0.100 immediately prevents `dotnet` command execution when only SDK 10.x is installed.
  Evidence: `dotnet --version` returned "A compatible .NET SDK was not found" and listed installed SDKs 10.0.107, 10.0.203.
  Impact: Task 4.1 cannot be marked complete until .NET 8 SDK is installed.

- Observation: A global gitignore rule (`C:/Users/cpeddle/.gitignore_global:*.props`) ignored `Directory.Build.props`.
  Evidence: `git check-ignore -v Directory.Build.props` output matched the global rule.
  Impact: Task 4.2 required a force-add commit to keep required artifact under version control.

- Observation: `dotnet build` on a zero-dependency project can still fail when machine-level NuGet config includes inaccessible authenticated feeds.
  Evidence: Task 4.3 failed in `NuGet.targets` loading `https://pkgs.dev.azure.com/kubusinfo/_packaging/Shared-Resources/nuget/v3/index.json` with `401`.
  Impact: Execution cannot proceed without either feed authentication or a plan-approved restore-source override strategy.

- Observation: The approved `xunit.v3 3.2.2` test project boilerplate is incomplete because xUnit v3 test projects must set `<OutputType>Exe</OutputType>`.
  Evidence: Task 4.5 restore succeeded, but build failed in `xunit.v3.core.mtp-v1.targets` with `xUnit.net v3 test projects must be executable (set project property '<OutputType>Exe</OutputType>')`.
  Impact: ST-001 cannot satisfy the `dotnet build` / `dotnet test` acceptance path until Task 4.5 or its boilerplate is revised under `/plan`.
