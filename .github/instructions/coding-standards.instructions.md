---
name: "Coding Standards"
summary: "Repository coding conventions and architecture constraints for ai-memory"
asset_type: "instruction"
status: "active"
owners:
	- "ai-memory-maintainers"
source_path: ".github/instructions/coding-standards.instructions.md"
---

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
- Follow TDD for new behavior and bug fixes: start with a failing test (red), make the minimum change to pass (green), then refactor with tests still green

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

## SOLID Principles

- **SRP:** Each class/service has one reason to change. `ISearchService` handles search only; don't combine search + consolidation in one class.
- **ISP:** Prefer small, focused interfaces. `IMemoryRepository` for CRUD, `ISearchService` for search, `IEmbeddingService` for embeddings — not one mega-interface.
- **DIP:** Depend on abstractions. Core defines interfaces; Server provides implementations registered in `Program.cs`. Never `new` up a service directly — always inject via constructor.
- **OCP:** Design services to be extended (new embedding providers, new search strategies) without modifying existing implementations where practical.
- **LSP:** Any implementation of an interface must be substitutable without altering correctness. Use NSubstitute mocks in tests to verify substitutability.

## DRY (Don't Repeat Yourself)

- Extract shared query patterns into helper methods on the repository rather than duplicating SQL across services.
- Reuse configuration-binding patterns — don't hand-parse settings in multiple places.
- Avoid premature DRY: if two blocks look similar but serve different domain purposes, keep them separate until a third use proves the abstraction.
- Prefer a single source of truth for constants (e.g., `DefaultSearchLimit` in one place, referenced elsewhere).

## Design Patterns

- **Repository:** `IMemoryRepository` encapsulates data access. All SQL lives in repository implementations — never in services.
- **Strategy:** `IEmbeddingService` allows swapping embedding providers (OpenAI, local ONNX) without changing consuming code.
- **Factory:** `IDbConnectionFactory` creates and configures database connections. Services never open connections directly.
- **Result:** Use `Result<T>` for operations that can fail expectedly (duplicate insert, not-found). Reserve exceptions for truly exceptional conditions.
- **Don't force it:** Only apply a pattern when it solves a real problem in this codebase. Simpler code > pattern compliance.

## Dependency Management

- Pin exact package versions in `.csproj` files (no floating versions like `*` or version ranges).
- Review NuGet updates monthly: `dotnet list package --outdated` from `src/`.
- Prefer packages with: active maintenance, no known CVEs, compatible license (MIT/Apache-2.0 preferred).
- Minimize transitive dependency count — fewer dependencies = smaller attack surface.
- Document any package with a non-MIT/Apache license in this file when added.
- Major version upgrades: create a dedicated story rather than inlining during feature work.

## Docker and Infrastructure

**No `git clone` inside Dockerfiles.** A corporate SSL proxy (Fortinet or similar) intercepts HTTPS connections inside Docker containers and terminates them with an untrusted CA certificate. `git clone https://github.com/...` inside a `RUN` step will fail. The mandated pattern is:

1. Download the release tarball or binary on the Windows host (where the proxy CA is trusted).
2. Commit the tarball to the repository under the relevant `docker/` subdirectory.
3. Use `COPY` to bring it into the image, then extract with `tar`.

Evidence: ST-021 Docker validation — `docker/postgres-age/Dockerfile` + `docs/investigations/ST-021-findings.md §6b #6`.

**Verify version tags against the target runtime before writing a Dockerfile.** Some libraries (notably Apache AGE) publish separate tag namespaces per PostgreSQL major version (e.g., `PG15/v1.6.0-rc0` vs `PG17/v1.7.0`). Using the wrong tag silently produces a 404 or a build that fails at runtime. Always browse the project's tag list (e.g., `https://github.com/apache/age/tags`) and confirm the tag exists for the exact PostgreSQL version in use before writing or committing a Dockerfile reference. Evidence: ST-021 — original Dockerfile referenced `v1.7.0` which does not exist for PG15; corrected to `PG15/v1.6.0-rc0`.

---

For rationale behind these practices, see `docs/investigations/se-best-practices.md`.
For operational checklists, see `.github/instructions/ways-of-working.instructions.md`.
