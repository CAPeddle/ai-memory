## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

- After running `dotnet build src/AiMemory.sln`, the build succeeds with exit code 0 and zero warnings.
- After running `dotnet test src/AiMemory.sln`, the command exits 0 and reports one passing placeholder smoke test.
- After inspecting project files, three `.csproj` files exist: `src/AiMemory.Core/AiMemory.Core.csproj`, `src/AiMemory.Server/AiMemory.Server.csproj`, `tests/AiMemory.Tests/AiMemory.Tests.csproj`.
- After inspecting `tests/AiMemory.Tests/AiMemory.Tests.csproj`, it sets both `<IsTestProject>true</IsTestProject>` and `<OutputType>Exe</OutputType>`.
- After inspecting `tests/AiMemory.Tests/SmokeTests.cs`, one pure smoke test exists for placeholder execution coverage.
- After inspecting `Directory.Build.props`, it sets C# 12, .NET 8, nullable enabled, implicit usings enabled, and TreatWarningsAsErrors true.
- After inspecting `NuGet.config`, it contains `<clear />` and only `https://api.nuget.org/v3/index.json` as a package source.
- After checking the repo root, `ai-memory.sln` does not exist and the only solution file path is `src/AiMemory.sln`.
- After inspecting `.github/instructions/coding-standards.instructions.md`, `.github/prompts/plan.prompt.md`, and `.github/prompts/continue.prompt.md`, each file records the repo-wide TDD expectation in its testing or rules guidance.
- After checking the board, ST-001 is moved to Review with the ExecPlan path linked.
