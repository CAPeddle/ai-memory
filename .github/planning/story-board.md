> System: Continuous-flow kanban · WIP limit: 1 In Progress · 1 in Review
> Cadence: No sprint boundaries. /plan (Opus) creates plans; /continue (Sonnet) executes them.
> Prioritisation: Value-first with dependency-aware sequencing. Value: 1-5.
> Next planning target: ST-022 — entity extraction worker (highest-value post-pivot; unblocks AGE graph utility).
> Last updated: 2026-05-18

---

## Backlog

<!-- Phase 1 — Cloud MCP Intelligence (extends OB1 fork shipped by ST-021) -->

### ST-022: Implement entity extraction worker (OpenRouter → AGE graph)
- Type: feature
- Source: ST-021 spike outcome (2026-05-16)
- phase: 1
- Value: 5
- Blocked by: ST-021 (done — `entity_extraction_queue` schema + trigger and design exist)
- Touches: `server/src/entityWorker.ts` (new), `server/db/graph.sql`
- Acceptance criteria:
  - [ ] Background worker loop polls `entity_extraction_queue` via `FOR UPDATE SKIP LOCKED`
  - [ ] OpenRouter LLM call with strict JSON `response_format` extracts entities + edges using an allow-list of labels/relationships (Function, Error, Person, Topic, etc.) to prevent openCypher injection
  - [ ] Writes nodes/edges to `memory_graph` via `MERGE` cypher (idempotent reprocessing)
  - [ ] Worker runs in the MCP container (or sidecar service in docker-compose)
  - [ ] Status transitions pending → processing → done|failed with exponential backoff on transient failures
  - [ ] Per-thought token cap; cost estimated ≤ $0.01/month at 10 thoughts/day on gpt-4o-mini
  - [ ] Integration test: insert thought → trigger queues → worker processes → AGE graph contains expected nodes
- ExecPlan: `.github/planning/execplans/exec-plan-ST-022.md` (to be created)
- Docs: `docs/investigations/ST-021-findings.md` §R8
- Notes: Design fully specified in ST-021 §R8. Allow-list is the critical SQL/Cypher injection mitigation — entity/relationship labels are interpolated into the cypher string, not parameterised.

### ST-005: Search quality enhancements (MMR, project boosting, recall logging)
- Type: feature
- Source: PO (rewritten post-ST-021 pivot)
- phase: 1
- Value: 4
- Blocked by: ST-021 (BM25 + pgvector RRF base already shipped in `search_thoughts`)
- Touches: `server/index.ts` (extend `search_thoughts`), `server/db/schema.sql` (new `recall_events` table)
- Acceptance criteria:
  - [ ] MMR diversity re-ranking (λ = 0.7) applied over top-K RRF results
  - [ ] Project boosting: 1.2× score multiplier for results matching context scope's project
  - [ ] Recall events logged to a `recall_events` table on every search (thought_id, query, score, rank, timestamp)
  - [ ] `last_recalled_at` and `recall_count` updated on `thoughts` for retrieval-aware consolidation scoring
  - [ ] Default limit unchanged (10); configurable up to 100
  - [ ] Integration test: seeded corpus achieves >80% recall on test queries; MMR demonstrably reduces top-K redundancy
- ExecPlan: `.github/planning/execplans/exec-plan-ST-005.md` (to be created)
- Docs: `docs/investigations/memory-architecture-design.md`
- Notes: Rewritten post-ST-021 pivot. The core BM25+vector RRF lane is already done; this story is about quality (MMR), relevance tuning (boosting), and the feedback loop (recall logging) that feeds ST-008's consolidation scoring.

### ST-008: Implement consolidation worker (shard → wiki promotion)
- Type: feature
- Source: PO (rewritten post-ST-021 pivot)
- phase: 1
- Value: 3
- Blocked by: ST-005 (recall events needed for scoring)
- Touches: `server/src/consolidationWorker.ts` (new), `server/db/`
- Acceptance criteria:
  - [ ] Scheduled background loop scores active shards on frequency (`recall_count`), recency (`last_recalled_at`), and `confidence`
  - [ ] Promotion: when composite score ≥ threshold, INSERT a new `memory_type='wiki'` row with `supersedes` pointing at the shard
  - [ ] Original shard set to `active = false`; `memory_type` unchanged (preserves provenance)
  - [ ] Content fingerprint dedup prevents duplicate wiki promotions
  - [ ] Dry-run mode logs candidates without committing
  - [ ] Configurable schedule (default: daily); runs separately from MCP request path
  - [ ] Integration test: seed high-recall shards → run consolidation → verify wiki row exists with `supersedes` link and shard.active=false
- ExecPlan: `.github/planning/execplans/exec-plan-ST-008.md` (to be created)
- Docs: `docs/investigations/memory-architecture-design.md`
- Notes: Rewritten for TypeScript/Deno/PostgreSQL stack post-ST-021. Promotion preserves shard provenance via `supersedes` FK; soft-deleted shards remain queryable as historical context when the `active = true` filter is relaxed.

<!-- Phase 2 — Production Deployment & Hardening -->

### ST-023: Cloud deployment (managed Postgres + container hosting)
- Type: infrastructure
- Source: ST-021 spike outcome
- phase: 2
- Value: 5
- Blocked by: ST-022, ST-005, ST-008 (functionally complete cloud MCP)
- Touches: deployment config (`fly.toml` / `railway.json` / `.do/app.yaml`), `.github/workflows/`
- Acceptance criteria:
  - [ ] Container hosting target chosen and documented (Fly.io / Railway / DigitalOcean Apps)
  - [ ] Managed Postgres provisioned with `pgvector` + `age` extensions enabled (or self-hosted on same provider VPC if no managed option supports AGE)
  - [ ] Secrets (`MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY`) stored in provider secret vault; never in `.env` files or repo
  - [ ] Custom domain + TLS termination
  - [ ] `/health` reachable from internet; `/mcp` requires Bearer auth
  - [ ] CI workflow builds and pushes Docker image on push to main
  - [ ] Deployment runbook in `docs/runbooks/deployment.md`
- ExecPlan: `.github/planning/execplans/exec-plan-ST-023.md` (to be created)
- Docs: `docs/design/adr/ADR-009-deployment-model.md`, `docs/investigations/ST-021-findings.md`
- Notes: Open question: AGE availability on managed Postgres. Supabase/Neon ship `pgvector` but not `age`; may require self-hosted Postgres alongside the MCP container, or waiting for AGE managed-service support. Decide during planning.

### ST-010: Integration testing for cloud MCP (Deno + Docker Compose)
- Type: debt
- Source: PO (rewritten post-ST-021 pivot)
- phase: 2
- Value: 4
- Blocked by: ST-022, ST-005, ST-008
- Touches: `server/tests/` (new), `.github/workflows/ci.yml`, `docker-compose.test.yml`
- Acceptance criteria:
  - [ ] E2E test: `capture_thought` → `search_thoughts` returns it via BM25 lane
  - [ ] E2E test: `capture_thought` (with embedding settled) → `search_thoughts` returns it via vector lane
  - [ ] E2E test: shard promoted to wiki via consolidation worker; both queryable
  - [ ] E2E test: entity extraction populates AGE graph; `graph_traverse` returns expected nodes
  - [ ] E2E test: context-scoped search filters correctly across `project` / `profile`
  - [ ] CI pipeline runs `docker compose up` against test images on every push
  - [ ] Recall event tracking verified end-to-end
- ExecPlan: `.github/planning/execplans/exec-plan-ST-010.md` (to be created)
- Docs: `docs/investigations/interface-design-mcp-rest.md`
- Notes: Rewritten post-ST-021 pivot for TypeScript/Deno/Docker Compose. CI runs against the same `docker-compose.yml` used locally to keep dev and CI environments in sync.

<!-- Phase 3 — Local Companion Services -->

### ST-019: Local Obsidian synthesis service (C# MCP client)
- Type: feature
- Source: PO (rewritten post-ST-021 pivot 2026-05-17)
- phase: 3
- Value: 4
- Blocked by: ST-022, ST-005, ST-008 (core MCP feature-complete)
- Touches: New `local-synthesis/` solution (separate from `server/`)
- Acceptance criteria:
  - [ ] Standalone C# console/daemon (.NET 8) that authenticates to the cloud MCP via Bearer token
  - [ ] Uses the official MCP C# client SDK to call `search_thoughts`, `list_thoughts`, and `fetch` tools as a consumer
  - [ ] Calls a local Ollama instance (or OpenRouter, configurable) to synthesise summaries from retrieved thoughts
  - [ ] Writes Obsidian-compatible Markdown to a configurable vault path (YAML frontmatter, `[[wiki-links]]`, backlinks)
  - [ ] Incremental update: tracks last-synthesised thought ID or `updated_at` per view; only re-synthesises views whose source thoughts changed
  - [ ] At least one built-in view type: per-project topic-summary board listing recent shards + promoted wiki facts
  - [ ] Configurable polling interval (default: 5 minutes); webhook trigger deferred to v2
  - [ ] Unit tests with mocked MCP client + mocked LLM
- ExecPlan: `.github/planning/execplans/exec-plan-ST-019.md` (to be created)
- Docs: `docs/investigations/openbrain-pivot-evaluation.md`, `docs/investigations/memory-architecture-design.md`
- Notes: Rewritten post-ST-021. Originally framed as the "C# core advantage" over OB1 cloud-hosted; now repositioned as a **local companion that consumes the cloud MCP**. Preserves the local-first synthesis + direct filesystem-write benefits (Obsidian vault on disk, $0 LLM cost via Ollama) without competing with the cloud MCP as source of truth. Iterable against either the deployed cloud MCP or a local `docker compose up` stack.

<!-- Deferred — not blocking the production path -->

### ST-006: Implement REST API endpoints (deferred)
- Type: feature
- Source: PO (deferred post-ST-021 pivot)
- phase: deferred
- Value: 2
- Blocked by: ST-023
- Touches: `server/index.ts` (REST routes alongside the existing MCP handler)
- Acceptance criteria:
  - [ ] REST routes for `/thoughts` (POST/GET/PATCH/DELETE), `/search`, `/stats`
  - [ ] Response envelope with consistent error format (RFC 7807)
  - [ ] OpenAPI spec generated and published
  - [ ] Bearer auth shared with `/mcp` endpoint
  - [ ] Integration tests for happy path + error cases
- ExecPlan: `.github/planning/execplans/exec-plan-ST-006.md` (to be created)
- Docs: `docs/investigations/interface-design-mcp-rest.md`
- Notes: Deferred post-ST-021. MCP is the primary interface; a REST API is only valuable when a non-MCP consumer is identified (e.g., a browser extension or third-party script). Reassess once such a consumer exists.

### ST-024: Upgrade to AGE v1.7.0 + PG17 (deferred)
- Type: infrastructure
- Source: ST-021 spike outcome
- phase: deferred
- Value: 2
- Blocked by: ST-023
- Touches: `docker/postgres-age/Dockerfile`, `server/db/graph.sql`
- Acceptance criteria:
  - [ ] PostgreSQL base image bumped to 17
  - [ ] AGE compiled at v1.7.0 (officially supports PG17)
  - [ ] All existing openCypher queries pass against v1.7.0
  - [ ] `|` relationship-type selector verified working (the v1.6.0 limitation hit in ST-021)
  - [ ] Migration plan for existing graph data documented
- ExecPlan: `.github/planning/execplans/exec-plan-ST-024.md` (to be created)
- Docs: `docs/investigations/ST-021-findings.md`
- Notes: Deferred from ST-021. Only triggered if a use case requires the `|` selector in openCypher (multi-relationship-type traversal in a single MATCH). Current workaround: explicit MATCH chains per relationship type, as documented in §R6 of the findings.
---

## Refined


(Empty)

---

## In Progress

(Empty)

---

## Review

(Empty)

## Done

### ST-013: Split investigation docs into landing pages and focused fragments
- Type: infrastructure
- Source: PO
- phase: 6
- Value: 4
- Completed: 2026-05-18
- Touches: `.github/copilot-instructions.md`, `.github/prompts/`, `.github/planning/`, `docs/investigations/`
- Acceptance criteria:
  - [x] Each current top-level investigation file remains in place as a compact landing page that links to focused fragment docs
  - [x] All investigation content under `docs/investigations/` (including nested research trees) is covered by per-topic fragment sets that preserve approved design decisions
  - [x] Governance consumers reference either the retained landing pages or precise fragment docs instead of broad monolith assumptions
  - [x] A section mapping matrix proves every original major section has a destination and no design-authority content was dropped during the split
- ExecPlan: `.github/planning/execplans/exec-plan-ST-013.md`
- Docs: `docs/investigations/split-section-mapping-matrix.md`, `docs/investigations/split-manifest.md`
- Notes: Accepted by PO 2026-05-18. 14 top-level landing pages + 174 fragments (top-level) + 45 Discussions + 3 Youtube = 437 total .md files. 222/222 matrix rows mapped. Zero content dropped.

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

---

## Archived

> Stories superseded by the ST-021 architectural pivot (2026-05-16) from local-first C#/SQLite to OB1 fork (TypeScript/Deno + PostgreSQL + pgvector + AGE). Retained for traceability; ExecPlans (where drafted) remain in `.github/planning/execplans/` as historical reference.

### ST-002: Implement SQLite schema + FTS5 + migrations
- Superseded by: `server/db/schema.sql` — PostgreSQL 15 + tsvector generated column + HNSW pgvector index + AGE init scripts (delivered by ST-021)
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-002.md`

### ST-003: Implement IMemoryRepository (SQLite)
- Superseded by: Direct SQL via `postgres` npm package in `server/index.ts`; dedup (content_fingerprint), soft-delete (active), and recall fields already in the `thoughts` schema
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-003.md`

### ST-004: Implement embedding service (OpenAI)
- Superseded by: OpenRouter inline embedding (`text-embedding-3-small`, 512-dim, fire-and-forget) in `server/index.ts` (delivered by ST-021)
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-004.md`

### ST-007: Implement MCP server (facade over service layer)
- Superseded by: OB1 fork in `server/index.ts` — 7 MCP tools live: `search`, `fetch`, `search_thoughts`, `capture_thought`, `list_thoughts`, `thought_stats`, `graph_traverse` (delivered by ST-021)
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-007.md`

### ST-018: Graph schema + structural fingerprints for SQLite
- Superseded by: AGE `memory_graph` + `entity_extraction_queue` trigger in `server/db/graph.sql` (delivered by ST-021)
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-018.md` (never drafted)

### ST-020: Implement request-scoped ambient context (contextual scoping)
- Superseded by: `server/src/parseContext.ts` + explicit `context` parameter on `capture_thought`, `search_thoughts`, and `list_thoughts` (delivered by ST-021)
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-020.md` (never drafted)
