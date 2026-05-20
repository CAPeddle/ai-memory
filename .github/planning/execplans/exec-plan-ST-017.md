# ExecPlan — ST-017: Evaluate Open Brain as base layer vs current architecture

> Status: ✅ Complete — OpenRouter revision incorporated; awaiting renewed PO review
> Story: ST-017
> Created: 2025-07-17
> Parent: docs/investigations/memory-architecture-design.md
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

### What this spike achieves

This spike evaluates whether the ai-memory project should change its foundational platform. The PO is considering whether Open Brain (OB1) — an open-source AI memory system — could replace the current C#/.NET architecture as the base layer. The deliverable is a scored investigation document with a clear recommendation across four platform options.

### Why this spike exists

The PO wants two capabilities that neither the current architecture nor OB1 provides out-of-the-box:

1. **Per-ingest synthesis** — When a thought/episode is ingested, automatically generate or update compiled Markdown views (Obsidian-compatible) that represent synthesised perspectives. Example: a Kanban-style personal storyboard that auto-updates whenever a relevant thought is captured.

2. **Graph/structural similarity search** — Query memories not just by text keywords or vector similarity, but by structural relationships between concepts (entity-relationship graph, subgraph matching, multi-hop traversal). Example: "show me all thoughts structurally similar to this planning session."

Since both extensions must be built regardless of platform, the question is: which base platform makes building them easier and more maintainable?

### Current ai-memory architecture (comparison baseline)

| Aspect | Detail |
|--------|--------|
| Stack | C# 12 / .NET 8+ |
| Storage | SQLite + FTS5 full-text search + sqlite-vec (vector embeddings) |
| Core model | `semantic_memories` (evergreen facts) + `episodic_memories` (session logs) + `recall_events` (search logs) |
| Consolidation | Episodic → semantic promotion pipeline with scoring: `0.40 × frequency + 0.35 × diversity + 0.25 × relevance`, threshold ≥ 0.7 |
| Search | Hybrid: FTS5 (BM25) + vector (cosine) → Reciprocal Rank Fusion → MMR diversity (λ=0.7) |
| Interface | MCP facade over ASP.NET Core Minimal API REST endpoints |
| Hosting | Local-first (portable single-file SQLite DB, zero cloud dependency) |
| Repo state | Scaffold only — `IMemoryService` interface defined; no production implementation yet |
| Key files | `src/AiMemory.Core/IMemoryService.cs`, `src/AiMemory.Server/Program.cs` |
| Postgres path | Designed via `IMemoryRepository` abstraction; migration documented in `docs/investigations/sqlite-vs-postgresql.md` |

### Open Brain (OB1) architecture (candidate platform)

| Aspect | Detail |
|--------|--------|
| Stack | TypeScript (53%), Python (14%), PLpgSQL (9%) |
| Storage | Supabase (PostgreSQL + pgvector) |
| License | FSL-1.1-MIT (personal use permissive; competitive use restricted for 2 years, then MIT) |
| Core model | Flat `thoughts` table with vector embeddings; no consolidation pipeline |
| MCP server | TypeScript, stdio transport |
| Extensions | Community recipes (import: ChatGPT, Obsidian, Slack, Discord, email), skills, schemas, dashboards |
| Agent Memory | Provenance, relation, recall-trace, audit sidecars |
| Philosophy | "Query-time system" — stores faithfully, synthesizes at recall only |
| Hosting | Cloud-first (Supabase + OpenRouter by default) |
| Repo | https://github.com/NateBJones-Projects/OB1 (3k stars, 576 forks, 20+ contributors) |

### Known gaps in OB1 for PO requirements

1. **No built-in per-ingest synthesis** — OB1 is explicitly query-time and has no compiled views. The core `capture_thought` flow has no middleware hook, though the optional `entity-extraction` schema demonstrates that trigger-based ingest processing is possible.
2. **No graph/structural similarity** — Basic `relation` sidecars exist but no graph database, structural fingerprinting, or subgraph matching.
3. **Stack mismatch** — OB1 is TypeScript/Python; current ai-memory is C#/.NET.

### Terms of art

| Term | Definition |
|------|-----------|
| **Per-ingest synthesis** | Automatically generating/updating compiled Markdown views when new data is ingested (write-time compilation, Karpathy wiki-style) |
| **Query-time system** | A system that stores raw data faithfully and synthesises/summarises only when queried (OB1's design) |
| **Write-time system** | A system that processes and compiles data at ingest time to maintain pre-built knowledge views (Karpathy's LLM Wiki) |
| **RRF** | Reciprocal Rank Fusion — a score-independent method for combining ranked result lists from multiple retrieval strategies |
| **MMR** | Maximal Marginal Relevance — a re-ranking technique that balances relevance with diversity to avoid near-duplicate results |
| **Supabase** | Open-source Firebase alternative built on PostgreSQL; provides auth, realtime, storage, and edge functions |
| **pgvector** | PostgreSQL extension for vector similarity search using HNSW or IVFFlat indexes |
| **Apache AGE** | PostgreSQL extension that adds graph database capabilities (openCypher query language) |
| **sqlite-vec** | SQLite extension for vector similarity search |
| **Obsidian** | A Markdown-based personal knowledge management tool; the PO wants compiled views to be Obsidian-compatible |
| **OB1** | Open Brain version 1 — the candidate platform being evaluated |
| **OpenRouter** | A multi-provider LLM gateway that exposes models from multiple vendors behind one API, allowing model switching, provider redundancy, and centralized pricing/routing |
| **Structural fingerprint** | A vector encoding of a document's structural properties (heading depth, list nesting, entity graph shape) rather than its semantic content |

### The four platform options being evaluated

| # | Option | Description |
|---|--------|------------|
| A | **Adopt OB1** | Use OB1 as-is with custom extensions built as plugins/recipes/schemas atop its Supabase + TypeScript stack |
| B | **Fork OB1** | Fork OB1 repository and modify core code directly; freedom to change internals while starting from OB1's codebase |
| C | **Stay Current** | Continue building on the existing C# .NET 8 + SQLite architecture as designed in investigation docs |
| D | **Adopt Approach, Build Fresh** | Take OB1's architectural patterns (Postgres + pgvector, thought-centric model, MCP-native) but implement from scratch. Variants: build in C# (keep current stack) or build in TypeScript/Python (adopt OB1 stack). Treated as a single option with noted variants. |

---

## §1b. Outcomes & Conclusions

**Completion status:** Full — OpenRouter revision executed; awaiting renewed PO review

**Key findings/achievements:**
- Investigation document now resolves all PO-raised review gaps across the two revision passes: OB1 cloud-side synthesis workflow, hobby-scale Supabase Free costs, and OpenRouter as a first-class part of the OB1 hosted value proposition.
- All 4 options remain rated across 5 weighted dimensions. Option A remains at 2.10 after the earlier Free-tier revision, and the OpenRouter revision did **not** change the A/B scores; rankings still hold with Option C strongest at 4.50, ahead of Option D-C# at 3.55.
- **Recommendation remains: Stay Current on C#/.NET 8 + SQLite.** The OpenRouter analysis strengthened the case that OB1-based Options A/B have real hosted-stack advantages around provider switching, fallback, and experimentation speed, but those benefits still do not outweigh the extra moving parts relative to the direct C# filesystem path.
- Two follow-on implementation stories remain appropriate and unchanged: ST-018 (graph schema + structural fingerprints) and ST-019 (ISynthesisService + Markdown writer).

**PO review resolution (2026-05-14):**
- The earlier open question "Can OB1's Supabase edge functions + schemas support per-ingest synthesis?" remains answered **yes**, provided remote Markdown storage plus a local sync bridge is acceptable. The remaining objection is operational shape, not capability.
- The cost floor for OB1-based options remains stated as ~$2–5/month at hobby scale on Supabase Free + OpenRouter. The earlier $25+/month shorthand now explicitly refers to the Pro-tier or full-baseline case near the full 100K-memory target or when always-on behavior is required.
- The OpenRouter-focused revision now explicitly documents that OpenRouter is portable in theory, but that its practical leverage in this spike is concentrated on Options A/B because OB1 already assumes hosted async workers plus OpenRouter in its default operating model.

**Requirements met vs unmet:**
- R1 Documented OB1 platform assessment ✅ — doc §3 Options + §6 Stack & Ecosystem Analysis
- R2 Per-ingest synthesis feasibility rated for all 4 options ✅ — doc §4
- R3 Graph/structural similarity feasibility rated for all 4 options ✅ — doc §5
- R4 Stack tradeoff analysis with 6 dimensions ✅ — doc §6 comparison table
- R5 Hosting cost comparison ✅ — doc §7 with hobby-scale and production-scale estimates
- R5a OpenRouter-specific platform-value analysis ✅ — doc §6 dedicated subsection with portability note, concrete provider/model examples, and stated score impact
- R6 Clear recommendation with named option and rationale ✅ — doc §9 names Option C with evidence
- R7 Impact assessment on ST-002–ST-010 ✅ — doc §10 with per-option consequences

**Architectural impact:** Existing architecture decisions **supported**. The final investigation still confirms that the C#/.NET 8 + SQLite design is the best base for the target capabilities. The OpenRouter revision clarifies that OB1's strongest hosted-stack upside is real, but it still does not justify a platform pivot away from the simpler C# local-first path.

**Supporting evidence:**
- `docs/investigations/openbrain-pivot-evaluation.md` §6 now contains `### OpenRouter-specific leverage for OB1-based options` using `openai/gpt-4o-mini`, `anthropic/claude-sonnet-4`, and `google/gemini-2.5-flash`.
- `docs/investigations/openbrain-pivot-evaluation.md` §7 now separates direct infrastructure + token costs from OpenRouter's strategic upside.
- `docs/investigations/openbrain-pivot-evaluation.md` §8 explicitly states that the OpenRouter revision did not move A/B scores; Option C remains 4.50.
- `docs/investigations/openbrain-pivot-evaluation.md` §9 keeps Option C as the recommendation while addressing OpenRouter directly.

**Downstream changes:**
- ST-017 returned to Review with the blocker cleared and a refreshed note reflecting the OpenRouter revision outcome.
- ST-018 and ST-019 remain in Backlog as the correct downstream stories.
- `FollowUpSessionLog.txt` refreshed for renewed PO review.
- No existing story invalidated; all ST-002–ST-010 still proceed as designed.

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

1. After opening `docs/investigations/openbrain-pivot-evaluation.md`, the document contains all 8 sections: Executive Summary, Background & Motivation, Options Under Evaluation, Per-Ingest Synthesis Analysis, Graph/Structural Similarity Analysis, Stack & Ecosystem Analysis, Hosting Cost Comparison, Option Scoring Matrix, Recommendation, Impact Assessment, Sources Referenced.
2. After reading the Option Scoring Matrix, each of the 4 options (Adopt OB1, Fork OB1, Stay Current, Adopt Approach Build Fresh) has a rating for: per-ingest synthesis feasibility, graph search feasibility, stack fit, hosting cost.
3. After reading the Recommendation section, there is a specific named option with evidence-backed rationale in narrative form ("Recommend X because Y, despite Z").
4. After reading the Impact Assessment, there is an explicit statement per option about consequences for stories ST-002 through ST-010.
5. After reading §1b of this ExecPlan, it contains a completion summary with supporting evidence references.
6. After checking `.github/planning/story-board.md`, ST-017 appears under "Review" (moved from "Refined").
7. After checking `FollowUpSessionLog.txt`, it contains session outcomes reflecting this spike.
8. After reading the revised stack/hosting analysis, there is a dedicated OpenRouter subsection that: (a) states OpenRouter is portable in theory, (b) evaluates its practical benefit mainly for Options A/B, and (c) uses 2–3 concrete provider/model examples.

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ✅ Ready for /continue

---

## §2c. Plan Review Notes

- **2026-05-14 escalation:** The revised ST-017 spike outcome was presented for PO acceptance after Tasks 4.6 and 4.7 completed. The PO selected **"Further changes needed"** but did not specify the requested changes in the approval round.
- **Why this became a plan-review blocker:** The completed revision pass only covered cloud-side synthesis analysis and free-tier cost re-evaluation. The additional OpenRouter request was new scope not defined in the original §4 task steps.
- **2026-05-14 scope resolution:** The PO specified the missing scope: add a dedicated OpenRouter subsection, use 2–3 concrete model/provider examples, state OpenRouter portability explicitly, re-score A/B if warranted, and allow the recommendation to change if evidence supports it.
- **2026-05-14 execution result:** Tasks 4.8 and 4.9 completed. The investigation now contains the required OpenRouter analysis with concrete provider/model examples, explicit portability framing, unchanged A/B scores, and a recommendation that remains Option C.
- **Current state:** The blocker is cleared. ST-017 is back in Review and awaiting renewed PO acceptance.

---

## §2d. Requirement Traceability Matrix

| # | Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|---|
| R1 | Documented assessment of OB1 as platform (ST-017 AC1) | Investigation doc §3 Options + §4.1 Per-Ingest + §4.2 Graph analysis | Task 4.1, 4.2, 4.3 | `Select-String` for "Adopt OB1" heading + per-option analysis text |
| R2 | Per-ingest synthesis feasibility evaluation (ST-017 AC2) | Investigation doc §4.1 with 4 option ratings | Task 4.2 | Each option has a feasibility rating (trivial/moderate/significant/impractical) |
| R3 | Graph/structural similarity feasibility evaluation (ST-017 AC3) | Investigation doc §4.2 with 4 option ratings | Task 4.3 | Each option has a feasibility rating |
| R4 | Stack tradeoff analysis (ST-017 AC4) | Investigation doc §4.3 comparison table with 6 dimensions | Task 4.4 | Table with 6 rows (one per dimension) and 2+ columns |
| R5 | Hosting model evaluation (ST-017 AC5) | Investigation doc §4.4 cost table with monthly estimates | Task 4.5 | Table with cost per option |
| R5a | OpenRouter-specific platform-value analysis (plan-review resolution 2026-05-14) | Investigation doc dedicated OpenRouter subsection with portability note, 2–3 provider/model examples, and stated impact on A/B scoring | Task 4.8 | `Select-String` for `OpenRouter` + example provider names + portability wording |
| R6 | Clear recommendation with rationale (ST-017 AC6) | Investigation doc §6 Recommendation section naming a specific option | Task 4.6 | "Recommend" keyword present with named option (A/B/C/D) |
| R7 | Impact assessment on ST-002–ST-010 (ST-017 AC7) | Investigation doc §7 Impact Assessment with per-option consequences | Task 4.6 | Each of ST-002 through ST-010 mentioned or grouped with disposition |

---

## §3. Preconditions

### Tools required

| Tool | Purpose | Version |
|------|---------|---------|
| Web browser / `fetch_webpage` | Read OB1 GitHub repo, Supabase docs, AGE docs | Any |
| Web browser / `fetch_webpage` | Read OpenRouter pricing/model pages and docs for current representative examples | Any |
| GitHub MCP tools | Read OB1 repo structure and files via `mcp_github_get_file_contents` | Available in session |
| Text editor / file tools | Write investigation doc and update ExecPlan | Available in session |
| `Select-String` (PowerShell) | Verify presence of required content in output files | Built-in |

### Prior stories required

None — ST-017 is unblocked.

### Files that must exist before starting

| File | Purpose |
|------|---------|
| `.github/planning/query-packets/QP-017-openbrain-pivot-evaluation.md` | Seed context — PO intent, research findings, open questions |
| `docs/investigations/memory-architecture-design.md` | Current architecture baseline for comparison |
| `docs/investigations/sqlite-vs-postgresql.md` | Existing Postgres migration analysis |
| `docs/investigations/interface-design-mcp-rest.md` | Current API design |
| `docs/investigations/Youtube/Nate B Jones on Open Brain vs LLM Wiki.md` | Write-time vs query-time tradeoff analysis |

### Error handling for external interactions

- **OB1 GitHub repo inaccessible**: If `https://github.com/NateBJones-Projects/OB1` cannot be reached via GitHub tools or web fetch, **stop and escalate to the PO** to resolve. Do not fall back to incomplete data.
- **Supabase/AGE documentation unavailable**: Use cached knowledge from the query packet research findings in §1. Note any gaps in §6b Surprises.
- **OpenRouter docs/pricing unavailable**: Use current public pricing/model pages if reachable; if exact example model names differ from prior research, choose nearest current equivalents and record them explicitly in the document.

### Investigation doc boilerplate

The output document (`docs/investigations/openbrain-pivot-evaluation.md`) must follow governance metadata conventions:

```markdown
---
name: "Open Brain Pivot Evaluation"
summary: "Evaluation of Open Brain (OB1) as base platform vs current C#/.NET architecture"
asset_type: "investigation"
status: "active"
owners:
  - "ai-memory-maintainers"
source_path: "docs/investigations/openbrain-pivot-evaluation.md"
---
```

---

## §4. Task Definitions

### Task 4.1: Map OB1 Extension Model from GitHub Source

**Objective:** Analyse OB1's GitHub repository to document its extension model — what hooks, schemas, plugin patterns, and customisation points exist, and specifically whether ingest-time processing hooks are available.

**Input:** OB1 repository at `https://github.com/NateBJones-Projects/OB1` plus the architecture summary from §1 of this ExecPlan.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

0. **Verify prerequisite files exist.** Before starting research, confirm these files are present in the working tree:
   ```powershell
   @(".github/planning/query-packets/QP-017-openbrain-pivot-evaluation.md",
     "docs/investigations/memory-architecture-design.md",
     "docs/investigations/sqlite-vs-postgresql.md",
     "docs/investigations/interface-design-mcp-rest.md"
   ) | ForEach-Object { if (!(Test-Path $_)) { Write-Warning "Missing: $_" } else { Write-Host "OK: $_" } }
   ```
   If any file is missing, stop and investigate before proceeding.

1. **Read the OB1 repo root structure.** Use GitHub MCP tools (`mcp_github_get_file_contents` with path `/`) or web fetch to list top-level directories and files. Record the directory layout.

2. **Identify extension-related directories.** Look for directories named or containing: `schemas`, `recipes`, `skills`, `integrations`, `plugins`, `extensions`, `dashboards`, `mcp`, `supabase`. Read their README or index files if present.

3. **Read the `thoughts` table schema.** Find the Supabase migration files (likely under `supabase/migrations/` or similar). Document:
   - Column names and types for the `thoughts` table
   - Any sidecar/auxiliary tables (relations, provenance, recall-trace, audit)
   - Any PostgreSQL triggers or functions defined in migrations

4. **Read the MCP server implementation.** Find the MCP server entry point (likely `mcp-server/` or similar TypeScript directory). Document:
   - Which MCP tools are defined (tool names, parameters, descriptions)
   - How tools call the database (direct SQL? Supabase client? service layer?)
   - Whether there is a hook/event/middleware system for extending tools

5. **Search for ingest-time hooks.** Grep for patterns suggesting event-driven processing on insert:
   - PostgreSQL triggers (`CREATE TRIGGER`, `AFTER INSERT`)
   - Edge function invocations on write
   - Event emitters or webhook calls in the TypeScript/Python code
   - Any "on-write" or "post-ingest" processing patterns

6. **Document findings** as structured notes in the Execution Log (§6). Capture:
   - Extension model type: plugin registry, schema-based, fork-required, or hook-based
   - Schema flexibility: can new tables/columns be added without modifying core?
   - MCP extensibility: can new tools be added without modifying the MCP server itself?
   - Ingest hooks: present or absent? If absent, what's the closest alternative?

**Expected output:** A detailed extension model map in §6 Execution Log entries, structured as:
- Schema extension points: (list)
- MCP tool extension points: (list)  
- Ingest pipeline hooks: (present/absent with evidence)
- Extension pattern classification: (plugin / schema / fork-required)

**Requirement mapping:** R1 (documented assessment of OB1 as platform)

**Verification:**
```powershell
# After writing §6 entries, confirm the three required extension-model categories are documented
Write-Host "Verify: Extension model map has entries for schema, MCP, and ingest hooks"
```
Expected result: §6 Execution Log contains entries covering all three categories, each with evidence (file paths or code snippets from OB1 repo).

**Failure handling:** If OB1 repo is inaccessible, stop and escalate to PO per §3 error handling. Do not proceed with incomplete data.

---

### Task 4.2: Evaluate Per-Ingest Synthesis Feasibility (4 Options)

**Objective:** For each of the four platform options (A: Adopt OB1, B: Fork OB1, C: Stay Current, D: Adopt Approach Build Fresh), assess how "per-ingest synthesis" could be implemented. Rate each option's feasibility.

**Input:** Extension model findings from Task 4.1 + architecture details from §1 of this ExecPlan.

**Working directory:** `c:\projects\ai-memory\`

**Definitions for this task:**
- **Per-ingest synthesis** = when a new thought/memory is stored, an automated process generates or updates one or more compiled Markdown files that represent synthesised views of the data (e.g., a Kanban board, a professional storyboard, a topic summary).
- **Obsidian-compatible** = standard Markdown with YAML frontmatter; optionally uses Dataview plugin query syntax.

**Steps:**

1. **Option A — Adopt OB1:** Assess whether Supabase edge functions or PostgreSQL triggers could:
   - Fire on `INSERT` to the `thoughts` table
   - Call an LLM API (OpenRouter or local Ollama) with the new thought + existing context
   - Write the synthesised output to a `compiled_views` table or export as a Markdown file
   - Handle incremental updates (append vs full regeneration)
   - Document: What Supabase edge function limits apply (execution time, memory, concurrency)? Can edge functions call external LLM APIs? Reference Supabase docs if needed.

2. **Option B — Fork OB1:** Same as Option A, but note what additional freedom forking provides:
   - Ability to add custom PostgreSQL triggers to the schema
   - Ability to modify the MCP server to expose synthesis tools
   - Ability to add a synthesis service as a new module alongside the existing code
   - Note: forking means divergence from upstream updates

3. **Option C — Stay Current (C#/.NET + SQLite):** Design sketch:
   - After `IMemoryRepository.StoreAsync()` completes, fire a domain event or call `ISynthesisService.UpdateViewsAsync()`
   - The synthesis service queries related memories, calls an LLM, and writes Markdown files to a configurable output directory
   - Use the existing `IMemoryRepository` abstraction — no SQLite-specific coupling
   - Incremental updates via timestamp tracking per view
   - Note: this is the most flexible option since the codebase is early-stage (scaffold only)

4. **Option D — Adopt Approach, Build Fresh:**
   - Variant D1 (C# + Postgres): Same as Option C but with PostgreSQL triggers as an alternative to application-level events
   - Variant D2 (TypeScript + Postgres): Custom TypeScript service with Postgres triggers, similar to OB1's stack but purpose-built
   - Note which variant(s) are most natural for per-ingest synthesis

5. **Rate each option** using this scale:
   - **Trivial**: Existing hooks/patterns support this with minimal code; <1 day of work
   - **Moderate**: Clear path exists but requires new components; 1–5 days of focused work
   - **Significant**: Requires substantial new infrastructure or architectural changes; 1–3 weeks
   - **Impractical**: Fundamental incompatibility; would require rewriting core systems

6. **For each option, document** these specific aspects:
   - Hook mechanism (how the ingest event triggers synthesis)
   - LLM integration path (how the synthesis service calls an LLM)
   - Output format (how Obsidian-compatible Markdown is produced)
   - Incremental update strategy (how views are updated without full regeneration)

**Expected output:** A four-row analysis (one per option) with feasibility rating and rationale, ready to embed in the investigation doc §4.1.

**Requirement mapping:** R2 (per-ingest synthesis feasibility evaluation)

**Verification:**
```powershell
# After writing the analysis, confirm all four options are rated
Write-Host "Verify: All 4 options (A/B/C/D) have feasibility ratings for per-ingest synthesis"
```
Expected result: Each of Options A, B, C, D has a rating (trivial/moderate/significant/impractical) with supporting rationale covering all four aspects (hook, LLM, output, incremental).

**Failure handling:** If specific OB1 capability is unclear from Task 4.1 findings, state the uncertainty explicitly and rate conservatively (assume "significant" if unclear).

---

### Task 4.3: Evaluate Graph/Structural Similarity Feasibility (4 Options)

**Objective:** For each platform option, assess how graph-based structural similarity search could be added. Rate each option's feasibility.

**Input:** Extension model findings from Task 4.1 + architecture details from §1 of this ExecPlan.

**Working directory:** `c:\projects\ai-memory\`

**Definitions for this task:**
- **Graph/structural similarity search** = querying based on structural relationships between concepts, not just text keywords or semantic embeddings. Includes: entity extraction, relationship mapping, subgraph matching, and multi-hop traversal.
- **Apache AGE** = PostgreSQL extension that adds graph database capabilities using the openCypher query language. Enables creating labelled property graphs within existing PostgreSQL databases.
- **Structural fingerprint** = a vector encoding of a document's structural properties (heading depth, list nesting, entity graph shape, section patterns) rather than its semantic content only.

**Steps:**

1. **Option A — Adopt OB1:** Assess graph layer options on Supabase-hosted PostgreSQL:
   - Can Apache AGE be installed on Supabase? (Research Supabase's supported extensions list)
   - If AGE is not available on Supabase, what alternatives exist? (Relationship table with foreign keys, LLM-extracted entity triples stored in a separate table, structural fingerprint vectors in pgvector)
   - What does OB1's existing `relation` sidecar in Agent Memory provide? (From Task 4.1 findings)
   - Can the relation sidecar be extended into a full graph layer without forking?

2. **Option B — Fork OB1:** Same as Option A plus:
   - Freedom to install AGE or any PostgreSQL extension (if self-hosting Postgres instead of Supabase)
   - Freedom to add a graph query API alongside the existing MCP tools
   - Note: self-hosting Postgres removes Supabase extension restrictions but adds ops burden

3. **Option C — Stay Current (C#/.NET + SQLite):**
   - SQLite graph options: recursive CTEs for graph traversal, or structural fingerprint vectors in sqlite-vec
   - Design sketch: `IGraphService` with entity extraction (LLM-powered) → relationship storage → graph query methods
   - Limitation: SQLite has no native graph extension equivalent to AGE
   - Mitigation: structural fingerprint approach (encode graph topology as vectors, use cosine similarity)

4. **Option D — Adopt Approach, Build Fresh:**
   - Variant D1 (C# + Postgres + AGE): Full graph support via AGE; openCypher queries from C# via Npgsql
   - Variant D2 (TypeScript + Postgres + AGE): Same stack as OB1 ecosystem with AGE added
   - Variant D3: Neo4j sidecar alongside Postgres (adds operational complexity but production-grade graph)

5. **Rate each option** using the same scale as Task 4.2.

6. **For each option, document:**
   - Graph schema (how entities and relationships are stored)
   - Query mechanism (how structural similarity queries are executed)
   - Entity extraction approach (LLM-based? rule-based? hybrid?)
   - Scalability notes (performance at 100K+ memories)

**Expected output:** A four-row analysis with feasibility rating and rationale, ready for investigation doc §4.2.

**Requirement mapping:** R3 (graph/structural similarity feasibility evaluation)

**Verification:**
```powershell
Write-Host "Verify: All 4 options (A/B/C/D) have feasibility ratings for graph/structural similarity"
```
Expected result: Each option rated with rationale covering graph schema, query mechanism, entity extraction, scalability.

**Failure handling:** If Apache AGE availability on Supabase cannot be confirmed, state it as "unconfirmed — research inconclusive" and note the uncertainty in the rating.

---

### Task 4.4: Stack & Ecosystem Tradeoff Analysis

**Objective:** Compare TypeScript/Python (OB1 ecosystem) vs C#/.NET 8 across six dimensions relevant to a solo developer building a personal AI memory service.

**Input:** §1 architecture summaries from this ExecPlan + general ecosystem knowledge.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Build a comparison table with these exact 6 dimensions as rows and "TypeScript/Python (OB1)" vs "C#/.NET 8 (Current)" as columns:

   | Dimension | TypeScript/Python (OB1) | C#/.NET 8 (Current) | Edge |
   |-----------|------------------------|---------------------|------|
   | **Developer velocity** (solo dev) | | | |
   | **AI/LLM ecosystem maturity** | | | |
   | **Type safety & testing** | | | |
   | **Community & contribution** | | | |
   | **Hosting & deployment** | | | |
   | **Existing codebase value** | | | |

2. For each dimension, write 2–3 sentences of qualified analysis. Back with specific facts:
   - **Developer velocity**: Consider npm/pip ecosystem breadth vs NuGet; hot reload; Supabase client library quality; how fast can one person ship?
   - **AI/LLM ecosystem**: LangChain/LlamaIndex (Python) vs Semantic Kernel (C#); OpenAI SDK availability; local model hosting via Ollama (both support it)
   - **Type safety & testing**: TypeScript strict mode vs C# nullable reference types; xUnit/NSubstitute/FluentAssertions vs Jest/Vitest
   - **Community**: OB1's 3k stars, 576 forks, 20+ contributors vs zero community for a personal C# project; does community matter for personal use?
   - **Hosting**: Supabase (managed) vs local SQLite (zero ops) vs Docker Compose self-hosted
   - **Existing codebase value**: What has been built so far in ai-memory? (Answer: project scaffold, `IMemoryService` interface, governance tooling, 9 investigation docs, GovernanceAssetValidator). What would be lost by switching stacks?

3. For each row, assign an "Edge" judgment: one of the two stacks, or "Tie".

**Expected output:** Completed comparison table with qualified analysis, ready for investigation doc §4.3.

**Requirement mapping:** R4 (stack tradeoff analysis)

**Verification:**
```powershell
Write-Host "Verify: Stack comparison table has 6 rows with analysis and Edge column filled"
```
Expected result: All 6 dimensions analysed; Edge column has a value for each row.

**Failure handling:** If a dimension is genuinely too close to call, mark as "Tie" with explanation. Do not force a winner.

---

### Task 4.5: Hosting Cost Comparison

**Objective:** Estimate monthly hosting costs for a personal-use AI memory service (≤100K memories, ~50 queries/day) across the four platform options.

**Input:** Supabase pricing page, OpenRouter pricing, general cloud/hardware costs.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Research Supabase pricing** (web fetch `https://supabase.com/pricing` if needed):
   - Free tier limits: database size, bandwidth, edge function invocations, row count
   - Pro tier cost and what it unlocks
   - Whether free tier supports pgvector and sufficient storage for 100K memories with embeddings

2. **Research OpenRouter pricing** (web fetch `https://openrouter.ai/pricing` or docs if needed):
   - Cost per 1K tokens for models relevant to memory synthesis (e.g., GPT-4o-mini, Claude 3.5 Haiku, Llama 3)
   - Estimate tokens per query and per ingest-synthesis call
   - Monthly estimate at 50 queries/day + synthesis on ~10 ingests/day

3. **Estimate self-hosted costs:**
   - Local machine (already owned hardware): $0/month in hosting, electricity only
   - VPS/Docker (if cloud self-hosted): smallest viable tier (e.g., DigitalOcean $6/mo, Hetzner €4/mo)
   - Ollama for local LLM: $0 (runs on existing hardware) vs cloud API costs

4. **Build the cost comparison table:**

   | Hosting Model | Applicable Options | Monthly Cost | Notes |
   |---------------|-------------------|-------------|-------|
   | Supabase Free + OpenRouter | A (Adopt OB1) | $X | Limits: ... |
   | Supabase Pro + OpenRouter | A, B | $X | Unlocks: ... |
   | Self-hosted Postgres + Ollama | B, D | $X | Hardware-only |
   | Self-hosted Postgres + cloud LLM | B, C, D | $X | API costs: ... |
   | Local SQLite + cloud LLM API | C | $X | Zero hosting, API only |
   | Local SQLite + Ollama | C | $0 | Fully local |

5. **Note the key insight:** Options C and D-variant-C# can run at $0/month (SQLite local + Ollama), while OB1-based options (A, B) have minimum costs tied to Supabase or self-hosted Postgres.

**Expected output:** Completed cost table with monthly estimates, ready for investigation doc §4.4.

**Requirement mapping:** R5 (hosting model evaluation)

**Verification:**
```powershell
Write-Host "Verify: Cost table has entries for all 4 platform options with monthly estimates"
```
Expected result: Each option (A/B/C/D) appears in at least one hosting model row with a cost figure.

**Failure handling:** If pricing pages have changed or are unavailable, use best available information and note the source date. Flag any stale pricing data in §6b Surprises.

---

### Task 4.6: Score Options & Write Investigation Document

**Objective:** Synthesise all findings from Tasks 4.1–4.5 into a comprehensive investigation document at `docs/investigations/openbrain-pivot-evaluation.md`. Include a scored option matrix and a draft recommendation.

**Input:** All Task 4.1–4.5 outputs (stored in §6 Execution Log and working notes).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Create the investigation document** at `docs/investigations/openbrain-pivot-evaluation.md` with the governance metadata frontmatter from §3 Preconditions.

2. **Write these sections in order:**

   **§1 Executive Summary** (1 paragraph): State the purpose of the spike, the four options evaluated, and the recommended option in one sentence.

   **§2 Background & Motivation**: Why this spike exists (PO's two desired extensions, platform question). Reference the write-time vs query-time tradeoff from the Nate B Jones analysis.

   **§3 Options Under Evaluation**: Define all four options (A/B/C/D) with one paragraph each, matching the definitions from this ExecPlan §1.

   **§4 Analysis Sections** (four sub-sections):
   - §4.1 Per-Ingest Synthesis Feasibility — from Task 4.2
   - §4.2 Graph/Structural Similarity Feasibility — from Task 4.3
   - §4.3 Stack & Ecosystem Tradeoff — from Task 4.4
   - §4.4 Hosting Cost Comparison — from Task 4.5

   **§5 Option Scoring Matrix**: Build a table scoring each option across all dimensions:

   | Dimension | A: Adopt OB1 | B: Fork OB1 | C: Stay Current | D: Adopt Approach |
   |-----------|-------------|-------------|-----------------|-------------------|
   | Per-ingest synthesis | rating | rating | rating | rating |
   | Graph/structural search | rating | rating | rating | rating |
   | Stack ecosystem fit | rating | rating | rating | rating |
   | Hosting cost | rating | rating | rating | rating |
   | Community/ecosystem | rating | rating | rating | rating |
   | Existing investment preservation | rating | rating | rating | rating |
   | **Overall** | rating | rating | rating | rating |

   Use a simple 1–5 scale where 5 = best fit, 1 = worst fit. Document the scoring rationale beneath the table.

   **§6 Recommendation**: Write a narrative recommendation: "Recommend [Option X] because [evidence], despite [tradeoffs]." The executor writes this as a **draft** recommendation — the PO will review and make the final decision. Clearly label it as "Draft Recommendation (pending PO review)".

   **§7 Impact Assessment**: For each option, state what happens to stories ST-002 through ST-010:
   - Option A/B: Which stories are invalidated? Which survive?
   - Option C: All stories remain valid (no change)
   - Option D: Which stories need rework? Which survive?
   
   Reference the specific story IDs by reading the board if needed.

   **§8 Sources Referenced**: List all sources consulted during the spike with full paths or URLs.

3. **Review the document** for completeness against §2d Requirement Traceability Matrix. Every requirement (R1–R7) should be addressed.

**Expected output:** `docs/investigations/openbrain-pivot-evaluation.md` exists with all sections, governance metadata, and scored options.

**Requirement mapping:** R1 (platform assessment), R6 (recommendation), R7 (impact assessment)

**Verification:**
```powershell
# Verify document exists and contains all required sections
Test-Path "docs\investigations\openbrain-pivot-evaluation.md"
Select-String -Path "docs\investigations\openbrain-pivot-evaluation.md" -Pattern "Executive Summary"
Select-String -Path "docs\investigations\openbrain-pivot-evaluation.md" -Pattern "Recommendation"
Select-String -Path "docs\investigations\openbrain-pivot-evaluation.md" -Pattern "Impact Assessment"
Select-String -Path "docs\investigations\openbrain-pivot-evaluation.md" -Pattern "Option Scoring Matrix"
Select-String -Path "docs\investigations\openbrain-pivot-evaluation.md" -Pattern "ST-002"
```
Expected result: File exists; all five patterns match at least once.

**Failure handling:** If any section is missing content, revisit the specific task (4.1–4.5) that should have produced the input. Do not write placeholder text — every section must contain substantive analysis.

---

### Task 4.7: Update Board, ExecPlan Outcomes & Session Log

**Objective:** Close out the spike by updating all governance artifacts.

**Input:** Completed investigation doc from Task 4.6.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Update ExecPlan §1b Outcomes & Conclusions** in this file (`exec-plan-ST-017.md`):
   - completion status: full / partial
   - key findings: 2–3 sentence summary of the recommendation
   - requirements met: list R1–R7 with pass/fail
   - architectural impact: what this spike means for the current architecture
   - supporting evidence: path to investigation doc + key section references
   - downstream changes: any new stories or board changes

2. **Move ST-017 on the board** in `.github/planning/story-board.md`:
   - Remove ST-017 from "Refined" section
   - Add ST-017 to "Review" section with the same metadata

3. **If the recommendation suggests a pivot (Option A, B, or D):**
   - Draft new follow-on stories in the "Backlog" section of the board
   - Example stories: "Migrate to [new stack]", "Set up [new infrastructure]", "Evaluate impact on existing governance tooling"
   - Use next available ST-N IDs

4. **If the recommendation is Stay Current (Option C):**
   - Add a note to ST-017's board entry confirming ST-002–ST-010 remain valid
   - No new stories needed

5. **Update `FollowUpSessionLog.txt`** (replace contents, max 40 lines):
   - What was accomplished (spike completed, recommendation made)
   - Where next session should resume (PO review of recommendation)
   - Current board state summary

6. **Commit all changes** with:
   ```
   docs(spike): ST-017 Open Brain pivot evaluation complete

   Story: ST-017
   Task: §4.7
   ```

**Expected output:** Board updated, ExecPlan §1b populated, session log refreshed, changes committed.

**Requirement mapping:** Supports DoD items 5, 6, 7 (ExecPlan outcomes, board move, session log).

**Verification:**
```powershell
# Verify board move
Select-String -Path ".github\planning\story-board.md" -Pattern "ST-017" | Select-Object LineNumber, Line
# Should appear under "## Review", not under "## Refined"

# Verify ExecPlan §1b is populated
Select-String -Path ".github\planning\execplans\exec-plan-ST-017.md" -Pattern "completion status"

# Verify session log
Test-Path "FollowUpSessionLog.txt"
Get-Content "FollowUpSessionLog.txt" | Measure-Object -Line
# Should be ≤40 lines
```
Expected result: ST-017 under Review; §1b has "completion status" entry; session log exists with ≤40 lines.

**Failure handling:** If git commit fails, log the error in §6b Surprises and note the uncommitted state in the session log. Do not force-push or bypass safety checks.

---

### Task 4.8: Evaluate OpenRouter as Part of the OB1 Platform Value

**Objective:** Revise the existing investigation to treat OpenRouter as a first-class part of the OB1 stack value proposition, not merely a cost line item, while keeping the comparison fair.

**Input:** Current `docs/investigations/openbrain-pivot-evaluation.md`, query packet `QP-017`, OpenRouter docs/pricing/model pages, and the completed findings from Tasks 4.4–4.6.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Read only the affected sections** of `docs/investigations/openbrain-pivot-evaluation.md`: Stack & Ecosystem Analysis, Hosting Cost Comparison, Option Scoring Matrix, and Recommendation. Do not reopen unrelated sections unless needed for wording consistency.

2. **Research OpenRouter capability facts** using current public pages:
   - confirm the single-API, multi-provider model access pattern
   - confirm enough information to discuss model switching, provider redundancy/fallback, and experimentation simplicity
   - identify 3 representative model families from different providers

3. **Use these representative example categories** in the write-up:
   - one OpenAI GPT-4o-mini-class model
   - one Anthropic Claude Haiku/Sonnet-class model
   - one Google Gemini Flash-class model
   If exact names differ on the current OpenRouter pages, choose the nearest current equivalents and record the actual names used.

4. **Add a dedicated subsection** under the Stack & Ecosystem Analysis titled exactly:
   `### OpenRouter-specific leverage for OB1-based options`

5. In that subsection, write explicit analysis covering all of the following points:
   - OpenRouter is **portable in theory** to any HTTP-capable application, including a future C# path.
   - For **this spike's platform comparison**, the practical benefit is concentrated on Options A and B because OB1 already assumes Supabase-hosted async workers plus OpenRouter in its default operating model.
   - OpenRouter can reduce model-lock-in for OB1-based options through easier provider switching.
   - OpenRouter can improve resilience for OB1-based options through provider redundancy/fallback.
   - OpenRouter can improve experimentation speed for OB1-based options because prompt/worker code can stay stable while the backing model changes.
   - The 3 representative examples must be used to illustrate why this matters in practice.

6. **Revise Hosting Cost Comparison only where necessary** so the document clearly separates:
   - Supabase infrastructure cost
   - OpenRouter token/API cost
   - OpenRouter strategic upside (which belongs in the new subsection, not only in the cost table)

7. **Revisit the Option Scoring Matrix** with these rules:
   - re-score **Options A and B only** if the OpenRouter analysis warrants a change
   - leave C and D unchanged unless there is a direct, documented reason they must change
   - if no scores move, state that explicitly in the scoring notes
   - if A/B scores move, recalculate their weighted totals and explain which row(s) changed and why

8. **Revise the Recommendation** so it addresses the new OpenRouter analysis directly. The recommendation may change if the evidence supports it. If it does not change, state why OpenRouter's upside still fails to overcome the OB1 path's extra moving parts.

**Expected output:** `docs/investigations/openbrain-pivot-evaluation.md` contains the dedicated OpenRouter subsection, concrete examples, any warranted A/B re-score, and an updated recommendation rationale.

**Requirement mapping:** R5a (OpenRouter-specific analysis), R6 (recommendation)

**Verification:**
```powershell
Select-String -Path "docs\investigations\openbrain-pivot-evaluation.md" -Pattern "OpenRouter-specific leverage for OB1-based options"
Select-String -Path "docs\investigations\openbrain-pivot-evaluation.md" -Pattern "portable in theory"
Select-String -Path "docs\investigations\openbrain-pivot-evaluation.md" -Pattern "OpenAI|Anthropic|Gemini"
```
Expected result: All three commands match at least once.

**Failure handling:** If OpenRouter pages have renamed models, document the actual current equivalents chosen. If OpenRouter pages are unavailable, use the best available public information and note the limitation in §6b Surprises.

---

### Task 4.9: Refresh Governance Artifacts After the OpenRouter Revision

**Objective:** Close out the OpenRouter-focused revision pass and unblock ST-017 from `plan-review`.

**Input:** Completed OpenRouter revision from Task 4.8.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Update ExecPlan §1b Outcomes & Conclusions** in this file so it reflects the final post-OpenRouter result:
   - whether the recommendation changed or stayed the same
   - whether A/B scores changed or stayed the same
   - what the OpenRouter analysis added to the reasoning

2. **Update §2c Plan Review Notes** to record that the missing scope was captured and executed.

3. **Update `.github/planning/story-board.md`** for ST-017:
   - change `Blocked by: plan-review` back to `Blocked by: none`
   - keep ST-017 in Review
   - update the Notes line to mention the OpenRouter revision and resulting recommendation status

4. **Update `FollowUpSessionLog.txt`** so the next session resumes at renewed PO review, not plan-review.

5. **Commit all Task 4.8 and 4.9 changes** with:
   ```
   docs(spike): incorporate OpenRouter revision into ST-017

   Story: ST-017
   Task: §4.8-§4.9
   ```

**Expected output:** ST-017 no longer blocked by `plan-review`; board, ExecPlan, and session log all reflect the OpenRouter-focused revision.

**Requirement mapping:** Supports DoD items 5, 6, 7, 8.

**Verification:**
```powershell
Select-String -Path ".github\planning\story-board.md" -Pattern "### ST-017","Blocked by: none","OpenRouter"
Select-String -Path "FollowUpSessionLog.txt" -Pattern "OpenRouter","PO review"
Select-String -Path ".github\planning\execplans\exec-plan-ST-017.md" -Pattern "OpenRouter"
```
Expected result: All three files contain the refreshed OpenRouter-related closeout state.

**Failure handling:** If the recommendation changes materially, ensure the board note and §1b say so explicitly. If git commit fails, leave the blocker state untouched and note the failure in `FollowUpSessionLog.txt`.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.9 — Governance artifacts refreshed after the OpenRouter revision |
| **Last successful command** | `Select-String` verification across `.github/planning/story-board.md`, `FollowUpSessionLog.txt`, and `.github/planning/execplans/exec-plan-ST-017.md` |
| **Expected outputs produced** | Refreshed ExecPlan §1b/§2c, ST-017 moved back to Review with blocker cleared, and FollowUpSessionLog updated for renewed PO review |
| **Next task** | PO review — renewed acceptance round for ST-017 |
| **Known blockers** | None |
| **Last updated** | 2026-05-14 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-13T00:00Z | Task 4.1 | ✅ Complete | OB1 repo structure mapped; `server/index.ts` analysed (6 MCP tools, no ingest hooks); `entity-extraction/schema.sql` studied (trigger found); Supabase AGE absence confirmed | Task 4.2 |
| 2026-05-13T00:00Z | Task 4.2 | ✅ Complete | Per-ingest synthesis: A=Significant, B=Moderate, C=Trivial, D=Trivial–Moderate | Task 4.3 |
| 2026-05-13T00:00Z | Task 4.3 | ✅ Complete | Graph similarity: A=Significant, B=Moderate, C=Significant, D-C#+AGE=Moderate; AGE unavailable on Supabase confirmed | Task 4.4 |
| 2026-05-13T00:00Z | Task 4.4 | ✅ Complete | 6-dimension stack tradeoff: TypeScript wins on LLM SDK + MCP; C# wins on local-first + codebase value; 2 Ties | Task 4.5 |
| 2026-05-13T00:00Z | Task 4.5 | ✅ Complete | Hosting costs: Option C = $0, OB1 options = $27–30/month (Pro) | Task 4.6 |
| 2026-05-13T00:00Z | Task 4.6 | ✅ Complete | `docs/investigations/openbrain-pivot-evaluation.md` created with 11 sections; all R1–R7 requirements met | Task 4.7 |
| 2026-05-13T00:00Z | Task 4.7 | ✅ Complete | Board updated; §1b populated; session log refreshed; committed | — |
| 2026-05-14T00:00Z | PO Review | ⚠️ Feedback | Two analytical gaps identified: (1) cloud-side synthesis hybrid workflow not evaluated for Options A/B, (2) free-tier cost analysis missing from scoring. See §1b PO Review Feedback. | Revise §4, §7 in investigation doc; re-evaluate §8/§9 |
| 2026-05-14T21:49:00.1414037+02:00 | Task 4.6 (revision) | ✅ Complete | Revised `openbrain-pivot-evaluation.md`: A/B synthesis now explicitly supports trigger → worker → remote Markdown → local sync; Supabase Free hobby-scale costs added; Option A score changed 1.95 → 2.10; recommendation remains Option C | Task 4.7 |
| 2026-05-14T21:50:55.1851042+02:00 | Task 4.7 (revision) | ✅ Complete | Refreshed §1b outcomes, corrected OB1 trigger note in background, updated ST-017 board note, refreshed `FollowUpSessionLog.txt`; verification passed | — |
| 2026-05-14T21:56:02.6745627+02:00 | Revised PO review | ⚠️ Blocked | Revised spike outcome presented for acceptance. PO selected "Further changes needed" without specifying the requested changes. This exceeds the current ExecPlan scope. | Block story by `plan-review`; run `/plan` |
| 2026-05-14T23:01:38.6567170+02:00 | /plan revision approved | ✅ Planned | QP-017 updated with OpenRouter scope; ExecPlan extended with Tasks 4.8/4.9; blocker resolved by PO approval | Task 4.8 |
| 2026-05-14T23:18:24.8091399+02:00 | Task 4.8 | ✅ Complete | Added `OpenRouter-specific leverage for OB1-based options` subsection with `openai/gpt-4o-mini`, `anthropic/claude-sonnet-4`, and `google/gemini-2.5-flash`; clarified portability; recommendation remained Option C; scores unchanged | Task 4.9 |
| 2026-05-14T23:22:43.7690556+02:00 | Task 4.9 | ✅ Complete | Refreshed §1b + §2c, returned ST-017 to Review with blocker cleared, refreshed `FollowUpSessionLog.txt` for renewed PO review | PO review |

### Avoidance

#### From /recover 2026-05-14

- DO NOT: Dismiss cloud-hosted synthesis solely because Edge Functions cannot write local files. The PO's workflow separates synthesis (cloud-side) from delivery (local sync daemon). Evaluate the full pipeline, not just the final write step.
- DO NOT: Use production-tier pricing ($25/month Pro) as the sole cost comparison against $0 local. Always include free-tier analysis with caveats clearly weighted.
- INSTEAD: When evaluating feasibility of a cloud-hosted capability, consider hybrid architectures (cloud processing + local sync) as a valid pattern, and rate the bridge complexity as a separate sub-dimension rather than a blanket dismissal.
- INSTEAD: Present cost comparisons as a range (free-tier with caveats → production tier) and let the PO decide which scenario is relevant.
- WATCH FOR: Bias toward local-first conclusions that underweight cloud-with-sync patterns. The investigation had a subtle local-first framing that inflated Option C's advantages on local file writing without adequately considering that cloud synthesis + local sync is an established pattern (e.g., Supabase Storage + Obsidian Remotely Save plugin).

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Desk research: read OB1 source via GitHub tools, analyse, compare, write investigation doc | Before Task 4.6 (all research reversible) | 🟢 Active |
| 2 | If GitHub tools fail: use web fetch on OB1 repo pages directly | Before Task 4.1 step 1 | ⬜ Reserve |

### Approach Failure Log
_(Empty — no failures yet)_

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

---

## §6. Execution Log

**2026-05-13 — Task 4.1: OB1 Extension Model**

Read OB1 repo via `mcp_github_get_file_contents`. Key findings:

- **Schema extension points:** Extensions add new PostgreSQL tables via SQL run in Supabase SQL Editor. Each extension grants `service_role` full access. New tables integrate with `thoughts` via UUID foreign keys. Fully additive — core schema is not modified.
- **MCP tool extension points:** Each extension deploys its **own separate Supabase Edge Function** (different name, independent of `open-brain-mcp`). There is NO plugin registry. To add tools to the core server, you must fork `server/index.ts`. This is a fork-required pattern for core MCP extension.
- **Ingest pipeline hooks:** The `entity-extraction` schema (`schemas/entity-extraction/schema.sql`) has a PostgreSQL trigger `trg_queue_entity_extraction` that fires `AFTER INSERT OR UPDATE OF content, metadata ON public.thoughts`. It writes to an async queue (`entity_extraction_queue`). The **worker that reads this queue is not in the OB1 repo** — it must be built separately. The core `capture_thought` tool in `server/index.ts` has no extensibility hooks — it calls `upsert_thought` plus updates the embedding column, then returns. No middleware, no event, no callback.
- **Extension pattern classification:** Schema-based with Edge Function sidecar. Not a plugin registry. Not hook-based (no hooks in core). Ingest-time trigger exists in optional schema; worker is absent.

**2026-05-13 — Tasks 4.2–4.5: All analysis complete**

All analysis performed in-session. Per-ingest synthesis and graph similarity conclusions drawn from OB1 source code + Supabase extension list + current architecture design. Stack tradeoff table built from ecosystem knowledge. Hosting costs from Supabase pricing page (https://supabase.com/pricing). AGE absence confirmed from Supabase extension list (https://supabase.com/docs/guides/database/extensions).

**2026-05-13 — Task 4.6: Investigation document written**

File created at `docs/investigations/openbrain-pivot-evaluation.md`. All 11 sections present. Scored options matrix complete. Recommendation: Option C — Stay Current.

**2026-05-14 — /recover: PO review feedback**

ST-017 was in Review. PO raised two challenges during review:
1. §4 Options A/B per-ingest synthesis: The cloud-side synthesis workflow (trigger → Edge Function worker → Supabase Storage → local sync daemon) was not evaluated. The investigation's "Edge Functions cannot write to local filesystems" treated the constraint as terminal rather than evaluating a bridge pattern.
2. §7 Hosting costs: Free-tier personal-use cost ($0 Supabase + $2–5 OpenRouter) was noted in the table but not factored into the scoring matrix. The primary comparison used $25–30/month vs $0, overstating the cost gap.

PO verbatim:
> "Using the Open Brain, remote access would allow the synthesis to happen at extraction. Therefore the work flow would be that the ingestion is as per Open Brain WoW - direct in with some processing to enable structural similarity and FTS5 + vector + RRF + MMR. Then this would trigger some extraction processing to create the synthesis into a local obsidian file."
> "The following statement assumes the full production cost is required, if we stay within low usage it could be lower cost?"

Failure mode: **Wrong approach (partial)** — analysis completed but reached conclusions based on incomplete evaluation of two scenarios the PO cares about. Investigation doc needs targeted revision, not rewrite.

**2026-05-14 — Task 4.6 (revision): Investigation document updated**

Revised `docs/investigations/openbrain-pivot-evaluation.md` in four places plus summary consistency text:

- **§4 Per-Ingest Synthesis Analysis:** Options A and B now explicitly evaluate the viable OB1 hybrid workflow: PostgreSQL trigger/queue → Edge Function worker → Markdown-compatible remote storage → local Obsidian sync bridge. The open question is now answered directly: OB1 can support per-ingest synthesis if remote storage plus local sync is acceptable.
- **§7 Hosting Cost Comparison:** Added the hobby-scale floor for Supabase Free using published limits (500 MB database, 1 GB file storage, 500,000 Edge Function invocations) and clarified that Pro is required only once the workload approaches the full 100K-memory target or always-on behavior is required.
- **§8 Option Scoring Matrix:** Option A Local-first / zero-cost score increased from 1 to 2, raising its weighted score from 1.95 to 2.10. No rank changes.
- **§9 Recommendation:** Recommendation remains Option C, but rationale now states that A/B are viable with more moving parts rather than impossible.

Verification run:
`Select-String -Path docs\investigations\openbrain-pivot-evaluation.md -Pattern Executive Summary, Recommendation, Impact Assessment, Option Scoring Matrix, ST-002`

**2026-05-14 — Task 4.7 (revision): Governance closeout refreshed**

Updated the closeout artifacts to match the revised investigation:

- **ExecPlan §1b:** now reports final completion, the resolved PO review gaps, stable recommendation, and unchanged downstream stories.
- **Story board:** ST-017 remains in Review, but its note now reflects the revised reasoning: OB1 synthesis is viable with a bridge, yet Option C still wins.
- **FollowUpSessionLog:** refreshed so the next session starts at PO review instead of recovery.

Verification run:
`Select-String -Path .github\planning\story-board.md -Pattern "### ST-017","Spike revised after PO feedback","## Review"`
`Select-String -Path FollowUpSessionLog.txt -Pattern "Recommendation remains Option C","Status: ✅ Complete","PO review and accept"`

**2026-05-14 — Post-closeout review: plan-review required**

After the revised spike outcome was presented for PO acceptance, the PO selected **"Further changes needed"** without specifying the requested changes. Because those changes are not defined in §4, execution must stop and return to planning.

Actions taken:

- Added a §2c Plan Review Notes entry describing the blocker.
- Marked ST-017 as `Blocked by: plan-review` on the board.
- Updated `FollowUpSessionLog.txt` so the next session starts with `/plan`, not `/continue`.

**2026-05-14 — Task 4.8: OpenRouter analysis added**

Revised only the affected sections of `docs/investigations/openbrain-pivot-evaluation.md`:

- Added the required subsection `### OpenRouter-specific leverage for OB1-based options` under Stack & Ecosystem Analysis.
- Explicitly stated that OpenRouter is portable in theory to any HTTP-capable application, including a future C# path.
- Used 3 concrete current examples: `openai/gpt-4o-mini`, `anthropic/claude-sonnet-4`, and `google/gemini-2.5-flash`.
- Clarified that OpenRouter's strategic upside is concentrated on A/B in this spike because OB1 already assumes hosted remote workers.
- Left the Option Scoring Matrix unchanged after re-evaluation; added a scoring note that the OpenRouter upside improves the A/B narrative but not the weighted dimensions enough to move totals.
- Updated the recommendation narrative to address OpenRouter directly while keeping Option C.

Verification run:
`Select-String -Path docs\investigations\openbrain-pivot-evaluation.md -Pattern "OpenRouter-specific leverage for OB1-based options","portable in theory","OpenAI|Anthropic|Gemini"`

**2026-05-14 — Task 4.9: Governance artifacts refreshed**

Refreshed the closeout artifacts to match the completed OpenRouter revision:

- **ExecPlan §1b:** now states that the recommendation remains Option C after the OpenRouter revision, that A/B scores stayed unchanged, and that OpenRouter adds real hosted-stack upside without changing the final ranking.
- **ExecPlan §2c:** now records that the missing scope was captured, executed, and closed out.
- **Story board:** ST-017 moved from Refined back to Review with `Blocked by: none` and a note that the OpenRouter revision executed without changing the recommendation.
- **FollowUpSessionLog:** refreshed so the next session resumes at renewed PO review instead of execution or plan-review.

Verification run:
`Select-String -Path .github\planning\story-board.md -Pattern "### ST-017","Blocked by: none","OpenRouter"`
`Select-String -Path FollowUpSessionLog.txt -Pattern "OpenRouter","PO review"`
`Select-String -Path .github\planning\execplans\exec-plan-ST-017.md -Pattern "OpenRouter"`

---

## §6b. Surprises & Discoveries

- **Observation:** The `entity-extraction` schema in OB1 DOES have a PostgreSQL AFTER INSERT trigger on `thoughts`, which was not evident from cursory reading of the README. OB1 is not entirely query-time at the schema level — it has ingest-time queue mechanics.
  **Evidence:** `schemas/entity-extraction/schema.sql`, function `queue_entity_extraction()`, trigger `trg_queue_entity_extraction AFTER INSERT OR UPDATE OF content, metadata ON public.thoughts`.
  **Impact:** The feasibility rating for Options A and B should be "Significant" rather than "Impractical" for per-ingest synthesis — the trigger scaffolding exists. The worker that processes the queue must still be built from scratch. Final ratings unchanged but the reasoning is more nuanced.

- **Observation:** Apache AGE is definitively absent from the Supabase managed service extension list, even though it is a popular PostgreSQL extension. This is a hard architectural constraint for Options A (Adopt OB1 on Supabase).
  **Evidence:** Full extensions list at https://supabase.com/docs/guides/database/extensions reviewed; AGE not present anywhere in the 50+ extension list.
  **Impact:** Options A graph feasibility drops to Significant (recursive CTEs only, no openCypher). Options B and D require self-hosting Postgres to unlock AGE.

- **Observation:** The OB1 entity extraction worker — the service that reads `entity_extraction_queue` and fires LLM calls to populate `entities` and `edges` — is entirely absent from the repository. The schema and trigger exist but the fulfillment side is missing.
  **Evidence:** No files in `server/`, `integrations/`, `primitives/`, or any other directory with code that processes `entity_extraction_queue`.
  **Impact:** Graph capability on OB1-based options requires building this worker from scratch, same as building it on current C# architecture.

- **Observation:** OpenRouter's current public docs and model pages make the hosted OB1 value proposition more concrete than the previous draft captured: one API surface, 400+ models, 60+ providers, explicit provider routing, and per-model fallback/uptime views.
   **Evidence:** `https://openrouter.ai/docs`, `https://openrouter.ai/pricing`, and the model pages for `openai/gpt-4o-mini`, `anthropic/claude-sonnet-4`, and `google/gemini-2.5-flash`.
   **Impact:** Options A and B gain a clearer operational upside for remote-worker scenarios, but not enough to overcome the local-first and stack-fit advantages of Option C.

- **Observation:** Supabase Free includes enough storage and Edge Function capacity to make hobby-scale remote synthesis plausible for Options A/B: 500 MB database, 1 GB file storage, and 500,000 Edge Function invocations per month.
   **Evidence:** Supabase pricing page reviewed on 2026-05-14.
   **Impact:** The first-pass analysis overstated the minimum operating cost for OB1-based options. The cost floor is closer to ~$2–5/month at hobby scale, though the free tier still does not support the full 100K-memory upper-bound workload and still pauses after 1 week of inactivity.

- **Observation:** The decisive difference between Option C and OB1-based options is now clearly architectural simplicity, not raw capability.
   **Evidence:** After revising §4, the doc now states that A/B can perform per-ingest synthesis through trigger + worker + bridge, yet still ranks C highest because it avoids the bridge entirely.
   **Impact:** Recommendation remains stable, but the rationale is stronger and less biased toward local-first assumptions.

---

## §6c. Decision Log

- **Decision:** Returned ST-017 to Review after Task 4.9 rather than reopening planning.
   **Rationale:** The missing plan-review scope was explicitly captured, executed, and verified through Tasks 4.8 and 4.9. The next governance step is renewed PO review, not further execution.
   **Date:** 2026-05-14

- **Decision:** Kept the numeric Option Scoring Matrix unchanged after the OpenRouter revision.
   **Rationale:** OpenRouter's benefits are real, but in the existing matrix they strengthen A/B mainly through narrative operational leverage rather than enough change in the weighted categories to justify a score move. The strongest weights still sit on per-ingest synthesis simplicity, graph path, local-first behavior, and stack fit for the current solo C# developer.
   **Date:** 2026-05-14

- **Decision:** Performed all research tasks (4.1–4.5) in a single session rather than separate atomic commits per task.
  **Rationale:** Research tasks are read-only and interdependent (each task's findings inform the next). The risk of interruption is low compared to the cost of artificial session breaks between read operations.
  **Date:** 2026-05-13

- **Decision:** Used `mcp_github_get_file_contents` for repo structure + `fetch_webpage` on raw GitHub URLs for file content, not separate file reads.
  **Rationale:** The file content tool returned a resource URI that required an extra read step; direct raw URL fetch was faster and more reliable for large files.
  **Date:** 2026-05-13

- **Decision:** Did not read `schemas/typed-reasoning-edges/schema.sql` separately after reading entity-extraction and agent-memory schemas.
  **Rationale:** The entity-extraction schema already demonstrated the full graph capability pattern (entities + edges + thought_entities). The typed-reasoning-edges schema is additive to the same pattern. Adding it would not change any rating or recommendation.
  **Date:** 2026-05-13

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

**Achieved:** Full investigation spike, including two PO-driven revision passes. OB1 source analysed from GitHub. All 4 platform options scored across 5 weighted dimensions. Investigation document updated to cover cloud-side synthesis viability, hobby-scale Supabase Free costs, and OpenRouter's hosted-stack leverage. Recommendation remains Option C. Two follow-on stories drafted (ST-018, ST-019). Board updated. Governance refreshed for renewed PO review.

**Remains:** PO review of recommendation. New story planning for ST-018 and ST-019 when the recommendation is accepted.

**Lesson:** OB1's extension model is more sophisticated than its README suggests — the entity-extraction schema with trigger-based async queuing is a solid design pattern worth studying and adapting for the C# architecture (as an ingest-time entity extraction queue in SQLite). The absence of the queue processor in OB1's repo is worth flagging: OB1 provides schema scaffolding for advanced features but leaves the substantial implementation work to the user in several areas.

---

## Revision Notes

- 2025-07-17: Reserved — shell created during /plan-new session
- 2026-05-13: Full ExecPlan authored during /plan session. PO confirmed: desk research only, 4 options (Adopt/Fork/Stay/Build Fresh), balanced evidence, executor writes draft recommendation, investigation doc + board update as deliverables.
- 2026-05-13: Spike executed via /continue. All 7 tasks complete. Recommendation: Stay Current (Option C). Investigation doc at docs/investigations/openbrain-pivot-evaluation.md. ST-017 moved to Review.
- 2026-05-14: First PO review surfaced two analytical gaps: cloud-side synthesis viability for A/B and hobby-scale Free-tier costs. Investigation and governance artifacts were revised; recommendation remained Option C.
- 2026-05-14: Second PO review requested explicit OpenRouter analysis. `/plan` added Tasks 4.8 and 4.9 and returned ST-017 to Refined for execution.
- 2026-05-14: OpenRouter revision executed and closed out. Dedicated subsection added, A/B scores unchanged, recommendation remained Option C, and ST-017 returned to Review for renewed PO acceptance.
