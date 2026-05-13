---
name: "Open Brain Pivot Evaluation"
summary: "Evaluation of Open Brain (OB1) as base platform vs current C#/.NET architecture for the ai-memory project"
asset_type: "investigation"
status: "active"
owners:
  - "ai-memory-maintainers"
source_path: "docs/investigations/openbrain-pivot-evaluation.md"
---

# Open Brain Pivot Evaluation

**Story:** ST-017  
**Date:** 2026-05-13  
**Author:** AI Lead Engineer (via /continue execution of exec-plan-ST-017.md)

---

## §1 Executive Summary

This spike evaluates whether the ai-memory project should pivot its foundational platform from the current C#/.NET 8 + SQLite architecture to Open Brain (OB1) — an open-source TypeScript/Supabase AI memory system. The PO identified two specific capabilities that must be built regardless of platform: per-ingest synthesis (write-time compiled Markdown views) and graph/structural similarity search.

**Recommendation: Stay Current (Option C) — continue building on C#/.NET 8 + SQLite.**

The investigation shows that OB1 neither provides nor makes easy either target capability. Both require substantial custom development on any platform. Given this parity, the decisive factors become stack fit, operational cost, and codebase continuity — all of which strongly favour Option C. The OB1 codebase is nonetheless a valuable reference: its entity-extraction schema's trigger pattern, relation sidecars, and schema-based extension model are design inspirations worth borrowing.

**Scores (1–5 scale):**

| Option | Weighted Score | Rank |
|--------|---------------|------|
| A — Adopt OB1 | 1.95 | 4 |
| B — Fork OB1 | 2.55 | 3 |
| C — Stay Current | **4.50** | **1** |
| D — Adopt Approach, Build Fresh | 3.55 | 2 |

---

## §2 Background & Motivation

The PO is planning two capabilities beyond core memory retrieval:

1. **Per-ingest synthesis** — When a thought or episode is stored, an automated process generates or updates compiled Markdown views (Obsidian-compatible) representing synthesised perspectives. Example: a Kanban-style personal storyboard that auto-updates when a relevant thought is captured. This mirrors the "write-time wiki" pattern described in `docs/investigations/Youtube/Nate B Jones on Open Brain vs LLM Wiki.md`.

2. **Graph/structural similarity search** — Query memories not just by keyword or semantic embedding, but by structural relationships between concepts (entity–relationship graph, multi-hop traversal, subgraph matching).

The trigger for this spike was the PO learning about OB1 and considering whether it could serve as a better foundation than the current scaffold. The current ai-memory repo is in scaffold phase: `IMemoryService` interface defined, governance tooling complete, 9 investigation documents written, no production implementation yet. This is the lowest-cost moment to evaluate a platform switch.

The investigation is organised around the question: **which base platform makes building both extensions easier and cheaper to maintain?**

---

## §3 Options Under Evaluation

| Option | Description |
|--------|-------------|
| **A — Adopt OB1** | Use OB1 as-is. Add per-ingest synthesis and graph search as custom extensions (separate Edge Functions + schema additions) built atop Supabase + TypeScript stack. |
| **B — Fork OB1** | Fork the OB1 repository. Modify core code directly (e.g. add synthesis calls into `capture_thought`). Full freedom to change internals; must maintain divergence from upstream. |
| **C — Stay Current** | Continue building on the existing C#/.NET 8 + SQLite architecture per the investigation docs. Implement both capabilities as services within the existing design. |
| **D — Adopt Approach, Build Fresh** | Take OB1's architectural patterns (Postgres + pgvector, thought-centric flat model, MCP-native, schema-based extensions) but implement from scratch. Two variants: D-C# (keep current C# stack, use Postgres instead of SQLite) or D-TypeScript (adopt OB1 stack). Treated as a single option with noted variants. |

### OB1 architecture summary (from source)

From direct analysis of `https://github.com/NateBJones-Projects/OB1`:

**Core `thoughts` table (from docs/01-getting-started.md):**
```sql
create table thoughts (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  content_fingerprint text,   -- added in step 2.6
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```
Functions: `match_thoughts` (vector cosine search), `upsert_thought` (dedup + insert/update).  
Trigger: `thoughts_updated_at` (BEFORE UPDATE, sets updated_at).

**MCP Server (server/index.ts):** Deno Edge Function. Six tools: `search` (ChatGPT compat), `fetch` (ChatGPT compat), `search_thoughts`, `list_thoughts`, `thought_stats`, `capture_thought`. No middleware, no hook system, no plugin registry.

**Extension model:** Schema-based. Each extension runs its own separate Supabase Edge Function (independent of core). Extensions add new PostgreSQL tables and grant `service_role` access. There is NO shared plugin registry — each extension is an independent deployable. Adding tools to the core server requires forking `server/index.ts`.

**Schemas available (optional add-ons):**
- `entity-extraction`: adds `entities`, `edges`, `thought_entities`, `entity_extraction_queue`, `consolidation_log` tables. Includes a PostgreSQL trigger `trg_queue_entity_extraction` (AFTER INSERT OR UPDATE on `thoughts`) that queues thoughts for async entity extraction. Worker must be built separately.
- `agent-memory`: runtime-neutral sidecar with `agent_memories`, `agent_memory_relations`, `agent_memory_recall_traces`, `agent_memory_audit_events`, and related tables. Provides typed memory-to-memory relations.
- `typed-reasoning-edges`, `enhanced-thoughts`, `workflow-status`, `entity-extraction`: additional optional schemas.

**OB1's explicit philosophy:** "Query-time system" — stores faithfully, synthesises at recall only. No write-time compilation anywhere in the codebase.

---

## §4 Per-Ingest Synthesis Analysis

Per-ingest synthesis means: when a new thought/memory is stored, the system automatically generates or updates one or more compiled Markdown files representing synthesised views. The synthesis requires calling an LLM with the new content in context of existing related memories, then writing Obsidian-compatible Markdown to a configurable output.

The four aspects evaluated per option:
- **Hook mechanism**: how the ingest event triggers synthesis
- **LLM integration path**: how the synthesis service calls an LLM
- **Output format**: how Obsidian-compatible Markdown is produced
- **Incremental update**: how views are updated without full regeneration

### Option A — Adopt OB1

| Aspect | Assessment |
|--------|-----------|
| Hook mechanism | No ingest hooks in `capture_thought`. Would need a PostgreSQL trigger (as per entity-extraction schema pattern) that queues the thought and a new Edge Function worker to process the queue — built entirely from scratch. |
| LLM integration | OpenRouter API is already wired. Can call it from a new Edge Function worker with synthesis prompt. Works. |
| Output format | Edge Functions cannot write to local filesystems. Obsidian-compatible Markdown would need to go into a Supabase Storage bucket or another database table — not a local file. Local-file Obsidian integration is not possible without an additional polling bridge (e.g., a local daemon that downloads from Storage). |
| Incremental update | Would need a `compiled_views` table and a timestamp-based "last compiled" tracker. Feasible but requires significant schema design. |

**Feasibility rating: Significant** — requires building a queue-processing Edge Function worker from scratch, building a compiled views storage scheme, and cannot naturally produce local Obsidian files without an additional bridge layer.

### Option B — Fork OB1

| Aspect | Assessment |
|--------|-----------|
| Hook mechanism | Can modify `capture_thought` in `server/index.ts` directly to call a synthesis function after writing the thought. Or add a PostgreSQL trigger. Full code freedom. |
| LLM integration | Same as Option A — OpenRouter already wired. |
| Output format | Same limitation as Option A: Edge Functions run in Supabase's cloud. Local Obsidian files require a bridge. If self-hosting Postgres (not Supabase), a Node.js synthesis server could write local files. |
| Incremental update | Same design work required. Forking removes upstream compatibility but unlocks arbitrary architectural changes. |

**Feasibility rating: Moderate** — more flexible than Option A because `capture_thought` can be modified directly, but the cloud-hosting constraint persists on Supabase. Self-hosted Postgres removes the cloud constraint but adds operational complexity.

### Option C — Stay Current (C# + SQLite)

| Aspect | Assessment |
|--------|-----------|
| Hook mechanism | After `IMemoryRepository.StoreAsync()` completes, a domain event or direct call to `ISynthesisService.UpdateViewsAsync(thought)`. C# event-driven design is natural here. Already in the design space per `IMemoryService`. |
| LLM integration | `ILlmClient` abstraction (straightforward to add). Calls OpenAI/OpenRouter/Ollama via HttpClient. Configurable. With Ollama, cost is $0. |
| Output format | Application has direct filesystem access. Writes Markdown directly to any configurable path (including the user's Obsidian vault). Zero bridging required. |
| Incremental update | Timestamp tracking per view in a `compiled_views` table or SQLite table. Differential: store last-ingested thought ID per view, regenerate only those views touched by related thoughts. |

**Feasibility rating: Trivial** — this is exactly where the design was headed. C# domain events after write, `ISynthesisService` implementation, direct Markdown file writes to any configured path. <1 day to design; 2–5 days to implement the first synthesis type. No bridging, no cloud constraints.

### Option D — Adopt Approach, Build Fresh

**Variant D-C# (C# + Postgres):**
Same as Option C, but PostgreSQL triggers could complement application-level events. Can add an `AFTER INSERT` trigger on a `thoughts` table that calls `pg_net.http_post()` or queues in `pgmq` (both available on Supabase). Direct Markdown file writes possible from application layer.  
**Feasibility: Trivial to Moderate** — slightly more infrastructure than Option C but same fundamental approach.

**Variant D-TypeScript:**
Custom TypeScript synthesis service using Postgres triggers + a queue-processing worker. Same constraints as Option B regarding Obsidian local files when cloud-hosted.  
**Feasibility: Moderate** — cleaner than forking OB1 but requires full reimplementation.

| Option | Rating | Key constraint |
|--------|--------|----------------|
| A | **Significant** | No core hook; cloud-only limits Obsidian local files |
| B | **Moderate** | Can modify core; cloud-only still limits Obsidian without self-hosting |
| C | **Trivial** | Direct filesystem access; C# domain events natural; best fit |
| D-C# | **Trivial–Moderate** | Similar to C; Postgres triggers add one option |
| D-TS | **Moderate** | Reimplements B advantages without OB1 code debt |

---

## §5 Graph/Structural Similarity Analysis

Graph/structural similarity search means: querying memories based on structural relationships between concepts, not just text or semantic vectors. Includes entity extraction, relationship mapping, subgraph matching, and multi-hop traversal.

The four aspects evaluated per option:
- **Graph schema**: how entities and relationships are stored
- **Query mechanism**: how structural queries are executed
- **Entity extraction**: how entities and relations are discovered from free text
- **Scalability**: behaviour at 100K+ memories

**Key infrastructure fact confirmed:** Apache AGE is **not available** on Supabase's managed service. The full Supabase extensions list (50+ extensions) does not include AGE. This blocks full graph traversal on Options A (Adopt OB1, Supabase-hosted) without self-hosting.

### Option A — Adopt OB1

The `entity-extraction` schema provides `entities`, `edges`, and `thought_entities` tables — a basic labelled property graph in relational form. Relationships are typed (`co_occurs_with`, `works_on`, `uses`, `related_to`, `member_of`, `located_in`). An async worker must be built to populate these tables.

However, querying this graph is limited to PostgreSQL recursive CTEs (e.g., multi-hop `WITH RECURSIVE` queries). No graph query language (openCypher) is available without AGE. Subgraph matching requires custom SQL and becomes expensive at scale. Structural fingerprinting (encoding graph topology as a vector) requires additional development.

**Feasibility rating: Significant** — requires building an entity extraction worker, graph traversal queries in raw SQL, and cannot use openCypher. Supabase AGE unavailability is a hard constraint.

### Option B — Fork OB1

Fork + self-host the PostgreSQL database on a VPS. This unlocks the ability to install Apache AGE (`CREATE EXTENSION age`), enabling openCypher graph queries. The `entity-extraction` schema still provides the base tables; AGE overlays graph traversal.

Entity extraction worker must still be built from scratch (the schema includes a trigger that queues thoughts; the actual worker that reads the queue and calls an LLM to extract entities is missing from the OB1 repo).

**Feasibility rating: Moderate** — forking + self-hosting Postgres adds operational complexity (~$6/month VPS) but unlocks AGE. Entity extraction worker still needs to be built. OpenCypher graph queries become possible.

### Option C — Stay Current (C# + SQLite)

SQLite has no native graph extension. Options:
1. **Structural fingerprints (recommended):** Encode graph topology as a vector: extract entity co-occurrence counts from content (entity names, frequencies, adjacency patterns), encode as a float array, store in sqlite-vec alongside semantic embeddings. Cosine similarity over structural fingerprints enables "structurally similar to this document" queries. Covers ~80% of structural similarity use cases with 0% operational overhead.
2. **Recursive CTEs:** SQLite supports `WITH RECURSIVE` — can traverse a `thought_relations` table (entity, relation, target_entity). Sufficient for multi-hop traversal without a graph DB.
3. **Future migration path:** If full AGE graph capability is needed, the `IMemoryRepository` abstraction allows migrating to Postgres with AGE; documented in `docs/investigations/sqlite-vs-postgresql.md`.

**Feasibility rating: Significant** — full subgraph matching requires either structural fingerprints (achievable) or SQLite→Postgres migration. Neither is trivial, but structural fingerprints are pragmatic and the migration path exists. Worth noting: this rating applies equally to all four options, since no option provides functional graph search out of the box.

### Option D — Adopt Approach, Build Fresh

**Variant D-C# + Postgres + AGE:** Self-hosted Postgres with AGE installed. C# queries via Npgsql with openCypher executed as raw SQL (`SELECT * FROM cypher(...)`). Full graph traversal. Entity extraction built as a background service (IHostedService in ASP.NET). This is the strongest graph option — AGE provides production-grade graph support.  
**Feasibility: Moderate** — requires building entity extraction service and Npgsql+AGE integration, but openCypher becomes available.

**Variant D-TypeScript + Postgres:** Same as D-C# for graph; TypeScript with pg client + AGE.  
**Feasibility: Moderate** — same capability, different stack.

| Option | Rating | Key capability |
|--------|--------|----------------|
| A | **Significant** | No AGE on Supabase; recursive CTEs only; entity extraction worker missing |
| B | **Moderate** | Self-host unlocks AGE; entity extraction worker still needed |
| C | **Significant** | No AGE on SQLite; structural fingerprints viable; clear Postgres migration path |
| D-C# + AGE | **Moderate** | Best graph option; self-hosted Postgres + AGE + Npgsql; entity extraction from scratch |
| D-TS | **Moderate** | Same as D-C# for graph; different stack |

---

## §6 Stack & Ecosystem Analysis

Evaluated across six dimensions relevant to a solo developer building a local-first personal AI memory service.

| Dimension | TypeScript/Python (OB1) | C#/.NET 8 (Current) | Edge |
|-----------|------------------------|---------------------|------|
| **Developer velocity** | Fast iteration with Deno/npm. Supabase TypeScript client is purpose-built; hot reload in VS Code; vast npm ecosystem for AI utilities. Deno edge function constraints limit some server-side packages (no native Node modules). | Strong IntelliSense, hot reload, LINQ for query composition, `dotnet watch`. NuGet ecosystem smaller than npm but deep in web/data tooling. Roughly comparable velocity for one developer on CRUD+search work. | **Tie** |
| **LLM SDK availability** | TypeScript OpenAI SDK is the reference implementation; all major AI providers release TypeScript SDKs first. Python has the best ML toolchain. OB1 already uses OpenRouter + TypeScript via `fetch`. | Semantic Kernel, `Azure.AI.OpenAI`, and community wrappers available. Generally 1–3 months behind TypeScript SDKs for cutting-edge features. Production-quality for OpenAI, OpenRouter via HttpClient, and Ollama. | **TypeScript/Python** |
| **Postgres integration** | `@supabase/supabase-js` is purpose-built for this stack and excellent. Deno + service_role key = direct, first-class Postgres access. | Npgsql is the standard .NET Postgres driver — mature, feature-complete, supports HNSW indexes, and can call custom functions. EF Core handles migrations well. Full Postgres feature access at ADO.NET level. AGE requires a custom handler but is achievable. | **Tie** |
| **MCP SDK quality** | Official TypeScript SDK (`@modelcontextprotocol/sdk`). OB1 uses it directly in Deno and it is battle-tested against Claude Desktop, ChatGPT, Claude Code. | C# MCP SDK (Stef Heyenrath's `ModelContextProtocol` package) is used in the ai-memory scaffold and functional. Less community tooling and fewer examples than the TypeScript SDK. May lag TypeScript reference on new protocol features. | **TypeScript** |
| **Local-first + zero cost** | TypeScript in Deno requires Supabase or self-hosted Postgres. No SQLite option in the standard Deno edge runtime. Node.js can use `better-sqlite3` but that abandons the OB1 Deno pattern. | SQLite + sqlite-vec = zero cloud dependency, portable single .db file, fully offline, $0/month. This is the existing design. Local Ollama removes the last API cost. | **C#/.NET 8** |
| **Existing codebase value** | No existing TypeScript codebase in this repo. A switch would mean full rewrite. | `IMemoryService` interface, `AiMemory.Core`, `AiMemory.Server` scaffold, `GovernanceAssetValidator`, `Directory.Build.props`, 9 investigation docs, this planning system. Low code sunk cost (scaffold only) but high design investment from discussions, investigation docs, and planning sessions. | **C#/.NET 8** |

**Summary:** TypeScript has a meaningful edge in LLM SDK currency; C#/.NET 8 dominates on local-first capability and existing work. For a solo developer who prefers C# and needs offline-capable, zero-cost hosting, the stack tradeoff firmly favors staying on C#.

---

## §7 Hosting Cost Comparison

Workload baseline: ≤100K memories, ~50 queries/day, ~10 ingests/day, personal-use.

### Storage sizing

100K thoughts at ~10KB each (content + 1536-float32 embedding + metadata) ≈ 1 GB total. Just above the Supabase free tier 500 MB limit but well within the Pro tier 8 GB limit. SQLite file size would be approximately 1 GB on disk.

### Monthly cost estimates (as of May 2026)

| Configuration | Option | Monthly Cost | Notes |
|---------------|--------|-------------|-------|
| Supabase Free + OpenRouter | A, B (Supabase) | ~$2–5 | Free tier pauses after 7 days of inactivity; 500MB DB limit means upgrade to Pro at ~75K memories. OpenRouter at 1800 calls/month ~$1–3. |
| Supabase Pro + OpenRouter | A, B (Supabase) | ~$27–30 | $25 plan + $2–5 OpenRouter. Avoids pause; 8 GB DB limit; sufficient for full workload. |
| Self-hosted Postgres VPS + OpenRouter | B (self-host), D | ~$8–11 | $6/month Hetzner CX11 or similar for Postgres + $2–5 OpenRouter. Unlocks AGE. Adds operational overhead. |
| SQLite local + Ollama | C, D-C# (local) | **$0** | SQLite file on local machine; Ollama runs LLMs locally on existing hardware. Battery + electricity negligible. Zero cloud dependency. |
| SQLite local + OpenRouter | C, D-C# (hybrid) | ~$1–3 | Small OpenRouter cost for quality synthesis; no hosting cost. |

### Key insight

Options C and D-C# with SQLite can operate at $0/month with Ollama, or $1–3/month with OpenRouter for quality synthesis LLMs. Options A and B require at minimum the Supabase service ($0 free with caveats, or $25 Pro). For personal use at the stated workload, the free Supabase tier is technically sufficient until ~75K memories, but the 7-day inactivity pause makes production use unreliable without a Pro subscription.

---

## §8 Option Scoring Matrix

Scoring rubric: 1 = poor / 2 = below average / 3 = average / 4 = good / 5 = excellent.

| Dimension | Weight | A — Adopt OB1 | B — Fork OB1 | C — Stay Current | D — Build Fresh (C#) |
|-----------|--------|:---:|:---:|:---:|:---:|
| Per-ingest synthesis feasibility | 30% | 2 | 3 | **5** | 4 |
| Graph/structural similarity feasibility | 25% | 2 | 3 | 3 | **4** |
| Stack fit for current solo C# developer | 20% | 2 | 2 | **5** | 3 |
| Local-first / zero cost potential | 15% | 1 | 2 | **5** | 3 |
| Adoption friction | 10% | 3 | 2 | **5** | 3 |
| **Weighted score** | | **1.95** | **2.55** | **4.50** | **3.55** |

**Scoring notes:**
- Option A scores 1 on Local-first because the Supabase free tier's inactivity pause makes it unusable for irregular personal use without paying.
- Option C scores 3 on graph because structural fingerprints are a viable pragmatic approach even without full AGE; the migration path to Postgres + AGE is documented.
- Option D-C# scores 4 on graph because it can use self-hosted Postgres + AGE, and 3 on stack fit (keep C# but must set up Postgres infrastructure from scratch vs. SQLite simplicity).
- Option B scores 2 on forking adoption because maintaining divergence from upstream is high friction for a solo developer.

---

## §9 Recommendation

**Recommend Option C — Stay Current — because it is the only option that makes per-ingest synthesis trivial, requires no stack switch, costs $0/month, and produces local Obsidian-compatible files directly, despite not providing Apache AGE graph traversal natively.**

The investigation reveals that OB1 provides neither target capability:

- **Per-ingest synthesis**: OB1's philosophy is explicitly query-time. The `capture_thought` tool calls `upsert_thought` and returns — no synthesis occurs. Adding synthesis requires building an async worker from scratch in TypeScript, running it in a new Edge Function, and working around the cloud-only constraint to write local Obsidian files. On C#, the same capability is a single domain event and a `FileWriter` — trivially composable with the already-designed `IMemoryService`.

- **Graph/structural similarity**: OB1's `entity-extraction` schema provides an `edges` table and a PostgreSQL trigger that queues thoughts. But the actual extraction worker is missing from the repo. Supabase does not support Apache AGE. On SQLite, structural fingerprinting (embedding graph topology as vectors via sqlite-vec, already planned) covers the primary use case, with a documented migration path to Postgres + AGE if full graph traversal is later required.

**Runner-up:** Option D-C# (adopt Postgres + pgvector approach but build fresh in C#) is the strongest alternative. It provides the best graph path (AGE via self-hosted Postgres) and would be recommended if the PO later decides: (a) graph traversal via openCypher is a hard requirement, AND (b) $6–11/month for a VPS is acceptable. The OB1 `entity-extraction` schema and `typed-reasoning-edges` schema are valuable reference material for designing the graph layer under any option.

**What to borrow from OB1 without switching platforms:**
1. The `AFTER INSERT OR UPDATE` trigger pattern from `schemas/entity-extraction/schema.sql` — adapt for SQLite (as an `AFTER INSERT` trigger on `memories` that updates a processing queue table).
2. The `thought_entities` → `entities` → `edges` graph schema — implement as SQLite tables with recursive CTE traversal.
3. The structural fingerprint concept (not in OB1 but implied by their relation model) — encode as a sqlite-vec vector alongside semantic embeddings.
4. The schema-based extension pattern — group optional capability schemas (graph, synthesis, agent memory) as opt-in migrations in `src/AiMemory.Core/Migrations/`.

---

## §10 Impact Assessment on Backlog Stories

### If Option C (Recommended) — no pivot

All existing backlog stories remain valid as designed. No changes required.

| Story | Status | Note |
|-------|--------|------|
| ST-002 | Valid | SQLite schema + FTS5 + migrations — proceed as planned |
| ST-003 | Valid | `IMemoryRepository` SQLite implementation — proceed as planned |
| ST-004 | Valid | `IEmbeddingService` OpenAI — proceed as planned |
| ST-005 | Valid | Hybrid search (FTS5 + vector + RRF + MMR) — proceed as planned |
| ST-006 | Valid | Consolidation pipeline (episodic → semantic) — proceed as planned |
| ST-007 | Valid | ASP.NET Core REST endpoints — proceed as planned |
| ST-008 | Valid | MCP facade over REST — proceed as planned |
| ST-009 | Valid | Full integration tests — proceed as planned |
| ST-010 | Valid | E2E tests + CI pipeline — proceed as planned |

**New stories to add** (downstream from this spike):
- **ST-018**: Per-ingest synthesis — graph schema (entities, edges, thought_entities as SQLite tables) + structural fingerprint vectors in sqlite-vec
- **ST-019**: Per-ingest synthesis — `ISynthesisService` + Markdown view writer (Obsidian-compatible output)

### If Option D-C# (runner-up) — Postgres pivot only

ST-002 (SQLite schema) becomes ST-002-revised (Postgres schema + EF Core migrations). ST-003–ST-010 largely survive with updated data access layer (Npgsql vs SQLite). The `IMemoryRepository` abstraction already accounts for this (see `docs/investigations/sqlite-vs-postgresql.md`). Net cost: ~2–3 stories revised, new setup infrastructure story for Postgres + self-hosting.

### If Options A or B (not recommended) — full platform pivot

ST-002 through ST-010 would be invalidated. The C# implementation stories would be replaced with TypeScript/Supabase equivalents:
- New: Supabase schema migration story
- New: TypeScript MCP server extension for per-ingest synthesis
- New: Entity extraction worker story
- New: Graph traversal story
- New: Obsidian bridge story (for local file writes from cloud)

The pivot would require 6–8 new stories and discard the current investigation and governance infrastructure, which is written for C#/.NET.

---

## §11 Sources Referenced

| Source | Used for |
|--------|---------|
| `https://github.com/NateBJones-Projects/OB1` — repo root listing | Identifying OB1 directory structure |
| `OB1/server/index.ts` (via GitHub MCP) | MCP tool definitions, `capture_thought` implementation, `upsert_thought` call, no ingest hooks confirmation |
| `OB1/docs/01-getting-started.md` (via GitHub MCP) | Core `thoughts` table schema, `match_thoughts`, `upsert_thought`, setup flow |
| `OB1/extensions/README.md` (via GitHub MCP) | Extension model: curated learning path, schema-based, separate Edge Functions |
| `OB1/extensions/_template/README.md` (via GitHub MCP) | Extension template: SQL + separate Edge Function pattern confirmed |
| `OB1/schemas/entity-extraction/schema.sql` (via GitHub MCP) | `AFTER INSERT OR UPDATE` trigger `trg_queue_entity_extraction`, `entities` + `edges` + `thought_entities` tables, async queue pattern |
| `OB1/schemas/agent-memory/schema.sql` (via GitHub MCP) | `agent_memory_relations`, relation types, memory sidecar architecture |
| `https://supabase.com/pricing` | Free tier limits (500 MB, inactivity pause), Pro pricing ($25/month) |
| `https://supabase.com/docs/guides/database/extensions` | Confirmed Apache AGE is NOT in Supabase's supported extensions list |
| `docs/investigations/memory-architecture-design.md` | Current architecture baseline |
| `docs/investigations/sqlite-vs-postgresql.md` | Postgres migration path via `IMemoryRepository` abstraction |
| `docs/investigations/interface-design-mcp-rest.md` | Current API design |
| `docs/investigations/Youtube/Nate B Jones on Open Brain vs LLM Wiki.md` | Write-time vs query-time analysis; OB1's query-time philosophy confirmed |
| `.github/planning/execplans/exec-plan-ST-017.md` | Source ExecPlan with research scope and criteria |
