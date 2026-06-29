---
name: "AI Memory — Architecture Decisions Record"
asset_type: "architecture-decisions"
status: "resolved"
owners:
  - "ai-memory-maintainers"
source_path: "docs/architecture/ai_memory_architecture_decisions.md"
created: "2026-06-26"
supersedes:
  - "docs/requirements/SRS.md"
  - "docs/design/SystemDesign.md"
---

# AI Memory — Architecture Decisions Record
**Session date:** 2026-06-26
**Status:** Resolved — ready for implementation planning

---

## System Overview

AI Memory is a **personal knowledge platform**. Products are built on top of it. Christopher is the sole user operating under distinct personas, each mapped to a product.

```
Clients: Android app · Claude.ai · Claude Code
           ↓                ↓↕             ↓
   Contact Memory    (cross-domain)  Developer Memory
   [teal product]    Claude.ai can   [purple product]
   Contact MCP       query both      Developer MCP
   Agentic runtime   MCPs together   Consolidation pipeline
   WhatsApp parser                   (deferred)
   Human review gate
           ↓                              ↓
           └──────────── MCP ─────────────┘
                          ↓
              AI Memory Platform [blue]
         Platform MCP · Shard storage · Hybrid search
         Append-only · versioned · tags · BM25 + pgvector
```

---

## Resolved Decisions

### 1. Platform model: single-tier shards only
The platform stores episodic, append-only shards. There is no wiki tier at the platform level.
- **Rationale:** The wiki concept encodes product-level curation logic. Different products have different promotion models (auto-confidence vs human review). Baking wiki into the platform forces a curation philosophy that doesn't fit all domains.
- **Implication:** The existing consolidation pipeline elevates to Developer Memory as a product-layer component. Contact Memory uses a human review gate instead.

### 2. Tags replace binary `profile` field
The `profile: professional | personal` enum is replaced with `tags: string[]`.
- **Rationale:** The colleague entity exists simultaneously in Contact Memory (social/relational) and Developer Memory (technical). A binary field cannot express multi-domain membership.
- **Schema change:** `tags TEXT[] NOT NULL DEFAULT '{}'` with GIN index.
- **Reserved platform tags:** `contact`, `developer`, `colleague`, `personal`, `professional`
- **Product namespacing:** `project:*`, `contact:*` etc.
- **Migration:** `professional` → `['developer']`, `personal` → `['personal']`
- **ADR:** ADR-012 (drafted, to be submitted to AI Memory project)

### 3. Per-product MCP servers
Each product exposes its own domain-specific MCP toolset on top of platform primitives.

| MCP server | Owner | Example tools |
|---|---|---|
| Platform MCP | AI Memory platform | `capture_shard`, `search_shards`, `soft_delete`, `supersede` |
| Contact MCP | Contact Memory product | `get_contact_profile`, `search_commitments`, `add_fact`, `get_upcoming_dates` |
| Developer MCP | Developer Memory product | `search_decisions`, `log_constraint`, `get_project_context` |

- **Cross-domain queries:** Claude.ai connects to both product MCPs simultaneously. A query about a colleague spans Contact MCP (commitments, birthday) and Developer MCP (architectural decisions together).

### 4. WhatsApp parser output → wiki-tier via `memory_teach`
Parser output bypasses the platform's consolidation pipeline and commits directly as curated knowledge via `memory_teach`.
- **Rationale:** The WhatsApp parser IS the consolidation step for Contact Memory. Running it through a generic confidence-scoring pipeline designed for developer context is duplication of work.
- **Implication:** The parser is a first-class curation tool, not just a capture agent.

### 5. Human review gate is product-layer (Contact Memory)
Mandatory human review before any shard commits belongs to the Contact Memory product, not the platform.
- **Rationale:** The platform is designed for frictionless, high-volume developer context capture. Contact Memory data (relationships, commitments, sentiments about real people) requires intentional curation. Misextracted facts about real people are meaningful errors.
- **Implementation:** WhatsApp CLI presents extraction → user approves → CLI calls `memory_teach`. Platform stays append-only.

### 6. Android app is a thin Contact Memory client
The Android app calls a Contact Memory product API. It has zero knowledge of which AI provider is running underneath.
- **No agent gateway** between app and product — the supplier-agnostic concern lives inside the Contact Memory product layer.
- **Agentic runtime** (inside Contact Memory): receives query → retrieves context via Contact MCP → routes to configured AI provider → returns response.
- **Provider agnostic:** Claude, OpenAI, OpenCode, OpenRouter, or ACP-compatible agent can be swapped without changing the Android app.

### 7. Deployment: Supabase (local-first, cloud as target)
- **Local dev:** `supabase start` + `deno serve` — full local stack mirroring prod
- **Production:** Supabase cloud + Edge Functions
- **Storage:** Postgres + pgvector (ADR-011 alignment)
- **Files:** Supabase Storage for original WhatsApp `.txt` exports
- **Runtime:** Deno (Edge Functions locally and in cloud — same code, no drift)
- **Design principle:** Local-first is not deferred; it is the dev path. Cloud is a deploy-time promotion.

### 8. Android app scope: narrow (Contact Memory only)
The Android app remains a Contact Memory client. It does not become a general platform client.
- **Rationale:** Developer Memory is better served by Claude Code and Claude.ai on desktop. The mobile-native use case is social: checking a friend's profile before meeting them, adding a quick manual fact in the moment.

---

## Deferred Decisions

| Decision | Why deferred | When to revisit |
|---|---|---|
| Developer Memory consolidation pipeline design | Not blocking Contact Memory or Android app | Before Developer Memory implementation |
| ACP as agentic runtime protocol | Ecosystem is early; OpenRouter is simpler for now | When OpenCode or another ACP agent becomes a concrete integration target |
| Multi-user / sharing model | Christopher is sole user | If a second persona or external user is added |

---

## The Colleague Cross-Domain Case

The motivating proof of concept for the merged architecture:

A colleague entity carries tags `['contact', 'developer', 'colleague']`.
- Contact MCP surfaces: commitments made, their birthday, relationship sentiment
- Developer MCP surfaces: architectural decisions made together, project constraints they own
- Claude.ai queries both MCPs in a single session
- Example query: *"What did I commit to deliver to Sarah by end of sprint?"* → resolved across both domains

---

## Superseded Designs

The following earlier sketches are superseded by this record:
- `whatsapp_processor_system_design.md` — custom backend replaced by Supabase + Edge Functions
- `architecture_diagram.md` (Mermaid) — replaced by the updated 3-tier diagram

---

## Next Session Agenda: Contact Memory Implementation Planning

1. **Contact MCP tool definitions** — full tool spec (name, inputs, outputs, errors)
2. **Shard schema for contact domain** — what fields, what tags, what provenance
3. **WhatsApp parser CLI spec** — language choice (Python vs TypeScript/Deno), extraction rules, output format, review flow
4. **Android app MVP spec** — screens, flows, API contract with Edge Function
5. **Supabase project setup** — tables, RLS policies, Edge Function skeleton

### Open question for next session
**CLI language choice:** Python (simpler text processing, existing Claude integration) vs TypeScript/Deno (same runtime as Edge Functions, consistent stack). This was flagged as an open decision in the original requirements doc and is now unblocked.
