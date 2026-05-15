---
name: "ADR-006: Views Architecture — Storyboard and Wiki"
asset_type: "adr"
status: "accepted"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-006-views-architecture.md"
created: "2026-05-15"
investigation: "docs/investigations/openbrain-pivot-evaluation.md"
---

# ADR-006: Views Architecture — Storyboard and Wiki as Projections over The Brain

**Status:** Accepted  
**Date:** 2026-05-15  
**Deciders:** PO (sole maintainer)  
**Source investigations:** [openbrain-pivot-evaluation.md](../../investigations/openbrain-pivot-evaluation.md), [MicrosoftCopilotProjectOverview.md](../Discussions/MicrosoftCopilotProjectOverview.md), [MicrosoftCopilotStorageBasedADR.md](../Discussions/MicrosoftCopilotStorageBasedADR.md), [Gemini Agile MD Storyboard.md](../Discussions/Gemini%20Agile%20MD%20Storyboard.md)

---

## Context

The system must produce two derived "views" over The Brain:

1. **Wiki view** — a synthesised, curated Markdown document per project or domain, generated from semantic memories. Equivalent to an always-current project reference sheet.

2. **Storyboard view** — a stateful task board showing stories (professional and personal) with their execution state. Used by agents to pick up work and by the developer to manage goals.

Two design questions were open:
1. Are views separate storage systems, or projections over The Brain?
2. What is the canonical interface — Markdown files, or REST/MCP API?

An earlier design (influenced by Open Brain / Supabase) considered edge function workers writing Markdown to cloud storage with a local sync bridge. The C# local-first architecture was evaluated as a direct alternative.

---

## Decision

### Views are stateful projections over The Brain, not separate storage systems

The Brain (SQLite) is the single source of truth. Views are derived representations generated on demand or via synthesis trigger.

**Wiki view:** Synthesised Markdown document generated from Tier 2 (semantic) memories for a specified project. Updated incrementally when new memories are ingested.

**Storyboard view:** A task board rendered from a dedicated `stories` table in The Brain. The `stories` table holds story state (todo | in-progress | review | done); the view is a query-time projection over it.

### Canonical interface is REST/MCP API

Agents and tools interact with views via REST endpoints and MCP tools. Markdown file output is an **optional rendering format**, not the canonical data store.

```
REST/MCP (canonical)
       ↓
IMemoryService / IStoryboardService
       ↓
The Brain (SQLite: memories + stories tables)
       ↓
ISynthesisService  (optional trigger)
       ↓
Markdown file write (optional; Obsidian-compatible)
```

### Synthesis trigger pattern

After `IMemoryRepository.StoreAsync()` completes successfully, a domain event fires. `ISynthesisService.UpdateViewsAsync(newMemory)` is invoked asynchronously. The synthesis service:
1. Identifies which views are affected by the new memory (project match, tag match)
2. Fetches the delta since the last synthesis point (tracked by `last_synthesised_memory_id` per view)
3. Calls `ILlmClient` with the delta memories as context
4. Writes the updated Markdown file to the configured output directory

### Storyboard state machine

Stories follow a controlled state machine:

```
todo → in-progress → review → done
          ↑              ↓
          ← ← ← ← ← ← ← ←  (back-transition permitted)
```

WIP limit: 1 story per profile (professional | personal) may be `in-progress` at a time.

### Layered context for story pickup

Agents use a two-step pattern:
1. **Summary view** (`memory://storyboard/{profile}`) — story IDs, titles, statuses (~500 tokens)
2. **Full detail** (`GET /api/v1/stories/:id`) — description, acceptance criteria, linked memories

This prevents context flooding when scanning for available work.

### Obsidian-compatible Markdown output format

View files use YAML frontmatter with Dataview-queryable properties:

```markdown
---
type: storyboard
profile: professional
generated_at: 2026-05-15T10:00:00Z
memory_count: 42
---

## To Do

\`\`\`dataview
TABLE priority, project FROM "stories" WHERE status = "todo" SORT priority DESC
\`\`\`

<!-- Story file format -->
---
id: 01HXY...
title: Implement SQLite schema
status: todo
priority: high
project: ai-memory
---
```

---

## Consequences

### Positive
- Single source of truth: The Brain (no sync bridges, no divergence)
- Synthesis within the C# process writes directly to the local filesystem (< 100 ms latency, no cloud round-trip)
- Storyboard state is fully transactional (SQLite) — no partial updates
- Layered context model prevents agent token flooding
- Obsidian Markdown is an optional rendering bonus, not a dependency
- WIP limit is enforced by the system, not by convention

### Negative / Trade-offs
- LLM synthesis is async (view is not updated synchronously with memory write)
- Obsidian-compatible Markdown requires Dataview plugin for live board rendering; plain Markdown is the fallback
- ISynthesisService must handle concurrent synthesis requests gracefully (queue or lock per view)

### Open Brain comparison

Open Brain's synthesis approach (Supabase edge functions + remote Markdown storage + local sync daemon) introduces:
- 1–30 second synthesis latency (vs < 100 ms for direct file write)
- A local sync bridge process (extra maintenance)
- Cloud dependency for synthesis (breaks local-first NFR)

These costs outweigh OB1's advantages at personal scale. **The C# direct-write approach is chosen.**  
Source: openbrain-pivot-evaluation.md §9 — Option C weighted score 4.50 vs 2.10–3.55 for alternatives.

---

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| **Views as separate storage systems (Supabase edge)** | Cloud dependency; 1–30s synthesis latency; local sync bridge complexity; violates local-first NFR |
| **Markdown files as canonical storage (file-as-truth)** | Weakens atomic updates, recall-event logging, consolidation pipelines; per memsearch-applicability-review.md |
| **Single storyboard (no profile split)** | Professional and personal tasks have different audiences and WIP limits; profile separation is first-class |
| **Storyboard as pure Markdown with no REST/MCP API** | Agents cannot programmatically update state without parsing and writing Markdown; REST/MCP is canonical |
| **Full synthesis on every write (synchronous)** | Blocks memory write response; violates NFR-P3 |
