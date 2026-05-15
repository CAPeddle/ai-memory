---
name: "ADR-001: Language and Framework Selection"
asset_type: "adr"
status: "accepted"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-001-language-stack.md"
created: "2026-05-15"
investigation: "docs/investigations/language-stack-recommendation.md"
---

# ADR-001: Language and Framework Selection

**Status:** Accepted  
**Date:** 2026-05-15  
**Deciders:** PO (sole maintainer)  
**Source investigation:** [language-stack-recommendation.md](../../investigations/language-stack-recommendation.md)

---

## Context

The ai-memory service requires a programming language and framework stack for:
- Hosting both an MCP server and a REST API in a single process
- SQLite database access with FTS5 and vector extensions
- Windows native service deployment
- Embedding service integration (OpenAI + future local models)
- Long-term maintainability by a solo C++/C# developer

Four candidates were evaluated against nine weighted criteria: C# (.NET 8), TypeScript (Node.js), Python, and Rust.

**Scoring (weighted, max 165):**

| Language | Score | Notes |
|----------|-------|-------|
| **C# / .NET 8** | **152** | Highest — team expertise, Microsoft MCP SDK, best REST ergonomics |
| TypeScript | 131 | Strong MCP ecosystem, good community examples, second choice |
| Python | 127 | Richest AI/ML ecosystem but team unfamiliarity and Windows friction |
| Rust | 95 | Performance overkill; borrow checker costs development velocity |

---

## Decision

**Use C# 12 on .NET 8+** as the sole implementation language.

Specific framework choices:
- **REST API:** ASP.NET Core Minimal API (route prefix `/api/v1/`)
- **MCP server:** `ModelContextProtocol` SDK (Microsoft co-maintained, v1.2.0+)
- **DI container:** `Microsoft.Extensions.DependencyInjection`
- **Windows service hosting:** `Microsoft.Extensions.Hosting.WindowsServices`
- **SQLite driver:** `Microsoft.Data.Sqlite`
- **Embedding integration:** `Microsoft.Extensions.AI`

No polyglot approach. All code in C#. No IPC between runtimes.

---

## Consequences

### Positive
- Zero ramp-up time; sole developer has strong C++/C# background
- Compile-time type safety catches errors early; nullable reference types enforced
- Microsoft co-maintains the MCP SDK — long-term support guaranteed
- Single process hosts both REST + MCP (shared DI container, no IPC)
- AOT compilation available for further latency optimisation if needed
- Windows native service support with minimal configuration

### Negative / Trade-offs
- Smaller MCP community example corpus compared to TypeScript
- Python's LangChain / LlamaIndex ecosystem not directly available; Semantic Kernel provides comparable C# equivalents
- If C# MCP SDK has a critical unresolved bug for > 2 weeks, trigger the TypeScript migration evaluation

### Risks
- C# MCP SDK community footprint is smaller than TypeScript; monitor for abandonment risk
- Migration to TypeScript estimated at 1–2 weeks if required (domain logic separation enables clean porting)

---

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| **TypeScript / Node.js** | Larger MCP community but team unfamiliarity requires ramp-up; C# score was 21 points higher |
| **Python** | Richest AI/ML ecosystem but Windows deployment awkwardness; team has no Python background |
| **Rust** | Maximum performance but borrow checker learning curve unacceptable for solo maintainability; MCP SDK immature |
| **Polyglot (C# + Python)** | Operational complexity of two runtimes + IPC adds maintenance burden without benefit at personal scale |

---

## Review Trigger

Re-evaluate if: C# MCP SDK has a critical unresolved bug for > 2 weeks, or team composition changes to include Python expertise.
