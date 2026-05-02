# Coding Standards — ai-memory

## Language & Framework

- **C# 12** on **.NET 8+**
- Nullable reference types: enabled (treat warnings as errors)
- Implicit usings: enabled
- Target framework: `net8.0`

## Project Structure

```
src/
├── AiMemory.Core/          # Domain models, interfaces, services (no framework deps)
├── AiMemory.Server/        # ASP.NET Core host, REST endpoints, MCP server
tests/
├── AiMemory.Tests/         # Unit + integration tests (xUnit)
```

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Namespace | PascalCase, match folder | `AiMemory.Core.Services` |
| Class/Interface | PascalCase | `MemoryRepository`, `ISearchService` |
| Interface | I-prefix | `IMemoryRepository` |
| Method | PascalCase | `SearchAsync` |
| Property | PascalCase | `CreatedAt` |
| Parameter | camelCase | `projectFilter` |
| Private field | _camelCase | `_connectionString` |
| Const | PascalCase | `DefaultSearchLimit` |
| Async method | Suffix with Async | `GetByIdAsync` |

## Architecture Rules

- **Core has zero framework dependencies** — no ASP.NET, no MCP SDK references
- **Server depends on Core** — never the reverse
- **All I/O is async** — use `ValueTask<T>` for hot paths, `Task<T>` elsewhere
- **Dependency injection everywhere** — register in `Program.cs`, inject via constructor
- **No static state** — everything is injectable and testable

## Database Access

- Use `Microsoft.Data.Sqlite` directly (no ORM)
- Connection management via `IDbConnectionFactory`
- Parameterised queries only — never string interpolation for SQL
- Wrap multi-statement operations in explicit transactions

## Error Handling

- Use exceptions for exceptional situations only
- Use `Result<T>` pattern or return types for expected failures
- At API boundary: catch and map to RFC 7807 Problem Details
- Never swallow exceptions silently — log at minimum

## Testing

- Framework: xUnit
- Assertions: FluentAssertions
- Mocking: NSubstitute
- Use in-memory SQLite (`:memory:`) for repository tests
- Name tests: `MethodName_Scenario_ExpectedResult`
- One assertion per test (logical, not literal)

## REST API Style

- Minimal API (not controllers)
- Route prefix: `/api/v1/`
- Response envelope: `{ data, meta, errors }`
- Dates: ISO 8601 UTC (`2025-05-02T14:30:00Z`)
- IDs: ULID format (26 chars, Crockford Base32)

## MCP Style

- Tool names: snake_case (`memory_search`, `memory_log_episode`)
- Resource URIs: `memory://` scheme
- Use `ModelContextProtocol.AspNetCore` for HTTP transport
- Tools call the same `IMemoryService` as REST endpoints
