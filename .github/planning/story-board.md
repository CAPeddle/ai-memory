> System: Continuous-flow kanban · WIP limit: 1 In Progress · 1 in Review
> Cadence: No sprint boundaries. /plan (Opus) creates plans; /continue (Sonnet) executes them.
> Prioritisation: WSJF (value ÷ effort). Value: 1-5. Effort: XS=1, S=2, M=3, L=5.
> Next planning target: ST-011 — governance remediation follow-up from the 2026-05-02 audit.
> Last updated: 2026-05-02

---

## Backlog

### ST-011: Institutionalize recurring governance review and remediation
- Type: debt
- Source: PO
- Value: 5 · Effort: XS(1) · WSJF: 5.0
- Blocked by: none
- Touches: `.github/prompts/`, `.github/planning/`, `.github/instructions/`, `.github/skills/`, `FollowUpSessionLog.txt`
- Acceptance criteria:
  - [ ] A dedicated governance review prompt exists for repeatable audit and remediation passes
  - [ ] The governance review workflow consumes a seed query packet when one is associated with a story
  - [ ] The workflow defines when audit findings become prompt, board, or instruction updates
  - [ ] A follow-up governance review pass validates the remediations from the 2026-05-02 audit
- ExecPlan: `.github/planning/execplans/exec-plan-ST-011.md`
- Docs: `docs/investigations/workflow-and-prompt-design.md`, `docs/investigations/context-engineering-principles.md`
- Notes: Highest-priority planning target. Seed query packet: `.github/planning/query-packets/QP-011-governance-review-remediation.md`. This story remains in Backlog so `/plan` can scope the recurring governance-review prompt and cadence.

### ST-001: Scaffold .NET solution and project structure
- Type: infrastructure
- Source: PO
- Value: 5 · Effort: S(2) · WSJF: 2.5
- Blocked by: none
- Touches: `src/`, `tests/`, `*.sln`, `Directory.Build.props`
- Acceptance criteria:
  - [ ] Solution builds with `dotnet build`
  - [ ] Three projects exist: AiMemory.Core, AiMemory.Server, AiMemory.Tests
  - [ ] Directory.Build.props sets C# 12, .NET 8, nullable enabled, implicit usings
  - [ ] `dotnet test` runs (even with zero tests)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-001.md`
- Docs: `docs/investigations/language-stack-recommendation.md`
- Notes: Foundation for all subsequent stories

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

(Empty — WIP limit: 1)

---

## Done

### ST-009: Create workflow governance files (.github/)
- Type: infrastructure
- Source: PO
- Value: 5 · Effort: S(2) · WSJF: 2.5
- Completed: 2025-05-02
- Notes: Prompts, board, ExecPlan template, instructions, session log created from investigation docs
