# Plan: ST-017 Open Brain Pivot Evaluation

Desk-research spike evaluating 4+ platform options for ai-memory. Produces a scored investigation doc at `docs/investigations/openbrain-pivot-evaluation.md` plus board updates with follow-on stories if a pivot is recommended.

---

## Phase A: Research & Analysis

### Task 4.1: Map OB1 Extension Model from Source

**Objective:** Read OB1's GitHub repo (extension-model focus): schema structure, MCP server wiring, recipes/skills/integrations directories, ingest-time hooks. Document extension points or their absence.

**Source:** https://github.com/NateBJones-Projects/OB1 (read via GitHub tools, not clone)

**Steps:**
1. Read OB1 repo structure (root-level organization, key directories)
2. Identify extension mechanisms: schemas, recipes, skills, integrations directories
3. Read schema definitions — how are `thoughts` structured, what metadata is available?
4. Read MCP server implementation — what tools are exposed, how are they wired?
5. Identify any event/hook system for ingest-time processing
6. Document findings in working notes

**Output:** Extension model map with: hook points, extensibility pattern (plugin? fork?), schema flexibility, event model (if any)

**Verification:** Extension model has specific entries for: schema extension, MCP tool extension, ingest pipeline hooks (or documented absence of)

---

### Task 4.2: Evaluate Per-Ingest Synthesis Feasibility (4 options)

**Objective:** For each platform option, assess how "per-ingest synthesis" (auto-generate compiled Markdown views on write) could be implemented. Rate each: trivial / moderate / significant / impractical.

**Steps:**
1. **OB1 Adopt:** Can Supabase triggers/edge functions call LLMs on insert and write to a views table/file? What pg functions exist already?
2. **OB1 Fork:** Same as adopt but with freedom to modify core. What changes would be needed?
3. **Stay Current (C#/.NET):** Design sketch — repository event → service → LLM call → Markdown file/table. How hard?
4. **Adopt Approach, Build Fresh:** Postgres + pgvector + custom service. What's the delta from current?

**Output:** Per-option feasibility rating (trivial/moderate/significant/impractical) with rationale

**Verification:** Each option addresses: hook mechanism, LLM integration path, output format (Obsidian-compatible MD), incremental update strategy

---

### Task 4.3: Evaluate Graph/Structural Similarity Feasibility (4 options)

**Objective:** For each platform option, assess how graph/structural similarity search could be added. Rate each: trivial / moderate / significant / impractical.

**Steps:**
1. **OB1 Adopt:** Can Apache AGE be added to Supabase? Or use pg relation tables with LLM-extracted entities?
2. **OB1 Fork:** Same as adopt + ability to add GraphQL layer or graph extension
3. **Stay Current:** sqlite-vec + structural fingerprint vectors approach from architecture doc. How does this compare?
4. **Adopt Approach, Build Fresh:** Postgres + AGE or Neo4j sidecar + custom graph queries

**Output:** Per-option feasibility rating with rationale

**Verification:** Each option addresses: graph schema, query mechanism, entity extraction approach, scalability notes

---

### Task 4.4: Stack & Ecosystem Tradeoff Analysis

**Objective:** Compare TypeScript/Python (OB1 ecosystem) vs C#/.NET across dimensions relevant to a solo PO/developer.

**Dimensions:**
- Developer velocity (for a solo PO/developer)
- Ecosystem maturity for AI/LLM integration
- Testing and type safety guarantees
- Community contribution pipeline (if ever relevant)
- Hosting/deployment simplicity
- Existing codebase investment (sunk cost analysis — what exists and what's its value)

**Output:** Comparison table with qualified judgment per dimension

**Verification:** Table covers all 6 dimensions with evidence for each judgment

---

### Task 4.5: Hosting Cost Comparison

**Objective:** Compare hosting costs for a personal-use memory service across options at ≤100K memories, ~50 queries/day scale.

**Dimensions:**
- Supabase free tier (limits: rows, bandwidth, storage, edge function invocations)
- Supabase Pro tier (first paid tier for growth)
- OpenRouter API costs (for LLM calls in OB1 ecosystem)
- Self-hosted PostgreSQL + local LLM (Ollama) costs (hardware only)
- Current architecture: SQLite local-first (zero ongoing cost)
- Hybrid: self-hosted Postgres + cloud LLM API

**Output:** Cost table with monthly estimates for personal-use scale

**Verification:** Each option has a monthly cost estimate (or "zero" / "hardware-only" where applicable)

---

## Phase B: Synthesis & Recommendation

### Task 4.6: Score Options & Write Investigation Doc

**Objective:** Synthesize all analysis into `docs/investigations/openbrain-pivot-evaluation.md`

**Structure:**
1. Executive Summary (1 paragraph)
2. Background & Motivation (why this spike exists)
3. Options Under Evaluation (4+ options defined)
4. Analysis Sections (per-ingest synthesis, graph search, stack, hosting — one section each)
5. Option Scoring Matrix (dimensions × options, scored)
6. Recommendation (narrative: "Recommend X because Y, despite Z")
7. Impact Assessment (ST-002–ST-010 consequences per option)
8. Sources Referenced

**Verification:** Doc exists, contains all 8 sections, each option rated, recommendation is specific

---

### Task 4.7: Update Board & Create Follow-on Stories (if applicable)

**Objective:** Based on the recommendation, update the story board appropriately.

**Steps:**
1. Move ST-017 to Review on the board
2. If pivot is recommended: draft follow-on stories for the board (new ST-N entries)
3. If stay current: note in ST-017 outcomes that ST-002–ST-010 remain valid
4. Update ExecPlan §1b Outcomes & Conclusions with key findings

**Verification:** Board reflects ST-017 in Review; follow-on stories (if any) appear in Backlog

---

## Relevant Files

- `.github/planning/query-packets/QP-017-openbrain-pivot-evaluation.md` — seed context (PO intent, research, open Qs)
- `.github/planning/execplans/exec-plan-ST-017.md` — target ExecPlan to populate
- `.github/planning/story-board.md` — board updates on completion
- `docs/investigations/memory-architecture-design.md` — comparison baseline
- `docs/investigations/sqlite-vs-postgresql.md` — existing Postgres migration analysis
- `docs/investigations/interface-design-mcp-rest.md` — current API design
- `docs/investigations/Youtube/Nate B Jones on Open Brain vs LLM Wiki.md` — write-time vs query-time analysis
- https://github.com/NateBJones-Projects/OB1 — OB1 source (read via web/GitHub tools)

---

## Verification (Definition of Done)

1. `docs/investigations/openbrain-pivot-evaluation.md` exists with all 8 sections
2. Each of 4+ options rated on: per-ingest synthesis, graph search, stack fit, hosting cost
3. Recommendation names a specific option with evidence-backed rationale
4. Impact on ST-002–ST-010 explicitly stated per option
5. ExecPlan §1b captures outcome summary with supporting evidence
6. Board updated: ST-017 → Review; follow-on stories created if pivot recommended
7. `FollowUpSessionLog.txt` updated with session outcomes

---

## Decisions

- Desk research only — no local deployment or prototyping
- 4 platform options minimum: Adopt OB1, Fork OB1, Stay Current, Adopt Approach Build Fresh
- Balanced evidence — no predetermined outcome
- OB1 source analysis: extension model + schema only (skip internals)
- Hosting cost included as full section
- Follow-on stories created only if recommendation changes project direction

---

## Further Considerations

1. OB1 repo URL is `https://github.com/NateBJones-Projects/OB1` — if inaccessible during execution, fall back to existing notes in the query packet and investigation docs (no blocker).
2. The "Adopt Approach Build Fresh" option may split into sub-variants (e.g., keep C# vs switch to TypeScript). These should be noted as variants within the single option row, not separate top-level options, unless the analysis reveals materially different outcomes.
