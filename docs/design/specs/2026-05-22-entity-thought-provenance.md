# Entity↔Thought Provenance Link — Design Spec

**Date:** 2026-05-22
**Status:** Brainstorm complete; pending PO review before writing-plans
**Source:** Brainstorming session with PO 2026-05-22
**Related stories:** ST-034 (cardinality spike, Backlog); consumers ST-019, ST-026. A feature story for this spec is not yet on the board — to be created during `/plan-new` after PO review of this spec.
**Related ADRs:** ADR-005 (memory model), ADR-007 (consolidation pipeline)

---

## 1. Background and motivation

The cloud MCP uses two storage layers colocated in one Postgres instance:

- **pgvector + BM25** over `public.thoughts` for semantic + lexical search
- **Apache AGE `memory_graph`** for entity-relationship traversal

The entity-extraction worker (ST-022, Done) populates the graph by MERGE-ing nodes from each thought's content ([server/src/entityWorker.ts](../../../server/src/entityWorker.ts)). Graph nodes carry only `(label, name)` — there is no reference back to the thoughts that mentioned them. Concretely:

- You cannot ask "which thoughts mention this entity?" with a single query.
- Cypher returns entities but cannot join back to source content.
- Future consumers (graph-expanded search, provenance audit, ST-019 backlink notes) all need this link and cannot reasonably implement it themselves.

**Why now:** Two named consumer storylines (graph-expanded search and ST-019 Obsidian synthesis) are both blocked on this. ST-022 is recently complete; wiring up cross-store joins is the natural next increment. Pre-launch, there is no migration concern — the worker can write the link forward from day one.

**Why this is its own story (not folded into a consumer):** Multiple future consumers need the same link with the same shape. Building any single consumer first would shape the link around one use case and force re-work for the next; the PO has signalled "all three / not sure yet" about which consumer comes first, so the cost of being wrong about consumer shape is real.

---

## 2. Scope

### In scope

- New `public.entity_mentions` table linking `thought_id ↔ (entity_label, entity_name)`.
- Modification to `entityWorker.writeToGraph` to write one mention row per extracted entity, alongside the existing AGE `MERGE`.
- Schema migration; idempotency on re-extraction; cascade on thought delete.
- Tests covering write path + re-extraction idempotency.

### Out of scope (and why)

- **No new MCP tools.** Why: the right read-tool shape depends on consumer needs we have not pinned down. Committing to a tool now is YAGNI in the most expensive form — interface choices are sticky.
- **No bounding strategy for graph-expanded search.** Why: that's ST-034. Separating spike from feature lets the bounding strategy be data-driven (measured against actual entity distributions in dev data) rather than guessed.
- **No backfill.** Why: pre-launch, no historical data to migrate.
- **No mention metadata beyond the link** (no confidence score, no character offset, no surface form). Why: speculative columns rot. Add fields only when a named consumer story needs them.

---

## 3. Direction (binding on future consumer stories)

When read tools land in later stories, they will be **composable single-purpose MCP tools** (e.g. `thoughts_for_entity`, `entity_neighbors`, `provenance_for_entity`) — **not** one opinionated `search-and-expand` pipeline.

**Why:**

1. **The agent should decide when to expand.** A pipeline pays the graph cost on every search call even when vector alone is sufficient — extra tokens, extra latency, no value when the question is "find a thought like this."
2. **Different consumers want different orchestrations.** An interactive agent wants step-by-step expansion with intermediate ranking; ST-019's batch synthesis wants bulk enumeration; ST-026's storyboard view wants neither. A single pipeline tool serves none of them well.
3. **Composed tools match the underlying lanes' independence.** Vector, BM25, and graph are independent at the data layer. Coupling them at the tool layer hides that independence and makes future tuning harder (you can't change the graph lane without rev'ing the pipeline tool).
4. **MCP convention.** Each tool does one thing; composition is the agent's job, not the server's.

A future consumer story may have strong reason to override this direction (e.g. a specific high-frequency pattern that is expensive to compose). If so, it should explicitly re-litigate this section — the override is a deliberate revisit, not a default.

---

## 4. Data plane design

### 4.1 Schema

```sql
CREATE TABLE IF NOT EXISTS public.entity_mentions (
  thought_id   uuid        NOT NULL REFERENCES public.thoughts(id) ON DELETE CASCADE,
  entity_label text        NOT NULL CHECK (entity_label IN ('Person', 'Function', 'Error', 'Topic', 'Project')),
  entity_name  text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thought_id, entity_label, entity_name)
);

CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity
  ON public.entity_mentions(entity_label, entity_name);
```

**Why this shape:**

- **Composite PK `(thought_id, entity_label, entity_name)`** gives natural idempotency on re-extraction — the worker uses `ON CONFLICT DO NOTHING`.
- **`ON DELETE CASCADE` on `thought_id`** matches the cascade pattern already used by `consolidation_queue` and `entity_extraction_queue` ([server/db/schema.sql:70](../../../server/db/schema.sql#L70), [server/db/graph.sql:27](../../../server/db/graph.sql#L27)).
- **Secondary index on `(entity_label, entity_name)`** powers the reverse-direction query "thoughts mentioning entity X" — the dominant read pattern for all L0–L1 consumers below.
- **`entity_label` CHECK constraint** enforces the same allow-list as the entity worker ([server/src/entityWorker.ts:11](../../../server/src/entityWorker.ts#L11)). Why: defence-in-depth — if a future code path bypasses the worker's filter, the database refuses bad data.
- **No `mention_count` column.** Why: would require UPDATE logic on each row; recurrence within a single thought is rare enough not to matter. If a consumer needs it, a future story can add it cheaply.

### 4.2 Worker change

`writeToGraph(extraction)` ([server/src/entityWorker.ts:96-118](../../../server/src/entityWorker.ts#L96-L118)) currently iterates extracted nodes and edges, issuing one Cypher MERGE per node/edge. It does not currently receive the source `thought_id`.

**Change:**
1. Thread `thought_id` into `writeToGraph` from the caller (`processQueue`, [server/src/entityWorker.ts:155-159](../../../server/src/entityWorker.ts#L155-L159)).
2. After the node MERGE loop, delete any prior mentions for this thought (§4.4) and insert the new set.

Use a single batched INSERT with `ON CONFLICT DO NOTHING`. **Why batched:** node count per thought is bounded by the LLM extraction step (no streaming) and one round-trip is cheaper than N, regardless of the exact count. `postgres` library array binding makes batching trivial. The DELETE precedes the INSERT to handle re-extraction (§4.4).

### 4.3 Transactional semantics

The existing AGE writes are **not transactional with each other** — each `sql.unsafe` is its own implicit transaction ([server/src/entityWorker.ts:99-117](../../../server/src/entityWorker.ts#L99-L117)).

**Decision:** the new mentions INSERT is also its own statement; no transaction wraps AGE writes + mentions together.

**Why:** the existing worker is already resilient to partial failure via the retry/backoff path ([server/src/entityWorker.ts:184-194](../../../server/src/entityWorker.ts#L184-L194)) — a re-run will idempotently `MERGE` the AGE entries and `ON CONFLICT DO NOTHING` on the mentions. Wrapping the AGE `sql.unsafe` calls in an explicit transaction would complicate the worker substantially (managing the `LOAD 'age'` and `search_path` across the boundary) for a consistency gain that retry already provides.

### 4.4 Re-extraction behaviour

The trigger ([server/db/graph.sql:60-78](../../../server/db/graph.sql#L60-L78)) re-enqueues a thought when its `content_fingerprint` changes. The re-extraction may produce a **different** entity set than the previous run.

**Decision:** at re-extraction, delete all prior mentions for the thought, then insert the new set.

**Why:** a thought's content has changed and the link must reflect the **current** content, not a union of all historical extractions. Stale rows would mislead consumers — provenance audit would show entities the current text no longer mentions, and graph-expanded search would surface phantom matches. The DELETE is cheap (composite-PK index lookup) and runs at most once per re-extraction.

---

## 5. What this enables (catalog for future consumer stories)

The `entity_mentions` link, in combination with the existing AGE graph, unlocks a layered menu of structural-similarity operations. Future consumer stories pick from this catalog.

### L0 — Entity-set similarity (entity_mentions only, no AGE)

**What:** Two thoughts are similar by count of shared entities, via SQL self-join on `entity_mentions`.

```sql
SELECT t.*, COUNT(*) AS shared_entities
FROM entity_mentions a
JOIN entity_mentions b USING (entity_name, entity_label)
JOIN thoughts t ON t.id = b.thought_id
WHERE a.thought_id = :hit_id AND b.thought_id <> :hit_id
GROUP BY t.id
ORDER BY shared_entities DESC;
```

**Why include it:** Nearly free and often "good enough." Captures "do these talk about the same things?" Bridges the gap between vector (word-level semantic) and full graph traversal — and may be all most consumers actually need.

**Honesty note:** Not really "structural" — it's set-overlap on the LLM's chosen entities, no edge semantics. Worth labelling clearly so future stories don't claim structural value they aren't delivering.

### L1 — Edge-typed 1-hop expansion (entity_mentions + existing AGE `graph_search`)

**What:** From a thought's entities, traverse a named edge type (`CAUSED_BY`, `WORKS_ON`, `USES`, `LIKES`, `RELATED_TO`), then back-join to thoughts via `entity_mentions`.

**Why include it:** This is **where the graph earns its keep over vector**. Vector cannot find "Alice's ProjectX thoughts" when the thought says only "ProjectX shipped" — the edge does. Without this layer, the graph adds no unique value over a higher-k vector search.

**Cost:** Needs ST-034's bounding strategy before any tool ships against it — popular entities will hairball without it.

### L2 — Multi-hop / path-based (entity_mentions + multi-hop AGE Cypher)

**What:** Shortest path or K-hop reachability between two thoughts' entity sets.

**Why include it:** Surfaces indirect / transitive connections — "downstream consequences of X," "things in the neighborhood of Y." Useful for diagnostic and exploratory queries.

**Cost:** Cardinality compounds with hop count; ranking is harder; ST-034's bounding strategy matters more here than at L1.

### L3 — Subgraph / motif similarity (advanced, future)

**What:** Match recurring relational patterns ("thoughts whose entities form a `CAUSED_BY → CAUSED_BY` chain").

**Why include it:** Mentioned for completeness so the catalog isn't misread as exhaustive. Likely not a v1 consumer concern — but the data layer doesn't preclude it.

### Ceiling caveat for all of L1–L3

Structural similarity quality is bounded by **the LLM extractor's precision/recall and the 5-label × 5-rel-type ontology**. If `(Alice)-[:WORKS_ON]->(ProjectX)` was never extracted, no graph cleverness recovers it. **The graph is a lossy projection of the text.** Future consumer stories that depend on graph quality should plan to invest in extraction quality (richer ontology, multi-pass extraction, evaluation set) — not assume the graph is faithful.

---

## 6. Open questions deferred to consumer stories

These are deliberately **not resolved** in this spec. The data-plane design does not commit to answers; consumer stories pick when relevant.

1. **Co-occurrence vs. edge-typed structure.** Does the dominant first consumer want L0 (entity-set overlap, no AGE) or L1 (edge-typed expansion via AGE)? Settled per-consumer-story.
2. **Vector-vs-graph value overlap.** When does the graph lane actually add value over higher-k vector? This is a quality-evaluation question for a later story, likely with measurement on real query patterns.
3. **Pipeline vs. composition.** Bound by §3 direction. A consumer story may surface a strong reason to package a specific composition as one tool — if so, it must explicitly re-litigate §3 rather than drift past it.
4. **Extraction quality investment.** §5's ceiling caveat raises the question; this spec does not address it.

---

## 7. Testing strategy

The change is small; test scope matches.

- **Worker integration tests** ([server/tests/entity-worker.test.ts](../../../server/tests/entity-worker.test.ts)) extended with:
  - (a) Happy-path assertion: after extraction of a thought with N entities, `entity_mentions` contains N rows for that `thought_id`.
  - (b) Re-extraction: after content change triggers re-extraction with a different entity set, prior rows are gone and only the new set remains.
- **Schema integration tests:**
  - Table exists, FK cascades correctly on `DELETE FROM thoughts WHERE id = ...`.
  - CHECK constraint rejects insertion of an unknown label.

**Why this minimal:** one new table + one new SQL statement in an existing well-tested worker. Heavier testing (property-based, performance) belongs to consumer stories that actually depend on read characteristics.

---

## 8. Related artifacts

- Cross-store architecture summary: [CLAUDE.md](../../../CLAUDE.md) "High-level architecture (cloud MCP)"
- ST-022 (Done) — entity extraction worker that this story extends
- ST-034 (Backlog, Phase 2) — cardinality bounding spike for graph-expanded search
- ST-019 (Backlog, Phase 3) — Obsidian synthesis service, consumer of L0/L1
- ST-026 (Backlog, Phase 3) — Obsidian storyboard view, may consume L0
- [ADR-005 memory model](../adr/ADR-005-memory-model.md)
- [ADR-007 consolidation pipeline](../adr/ADR-007-consolidation-pipeline.md)
