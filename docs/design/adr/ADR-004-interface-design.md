---
name: "ADR-004: Interface Design — MCP"
asset_type: "adr"
status: "revised"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-004-interface-design.md"
created: "2026-05-15"
revised: "2026-05-16"
investigation: "docs/investigations/interface-design-mcp-rest.md"
---

# ADR-004: Interface Design — MCP

**Status:** Revised  
**Date:** 2026-05-15 | **Revised:** 2026-05-16  
**Deciders:** PO (sole maintainer)  
**Source investigations:** [interface-design-mcp-rest.md](../../investigations/interface-design-mcp-rest.md), [openbrain-pivot-evaluation.md](../../investigations/openbrain-pivot-evaluation.md)

---

## Context

The original design co-hosted a REST API and an MCP server in a single ASP.NET Core process, with MCP as a thin facade over a shared service layer. Both the language stack (ADR-001 revised) and the deployment model (ADR-009) have changed:

1. **The cloud MCP server is now a forked OB1 TypeScript/Deno process** — it is not an ASP.NET Core host. The C# service layer abstraction (`IMemoryService`) does not apply to the server component.

2. **The cloud component serves AI chat platforms exclusively** — Claude.ai, ChatGPT, Gemini, GitHub Copilot, Cursor. All of these connect via MCP. None require a REST API at the cloud layer.

3. **REST is a local concern** — if a local tool, script, or the C# synthesis service needs to call the memory server programmatically, it connects via the MCP StreamableHTTP transport. A REST wrapper, if ever needed, would be a local adapter, not part of the cloud server.

4. **stdio transport is dropped** — stdio is used for local process-to-process MCP connections (e.g., Claude Desktop spawning a local server). The cloud server is accessed over the public internet; stdio is not relevant.

---

## Decision

### MCP is the sole interface for the cloud server

The cloud MCP server exposes one transport: **StreamableHTTP over HTTPS** with API key authentication (ADR-010). All callers — AI chat platforms, the local synthesis service, developer tools — use this single endpoint.

```
Claude.ai │ ChatGPT │ Gemini │ Copilot │ C# Synthesis Service
          │         │        │         │
          └─────────┴────────┴─────────┘
                         │
              StreamableHTTP (HTTPS + Bearer API key)
                         │
          ┌──────────────▼──────────────┐
          │  Deno MCP Server            │
          │  (OB1 fork, TypeScript)     │
          │                             │
          │  tool handlers              │
          │       │                     │
          │  service functions          │
          │       │                     │
          │  PostgreSQL + AGE           │
          └─────────────────────────────┘
```

### MCP tool set (OB1 fork, extended)

Core tools inherited from OB1 and extended:

| Tool | Description |
|------|-------------|
| `capture_thought` | Store a memory (shard or wiki, per `memory_type` parameter) |
| `search_thoughts` | Hybrid BM25 + vector search (Mode 1, ADR-003) with optional `context` parameter |
| `graph_traverse` | openCypher graph traversal (Mode 2, ADR-003) |
| `list_thoughts` | Paginated list with optional project/type filter |
| `thought_stats` | Count and recency stats per project/type |
| `story_list` | List storyboard stories with status filter |
| `story_claim` | Transition story to in-progress; returns resolved context |
| `story_update` | Update story status via state machine |
| `consolidate` | Trigger consolidation pipeline; supports `dry_run` |

### MCP response format

Tools return **formatted text / Markdown**, not raw JSON. AI agents interpret natural language prose better than structured data for memory content.

Format: `[Score: 0.92] (shard · zoom) Implemented conan integration using find_package — ID: <uuid>`

### Context layers (adjusted)

- **Layer 0** (passive): MCP Resources — `memory://thoughts/{project}`, `memory://stats`, `memory://storyboard/{profile}` — max ~500 tokens each
- **Layer 1** (active pull): MCP Tools — search, capture, graph, story management
- **Layer 1.5** (guided retrieval): MCP Prompts — `recall_context`, `session_summary`

### Pagination

Cursor-based on all list tools (not offset-based). Offset pagination drifts on concurrent inserts.

### REST (not in cloud server scope)

A REST adapter may be added as a local-only wrapper in a future story if programmatic non-MCP access is needed. It is not part of the cloud server and not planned for the spike.

---

## Consequences

### Positive
- Single interface eliminates the REST/MCP duality and the associated "MCP as facade" pattern complexity
- All callers use the same transport; no per-caller protocol negotiation
- OB1's MCP tool signatures are the starting point; the fork extends rather than replaces
- StreamableHTTP over HTTPS works with all target chat platforms (Claude.ai, ChatGPT custom GPTs, Gemini plugins, Copilot extensions, Cursor)

### Negative / Trade-offs
- No REST API means no Swagger/OpenAPI documentation at the cloud layer; MCP schema serves that role
- The local synthesis service must speak MCP (StreamableHTTP client) rather than REST; this is acceptable — the C# `HttpClient` can call MCP StreamableHTTP directly
- stdio transport is removed; any future local-process use case would need to connect via the HTTPS endpoint with the API key

---

## Alternatives Considered

| Alternative | Why Not Chosen |
|-------------|---------------|
| **REST + MCP in same server (original design)** | Requires ASP.NET Core + C# MCP SDK; superseded by TypeScript/Deno OB1 fork |
| **MCP as facade over REST service layer** | The OB1 architecture is service functions called directly by tool handlers; no REST intermediary layer is present or needed |
| **stdio transport** | Cloud-hosted server is not spawned as a child process; stdio irrelevant for remote MCP access |
| **REST-only** | Chat platforms connect via MCP; REST would require each platform to use a custom integration rather than the standard MCP handshake |

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-05-15 | Initial — REST + MCP in single ASP.NET Core process; MCP as facade; stdio + HTTP dual transport |
| 2.0 | 2026-05-16 | Revised — MCP-only; OB1 fork TypeScript/Deno server; StreamableHTTP over HTTPS only; stdio dropped; REST deferred as local-only concern; graph_traverse tool added |
