# Investigation: Language & Runtime Stack for ai-memory

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Complete |
| **Scope** | Language/runtime selection for ai-memory service |
| **Decision** | **C# / .NET 8+** (recommended) |

---

## 1. Executive Summary

After evaluating TypeScript, C#, Python, and Rust across nine weighted criteria, **C# / .NET 8+** is the recommended stack for ai-memory. It scores highest overall due to the team's existing expertise, a mature official MCP SDK maintained in collaboration with Microsoft, first-class REST API support via ASP.NET Core, and excellent database driver quality. TypeScript is a close second and the natural fallback if the C# MCP SDK proves insufficient.

---

## 2. Comparison Matrix

Scores are 1–5 (5 = best fit for this project). Weights reflect importance to ai-memory specifically.

| Criterion | Weight | TypeScript | C# (.NET 8+) | Python | Rust |
|-----------|--------|:----------:|:-------------:|:------:|:----:|
| MCP SDK Maturity | 5 | **5** | 4 | 5 | 2 |
| REST API Ergonomics | 4 | 4 | **5** | 5 | 3 |
| DB Driver Quality (SQLite + PG) | 4 | 4 | **5** | 4 | 4 |
| Vector Search Readiness | 3 | 3 | 3 | **5** | 4 |
| Team Familiarity | 5 | 2 | **5** | 2 | 3 |
| AI/ML Ecosystem | 2 | 3 | 3 | **5** | 2 |
| Local Deployment (Windows) | 3 | 4 | **5** | 3 | 5 |
| Development Velocity | 4 | 4 | **5** | 4 | 2 |
| Community & MCP Examples | 3 | **5** | 3 | 4 | 1 |

**Weighted Totals:**

| Language | Score (max 165) |
|----------|:---------------:|
| **C# (.NET 8+)** | **152** |
| TypeScript | 131 |
| Python | 127 |
| Rust | 95 |

---

## 3. MCP SDK Maturity Assessment

### TypeScript — `@modelcontextprotocol/server` (Score: 5/5)

- **Repository**: [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- **Stars**: 12.3k | **Contributors**: 178 | **Releases**: 94 (latest v1.29.0, March 2026)
- **Status**: v1.x is production-stable. v2 in pre-alpha (monorepo split into `@modelcontextprotocol/server` and `@modelcontextprotocol/client`).
- **Transport support**: stdio, SSE, Streamable HTTP
- **Ecosystem dominance**: The official MCP reference servers repo is **69.4% TypeScript**. All primary reference servers (Memory, Filesystem, Git, Fetch, Everything) are TypeScript.
- **Assessment**: The *de facto* reference implementation. Maximum community support and examples.

### C# (.NET) — `ModelContextProtocol` (Score: 4/5)

- **Repository**: [modelcontextprotocol/csharp-sdk](https://github.com/modelcontextprotocol/csharp-sdk)
- **Stars**: 4.2k | **Contributors**: 63 | **Releases**: 35 (latest v1.2.0, March 2026)
- **Status**: Production-ready. **Maintained in collaboration with Microsoft**. Stephen Toub (legendary .NET performance engineer) is the #1 contributor.
- **Packages**: `ModelContextProtocol.Core` (minimal deps), `ModelContextProtocol` (DI + hosting), `ModelContextProtocol.AspNetCore` (HTTP transport)
- **Transport support**: stdio, Streamable HTTP (via ASP.NET Core)
- **Assessment**: Official, well-engineered, Microsoft-backed. Slightly fewer community examples than TypeScript, but the SDK itself is high quality and actively evolved. The collaboration with Microsoft means long-term maintenance is virtually guaranteed.

### Python — `mcp` (Score: 5/5)

- **Repository**: [modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk)
- **Stars**: 22.8k | **Contributors**: 194 | **Releases**: 54 (latest v1.27.0)
- **Status**: Production-ready. High-level `FastMCP` API makes server creation trivial.
- **Transport support**: stdio, SSE, Streamable HTTP (via Starlette/ASGI)
- **Assessment**: Extremely mature and popular. The highest star count of any MCP SDK. FastMCP's decorator-based API is elegant and fast to prototype with.

### Rust — `mcp-rust-sdk` (Score: 2/5)

- **Repository**: [modelcontextprotocol/rust-sdk](https://github.com/modelcontextprotocol/rust-sdk)
- **Status**: Official but significantly less mature. Fewer contributors, fewer examples, smaller community.
- **Assessment**: Exists but is not battle-tested. Few community servers use it. Would be pioneering territory.

---

## 4. Language-by-Language Analysis

### 4.1 TypeScript / Node.js

**Strengths for ai-memory:**
- Largest MCP ecosystem by far — the reference Memory server is literally TypeScript
- Rich npm packages for text processing (natural, compromise, lunr)
- Express/Fastify for REST; excellent ergonomics
- `better-sqlite3` is mature and fast; `pg` driver is battle-tested
- Hot-reload development with `tsx` or `nodemon` enables fast iteration

**Weaknesses for ai-memory:**
- **Team doesn't know it well.** The team's expertise is C++/C# — picking up TypeScript for a side project adds cognitive load and slows initial development.
- Node.js single-threaded model requires care for CPU-intensive text processing
- Less natural type safety than C# (TypeScript types are erased at runtime)
- Windows service deployment requires extra tooling (pm2, node-windows, or NSSM)

**Verdict**: Would be the default choice *if the team were polyglot or TypeScript-native*. For this team, it's a viable fallback but not the natural first choice.

### 4.2 C# / .NET 8+

**Strengths for ai-memory:**
- **Team's strongest language.** They already ship Visual Studio solutions and know the ecosystem deeply. Zero ramp-up time on language/tooling.
- ASP.NET Core Minimal APIs provide the cleanest REST experience available in any language — comparable to Express/FastAPI but with compile-time safety
- `Microsoft.Data.Sqlite` and `Npgsql` are first-class, Microsoft-maintained database drivers with full FTS5 support
- MCP SDK is co-maintained with Microsoft (Stephen Toub, halter73) — same people who build ASP.NET Core
- `ModelContextProtocol.AspNetCore` gives HTTP-based MCP transport with zero extra work
- Native Windows service support via `Microsoft.Extensions.Hosting.WindowsServices` — one line of code
- AOT compilation available for fast startup
- Entity Framework Core for migrations and schema management
- Strong typing catches bugs at compile time — critical for a service that must be reliable
- `Microsoft.Extensions.AI` for embedding model integration

**Weaknesses for ai-memory:**
- Fewer MCP community examples to copy from (most examples are TypeScript/Python)
- Vector search ecosystem is less developed than Python's (no native faiss, but pgvector via Npgsql works fine)
- AI/ML library ecosystem is narrower — though for embeddings, calling an API or using ONNX runtime covers the need

**Verdict**: The sweet spot for this team. Leverages existing expertise, has official SDK support, and provides the best path to a reliable, maintainable service on Windows.

### 4.3 Python

**Strengths for ai-memory:**
- `FastMCP` makes MCP server creation trivially easy — decorator-based, minimal boilerplate
- FastAPI is arguably the best REST framework in any language (auto-docs, async, Pydantic validation)
- **Unmatched AI/ML ecosystem**: numpy, sentence-transformers, faiss, tiktoken, langchain
- Largest MCP star count (22.8k) and very active community
- Quick to prototype and iterate

**Weaknesses for ai-memory:**
- **Team doesn't know Python.** C++/C# developers often find Python's dynamic typing and runtime errors frustrating.
- Windows deployment as a background service is awkward — no native service support, requires `pywin32` or wrapper scripts
- Dependency management is historically painful (though `uv` improves this)
- Performance for text processing is significantly worse than C# without native extensions
- `sqlite3` stdlib module has limited FTS support; need `apsw` or `sqlalchemy` for advanced usage
- Type checking is optional and tooling (mypy/pyright) adds friction

**Verdict**: Best for an AI/ML-focused team that already knows Python. Overkill ecosystem for what ai-memory needs today, and the team would have to learn a new language.

### 4.4 Rust

**Strengths for ai-memory:**
- Exceptional performance and memory safety
- Small binary, fast startup, low resource usage
- `rusqlite` and `tokio-postgres` are solid
- Could compile to a single binary with no runtime dependencies
- Actix-web/Axum for REST are fast and ergonomic

**Weaknesses for ai-memory:**
- **Highest development cost by far.** Borrow checker, lifetimes, and async Rust are steep learning curves even for C++ developers.
- MCP SDK is immature — would be fighting the SDK, not building features
- Very few MCP server examples to learn from
- Slow compilation hurts iteration speed
- AI/ML ecosystem is nascent compared to Python or even .NET
- Massive overkill for a local service that serves one user

**Verdict**: Wrong tool for this job. The performance benefits are irrelevant for a local single-user service, and the development cost is prohibitive for a side project.

---

## 5. Deep Dive: Key Decision Factors

### 5.1 Team Familiarity (Weight: 5 — Highest)

This is a side project. The team ships C++/C# products daily. Choosing a language they already know means:
- No ramp-up time on syntax, idioms, package managers, or debugging tools
- Patterns from their main products transfer directly (DI, async/await, LINQ)
- They can get help from colleagues who also know C#
- The codebase stays maintainable by the whole team, not just the one person who learned TypeScript

This single factor nearly decides the outcome on its own.

### 5.2 MCP SDK Quality vs. Ecosystem Size

TypeScript has more *examples*, but the C# SDK has better *engineering quality* for this team's needs:
- It uses ASP.NET Core hosting — the same pattern they already know
- It integrates with `Microsoft.Extensions.DependencyInjection` — their existing DI framework
- The `[McpServerTool]` attribute pattern mirrors ASP.NET Core controller attributes they're familiar with
- Microsoft co-maintenance means bugs get fixed quickly and the SDK won't be abandoned

Having fewer examples to copy from is a one-time cost during initial setup. The ongoing velocity benefit of using a familiar language far outweighs it.

### 5.3 Database Story

Both SQLite and PostgreSQL are first-class citizens in .NET:
- **SQLite**: `Microsoft.Data.Sqlite` (Microsoft-maintained) with full FTS5 support. EF Core has a SQLite provider.
- **PostgreSQL**: `Npgsql` (the .NET PostgreSQL driver) has native support for `pgvector` via `Npgsql.EntityFrameworkCore.PostgreSQL` — making the future vector search story straightforward.

### 5.4 REST API — Minimal APIs

.NET 8+ Minimal APIs are concise and fast:

```csharp
app.MapPost("/memories", async (CreateMemoryRequest req, MemoryService svc) =>
    Results.Created($"/memories/{id}", await svc.CreateAsync(req)));

app.MapGet("/memories/search", async (string query, MemoryService svc) =>
    Results.Ok(await svc.SearchAsync(query)));
```

This is comparable in brevity to Express or FastAPI while providing compile-time type safety.

### 5.5 Windows Deployment

.NET wins decisively here:
```csharp
builder.Services.AddWindowsService(options =>
    options.ServiceName = "ai-memory");
```
One line → native Windows service with proper lifecycle management, event log integration, and `sc` command compatibility. No external tooling needed.

---

## 6. Final Recommendation

### Use C# / .NET 8+ with the official MCP C# SDK

**Architecture:**
```
ai-memory/
├── src/
│   ├── AiMemory.Core/           # Domain models, interfaces
│   ├── AiMemory.Infrastructure/ # DB access, SQLite/PG providers
│   ├── AiMemory.Mcp/           # MCP server (tools, resources)
│   └── AiMemory.Api/           # ASP.NET Core host (REST + MCP HTTP)
├── tests/
└── ai-memory.sln
```

**Key packages:**
- `ModelContextProtocol.AspNetCore` — MCP server over HTTP
- `Microsoft.Data.Sqlite` — SQLite with FTS5
- `Npgsql` — PostgreSQL (with pgvector support for future vector search)
- `Microsoft.Extensions.Hosting.WindowsServices` — Windows service hosting
- `Microsoft.Extensions.AI` — Embedding model integration

**Transport strategy:**
- Primary: Streamable HTTP (via ASP.NET Core) — works with GitHub Copilot, Claude Desktop, and any MCP client
- Secondary: stdio (for direct process integration if needed)

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| C# MCP SDK lacks a feature needed | Low | Medium | SDK is actively developed; file an issue or contribute. Fall back to low-level protocol handling. |
| Fewer community MCP examples to reference | Medium | Low | The SDK docs and samples directory are sufficient. TypeScript examples translate conceptually to C#. |
| Vector search ecosystem gap | Low | Low | pgvector via Npgsql is mature. For local embeddings, ONNX Runtime works in .NET. |
| SDK maintenance stalls | Very Low | High | Microsoft co-maintains it. Stephen Toub won't let it die. Worst case: fork and maintain. |
| Team member leaves, replacement doesn't know C# | Low | Medium | C# is one of the most commonly known languages. Much easier to hire for than Rust or even TypeScript MCP expertise. |
| Performance bottleneck in text processing | Very Low | Low | .NET has excellent string performance. For heavy NLP, call out to a Python sidecar. |

---

## 8. Migration Path (If C# Proves Wrong)

If for any reason C# doesn't work out, here's the escape hatch:

### Fallback: TypeScript / Node.js

**When to trigger migration:**
- The C# MCP SDK has a critical bug that isn't fixed within 2 weeks
- A TypeScript-only MCP feature is needed that the C# SDK can't provide
- The team composition changes and new members are TypeScript-native

**Migration strategy:**
1. The domain logic (memory operations, search ranking) is in `AiMemory.Core` — this is pure logic that translates to any language
2. The REST API shape (routes, request/response models) stays identical — clients don't notice
3. Replace MCP server implementation with `@modelcontextprotocol/server`
4. Replace SQLite access with `better-sqlite3`
5. Estimated effort: 1–2 weeks for a clean port (the service is intentionally small)

**Why TypeScript and not Python:**
- TypeScript's type system is closer to C# thinking
- The MCP ecosystem is TypeScript-dominant, so maximum community support
- Better Windows deployment story than Python (though still worse than .NET)

---

## 9. What About a Hybrid Approach?

**Don't do this.** Some might suggest:
- "Write the MCP layer in TypeScript, business logic in C#"
- "Use Python for embeddings, C# for everything else"

This adds operational complexity (multiple processes, IPC, deployment coordination) that is completely unnecessary for a local single-user service. Pick one language and commit to it.

The one exception: if you add local embedding generation later, running a Python `sentence-transformers` sidecar or using ONNX Runtime directly in .NET are both acceptable. But that's a future addon, not a core architecture decision now.

---

## 10. Quick-Start Path

To validate the recommendation immediately:

```bash
dotnet new web -n AiMemory.Api
cd AiMemory.Api
dotnet add package ModelContextProtocol.AspNetCore
dotnet add package Microsoft.Data.Sqlite
```

```csharp
// Program.cs — proof of concept in ~30 lines
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddMcpServer()
    .WithTools<MemoryTools>();

var app = builder.Build();
app.MapMcp();                    // MCP over Streamable HTTP at /mcp
app.MapGet("/health", () => "ok");
app.Run();
```

This gives you a running MCP server with HTTP transport in under 5 minutes — using patterns the team already knows from ASP.NET Core.

---

## 11. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-05-02 | Select C# / .NET 8+ | Highest weighted score. Team expertise is the dominant factor for a side project. Official SDK with Microsoft co-maintenance eliminates sustainability risk. |
| 2025-05-02 | Designate TypeScript as fallback | Largest MCP ecosystem. Clear migration path if C# SDK proves insufficient. |
| 2025-05-02 | Reject Python | Wrong team. Deployment friction on Windows. No compelling advantage over C# for this use case. |
| 2025-05-02 | Reject Rust | Development cost far exceeds performance benefits for a local single-user service. Immature MCP SDK. |
