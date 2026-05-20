# QP-017: Evaluate Open Brain as base layer vs current architecture

## Story

- **ID:** ST-017
- **Type:** spike
- **Value:** 5
- **Placement:** Review (blocked by plan-review)

## PO Intent

Evaluate whether the Open Brain project (OB1) can serve as the base platform for ai-memory — used directly with custom extensions built as plugins/recipes/schemas — rather than continuing to build on the current C#/.NET 8 + SQLite architecture.

The PO is considering two specific extensions beyond Open Brain's current capabilities:

1. **Per-ingest synthesis** — When data is ingested, automatically generate/update compiled Markdown views (Obsidian-compatible) that represent synthesised perspectives on the data. Example: a personal/professional storyboard tracking todo items in board format, updated every time a relevant thought is captured.

2. **Graph/structural similarity search** — Beyond vector similarity and text search, enable querying based on structural relationships between concepts (entity-relationship graph, subgraph matching, multi-hop traversal).

## Research Findings

### Open Brain (OB1) architecture summary

| Aspect | Detail |
|--------|--------|
| Stack | TypeScript (53%), Python (14%), PLpgSQL (9%) |
| Storage | Supabase (PostgreSQL + pgvector) |
| License | FSL-1.1-MIT (personal use OK) |
| Core model | Flat `thoughts` table + vector embeddings |
| MCP server | TypeScript, stdio transport |
| Extensions | Community recipes, skills, schemas, dashboards, integrations |
| Agent Memory | Provenance, relation, recall-trace, audit sidecars |
| Hosting | Cloud-first (Supabase + OpenRouter) |

### Current ai-memory architecture summary

| Aspect | Detail |
|--------|--------|
| Stack | C# 12 / .NET 8+ |
| Storage | SQLite + FTS5 + sqlite-vec (Postgres migration designed in) |
| Core model | Semantic memories + Episodic memories + Consolidation pipeline |
| Interface | MCP facade over REST API (ASP.NET Core Minimal API) |
| Hosting | Local-first (portable single-file DB) |
| Search | Hybrid FTS5 + vector + RRF fusion + MMR diversity |

### Key gaps in OB1 for PO's requirements

1. **No per-ingest synthesis** — OB1 is explicitly a "query-time system" (stores faithfully, synthesizes at recall). The PO's wiki-style ingest-time compilation would need to be built as a new extension.

2. **No graph/structural similarity** — OB1 has basic `relation` sidecars in the Agent Memory schema but no graph database, no structural fingerprinting, no subgraph matching. Would need a new layer.

3. **Stack mismatch** — OB1 is TypeScript/Python; current ai-memory is C#/.NET. Switching stacks is a consideration.

### What OB1 provides that current architecture doesn't

- Active community (3k stars, 576 forks, 20+ contributors)
- Pre-built import recipes (ChatGPT, Obsidian, Slack, Discord, email, etc.)
- Dashboard templates (SvelteKit, Next.js)
- Agent Memory schema with provenance tracking
- Cloud-hosted by default (low friction for multi-device access)
- Extension ecosystem (skills, recipes, integrations)

### What current architecture provides that OB1 doesn't

- Consolidation pipeline (episodic → semantic promotion with scoring)
- Hybrid search with RRF fusion + MMR diversity re-ranking
- Strong typing and compile-time safety (C#)
- Local-first deployment (zero cloud dependency)
- Designed repository interface for backend swappability

## Confirmed Story Metadata

- **Placement:** Refined
- **Value:** 5 (critical — determines project direction)
- **Blocked by:** none
- **License concern:** none (personal use)
- **Stack change:** undecided — spike should evaluate tradeoffs

## Known Dependencies

- If spike recommends OB1 adoption, stories ST-002 through ST-010 would need to be invalidated or heavily reworked
- ST-013 (doc split) is unaffected regardless of outcome
- ST-015 and ST-016 (governance improvements) are unaffected

## Open Questions for /plan Session

1. **Extension feasibility**: Can OB1's Supabase edge functions + schemas support per-ingest synthesis (e.g., a Postgres trigger or edge function that calls an LLM and writes to a Markdown-compatible table)?

2. **Graph layer options**: What's the lightest-weight graph extension for OB1? Options include:
   - Apache AGE (Postgres graph extension)
   - Separate relationship table with LLM-extracted entities
   - Structural fingerprint vectors (as discussed in the Copilot conversation)

3. **Use case validation**: Map these specific use cases to OB1's capabilities:
   - Capture a meeting transcript → auto-update a professional storyboard view
   - Capture a personal todo → auto-update a Kanban-style board view
   - Query "show me all thoughts structurally similar to this planning session"

4. **Community extension model**: Can the PO's extensions be built as OB1 recipes/schemas that benefit from upstream improvements, or would they diverge too much?

5. **Hosting evaluation**: Supabase free tier limits, OpenRouter costs, vs self-hosted PostgreSQL + local models

6. **Migration path**: If adopting OB1, what happens to the existing C# codebase (ST-001 scaffold, governance tooling)?

## Plan-Review Resolution Scope (2026-05-14)

The PO requested an additional revision to ST-017 after the revised spike outcome was presented for acceptance.

Locked scope for the revision:

1. **OpenRouter must be evaluated as a first-class part of the OB1 stack value proposition**, not only as a cost line item alongside Supabase.
2. **The investigation doc must gain a dedicated OpenRouter subsection** inside the existing analysis rather than a separate addendum document.
3. **Use 2–3 concrete representative provider/model examples** to show why OpenRouter matters in practice. The planner may choose the specific examples.
4. **State portability fairly**: OpenRouter is portable in theory to any HTTP-capable application, including a future C# path.
5. **Evaluate practical benefit mainly on Options A and B** because OB1 already assumes a cloud-hosted Supabase + OpenRouter operating model. Re-score A/B if warranted; do not automatically re-score C/D.
6. **Recommendation may change** if the OpenRouter analysis materially shifts the balance.

## Sources Referenced

- `docs/investigations/memory-architecture-design.md` — current schema and pipeline design
- `docs/investigations/sqlite-vs-postgresql.md` — storage decision (already designed for Postgres migration)
- `docs/investigations/interface-design-mcp-rest.md` — current MCP/REST interface design
- `docs/investigations/Youtube/Nate B Jones on Open Brain vs LLM Wiki.md` — write-time vs query-time tradeoff analysis
- `docs/investigations/Discussions/Gemini Agile MD Storyboard.md` — use case: agent-managed storyboard
- `docs/investigations/Discussions/Open Brain Project Overview and Implementation.html` — OB1 structural similarity discussion
- https://github.com/NateBJones-Projects/OB1 — Open Brain repository (TypeScript/Python, Supabase)

## Recommended Next Step

Run `/plan` for ST-017 to produce a full ExecPlan. The plan should structure the spike as:
1. Deep-dive into OB1's extension model (schemas, edge functions, MCP tools)
2. Prototype per-ingest synthesis as an OB1 schema/edge function
3. Prototype graph querying (AGE or relation table approach)
4. Compare effort/outcomes against extending the current C# architecture
5. Produce a go/no-go recommendation with clear rationale

## Planning Decisions (from /plan session 2026-05-13)

- **Execution mode:** Desk research only — no local deployment or prototyping
- **Options evaluated:** 4 minimum — Adopt OB1, Fork OB1, Stay Current, Adopt Approach Build Fresh
- **"Adopt Approach Build Fresh":** Treated as a single option with noted sub-variants (C# vs TypeScript)
- **Decision threshold:** Balanced evidence, no pre-leaning; executor writes draft recommendation
- **OB1 research scope:** Extension model + schema focus (skip internal implementation detail)
- **Hosting costs:** Included as a full analysis section
- **Deliverables:** Investigation doc (`docs/investigations/openbrain-pivot-evaluation.md`) + board update + follow-on stories if pivot recommended
- **OB1 repo inaccessible:** Escalate to PO; do not fall back to incomplete data
- **Plan file:** `docs/investigations/plan-openBrainPivotEvaluation.prompt.md` retained as supplementary context
- **ExecPlan:** `.github/planning/execplans/exec-plan-ST-017.md` — Status: ✅ Ready for /continue

## Planning Decisions (from /plan-review resolution 2026-05-14)

- **Artifact shape:** Revise `docs/investigations/openbrain-pivot-evaluation.md` in place; add a dedicated OpenRouter subsection
- **Comparison frame:** Explicitly state OpenRouter portability, but weight its practical benefit mainly toward OB1-based options A/B
- **Evidence depth:** Include concrete representative model/provider examples rather than conceptual analysis only
- **Scoring scope:** Re-score A/B only unless the executor finds a direct, documented reason that C/D must also move
- **Outcome posture:** Recommendation is allowed to change if the OpenRouter analysis supports it
