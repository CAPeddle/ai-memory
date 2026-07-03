# Bootstrap: Contact Memory Implementation Planning
**Origin:** Claude.ai architecture session, 2026-06-26  
**Destination:** Claude Code, ai-memory project  
**Purpose:** Orient a fresh session with full context and immediate direction

---

## What AI Memory Is

AI Memory is a **personal knowledge platform**. Products are built on top of it. Christopher is the sole user. Two products are in scope:

- **Contact Memory** — processes WhatsApp exports, builds structured contact profiles, tracks commitments/sentiment/events. Android app is its mobile client.
- **Developer Memory** — cross-AI technical context (decisions, constraints, project facts). Claude Code and Claude.ai are its clients.

The motivating cross-domain case: **work colleagues** exist in both products simultaneously. A colleague shard carries tags `['contact', 'developer', 'colleague']`. Claude.ai connects to both product MCPs in a single session to answer cross-domain queries.

---

## Architecture (Fully Resolved)

### Three-tier structure

```
┌──────────────────────────────────────────────────────────────┐
│                         CLIENTS                              │
│  Android app (Contact Memory)  ·  Claude.ai (cross-domain)  │
│  Claude Code (Developer Memory)                              │
└───────────────┬──────────────────────────┬───────────────────┘
                ↓                          ↓
┌──────────────────────────┐  ┌────────────────────────────────┐
│   Contact Memory         │  │   Developer Memory             │
│   (teal product)         │  │   (purple product)             │
│                          │  │                                │
│   Contact MCP            │  │   Developer MCP                │
│   Agentic runtime        │  │   Consolidation pipeline*      │
│   (supplier-agnostic)    │  │   (*deferred, not blocking)    │
│   WhatsApp parser CLI    │  │                                │
│   Human review gate      │  │                                │
└──────────────┬───────────┘  └────────────────┬───────────────┘
               │    MCP                MCP      │
               └──────────────┬────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                    AI Memory Platform                        │
│   Platform MCP  ·  Shard storage  ·  Hybrid search          │
│   Append-only · versioned shards · tags · BM25 + pgvector   │
└──────────────────────────────────────────────────────────────┘
```

### Key architectural decisions

**1. Single-tier platform — no wiki**  
The platform stores episodic shards only. There is no wiki tier at the platform level. The existing wiki/consolidation concept was a product-layer concern baked into the platform incorrectly. Each product owns its own promotion model.

**2. Tags replace binary `profile` field — ADR-012**  
`profile: professional | personal` is replaced with `tags: string[]`.  
Schema: `tags TEXT[] NOT NULL DEFAULT '{}'` with GIN index.  
Migration: `professional` → `['developer']`, `personal` → `['personal']`  
Reserved platform tags: `contact`, `developer`, `colleague`, `personal`, `professional`  
Product namespacing: `project:*`, `contact:*`  
ADR-012 is drafted and needs to be submitted to this project.

**3. Per-product MCP servers**  
Platform MCP: raw primitives (`capture_shard`, `search_shards`, `soft_delete`, `supersede`)  
Contact MCP: domain tools (`get_contact_profile`, `search_commitments`, `add_fact`, `get_upcoming_dates`)  
Developer MCP: domain tools (`search_decisions`, `log_constraint`, `get_project_context`)

**4. WhatsApp parser output → `memory_teach` (bypasses consolidation)**  
The parser is the consolidation step for Contact Memory. Output commits directly as curated knowledge via `memory_teach`. It does not go through the platform's generic confidence-scoring pipeline.

**5. Human review gate is product-layer (Contact Memory only)**  
The platform stays append-only and frictionless. Contact Memory wraps the capture path with a mandatory human review step before anything commits. The parser presents an extraction → user approves → CLI calls `memory_teach`.

**6. Android app is a thin Contact Memory client**  
No agent gateway between the app and the product. The app calls a Contact Memory product API endpoint. The supplier-agnostic agentic runtime lives inside the Contact Memory product layer — the app has zero knowledge of which AI provider is underneath.

**7. Deployment: Supabase (local-first, cloud as target)**  
- Local dev: `supabase start` + `deno serve` — full local stack
- Production: Supabase cloud + Edge Functions
- Storage: Postgres + pgvector (pgvector HNSW + tsvector GIN)
- Files: Supabase Storage for original WhatsApp `.txt` exports
- Runtime: Deno (Edge Functions — same code locally and in cloud)

**8. Android app scope: narrow (Contact Memory only)**  
Developer Memory is served by Claude Code and Claude.ai on desktop. Mobile use case is social: checking profiles before meeting someone, adding quick manual facts in the moment.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Platform storage | Postgres + pgvector (Supabase) |
| Hybrid search | BM25 (tsvector GIN) + vector (pgvector HNSW) |
| File storage | Supabase Storage |
| Edge runtime | Deno (Supabase Edge Functions) |
| Local dev | `supabase start` + `deno serve` |
| MCP protocol | MCP server (per product) |
| Android client | Kotlin + Jetpack Compose |
| WhatsApp parser | **OPEN — see below** |

---

## Open Decision: CLI Language (First Decision for This Session)

The WhatsApp parser is a CLI tool that:
1. Accepts a `.txt` WhatsApp export
2. Calls Claude to extract facts (events, commitments, sentiment, interests, dates, links)
3. Presents a human-readable extraction for review
4. On approval, calls `memory_teach` to commit to the platform

**Python**  
✅ Simpler text processing  
✅ Mature WhatsApp parsing approaches  
✅ Existing Claude Python SDK  
✅ Lower friction for extraction logic  
❌ Different runtime from Edge Functions (two languages in stack)

**TypeScript / Deno**  
✅ Same runtime as Edge Functions — one language across the full stack  
✅ Parser logic can be promoted into Edge Function code directly  
✅ Consistent with Supabase tooling  
❌ Slightly more setup for CLI tooling than Python  
❌ Text processing less ergonomic than Python

**Resolve this first.** Everything downstream (parser architecture, Edge Function skeleton, shard schema, Android API contract) flows from this choice.

---

## Immediate Session Agenda

Work through these in order:

### 1. ADR-012: Tags schema change
Submit to this project. Schema change is a prerequisite for all implementation work.

### 2. CLI language decision
See above. Decide and record as an ADR or implementation note.

### 3. Contact MCP tool definitions
Full tool spec for each Contact MCP tool:
- `get_contact_profile(contact_name: string)` → full profile
- `search_commitments(contact?: string, status?: string)` → matching commitments
- `add_fact(contact_name: string, fact: string, tags: string[])` → shard commit
- `get_upcoming_dates(days: int)` → upcoming birthdays/events

For each tool: inputs, outputs, errors, platform MCP calls it makes underneath.

### 4. Shard schema for contact domain
What a contact memory shard looks like:
- Which fields beyond platform primitives
- Which tags (reserved + product)
- Provenance fields (`source: whatsapp_export | manual | ai_session`, `capture_agent: cli | android | claude`)
- How contact identity is represented (name as string? UUID? linked entity?)

### 5. WhatsApp parser CLI spec
- Input format: `.txt` WhatsApp export
- Extraction targets: date range, events, commitments, interests, sentiment, important dates, links
- Output format: human-readable review document (markdown)
- Review flow: present → approve/edit → commit via `memory_teach`
- Deduplication: how to handle re-processing a chat with overlapping date range
- Error handling: malformed exports, ambiguous extractions

### 6. Supabase project setup
- Tables and migrations for ADR-012 tag schema
- RLS policies (single user, so simple)
- Edge Function skeleton for Contact Memory product API
- Storage bucket for WhatsApp exports

### 7. Android app MVP spec
- Screens: file picker, review/approval, fact builder, profile viewer
- API contract with Contact Memory Edge Function
- Authentication (how Android authenticates to Supabase Edge Function)

---

## Deferred (Do Not Scope Now)

- Developer Memory consolidation pipeline design
- ACP as agentic runtime protocol
- Multi-user or sharing model
- Cross-contact search and relationship analytics
- Google Calendar integration (flagged in original requirements, defer until core is working)

---

## Source Documents in This Project

Check for these existing files — they predate this session and may contain earlier design assumptions that are now superseded by the decisions above:

- `STRATEGY` / `gemini-code-*.md` — AI Memory strategy doc. The wiki tier concept in this doc is superseded by decision #1 above.
- `SRS` — System requirements. The two-tier shard/wiki model is superseded. Tags replace binary `profile` field (ADR-012).
- `SystemDesign` — Check for wiki promotion pipeline references (now product-layer).
- `ADRs 004–011` — ADR-012 (tags) needs to be added.
- `whatsapp_contact_system_requirements.md` — Original WhatsApp contact system requirements. Architecture superseded but data extraction requirements (commitments, sentiment, events, interests, links) remain valid.

The **data model and extraction requirements** from the WhatsApp doc are still accurate. The **architecture** (local JSON index, git-tracked files, direct CLI-to-mobile) is superseded by the platform approach.

---

## Skills Needed in This Session

The following knowledge areas will be needed. Acquire or create skills for these before starting implementation:

### Priority 1 — Needed immediately
**MCP server implementation**  
How to build MCP servers (tool definitions, transport, handler patterns). In Python (FastMCP) or TypeScript (MCP SDK). Required for Contact MCP and Developer MCP implementation.  
→ Look for `mcp-builder` skill or equivalent. If not available, check https://modelcontextprotocol.io/docs and create a skill from it.

**Supabase + pgvector**  
Local dev setup (`supabase start`), Edge Functions (Deno), pgvector HNSW indexes, tsvector GIN, RLS policies, Supabase Storage, `supabase-js` client.  
→ No skill observed in this session. Create one from https://supabase.com/docs.

### Priority 2 — Needed for parser implementation
**Deno / TypeScript for CLI** (if TypeScript chosen)  
Deno CLI tooling, `deno compile`, TypeScript patterns for text processing, Anthropic SDK for Deno.

**Python CLI tooling** (if Python chosen)  
Click or Typer for CLI, Python Anthropic SDK, text parsing patterns.

### Priority 3 — Needed for Android
**Android / Kotlin + Compose**  
Jetpack Compose patterns, Retrofit/OkHttp for HTTP, file picker implementation, markdown rendering.

### Available in this session (may or may not be available in Claude Code)
- `architecture-fundamentals` — formal architecture decision frameworks, ADR format, trade-off analysis. Useful if design decisions arise during implementation. Check `/mnt/skills/user/architecture-fundamentals/`.
- `mcp-builder` — MCP server building guidance. Check `/mnt/skills/examples/mcp-builder/`.

---

## ADR-012 — Ready to Submit

Full text is in `ADR-012-tags-replace-binary-profile.md` (generated in the Claude.ai session). Key change:

```sql
-- Remove
profile VARCHAR CHECK (profile IN ('professional', 'personal'))

-- Add  
tags TEXT[] NOT NULL DEFAULT '{}'

-- Index
CREATE INDEX idx_memory_shards_tags ON memory_shards USING GIN (tags);
```

Migration:
```sql
UPDATE memory_shards SET tags = ARRAY['developer'] WHERE profile = 'professional';
UPDATE memory_shards SET tags = ARRAY['personal'] WHERE profile = 'personal';
ALTER TABLE memory_shards DROP COLUMN profile;
ALTER TABLE memory_shards ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
```

---

## One-Line Orientation for Claude Code

> We are implementing Contact Memory — a product on the AI Memory platform. Contact Memory processes WhatsApp exports into structured contact profiles stored as shards in Supabase (Postgres + pgvector), exposed via a Contact MCP server, with a supplier-agnostic agentic runtime in a Supabase Edge Function (Deno), and a thin Android client. First decision: Python or TypeScript/Deno for the WhatsApp parser CLI?

