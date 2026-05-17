> System: Continuous-flow kanban · WIP limit: 1 In Progress · 1 in Review
> Cadence: No sprint boundaries. /plan (Opus) creates plans; /continue (Sonnet) executes them.
> Prioritisation: Value-first with dependency-aware sequencing. Value: 1-5.
> Next planning target: ST-013 — split investigation docs into landing pages and focused fragments.
> Last updated: 2026-05-17

---

## Backlog

<!-- Phase 1 — Persistence Layer -->

### ST-002: Implement SQLite schema + FTS5 + migrations
- Type: infrastructure
- Source: PO
- phase: 1
- Value: 5
- Blocked by: ST-001
- Touches: `src/AiMemory.Core/`, database migrations
- Acceptance criteria:
  - [ ] SQLite database created on first run with all tables
  - [ ] FTS5 virtual table with triggers for auto-sync
  - [ ] Migration system applies schema changes idempotently
  - [ ] Schema matches design in memory-architecture-design.md §6
- ExecPlan: `.github/planning/execplans/exec-plan-ST-002.md`
- Docs: `docs/investigations/sqlite-vs-postgresql.md`, `docs/investigations/memory-architecture-design.md`

### ST-003: Implement IMemoryRepository (SQLite)
- Type: feature
- Source: PO
- phase: 1
- Value: 4
- Blocked by: ST-002
- Touches: `src/AiMemory.Core/`
- Acceptance criteria:
  - [ ] CRUD operations for semantic and episodic memories
  - [ ] Recall event logging on every retrieval
  - [ ] Content-hash deduplication on insert
  - [ ] Soft-delete via `active` flag
  - [ ] Unit tests with in-memory SQLite
- ExecPlan: `.github/planning/execplans/exec-plan-ST-003.md`
- Docs: `docs/investigations/memory-architecture-design.md`

<!-- Phase 2 — Retrieval Core -->

### ST-004: Implement embedding service (OpenAI)
- Type: feature
- Source: PO
- phase: 2
- Value: 4
- Blocked by: ST-001
- Touches: `src/AiMemory.Core/`
- Acceptance criteria:
  - [ ] IEmbeddingService interface with OpenAI implementation
  - [ ] Configurable model (default: text-embedding-3-small)
  - [ ] Batch embedding support
  - [ ] Graceful fallback when API unavailable (search degrades to FTS-only)
  - [ ] Unit tests with mocked HTTP responses
- ExecPlan: `.github/planning/execplans/exec-plan-ST-004.md`
- Docs: `docs/investigations/memory-architecture-design.md`

### ST-005: Implement hybrid search (FTS5 + vector + RRF + MMR)
- Type: feature
- Source: PO
- phase: 2
- Value: 5
- Blocked by: ST-003, ST-004
- Touches: `src/AiMemory.Core/`
- Acceptance criteria:
  - [ ] FTS5 BM25 search returns ranked results
  - [ ] Vector cosine similarity search returns ranked results
  - [ ] RRF fusion combines both result sets
  - [ ] MMR diversity re-ranking (λ = 0.7) reduces redundancy
  - [ ] Project boosting (1.2× same-project)
  - [ ] Default limit = 10, configurable up to 100
  - [ ] Recall events logged for every search
  - [ ] Integration test with seeded data achieves >80% recall on test queries
- ExecPlan: `.github/planning/execplans/exec-plan-ST-005.md`
- Docs: `docs/investigations/memory-architecture-design.md`, `docs/investigations/openclaw-memory-architecture-analysis.md`

<!-- Phase 3 — API Layer -->

### ST-006: Implement REST API endpoints
- Type: feature
- Source: PO
- phase: 3
- Value: 4
- Blocked by: ST-003, ST-005
- Touches: `src/AiMemory.Server/`
- Acceptance criteria:
  - [ ] All endpoints from interface-design-mcp-rest.md implemented
  - [ ] Response envelope with consistent error format
  - [ ] Input validation with problem details (RFC 7807)
  - [ ] Swagger/OpenAPI spec generated
  - [ ] Integration tests for happy path + error cases
- ExecPlan: `.github/planning/execplans/exec-plan-ST-006.md`
- Docs: `docs/investigations/interface-design-mcp-rest.md`

### ST-007: Implement MCP server (facade over service layer)
- Type: feature
- Source: PO
- phase: 3
- Value: 5
- Blocked by: ST-006
- Touches: `src/AiMemory.Server/`
- Acceptance criteria:
  - [ ] MCP tools: memory_search, memory_log_episode, memory_log_semantic, memory_inspect, memory_feedback
  - [ ] MCP resources: memory://facts/{project}, memory://recent-episodes
  - [ ] MCP prompts: recall_context
  - [ ] `memory_search` returns token-efficient formatted results with score and provenance
  - [ ] Dual transport: stdio + HTTP (StreamableHTTP)
  - [ ] Integration test: MCP client round-trip
- ExecPlan: `.github/planning/execplans/exec-plan-ST-007.md`
- Docs: `docs/investigations/interface-design-mcp-rest.md`

### ST-020: Implement request-scoped ambient context (contextual scoping)
- Type: feature
- Source: PO (contextual scoping investigation 2026-05-15)
- phase: 3
- Value: 4
- Blocked by: ST-006, ST-007
- Touches: `src/AiMemory.Server/`, `src/AiMemory.Core/`
- Acceptance criteria:
  - [ ] `AmbientContextScope` (AsyncLocal) implemented in `AiMemory.Core`
  - [ ] ASP.NET Core middleware extracts `X-AI-Memory-Context` header and sets ambient scope per request
  - [ ] `IMemoryService.HybridSearchAsync()` resolves project/profile from: (1) explicit parameter → (2) ambient context → (3) null
  - [ ] MCP `memory_search` accepts optional `context` parameter (e.g., `"project:zoom"`, `"project:zoom,profile:professional"`)
  - [ ] MCP `story_list`, `memory_teach`, `memory_log_episode` accept optional `context` parameter
  - [ ] `story_claim` response includes resolved context string (`project:{slug},profile:{profile}`) per FR-B-009
  - [ ] Requests without context header/parameter behave identically to v1.0 (backward compatible)
  - [ ] Unit tests: ambient scope correctly overridden by explicit parameter; ambient scope correctly cleaned up after request
  - [ ] Integration test: search with `X-AI-Memory-Context: project=zoom` returns project-boosted results without explicit `?project=zoom` query parameter
- ExecPlan: `.github/planning/execplans/exec-plan-ST-020.md` (to be created)
- Docs: `docs/design/adr/ADR-008-context-scoping.md`, `docs/requirements/SRS.md` (FR-R-016, FR-API-013, FR-MCP-007, FR-B-009)

<!-- Phase 4 — Intelligence -->

### ST-008: Implement consolidation pipeline
- Type: feature
- Source: PO
- phase: 4
- Value: 3
- Blocked by: ST-005
- Touches: `src/AiMemory.Core/`
- Acceptance criteria:
  - [ ] Consolidation scoring (frequency, recency, relevance, diversity)
  - [ ] Promotion: episodic → semantic when score threshold met
  - [ ] Content-hash deduplication prevents duplicate promotions
  - [ ] Background service runs consolidation on configurable schedule
  - [ ] Dry-run mode shows what would be promoted without acting
- ExecPlan: `.github/planning/execplans/exec-plan-ST-008.md`
- Docs: `docs/investigations/memory-architecture-design.md`

### ST-010: Integration testing (E2E round-trip)
- Type: debt
- Source: PO
- phase: 4
- Value: 4
- Blocked by: ST-007
- Touches: `tests/`
- Acceptance criteria:
  - [ ] E2E test: log episode via REST → search via MCP → verify result
  - [ ] E2E test: log semantic via MCP → search via REST → verify result
  - [ ] E2E test: search returns diverse results (MMR verification)
  - [ ] E2E test: recall events tracked correctly
  - [ ] CI pipeline runs tests on push
- ExecPlan: `.github/planning/execplans/exec-plan-ST-010.md`
- Docs: `docs/investigations/interface-design-mcp-rest.md`

<!-- Phase 5 — Views and Graph -->

### ST-018: Graph schema + structural fingerprints for SQLite
- Type: feature
- Source: ST-017 spike outcome
- phase: 5
- Value: 4
- Blocked by: ST-002, ST-003
- Touches: `src/AiMemory.Core/`, database migrations
- Acceptance criteria:
  - [ ] SQLite tables for graph layer: `entities`, `edges`, `thought_entities` with typed relationships
  - [ ] AFTER INSERT trigger on memories table queues thoughts for entity extraction
  - [ ] Structural fingerprint vector stored alongside semantic embedding in sqlite-vec
  - [ ] Recursive CTE query for multi-hop traversal implemented in `IMemoryRepository`
  - [ ] Unit tests covering graph insert, traversal, and structural similarity lookup
- ExecPlan: `.github/planning/execplans/exec-plan-ST-018.md` (to be created)
- Docs: `docs/investigations/openbrain-pivot-evaluation.md`, `docs/investigations/memory-architecture-design.md`
- Notes: Downstream from ST-017. Borrows entity-extraction schema pattern from OB1. Structural fingerprints as sqlite-vec vectors cover ~80% of structural similarity use cases without Apache AGE.

### ST-019: ISynthesisService + Obsidian-compatible Markdown view writer
- Type: feature
- Source: ST-017 spike outcome
- phase: 5
- Value: 4
- Blocked by: ST-003, ST-004
- Touches: `src/AiMemory.Core/`
- Acceptance criteria:
  - [ ] `ISynthesisService` interface defined in AiMemory.Core
  - [ ] Default implementation calls `ILlmClient` after `IMemoryRepository.StoreAsync()` fires
  - [ ] Writes Obsidian-compatible Markdown files to a configurable output path
  - [ ] Incremental update: tracks last-synthesised thought ID per view; does not fully regenerate on every write
  - [ ] At least one built-in view type: topic-summary board
  - [ ] Unit tests with mocked LLM client
- ExecPlan: `.github/planning/execplans/exec-plan-ST-019.md` (to be created)
- Docs: `docs/investigations/openbrain-pivot-evaluation.md`, `docs/investigations/memory-architecture-design.md`
- Notes: Downstream from ST-017. Per-ingest synthesis with direct filesystem writes — the key advantage of C# over OB1 cloud-hosted approaches. Can use Ollama for $0 synthesis cost.

<!-- Phase 6 — Documentation and Governance -->

---

## Refined


(Empty)

---

## In Progress

### ST-013: Split investigation docs into landing pages and focused fragments
- Type: infrastructure
- Source: PO
- phase: 6
- Value: 4
- Blocked by: ST-011 (Done)
- Touches: `.github/copilot-instructions.md`, `.github/prompts/`, `.github/planning/`, `docs/investigations/`
- Acceptance criteria:
  - [ ] Each current top-level investigation file remains in place as a compact landing page that links to focused fragment docs
  - [ ] All investigation content under `docs/investigations/` (including nested research trees) is covered by per-topic fragment sets that preserve approved design decisions
  - [ ] Governance consumers reference either the retained landing pages or precise fragment docs instead of broad monolith assumptions
  - [ ] A section mapping matrix proves every original major section has a destination and no design-authority content was dropped during the split
- ExecPlan: `.github/planning/execplans/exec-plan-ST-013.md`
- Docs: `docs/investigations/memory-architecture-design.md`, `docs/investigations/language-stack-recommendation.md`, `docs/investigations/sqlite-vs-postgresql.md`, `docs/investigations/interface-design-mcp-rest.md`, `docs/investigations/workflow-and-prompt-design.md`, `docs/investigations/context-engineering-principles.md`, `docs/investigations/openclaw-official-docs-review.md`, `docs/investigations/openclaw-memory-architecture-analysis.md`
- Notes: PO approved 2026-05-17. Split the current investigation monoliths into per-topic folders while keeping the top-level files as compact landing pages.

---

## Review

(Empty)

## Done

### ST-021: Spike — Fork OB1 and extend with memory tiers, context scoping, BM25, and openCypher structural search
- Type: spike
- Source: PO (architecture review session 2026-05-16)
- phase: 0
- Value: 5
- Completed: 2026-05-16 (Docker validation confirmed locally)
- Touches: `docker/`, `server/`, `docker-compose.yml`, `docs/investigations/ST-021-findings.md`, `.github/planning/execplans/exec-plan-ST-021.md`
- Acceptance criteria:
  - [x] **Memory tier mapping** — Single-table discriminator (`memory_type` column on `thoughts`) recommended and validated; `server/db/schema.sql` produced
  - [x] **BM25 on PostgreSQL** — `tsvector`/`tsquery` + `ts_rank_cd` + RRF fusion validated; `server/db/search.sql` produced; OB1's existing `search_thoughts_text()` identified as extension base
  - [x] **Structural search without AGE (baseline)** — Recursive CTE ceiling documented in findings §R3; variable-length multi-label patterns require AGE
  - [x] **AGE v1.7.0 on PostgreSQL 15 in Docker** — Dockerfile with `postgresql-server-dev-15` + AGE v1.6.0-rc0 from source (COPY tarball approach); `docker/postgres-age/Dockerfile` and `init/01-extensions.sql` produced and tested
  - [x] **openCypher validation** — Multi-hop traversal (`CAUSED_BY*1..5`) returned 3-hop chain; fact inference returned `flowers` via explicit MATCH chain (AGE v1.6.0 `|` workaround); validated in findings §R5 and §R6
  - [x] **Context scoping in OB1 MCP tools** — `server/src/parseContext.ts` + `server/index.ts` fork with `context` parameter on `capture_thought`, `search_thoughts`, and `list_thoughts`
  - [x] **Entity extraction worker wire-up design** — OpenRouter call shape, `FOR UPDATE SKIP LOCKED` queue loop, `MERGE` AGE writes (with label/rel allow-listing) documented in findings §R8
  - [x] **Docker Compose validation** — `docker compose up -d` confirmed locally: both `db` and `mcp` containers healthy; `vector` and `age` extensions loaded; `memory_graph` created; BM25+RRF `rrf_score` column returned; `CAUSED_BY*1..5` traversal returned 3-hop chain; fact inference returned `flowers` via explicit MATCH chain
- ExecPlan: `.github/planning/execplans/exec-plan-ST-021.md`
- Docs:
  - `docs/investigations/ST-021-findings.md`
  - `server/db/schema.sql`, `server/db/search.sql`, `server/db/graph.sql`
  - `server/index.ts`, `server/src/parseContext.ts`, `server/src/auth.ts`, `server/src/db.ts`
  - `docker/postgres-age/Dockerfile`, `docker-compose.yml`
- Notes: All 8 ACs met. Key discoveries: AGE v1.7.0 does not exist for PG15 (use PG15/v1.6.0-rc0); git clone inside Docker blocked by Fortinet SSL proxy — use COPY of pre-downloaded tarball; flex + bison required in apt-get; AGE v1.6.0 does not support `|` in relationship type selectors (requires AGE v1.7.0 / PG17+). OB1 already has `search_thoughts_text()` with two-phase BM25 — implementation story should extend it. Downstream stories needed: entity extraction worker, consolidation worker, cloud deployment.

### ST-015: Improve ExecPlan template to show outcomes up front
- Type: infrastructure
- phase: 0
- Source: PO
- Value: 3
- Completed: 2026-05-15
- Blocked by: none
- Touches: `.github/planning/execplans/_TEMPLATE.md`, `.github/planning/execplans/`
- Acceptance criteria:
  - [x] ExecPlan template now has an "Outcomes & Conclusions" section immediately after §1 Background
  - [x] The Outcomes section has type-specific structure: spikes emphasize discoveries/learnings, features emphasize completion/delivery, and infrastructure/debt emphasize risk/improvements
  - [x] Template documents required fields: completion status, key findings/achievements, requirements met vs unmet, architectural impact, supporting evidence, and downstream changes
  - [x] A worked example (based on a completed story like ST-014) shows how the new section is populated
  - [x] The narrative flow makes it clear at a glance: intent → requirements → what was actually delivered
- ExecPlan: `.github/planning/execplans/exec-plan-ST-015.md`
- Docs: `.github/planning/execplans/_TEMPLATE.md`, `.github/planning/execplans/supporting_material/exec-plan-ST-014-outcomes-worked-example.md`
- Notes: Accepted by PO.

### ST-016: Research software engineering best practices for governance adoption
- Type: infrastructure
- phase: 0
- Source: PO
- Value: 5
- Completed: 2026-05-15
- Blocked by: none
- Touches: `.github/instructions/`, `.github/prompts/`, `.github/planning/`, `docs/investigations/`
- Acceptance criteria:
  - [x] A research-backed shortlist of software engineering practices (code quality + C# idioms) is documented with applicability to ai-memory
  - [x] Recommended governance updates define where each practice is enforced (instructions, prompts, checklists, or automation)
  - [x] A WoW proposal captures linting/setup expectations and checklist-driven execution guidance for future stories
  - [x] Adoption guidance identifies what to introduce now vs defer, including rationale and risk
- ExecPlan: `.github/planning/execplans/exec-plan-ST-016.md`
- Docs: `docs/investigations/se-best-practices.md`, `.github/instructions/coding-standards.instructions.md`, `.github/instructions/ways-of-working.instructions.md`
- Notes: Accepted by PO. All 6 tasks executed and verified. Build clean, tests pass, 4 analyzers active.

### ST-017: Evaluate Open Brain as base layer vs current architecture
- Type: spike
- phase: 0
- Source: PO
- Value: 5
- Completed: 2026-05-15
- Blocked by: none
- Touches: `docs/investigations/`, `.github/planning/`
- Acceptance criteria:
  - [x] Documented assessment of Open Brain (OB1) as a platform for ai-memory's use cases — can it be used directly with plugins/recipes/schemas?
  - [x] Evaluation of per-ingest synthesis extension feasibility on OB1 vs current C#/SQLite architecture — which base makes this easier to build?
  - [x] Evaluation of graph/structural similarity search extension feasibility on OB1 vs current architecture
  - [x] Stack tradeoff analysis: TypeScript/Python (OB1 ecosystem) vs C#/.NET 8 (current) — evaluation of ecosystem, hosting, and extension authoring
  - [x] Hosting model evaluation: Supabase/OpenRouter (OB1 default) vs local-first (current) vs hybrid
  - [x] Clear recommendation: use OB1 as-is + extend, fork OB1, adopt patterns in C#, or stay current course — with rationale
  - [x] Impact assessment on existing backlog stories ST-002 through ST-010 if pivot is recommended
- ExecPlan: `.github/planning/execplans/exec-plan-ST-017.md`
- Docs: `docs/investigations/openbrain-pivot-evaluation.md`
- Notes: Accepted by PO. Recommendation was Option C (Stay Current, 4.50/5.0). ST-021 opens a new evaluation with hybrid architecture lens.

### ST-012: Add discoverable AI-governance asset catalog and validation
- Type: infrastructure
- phase: 0
- Source: PO
- Value: 4
- Completed: 2026-05-05
- Blocked by: none
- Touches: `.github/prompts/`, `.github/instructions/`, `.github/planning/`, `docs/`
- Acceptance criteria:
  - [x] A documented metadata contract exists for repo AI-governance assets covering prompts, instructions, and planned future extensions such as agents or skills
  - [x] A machine-readable inventory or index exposes the repo's AI-governance assets and their intended use
  - [x] Validation guidance or automation detects drift between asset metadata, indexes, and published docs
  - [x] Contribution guidance defines what prompt/instruction/skill-style additions are accepted, rejected, or deferred
- ExecPlan: `.github/planning/execplans/exec-plan-ST-012.md`
- Docs: `docs/investigations/awesome-copilot-applicability-review.md`, `docs/investigations/workflow-and-prompt-design.md`, `docs/investigations/context-engineering-principles.md`
- Notes: Accepted by PO.

### ST-001: Scaffold .NET solution and project structure
- Type: infrastructure
- phase: 0
- Source: PO
- Value: 5
- Completed: 2026-05-05
- Blocked by: none
- Touches: `src/`, `tests/`, `*.sln`, `Directory.Build.props`, `NuGet.config`, `.github/instructions/`, `.github/prompts/`
- Acceptance criteria:
  - [x] Solution builds with `dotnet build`
  - [x] Three projects exist: AiMemory.Core, AiMemory.Server, AiMemory.Tests
  - [x] Directory.Build.props sets C# 12, .NET 8, nullable enabled, implicit usings
  - [x] `dotnet test` runs and executes one placeholder smoke test
  - [x] Coding standards plus `/plan` and `/continue` prompts state that testing follows TDD principles
- ExecPlan: `.github/planning/execplans/exec-plan-ST-001.md`
- Docs: `docs/investigations/language-stack-recommendation.md`
- Notes: Accepted by PO.

### ST-014: Investigate memsearch (zilliztech) for architectural learnings
- Type: spike
- phase: 0
- Source: PO
- Value: 4
- Completed: 2026-05-04
- Blocked by: none
- Touches: `docs/investigations/`, `docs/investigations/memory-architecture-design.md`, `docs/investigations/sqlite-vs-postgresql.md`
- Acceptance criteria:
  - [x] Assessment of ONNX bge-m3 local embeddings as an alternative to OpenAI for ST-004 — feasibility, trade-offs, and a go/no-go recommendation
  - [x] Assessment of Milvus Lite as a vector store option against ai-memory's current SQLite + pgvector plan — documented in investigation note
  - [x] Summary of memsearch's 3-layer progressive recall pattern (search → expand → transcript) with a recommendation on whether to adopt, adapt, or skip for ai-memory
  - [x] Comparison of memsearch's markdown-as-source-of-truth model against ai-memory's SQLite-first design — with documented rationale for maintaining or reconsidering the current approach
  - [x] Findings captured in a new investigation doc: `docs/investigations/memsearch-applicability-review.md`
- ExecPlan: `.github/planning/execplans/exec-plan-ST-014.md`
- Docs: `docs/investigations/memory-architecture-design.md`, `docs/investigations/sqlite-vs-postgresql.md`
- Notes: Accepted by PO. Use memsearch as a reference for future provider flexibility and staged recall UX, not as a replacement architecture.

### ST-011: Institutionalize recurring governance review and remediation
- Type: debt
- phase: 0
- Source: PO
- Value: 5
- Completed: 2026-05-04
- Notes: Accepted by PO; review slot cleared. Validation report: `.github/planning/audit-reports/audit-report-2026-05-03.md`.

### ST-009: Create workflow governance files (.github/)
- Type: infrastructure
- phase: 0
- Source: PO
- Value: 5
- Completed: 2025-05-02
- Notes: Prompts, board, ExecPlan template, instructions, session log created from investigation docs
