> System: Continuous-flow kanban · WIP limit: 1 In Progress · 1 in Review
> Cadence: No sprint boundaries. /plan (Opus) creates plans; /continue (Sonnet) executes them.
> Prioritisation: WSJF (value ÷ effort). Value: 1-5. Effort: XS=1, S=2, M=3, L=5.
> Next planning target: ST-013 — split investigation docs into landing pages and focused fragments.
> Last updated: 2026-05-05

---

## Backlog

### ST-013: Split investigation docs into landing pages and focused fragments
- Type: infrastructure
- Source: PO
- Value: 4 · Effort: M(3) · WSJF: 1.3
- Blocked by: none
- Touches: `.github/copilot-instructions.md`, `.github/prompts/`, `.github/planning/`, `docs/investigations/`
- Acceptance criteria:
  - [ ] Each current top-level investigation file remains in place as a compact landing page that links to focused fragment docs
  - [ ] All eight investigation docs have per-topic fragment sets under `docs/investigations/` that preserve the current approved design decisions
  - [ ] Governance consumers reference either the retained landing pages or precise fragment docs instead of broad monolith assumptions
  - [ ] A completeness review proves every original major section has a destination and no design-authority content was dropped during the split
- ExecPlan: `.github/planning/execplans/exec-plan-ST-013.md`
- Docs: `docs/investigations/memory-architecture-design.md`, `docs/investigations/language-stack-recommendation.md`, `docs/investigations/sqlite-vs-postgresql.md`, `docs/investigations/interface-design-mcp-rest.md`, `docs/investigations/workflow-and-prompt-design.md`, `docs/investigations/context-engineering-principles.md`, `docs/investigations/openclaw-official-docs-review.md`, `docs/investigations/openclaw-memory-architecture-analysis.md`
- Notes: Split the current investigation monoliths into per-topic folders while keeping the top-level files as compact landing pages. Seed query packet: `.github/planning/query-packets/QP-013-split-investigation-docs.md`. Keep behind ST-011 so governance-review workflow changes land before broader doc-structure refactoring.

### ST-015: Improve ExecPlan template to show outcomes up front
- Type: infrastructure
- Source: PO
- Value: 3 · Effort: S(2) · WSJF: 1.5
- Blocked by: none
- Touches: `.github/planning/execplans/_TEMPLATE.md`, `.github/planning/execplans/`
- Acceptance criteria:
  - [ ] ExecPlan template now has an "Outcomes & Conclusions" section immediately after §1 Background
  - [ ] The Outcomes section has type-specific structure: spikes emphasize discoveries/learnings, features emphasize completion/delivery, and infrastructure/debt emphasize risk/improvements
  - [ ] Template documents required fields: completion status, key findings/achievements, requirements met vs unmet, architectural impact, supporting evidence, and downstream changes
  - [ ] A worked example (based on a completed story like ST-014) shows how the new section is populated
  - [ ] The narrative flow makes it clear at a glance: intent → requirements → what was actually delivered
- ExecPlan: `.github/planning/execplans/exec-plan-ST-015.md`
- Docs: `.github/planning/execplans/_TEMPLATE.md`, `.github/planning/execplans/exec-plan-ST-014.md`
- Notes: Improves PO visibility when reviewing completed stories. Seed query packet: `.github/planning/query-packets/QP-015-execplan-outcomes-template.md`.

### ST-002: Implement SQLite schema + FTS5 + migrations
- Type: infrastructure
- Source: PO
- Value: 5 · Effort: M(3) · WSJF: 1.7
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
- Value: 4 · Effort: M(3) · WSJF: 1.3
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

### ST-004: Implement embedding service (OpenAI)
- Type: feature
- Source: PO
- Value: 4 · Effort: S(2) · WSJF: 2.0
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
- Value: 5 · Effort: L(5) · WSJF: 1.0
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

### ST-006: Implement REST API endpoints
- Type: feature
- Source: PO
- Value: 4 · Effort: M(3) · WSJF: 1.3
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
- Value: 5 · Effort: M(3) · WSJF: 1.7
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

### ST-008: Implement consolidation pipeline
- Type: feature
- Source: PO
- Value: 3 · Effort: L(5) · WSJF: 0.6
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
- Value: 4 · Effort: M(3) · WSJF: 1.3
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

---

## Refined

(Empty)

---

## In Progress

(Empty — WIP limit: 1)

---

## Review

(Empty)

---

## Done

### ST-012: Add discoverable AI-governance asset catalog and validation
- Type: infrastructure
- Source: PO
- Value: 4 · Effort: S(2) · WSJF: 2.0
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
- Source: PO
- Value: 5 · Effort: S(2) · WSJF: 2.5
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
- Source: PO
- Value: 4 · Effort: S(2) · WSJF: 2.0
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
- Source: PO
- Value: 5 · Effort: XS(1) · WSJF: 5.0
- Completed: 2026-05-04
- Notes: Accepted by PO; review slot cleared. Validation report: `.github/planning/audit-reports/audit-report-2026-05-03.md`.

### ST-009: Create workflow governance files (.github/)
- Type: infrastructure
- Source: PO
- Value: 5 · Effort: S(2) · WSJF: 2.5
- Completed: 2025-05-02
- Notes: Prompts, board, ExecPlan template, instructions, session log created from investigation docs
