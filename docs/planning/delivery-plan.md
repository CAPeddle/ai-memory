---
name: "Delivery Plan — ai-memory"
summary: "Phased delivery plan with dependency graph and done criteria for each phase, mapped to story-board stories"
asset_type: "plan"
status: "active"
version: "1.0"
owners:
  - "ai-memory-maintainers"
source_path: "docs/planning/delivery-plan.md"
created: "2026-05-15"
---

# Delivery Plan — ai-memory

**Version:** 1.0  
**Date:** 2026-05-15  
**Status:** Active

This document defines the phased delivery sequence for ai-memory, mapping backlog stories to delivery phases with dependency ordering and phase-level done criteria. Stories within a phase are listed in execution order (dependencies respected).

For requirements, see [docs/requirements/SRS.md](../requirements/SRS.md).  
For architecture decisions, see [docs/design/SystemDesign.md](../design/SystemDesign.md) and [docs/design/adr/](../design/adr/).  
For day-to-day execution state, see [.github/planning/story-board.md](../../.github/planning/story-board.md).

---

## Dependency Graph

```
ST-001 (Scaffold)
  ├── ST-002 (SQLite schema)
  │     └── ST-003 (IMemoryRepository)
  │           ├── ST-005 (Hybrid search) ← also needs ST-004
  │           │     ├── ST-006 (REST API) ← also needs ST-003
  │           │     │     └── ST-007 (MCP server)
  │           │     │           └── ST-010 (E2E integration tests)
  │           │     └── ST-008 (Consolidation pipeline)
  │           │           └── ST-010 (E2E integration tests)
  │           └── ST-004 (Embedding service)
  │                 └── ST-005 (Hybrid search)
  ├── ST-018 (Graph schema + structural fingerprints) ← needs ST-002, ST-003
  │     └── ST-019 (ISynthesisService + Views) ← also needs ST-003, ST-004
  └── ST-013 (Split investigation docs) ← no hard dependency
```

---

## Phase 0 — Foundation and Governance (Complete)

**Status:** ✅ Done  
**Description:** Repository scaffolding, governance workflows, and investigation spikes. No user-facing features yet.

| Story | Type | Description | Status |
|-------|------|-------------|--------|
| ST-001 | Infrastructure | Scaffold .NET solution and project structure | ✅ Done |
| ST-009 | Infrastructure | Create workflow governance files (.github/) | ✅ Done |
| ST-011 | Debt | Institutionalise recurring governance review | ✅ Done |
| ST-012 | Infrastructure | Discoverable AI-governance asset catalog | ✅ Done |
| ST-014 | Spike | Investigate memsearch for architectural learnings | ✅ Done |
| ST-015 | Infrastructure | Improve ExecPlan template (outcomes section) | Review |
| ST-016 | Infrastructure | SE best practices adoption | Review |
| ST-017 | Spike | Evaluate Open Brain vs current architecture | Review |

**Phase done criteria:**
- Solution builds clean with zero analyser warnings
- `dotnet test` passes (smoke tests)
- All investigation spikes have completed investigation docs with recommendations
- ST-017 recommendation confirmed: Stay Current on C#/.NET 8 + SQLite ✅

---

## Phase 1 — Persistence Layer

**Status:** 🔲 Not started  
**Description:** Implement the SQLite schema, FTS5 index, migration system, and the `IMemoryRepository` CRUD implementation. This is the data foundation for all subsequent phases.

**Dependency:** ST-001 complete.

| Story | Value | Blocked by | Description |
|-------|-------|-----------|-------------|
| ST-002 | 5 | ST-001 | SQLite schema + FTS5 + migrations |
| ST-003 | 4 | ST-002 | `IMemoryRepository` (SQLite CRUD) |

**Story sequence:** ST-002 → ST-003 (strictly sequential)

**Phase done criteria:**
1. `dotnet build` passes; `dotnet test` passes
2. Database file created on first run at `~/.ai-memory/memory.db`
3. `semantic_memories`, `episodic_memories`, `recall_events`, `projects`, `consolidation_log`, `stories`, `entities`, `chunk_entities` tables exist
4. FTS5 virtual table `fts_memories` created with porter tokenizer; row-level triggers keep it in sync
5. `IMemoryRepository.StoreAsync()`, `GetByIdAsync()`, `SoftDeleteAsync()`, `RecordRecallEventAsync()` are unit-tested with in-memory SQLite
6. Migration system applies schema idempotently on second run
7. NFR-S3: database created automatically (no manual `CREATE TABLE` needed)

---

## Phase 2 — Retrieval Core

**Status:** 🔲 Not started  
**Description:** Implement the embedding service, hybrid search pipeline (BM25 + Vector via RRF + MMR), and structural pre-filter. This phase delivers the core search capability of The Brain.

**Dependency:** ST-003 complete.

| Story | Value | Blocked by | Description |
|-------|-------|-----------|-------------|
| ST-004 | 4 | ST-001 | OpenAI embedding service (`IEmbeddingService`) |
| ST-005 | 5 | ST-003, ST-004 | Hybrid search: FTS5 + Vector + RRF + MMR |

**Story sequence:** ST-004 (can start in parallel with ST-003) → ST-005

**Phase done criteria:**
1. `dotnet test` passes all retrieval tests
2. `IEmbeddingService.GetEmbeddingAsync()` calls OpenAI and returns 1,536-dim vector; falls back gracefully on HTTP failure
3. `ISearchEngine.HybridSearchAsync()` returns results within 100 ms on 10K seeded records (NFR-P1 proxy)
4. FTS5 BM25 lane returns results for exact keyword queries
5. Vector lane returns results for paraphrase queries with > 0.7 cosine
6. RRF fusion produces a meaningful merged ranking (validated by integration test with seeded test data, >80% recall on test queries — per ST-005 AC)
7. MMR re-ranking reduces result set to include < 30% near-duplicate pairs
8. Structural pre-filter (project scoping) reduces candidate set before ranking
9. `degraded: true` is returned when embedding service is unavailable (FTS5-only mode active)

---

## Phase 3 — API Layer

**Status:** 🔲 Not started  
**Description:** Expose the memory engine via REST and MCP. This phase makes the system usable by AI agents and developer tooling.

**Dependency:** ST-003, ST-005 complete.

| Story | Value | Blocked by | Description |
|-------|-------|-----------|-------------|
| ST-006 | 4 | ST-003, ST-005 | REST API endpoints (all FR-API-* requirements) |
| ST-007 | 5 | ST-006 | MCP server facade (all FR-MCP-* requirements) |
| ST-020 | 4 | ST-006, ST-007 | Request-scoped ambient context (ADR-008: FR-R-016, FR-API-013, FR-MCP-007, FR-B-009) |

**Story sequence:** ST-006 → ST-007 → ST-020

**Phase done criteria:**
1. `dotnet test` passes all API tests
2. All REST endpoints from SRS §5.7 return correct responses with `{ data, meta, errors }` envelope
3. `POST /api/v1/memories` stores a fact and returns 201 with ULID
4. `GET /api/v1/memories/search?q=...` returns ranked results within 100 ms
5. MCP `memory_teach` and `memory_search` tools return formatted text responses
6. MCP Resources (`memory://facts/{project}`, `memory://recent-episodes`, `memory://storyboard/{profile}`) return populated data
7. Both MCP transports (stdio, HTTP) function simultaneously
8. `GET /health` returns 200; `GET /ready` returns 503 when DB unreachable
9. Swagger UI accessible at `/swagger` in dev mode; absent in service mode
10. OpenAPI spec generated at `/swagger/v1/swagger.json`
11. `X-AI-Memory-Context: project=zoom` header scopes search results without explicit query parameter (ADR-008, FR-API-013)
12. MCP `memory_search` with `context="project:zoom"` parameter returns boosted results for that project (FR-MCP-007)
13. `story_claim` response includes resolved context string `project:{slug},profile:{profile}` (FR-B-009)

---

## Phase 4 — Intelligence

**Status:** 🔲 Not started  
**Description:** Implement the consolidation pipeline (episodic → semantic promotion) and full end-to-end integration test coverage.

**Dependency:** ST-005 complete (for ST-008); ST-007 complete (for ST-010).

| Story | Value | Blocked by | Description |
|-------|-------|-----------|-------------|
| ST-008 | 3 | ST-005 | Consolidation pipeline (scoring + promotion) |
| ST-010 | 4 | ST-007 | E2E integration tests (round-trip: REST ↔ MCP) |

**Story sequence:** ST-008 and ST-010 can proceed in parallel once their blockers clear.

**Phase done criteria:**
1. `dotnet test` passes all consolidation and E2E tests
2. `POST /api/v1/consolidate` with `dry_run: true` returns candidate list without writes
3. `POST /api/v1/consolidate` promotes memories scoring ≥ 0.7 to semantic_memories
4. Content-hash deduplication prevents duplicate promotions
5. Consolidation log records all decisions (promoted | flagged | skipped)
6. E2E test: log episode via REST → search via MCP → verify result includes episode
7. E2E test: log semantic via MCP → search via REST → verify result
8. E2E test: recall events tracked correctly; feedback recorded
9. E2E test: MMR produces diverse results (inter-result cosine < 0.7 target)

---

## Phase 5 — Views and Graph

**Status:** 🔲 Not started  
**Description:** Implement the structural pre-filter entity tables, synthesis service, storyboard views, and Obsidian-compatible Markdown output. This phase delivers the Storyboard and Wiki features.

**Dependency:** ST-002, ST-003 complete (for ST-018); ST-003, ST-004 complete (for ST-019).

| Story | Value | Blocked by | Description |
|-------|-------|-----------|-------------|
| ST-018 | 4 | ST-002, ST-003 | Graph schema + structural fingerprints (entities, edges, chunk_entities) |
| ST-019 | 4 | ST-003, ST-004 | `ISynthesisService` + Obsidian Markdown view writer + Storyboard CRUD |

**Story sequence:** ST-018 → ST-019 (strictly sequential)

**Phase done criteria:**
1. `dotnet test` passes all view and storyboard tests
2. `entities`, `edges`, `chunk_entities` tables exist and are populated by async entity extraction after memory ingest
3. Structural pre-filter constrains search candidates by project entity membership
4. `ISynthesisService.UpdateViewsAsync()` writes an Obsidian-compatible Markdown file after memory ingest
5. Wiki view file contains YAML frontmatter with `type: wiki`, `project`, `generated_at`, `memory_count`
6. Storyboard: `POST /api/v1/stories` creates a story; `PATCH /api/v1/stories/:id` transitions status; WIP limit enforced
7. `GET /api/v1/views/storyboard?profile=professional` returns Markdown with story states
8. MCP `story_claim` transitions a story to `in-progress`; returns 409 if WIP limit hit
9. MCP Resource `memory://storyboard/professional` returns story list within ~500 tokens
10. Synthesis does not block memory write response (NFR-P3)

---

## Phase 6 — Documentation and Governance

**Status:** 🔲 Not started  
**Description:** Refactor investigation documents into compact landing pages with focused fragments. Improve developer-facing documentation.

**Dependency:** None (can be picked up anytime; typically after Phase 3 when the system is usable for dogfooding).

| Story | Value | Blocked by | Description |
|-------|-------|-----------|-------------|
| ST-013 | 4 | None | Split investigation docs into landing pages and focused fragments |

**Phase done criteria:**
1. Each of the 8 design-authority investigation docs has a compact landing page linking to per-topic fragments
2. All major sections of each investigation doc have a destination fragment
3. No design-authority content is dropped during the split
4. Governance consumers (copilot-instructions.md, prompts) reference the retained landing pages

---

## Milestone Summary

| Phase | Milestone | Target |
|-------|-----------|--------|
| Phase 0 | Governance + Investigations ✅ | Done |
| Phase 1 | Persistent data store | The Brain records data |
| Phase 2 | Hybrid search | The Brain retrieves data |
| Phase 3 | API layer ← **v0.1 working service** | Agents can interact |
| Phase 4 | Intelligence | Consolidation works |
| Phase 5 | Views ← **v1.0 full feature set** | Storyboard and Wiki work |
| Phase 6 | Docs | Investigation docs refactored |

### v0.1 Definition (Phase 3 complete)
A working local memory service: agents can store and search memories via MCP; developers can interact via REST; system is testable end-to-end.

### v1.0 Definition (Phase 5 complete)
Full feature set: hybrid search with structural pre-filter; consolidation pipeline; storyboard management; wiki and storyboard view generation; Obsidian-compatible Markdown output.

---

## Notes

- Stories within each phase are sequenced by dependency; PO may choose to defer lower-value stories within a phase if blockers are cleared for higher-value ones.
- ST-013 (doc split) has no hard dependency and can be started at any point after Phase 0 completes, but is most valuable after Phase 3 when the system is usable and the investigation docs become the developer reference.
- The delivery plan reflects story sequencing only; sprint or time-box boundaries are not used (continuous-flow kanban per [story-board.md](../../.github/planning/story-board.md)).

---

## Revision History

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2026-05-15 | ai-memory-maintainers | Initial delivery plan — dependency graph and phase done criteria synthesised from SRS and story board |
