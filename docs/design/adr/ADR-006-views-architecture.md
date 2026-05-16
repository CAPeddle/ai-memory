---
name: "ADR-006: Views Architecture — Storyboard and Wiki"
asset_type: "adr"
status: "revised"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-006-views-architecture.md"
created: "2026-05-15"
revised: "2026-05-16"
investigation: "docs/investigations/openbrain-pivot-evaluation.md"
---

# ADR-006: Views Architecture — Storyboard and Wiki as Local Projections

**Status:** Revised  
**Date:** 2026-05-15 | **Revised:** 2026-05-16  
**Deciders:** PO (sole maintainer)  
**Source investigations:** [openbrain-pivot-evaluation.md](../../investigations/openbrain-pivot-evaluation.md)

---

## Context

The original design assumed the synthesis trigger was a server-side domain event (C# `ISynthesisService` called after `IMemoryRepository.StoreAsync()`). The architecture has changed:

- The cloud MCP server is a TypeScript/Deno process (OB1 fork). It has no direct filesystem access to the local Obsidian vault and no C# domain event system.
- The local synthesis service is a C# client that connects to the cloud MCP server via StreamableHTTP.
- Synthesis is therefore a **pull model** — the local service queries the cloud for memories and synthesises views locally — rather than a push model triggered by server-side writes.

The conceptual view model is unchanged: Wiki and Storyboard views are projections over The Brain, not separate storage systems. The canonical memory store is the cloud PostgreSQL database; Markdown files are optional local renderings.

---

## Decision

### Views are local projections — synthesis is a pull model

The C# local synthesis service is responsible for generating and writing view files. It connects to the cloud MCP server, retrieves relevant memories, calls an LLM, and writes Obsidian-compatible Markdown to the local filesystem.

```
CLOUD (PostgreSQL + Deno MCP server)
  │
  │  StreamableHTTP + API key
  │  (MCP tools: search_thoughts, list_thoughts, story_list)
  ▼
LOCAL — C# Synthesis Service (WSL2)
  │
  ├── Pull: fetch memories since last synthesis point
  ├── LLM call: Ollama (local, $0) or OpenRouter (remote, configurable)
  ├── Write: Obsidian-compatible Markdown to configured vault path
  └── Track: last synthesised thought ID per view (local state file)
        │
        ▼
  Local Obsidian Vault
  ├── wiki/{project}.md
  └── storyboard/{profile}.md
```

### Synthesis trigger

Synthesis is triggered by:
1. **WSL2 cron schedule** — configurable interval (e.g., every 30 minutes, hourly)
2. **Manual trigger** — developer or agent calls the synthesis service directly
3. **Agent-initiated** — an MCP-capable agent with local access can request a synthesis run

The cloud server does not push synthesis events. This is a pull-on-demand model.

### Incremental update

The synthesis service tracks the last synthesised thought ID per view in a local state file. On each run it fetches only thoughts created or updated since that checkpoint, reducing LLM token cost and synthesis latency.

```
State file: ~/.ai-memory/synthesis-state.json
{
  "wiki/zoom": { "last_thought_id": "uuid-xyz", "last_run": "2026-05-16T10:00:00Z" },
  "storyboard/professional": { "last_thought_id": "uuid-abc", "last_run": "2026-05-16T09:30:00Z" }
}
```

### LLM provider — configurable

The synthesis service supports two LLM backends, configurable per environment:
- **Ollama** (default for local runs): `http://localhost:11434` — $0/month, no data leaves the machine
- **OpenRouter** (remote): configured API key — model flexibility, stronger synthesis quality

Both are called via `Microsoft.Extensions.AI`'s provider-agnostic interface. Switching providers requires only a configuration change.

### Storyboard state machine (unchanged)

Stories follow a controlled state machine:

```
todo → in-progress → review → done
          ↑              ↓
          ← ← ← ← ← ← ← ←  (back-transition permitted)
```

WIP limit: 1 story per profile (`professional` | `personal`) may be `in-progress` at a time. State is enforced by the cloud MCP server (`story_claim`, `story_update` tools).

### Obsidian-compatible Markdown output (unchanged)

View files use YAML frontmatter with Dataview-queryable properties:

```markdown
---
type: wiki
project: zoom
generated_at: 2026-05-16T10:00:00Z
memory_count: 42
last_thought_id: uuid-xyz
---

## Key Facts

...synthesised content...
```

---

## Consequences

### Positive
- The local synthesis service retains **direct filesystem access** — writes go straight to the Obsidian vault with no cloud storage bridge or sync daemon
- Pull model is simpler than push: no server-side event system, no webhook infrastructure
- Cron-triggered synthesis is transparent and controllable; the developer sees exactly when synthesis runs and can trigger it manually
- LLM provider is configurable: free local synthesis (Ollama) or high-quality remote synthesis (OpenRouter) with no code change
- The cloud server has zero synthesis responsibility; it only stores and retrieves memories

### Negative / Trade-offs
- Views are not updated immediately on memory write; there is a lag between capture and synthesis equal to the cron interval (acceptable for a personal tool)
- The local synthesis service must be running (or cron must be active) for views to update; on a machine that is off or suspended, synthesis is paused
- Local state file introduces a lightweight dependency; loss of the state file causes full re-synthesis on the next run (correct result, higher token cost)

### Comparison with server-side synthesis (OB1 pattern)

OB1's approach (Supabase Edge Function worker + remote Markdown storage + local sync bridge) introduces:
- 1–30 second synthesis latency (network round-trips to OpenRouter + storage)
- A local sync bridge process (extra maintenance)
- Cloud dependency for every synthesis run
- Remote storage cost

The local pull model eliminates all of these costs. The trade-off is that synthesis does not happen on the cloud server; it happens on the developer's machine. For a single-user personal tool, this is the correct trade-off.

---

## Alternatives Considered

| Alternative | Why Not Chosen |
|-------------|---------------|
| **Server-side synthesis (OB1 Edge Function + remote Markdown)** | Network latency, sync bridge complexity, cloud dependency for Markdown writes; pull model is simpler and cheaper |
| **Supabase Storage + local sync daemon** | Adds a second service (sync daemon) and a cloud storage dependency for files that live on the local machine anyway |
| **Views as cloud API endpoints only (no Markdown)** | Obsidian-compatible Markdown is a primary deliverable for the storyboard and wiki use cases; API-only removes the Obsidian vault integration |
| **Synchronous synthesis on every memory capture** | Cloud server cannot write to local filesystem; local synthesis service is not called synchronously during cloud capture |

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-05-15 | Initial — server-side domain event triggers ISynthesisService; C# direct filesystem write; SQLite as canonical store |
| 2.0 | 2026-05-16 | Revised — pull model: local C# synthesis service queries cloud MCP, writes Markdown locally; trigger is WSL2 cron or manual; LLM configurable (Ollama / OpenRouter); canonical store is cloud PostgreSQL |
