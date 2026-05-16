---
name: "ADR-001: Language and Framework Selection"
asset_type: "adr"
status: "revised"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-001-language-stack.md"
created: "2026-05-15"
revised: "2026-05-16"
investigation: "docs/investigations/language-stack-recommendation.md"
---

# ADR-001: Language and Framework Selection

**Status:** Revised  
**Date:** 2026-05-15 | **Revised:** 2026-05-16  
**Deciders:** PO (sole maintainer)  
**Source investigations:** [language-stack-recommendation.md](../../investigations/language-stack-recommendation.md), [openbrain-pivot-evaluation.md](../../investigations/openbrain-pivot-evaluation.md)

---

## Context

The original decision selected C# as the sole implementation language based on three assumptions: local-first deployment, SQLite integration, and Windows service hosting. All three have changed:

1. **Deployment is cloud-hosted** — the MCP server runs as a Docker container accessible over HTTPS. SQLite and Windows service hosting are no longer requirements for the server component.

2. **The base is a fork of OB1** — OB1 is a TypeScript/Deno MCP server. Forking it means the cloud MCP server inherits TypeScript. Rewriting it in C# would lose the existing tool layer, schema patterns, and entity-extraction design at no quality gain.

3. **The local synthesis service remains local** — a client process on WSL2 that pulls memories from the cloud MCP server, runs LLM synthesis, and writes Obsidian-compatible Markdown directly to the local filesystem. Filesystem access, WSL2/Windows native tooling, Ollama integration, and compile-time type safety all favour C# here.

**Principle adopted:** use the right language for the task. The project is not bound to a single stack; each component uses the language best suited to its responsibilities.

---

## Decision

Two languages are used, each scoped to a distinct component with no overlap.

### Cloud MCP Server — TypeScript / Deno

The OB1 fork runs as a persistent Deno HTTP server inside a Docker container.

| Criterion | Assessment |
|-----------|-----------|
| MCP SDK | Official `@modelcontextprotocol/sdk` — first-class, battle-tested, fastest to adopt new protocol features |
| PostgreSQL | `postgres` Deno-compatible npm package — first-class, production-grade |
| AGE / openCypher | Raw SQL via pg client (`SELECT * FROM cypher(...)`) — fully supported |
| OpenRouter | Standard `fetch` — trivial; all major LLM providers publish TypeScript SDKs first |
| OB1 fork | Direct inheritance — zero rewrite cost for MCP tool layer, schema, entity-extraction worker design |
| Strict mode | TypeScript strict mode mandatory; no `any` types in production code |

Key frameworks:
- **MCP server:** `@modelcontextprotocol/sdk` (StreamableHTTP transport)
- **PostgreSQL client:** `postgres` (Deno-compatible, parameterised queries)
- **HTTP server:** Deno's built-in `Deno.serve`
- **OpenRouter:** `fetch` with `Authorization: Bearer` header

### Local Synthesis Service — C# / .NET 8

A client process triggered by WSL2 cron or manually by the developer or an agent.

| Criterion | Assessment |
|-----------|-----------|
| Filesystem access | Direct — writes Markdown to any configured Obsidian vault path without bridging or cloud storage |
| Ollama | `HttpClient` to `localhost:11434` — zero external dependency |
| OpenRouter | `HttpClient` with Bearer token — trivial |
| MCP client | StreamableHTTP client to cloud MCP endpoint + API key |
| Type safety | Compile-time nullable reference types; strongly typed DI container |
| Developer background | Strong C++/C# expertise; zero ramp-up for the local component |

Key frameworks:
- **HTTP client:** `System.Net.Http.HttpClient` (MCP StreamableHTTP, OpenRouter, Ollama)
- **DI / hosting:** `Microsoft.Extensions.Hosting` (WSL2 background service or CLI)
- **LLM abstraction:** `Microsoft.Extensions.AI` (Ollama + OpenRouter behind one interface)

### Explicitly out of scope for the cloud component

ASP.NET Core, ModelContextProtocol C# SDK, Windows service hosting, Microsoft.Data.Sqlite — all superseded by the TypeScript/Deno OB1 fork. The C# scaffold's interfaces (`IMemoryService`) inform the TypeScript design vocabulary but are not ported.

---

## Consequences

### Positive
- TypeScript is the reference implementation language for MCP; the official SDK has the most community examples and the fastest adoption of new protocol features
- The OB1 fork inherits working TypeScript tool patterns; no rewrite cost for the MCP layer
- C# is the right tool for the local synthesis task: direct filesystem writes, WSL2 native integration, Ollama, compile-time safety
- The two components communicate via standard HTTP (MCP StreamableHTTP); no IPC, no shared build system

### Negative / Trade-offs
- Polyglot project: two languages, two build systems, two dependency managers. Bounded by a clear component boundary — cloud server is TypeScript, local client is C#
- TypeScript runtime type safety is weaker than C#; strict mode and `zod` schema validation are mandatory compensating controls
- The C# MCP SDK and ASP.NET Core scaffold from ST-001 does not carry forward to the cloud server. That work informed the design and remains as the local synthesis service base

---

## Alternatives Considered

| Alternative | Why Not Chosen |
|-------------|---------------|
| **C# for everything (original v1.0 decision)** | Cloud MCP server is an OB1 fork (TypeScript); rewriting in C# loses the fork's tool patterns and introduces MCP SDK lag against the TypeScript reference implementation |
| **TypeScript for everything** | Local synthesis needs direct filesystem writes and WSL2 cron integration; C# is more natural for a Windows/WSL2 client with Ollama integration and compile-time safety |
| **Python** | No OB1 fork, no mature Deno-equivalent MCP server pattern, Windows/WSL2 friction unchanged |
| **Single-language mandate** | Forces a worse tool into at least one component; gains no user-visible benefit at single-developer scale |

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-05-15 | Initial — C# sole language, local-first, SQLite, Windows service |
| 2.0 | 2026-05-16 | Revised — TypeScript/Deno for cloud MCP server (OB1 fork); C# retained for local synthesis service; task-appropriate language principle adopted; polyglot approach formalised |
