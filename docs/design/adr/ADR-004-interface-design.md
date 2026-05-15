---
name: "ADR-004: Interface Design — MCP and REST"
asset_type: "adr"
status: "accepted"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-004-interface-design.md"
created: "2026-05-15"
investigation: "docs/investigations/interface-design-mcp-rest.md"
---

# ADR-004: Interface Design — MCP and REST

**Status:** Accepted  
**Date:** 2026-05-15  
**Deciders:** PO (sole maintainer)  
**Source investigation:** [interface-design-mcp-rest.md](../../investigations/interface-design-mcp-rest.md), [context-engineering-principles.md](../../investigations/context-engineering-principles.md)

---

## Context

The memory service must be accessible to:
1. **AI agents** (GitHub Copilot, Claude, Claude Desktop, etc.) via MCP protocol
2. **Developer tooling and automation** via standard REST HTTP
3. **Both simultaneously** from the same running process

Two design questions were open:
1. Should MCP be a peer of REST, or a facade over a shared service layer?
2. Should MCP and REST run in separate processes?

---

## Decision

### MCP is a thin facade over the REST/service layer

Both REST controllers and MCP tool handlers call the same `IMemoryService` interface. Business logic lives **only** in the service layer — not in transport handlers.

```
┌─────────────────────────────────────┐
│        TRANSPORT LAYER              │
│  REST endpoints  │  MCP tool handlers│
└────────┬─────────┴────────┬──────────┘
         │                  │
         └──────┬───────────┘
                ▼
┌───────────────────────────────────────┐
│         SERVICE LAYER                 │
│  IMemoryService  │  ISearchEngine     │
└───────────────────────────────────────┘
                ▼
┌───────────────────────────────────────┐
│         DATA LAYER                    │
│  IMemoryRepository  │  IMemoryStore   │
└───────────────────────────────────────┘
```

### Single-process hosting

Both REST and MCP run in the same ASP.NET Core process. Shared DI container, zero IPC overhead.

### MCP response format

MCP tools return **formatted text/Markdown** (not raw JSON). Agents interpret natural language prose better than structured data.

Format: `[Score: 0.92] (type, project) content — ID: <ulid>`

### Transport

Both stdio and HTTP (StreamableHTTP) transports are supported simultaneously. HTTP is prioritised for GitHub Copilot and Claude Desktop; stdio is provided for CLI clients.

### Context layers

The MCP interface implements a three-layer context model:
- **Layer 0** (passive, always available): MCP Resources (`memory://facts/{project}`, `memory://recent-episodes`, `memory://stats`, `memory://storyboard/{profile}`) — max ~500 tokens each
- **Layer 1** (active pull): MCP Tools (`memory_search`, `memory_inspect`, story tools)
- **Layer 1.5** (guided retrieval): MCP Prompts (`recall_context`, `session_summary`)

### Pagination

Cursor-based pagination on all list endpoints (not offset-based) to avoid drift on concurrent inserts.

### Swagger / OpenAPI

Enabled in development mode; disabled in background/service mode.

---

## Consequences

### Positive
- Single source of truth for business logic: `IMemoryService`
- Consistent validation across both interfaces (REST and MCP call the same validators)
- Testing is straightforward: service layer tested once; transport handlers are thin
- Single process = simpler deployment, no IPC, shared health/ready signals
- `recall_event_id` in search results enables the feedback loop from both REST and MCP callers
- Layer 0 Resources provide passive context injection without agent effort (token-efficient)

### Negative / Trade-offs
- MCP response format (formatted text) is not directly machine-parseable by non-agent consumers; REST is the right channel for programmatic consumers
- Both transports running simultaneously means any service degradation affects all consumers; no isolation between MCP and REST traffic

### Acceptance criteria for implementation

After `GET /health` returns 200:
1. `POST /api/v1/memories` accepts a valid body and returns 201 with an ID
2. An MCP `memory_teach` call returns a formatted confirmation
3. `GET /api/v1/memories/search?q=test` returns an envelope with `data` array and `took_ms`

---

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| **MCP as peer (not facade)** | Would require duplicating service logic; violates DRY; testing doubles; rejected |
| **Separate REST and MCP processes** | Added IPC complexity; no user benefit at personal scale |
| **MCP returns raw JSON** | Agent consumption tested as worse with structured JSON than with natural language formatted text |
| **Offset-based pagination** | Drifts on concurrent inserts; cursor-based is safer and stateless |
| **Swagger in production mode** | Removed from service/background mode to reduce attack surface on localhost binding |
