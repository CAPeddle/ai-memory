### Coverage tooling
- Package: `coverlet.collector` added to `tests/AiMemory.Tests/AiMemory.Tests.csproj`
- Collection command: `dotnet test --collect:"XPlat Code Coverage"`
- Output format: Cobertura XML (`coverage.cobertura.xml`) under `TestResults/`
- Results directory: excluded from version control via `.gitignore`

