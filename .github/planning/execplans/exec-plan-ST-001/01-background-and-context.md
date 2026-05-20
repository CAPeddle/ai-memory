## §1. Background & Context

The ai-memory repository currently contains only governance and investigation documents — no .NET source code exists yet. Every subsequent feature story (ST-002 through ST-010) depends on a compilable solution structure being in place.

After this story completes, a developer (or agent running `/continue`) can:
- Run `dotnet build src/AiMemory.sln` and get a clean zero-warning build.
- Run `dotnet test src/AiMemory.sln` and get a passing (zero-test) run.
- Open the solution in any .NET IDE and see three projects wired together correctly.
- Restore packages deterministically without inheriting unauthorized machine-level private NuGet feeds.

Current execution state relevant to this revision:
- `global.json` and `Directory.Build.props` were already created and committed during `/continue`.
- `src/AiMemory.Core/AiMemory.Core.csproj` and `src/AiMemory.Core/IMemoryService.cs` were created before Task 4.3 blocked and are now part of the story state.
- Task 4.3 failed because restore attempted a machine-level Azure Artifacts source that returned `401 Unauthorized`.
- A stray root `ai-memory.sln` exists in the working tree and is not part of the approved ST-001 deliverables.

**Project layout this story creates:**
```
(repo root)
├── global.json                         ← SDK pin: .NET 8.0.100+
├── Directory.Build.props               ← shared: C# 12, net8.0, nullable, implicit usings
├── NuGet.config                        ← repo-local package source policy (`nuget.org` only)
├── src/
│   ├── AiMemory.sln                    ← solution file
│   ├── AiMemory.Core/
│   │   ├── AiMemory.Core.csproj        ← class library, zero dependencies
│   │   └── IMemoryService.cs           ← placeholder marker interface
│   └── AiMemory.Server/
│       ├── AiMemory.Server.csproj      ← web SDK, references Core
│       └── Program.cs                  ← minimal web host shell
└── tests/
    └── AiMemory.Tests/
        └── AiMemory.Tests.csproj       ← xunit.v3, FluentAssertions, NSubstitute, references Core
```

**Key constraints from design authority:**
- `AiMemory.Core` must have **zero** framework or NuGet dependencies (pure domain).
- `AiMemory.Server` depends on Core via `<ProjectReference>` — never the reverse.
- Nullable reference types are treated as errors (`<TreatWarningsAsErrors>true`).
- All shared compiler settings live in a single `Directory.Build.props` at repo root.
- Package restore must be isolated from inherited machine-level private feeds by a repo-local `NuGet.config` and explicit restore commands.
