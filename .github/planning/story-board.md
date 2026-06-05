> System: Continuous-flow kanban · WIP limit: 1 In Progress · 1 in Review
> Cadence: No sprint boundaries. /plan (Opus) creates plans; /continue (Sonnet) executes them.
> Prioritisation: Value-first with dependency-aware sequencing. Value: 1-5.
> Next planning target: plan ST-054 against the completed ST-046 harness.
> Unblocked: ST-023, ST-028, ST-029, ST-019 (all ST-005/ST-008/ST-022 blockers cleared)
> Last updated: 2026-06-05

---

## Backlog

<!-- Retrieval quality (from 2026-06-04 build-failure false-empty incident analysis) -->

### ST-054: Retrieval robustness (false-empty, identifier dilution, zero-result observability)
- Type: hardening
- Source: Session analysis 2026-06-04 (build-failure false-empty incident) + adversarial design review + local-instance validation
- phase: 2
- Value: 5
- Blocked by: —
- Touches: `server/index.ts` (`search` floor, `search_thoughts` response signal, capture/query normalization), `server/src/identifierNormalization.ts` (new), `server/src/searchQuality.ts` (zero-result logging), possibly `server/db/` (`search_text` column + metadata facets — schema-vs-inline decided in /plan), `server/tests/`
- Acceptance criteria:
  - [ ] **D1** — `search` no longer returns an empty set when relevant memories exist below the legacy 0.5 floor; a characterization test pins the `{results:[{id,title,url}]}` response shape ([server/index.ts:43-65](../../server/index.ts#L43-L65))
  - [ ] **D2** — high-entropy identifiers (Jira-style tickets, build numbers) are normalized out of the embedding + BM25 retrieval text via a non-destructive helper; raw `content` is preserved verbatim; identifiers are retained as exact-match `metadata` facets. Token-class boundary reconciled with ST-049 (error codes/UUIDs/versions stay BM25-precise)
  - [ ] **D3** — zero-result queries are logged for both `search` and `search_thoughts` (currently invisible: [server/index.ts:166](../../server/index.ts#L166), [server/src/searchQuality.ts:62](../../server/src/searchQuality.ts#L62))
  - [ ] **D3b** — `search_thoughts` results carry a machine-parseable per-result quality signal so consumers can distinguish authoritative hits from thin-corpus best-guesses
  - [ ] **Gate** — adds and greens the **target** assertions on ST-046's harness: flips the `normalizeForBm25` hook + `BASELINE` constants so the identifier-form and `search` D1 baselines move from today's degraded values to the improved thresholds (red→green)
  - [ ] **Target — identifier-form recall@k:** after D2 normalization, recall@k on the identifier form (`build 65008 PRI-5751 pipeline failure`) meets the defined threshold (the ST-046 identifier-form BM25 baseline of 0 rows is flipped to match the no-identifier form)
  - [ ] **Target — no false empty:** with a relevant memory present, `search` never returns `[]` (the ST-046 `search` D1 characterization is flipped from "not surfaced" to "surfaced")
  - [ ] Cross-model critical review passes (different model reviews implementation against the ExecPlan contract before the story moves to Review)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-054.md` (to be created by /plan)
- Query packet: `.github/planning/query-packets/QP-054-retrieval-robustness.md`
- ce-plan artifact: `docs/plans/2026-06-04-001-feat-retrieval-robustness-plan.md`
- Docs: `server/index.ts`, `server/db/search.sql`, `server/src/searchQuality.ts`
- Notes: Next planning target — **Backlog until its ExecPlan is authored and marked Ready** by /plan Phase 2 (Refined ⟺ Ready ExecPlan, per plan.prompt.md; a Refined story with no ExecPlan would be wrongly auto-picked by /continue). Tooling-side fix for the build-failure false-empty incident. **Why:** a hyper-specific query (`build 65008 PRI-5751 pipeline failure`) returned `{"results":[]}` from `search` — indistinguishable from "memory is empty" — and `search_thoughts` returned 10 low-signal results. Three independent defects proven in-session against source + local instance: `search`'s hard 0.5 floor fails closed (D1); `plainto_tsquery` ANDs every lexeme so unique identifiers zero the BM25 lane while also skewing the vector (D2); zero-result queries leave no trace so the failure rate is unmeasurable (D3). PO decisions (2026-06-04): fix `search` floor **in place** + characterization test (the floor is an internal knob, not the MCP shape contract; a flag is riskier given ChatGPT's fixed single-arg call); **non-destructive** normalization (raw + derived retrieval text + facets); connected-retrieval deferred to reshaped ST-034; completed ST-046 eval harness is now available as the proof gate. Corpus was also genuinely empty of build-failure memories — retrieval fix cannot conjure uncaptured data, which is why the ST-046 gate seeds a known corpus.

<!-- Phase 1 — Cloud MCP Intelligence (extends OB1 fork shipped by ST-021) -->

(ST-008 moved to Refined 2026-05-20)


<!-- Phase 2 — Production Deployment & Hardening -->

### ST-023: Cloud deployment (managed Postgres + container hosting)
- Type: infrastructure
- Source: ST-021 spike outcome
- phase: 2
- Value: 5
- Blocked by: —
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

### ST-028: Worker observability and `stats` MCP tool
- Type: feature
- Source: PO assessment of storyboard sufficiency (2026-05-18)
- phase: 2
- Value: 3
- Blocked by: —
- Touches: `server/index.ts` (new `stats` tool), `server/src/entityWorker.ts`, `server/src/consolidationWorker.ts`, `server/db/schema.sql` (new `worker_runs` table)
- Acceptance criteria:
  - [ ] Both workers emit structured JSON logs to stdout, one line per event: `{ts, level, worker, run_id, event, duration_ms, items_processed, errors}` where `event` is one of `run_started|item_processed|run_completed|run_failed`
  - [ ] New `worker_runs` table persists per-run state: `(run_id uuid PK, worker text, started_at, ended_at, items_processed int, errors int, error_summary jsonb)`
  - [ ] 30-day retention on `worker_runs` via `DELETE FROM worker_runs WHERE ended_at < now() - interval '30 days'` at end of each run
  - [ ] New `stats` MCP tool returns one JSON object with sections: `queues` (entity_extraction_queue depth), `workers` (last-24h run counts + error counts per worker), `recall` (recall events last 24h), `content` (counts from existing `thought_stats`)
  - [ ] `stats` subject to existing `requireApiKey` middleware (no new auth surface)
  - [ ] Failure of either worker visible in `stats` output within one poll cycle of the next run
  - [ ] Integration test: induce worker failure → `stats` reports `errors > 0`; recover → next run reports success
- ExecPlan: `.github/planning/execplans/exec-plan-ST-028.md` (to be created)
- Query packet: `.github/planning/query-packets/QP-028-worker-observability.md`
- Docs: `docs/design/adr/ADR-007-consolidation-pipeline.md`
- Notes: Operational closure for the cloud MCP. Without this, worker failures are invisible until users notice missing entity extractions or stale wikis. The `stats` tool also gives the local synthesis service (ST-019) and storyboard view (ST-026) a "is the cloud healthy?" check they can run before synthesis.



### ST-034: Spike — Graph-expanded "connected" retrieval: cardinality bounding + orchestration design
- Type: spike
- Source: PO (brainstorming session 2026-05-22, entity↔thought provenance design); scope widened 2026-06-04 to carry the connected-retrieval orchestration outcome (PO decision during ST-054 intake)
- phase: 2
- Value: 3
- Blocked by: ST-037 (needs accumulated real data from dogfooding)
- Touches: `docs/investigations/graph-expanded-search-cardinality.md` (new); no code changes expected
- Acceptance criteria:
  - [ ] Findings doc quantifies the cardinality problem on current dev data: for each entity label (Person/Function/Error/Topic/Project), the distribution of (thoughts mentioning entity) and (entities reachable at 1-hop, 2-hop)
  - [ ] At least 3 bounding strategies evaluated with trade-offs: hard limits (top-N per hop), score-based ranking (shared-entity count / edge confidence / recency / recall_count), and edge-type allow-listing (e.g. exclude `RELATED_TO` from expansion; weight `CAUSED_BY` higher than `LIKES`)
  - [ ] One strategy recommended for graph-expanded search v1 with rationale grounded in the observed dev-data distribution (not a guess)
  - [ ] Findings note explicitly addresses: does a popular entity (e.g. "TypeScript" if it appears in many thoughts) reliably get pruned, or does it dominate results?
  - [ ] **Orchestration design (added 2026-06-04):** recommend *when* graph expansion fires and *how* its candidates fuse with the lexical/vector path — specifically a **conditional** trigger on thin/low-confidence results (not always-on, to protect latency and ranking predictability) plus a **bounded-boost** fusion into the existing RRF/MMR ranker. Grounds the "surface connected memories" requirement that motivated ST-054 but is out of ST-054's scope
  - [ ] Out of scope: implementing the strategy (a follow-on feature story owns the graph-expanded search tool itself)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-034.md` (to be created)
- Relates to: ST-054 (retrieval robustness) — ST-054's thin-corpus / low-confidence result signal is the trigger condition this spike designs the graph expansion against; ST-034 owns the "connected memories" answer ST-054 explicitly defers
- Notes: Surfaced 2026-05-22 during entity↔thought provenance brainstorming. Without a bounding strategy, 1-hop expansion over popular entities returns hairballs and drowns out the high-signal hits that motivate the graph lane. Foundational design — settle before any graph-expanded search tool ships, not retrofitted after users hit noise. **Why widened 2026-06-04:** the build-failure false-empty incident (ST-054) showed the conceptually-correct mechanism for "surface *connected* memories" is the AGE graph, but it is built and orphaned from the default search path. Rather than spawn a duplicate "Story B", this spike now also designs the orchestration (conditional trigger + bounded-boost fusion) so the connected-retrieval feature story that follows has a settled design, not just cardinality numbers.

<!-- Phase 3 — Local Companion Services -->

### ST-019: Local Obsidian synthesis service (C# MCP client)
- Type: feature
- Source: PO (rewritten post-ST-021 pivot 2026-05-17)
- phase: 3
- Value: 4
- Blocked by: —
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

### ST-026: Obsidian storyboard view (C# MCP client storyboard projection)
- Type: feature
- Source: PO assessment of storyboard sufficiency (2026-05-18)
- phase: 3
- Value: 3
- Blocked by: ST-019 (reuses C# MCP client scaffolding, Markdown writer, polling loop)
- Touches: `local-synthesis/` solution (new view type alongside the wiki view)
- Acceptance criteria:
  - [ ] Reads `.github/planning/story-board.md` and `.github/planning/execplans/*.md` from a configured local repo path; parses into structured story records
  - [ ] Renders one Markdown note per story at `storyboard/{profile}/{story-id}.md` with YAML frontmatter (`type: story`, `status`, `value`, `blocked_by`, `touches`, `phase`)
  - [ ] Renders a kanban-style index note `storyboard/{profile}/index.md` with columns Backlog / Refined / In Progress / Review / Done
  - [ ] Per-story notes use `[[wiki-link]]` backlinks to `blocked_by` story notes; touches/docs paths render as Obsidian-relative or external links per convention
  - [ ] Profile partitioning: `professional` and `personal` directories; default profile from config
  - [ ] Incremental update: per-story checksum (SHA-256 over the story block) tracked in local state; only re-renders changed notes
  - [ ] Read-only — editing happens via `/plan` and `/continue`, not in Obsidian
  - [ ] Unit tests: mocked storyboard input → renders expected Markdown structure
- ExecPlan: `.github/planning/execplans/exec-plan-ST-026.md` (to be created)
- Query packet: `.github/planning/query-packets/QP-026-obsidian-storyboard-view.md`
- Docs: `docs/design/adr/ADR-006-views-architecture.md`
- Notes: Second of the "two views" promised in ADR-006. Reuses ST-019's C# scaffolding (MCP client, Markdown writer, polling loop) — thin extension, not a separate solution. Source of truth is the planning artifacts on disk today; if/when ADR-006's cloud-side `story_*` MCP tools are implemented, migrate to those.

<!-- Phase 0 — governance / dev-experience debt -->

### ST-032: Evaluate asset-metadata mechanism (cost/benefit + VS Code reconciliation + automation)
- Type: spike
- Source: PO (governance-friction observation 2026-05-22)
- phase: 0
- Value: 3
- Blocked by: none
- Touches: `docs/investigations/asset-metadata-mechanism-evaluation.md` (new), `docs/governance/asset-metadata-contract.md` (proposal section), `.github/planning/story-board.md` (adds follow-on ST-033), `.github/instructions/` (one file prototyped), `tools/GovernanceAssetValidator/` (read-only inspection)
- Acceptance criteria:
  - [ ] Findings doc at `docs/investigations/asset-metadata-mechanism-evaluation.md` contains a baseline section quantifying current state: count of governance asset files, count of VS Code Copilot "unknown attribute" warnings per file, last commit that regenerated `.github/planning/assets/asset-catalog.json`, output of `dotnet run --project tools/GovernanceAssetValidator -- validate .` at spike start
  - [ ] Findings doc contains a cost/benefit table: dev-experience cost of current shape (warnings, manual-command frequency, contract complexity) vs concrete value the catalog delivers today (who reads `asset-catalog.json` / `asset-catalog.md`; how many drift events have been detected since ST-012 shipped)
  - [ ] Findings doc evaluates ≥2 frontmatter reconciliation patterns against VS Code Copilot's schema (`applyTo`, `description`, `name`); recommends one pattern with rationale; demonstrated by editing one asset file to the proposed shape and showing both (a) VS Code reports 0 unknown-attribute warnings on that file and (b) `dotnet run --project tools/GovernanceAssetValidator -- build .` produces unchanged catalog output
  - [ ] Findings doc evaluates ≥3 automation mechanisms (e.g. `.git/hooks/pre-commit`, `.vscode/tasks.json` runOptions, `dotnet watch`, `husky.net`, scheduled CI documentation diff); recommends one with rationale that **explicitly addresses the PO's premise that the manual `dotnet run … build .` step does not happen in practice**
  - [ ] Recommendation is bounded to {reconcile, automate, reconcile+automate}; sunsetting is out of scope for this spike (PO scope decision 2026-05-22)
  - [ ] Follow-on implementation story ST-033 added to Backlog with concrete `Touches:` and `Acceptance criteria:` derived from the spike's recommendation
- ExecPlan: `.github/planning/execplans/exec-plan-ST-032.md`
- Docs: `docs/governance/asset-metadata-contract.md`, `docs/governance/asset-contribution-policy.md`, `tools/GovernanceAssetValidator/Program.cs`, `.github/planning/assets/asset-catalog.md`
- Notes: PO observed 2026-05-22 that the validator's manual `dotnet run -- build .` step does not happen, so the catalog is silently drifting AND the mechanism is paying its dev-experience cost (VS Code warnings on every governance file) without delivering its value. Spike must produce a real cost/benefit evaluation, not a rubber-stamp of the existing design. Disposition space bounded to "keep, in some form" per PO direction.

<!-- Phase 1 follow-ups deferred from earlier scoping -->

### ST-031: N:1 cluster-based consolidation (multi-shard → one wiki)
- Type: feature
- Source: PO deferred during ST-008 scope-lock (2026-05-20)
- phase: 2 (post-v1 consolidation maturity)
- Value: 2 (reassess once v1 consolidation has run in production)
- Blocked by: ST-008 (1:1 consolidation must ship first)
- Touches: `server/src/consolidationWorker.ts` (extend), possibly `server/db/schema.sql` (cluster bookkeeping)
- Acceptance criteria:
  - [ ] Worker clusters eligible shards by embedding cosine similarity > 0.85 (the §4.2 fragment value)
  - [ ] N:1 promotion: cluster contents merged via LLM call into one wiki row; each cluster-source shard receives `active=false`
  - [ ] `consolidation_log` records the N→1 mapping (multiple `thought_id`s associate to one `wiki_id` via a new linking table or jsonb array — decide during scoping)
  - [ ] Integration test: seed 3+ similar shards → run consolidation → verify one wiki row, all source shards inactive
- ExecPlan: `.github/planning/execplans/exec-plan-ST-031.md` (to be created)
- Notes: Deferred from ST-008 (2026-05-20). v1 is 1:1 only. N:1 requires maturity data from v1 — do we actually see clusters worth merging? — before investing in the more complex logic.


### ST-029: Feedback API (`report_feedback` tool + `feedback_events`)
- Type: feature
- Source: PO scope-lock during QP-005 planning (2026-05-18)
- phase: 1
- Value: 3
- Blocked by: —
- Touches: `server/index.ts` (new MCP tool), `server/db/schema.sql` (new table)
- Acceptance criteria:
  - [ ] New MCP tool `report_feedback({ thought_id, query, verdict: 'helpful' | 'irrelevant' })`
  - [ ] New `feedback_events` table with `(id, thought_id, query, verdict, created_at)`; FK to `thoughts`
  - [ ] Feedback rows joinable to the originating `recall_events` row (shared `(thought_id, query)` natural key, or an explicit `recall_event_id` FK — decide during planning)
  - [ ] `requireApiKey` middleware applies; no new auth surface
  - [ ] Integration test: capture → search → report_feedback → row visible in `feedback_events`
  - [ ] Out of scope for this story: surfacing feedback in `stats` (owned by ST-028) and rate-limiting (defer to a later story if abuse emerges)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-029.md` (to be created)
- Docs: `docs/investigations/memory-architecture-design/05-recall-tracking-and-promotion-scoring.md` §5.2
- Notes: Deferred from ST-005 to keep that story focused on the passive recall feedback loop. ST-029 wires up the active feedback channel. Useful when an agent harness is positioned to call this (e.g., after a code edit attributable to a recalled memory). ST-008's consolidation scoring can read `feedback_events` once available, but doesn't depend on it.

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

<!-- Phase 2 — Operational Hardening (from QP-038 vectorize-mcp-worker review) -->



### ST-039: Embedding resilience
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 5
- Blocked by: —
- Touches: `server/db/002_needs_embedding.sql` (new), `server/index.ts`, `server/src/entityWorker.ts` or new backfill module
- Acceptance criteria:
  - [ ] Thoughts with failed embeddings are recoverable via backfill (AC-2)
  - [ ] Embedding model version is recorded per thought (AC-17)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-039.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🔴 Must fix. Fire-and-forget embeddings currently lose data silently on transient failures. Uses standalone idempotent DDL (not migration runner from ST-042).

### ST-040: Worker crash isolation
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 5
- Blocked by: —
- Touches: `server/src/entityWorker.ts`
- Acceptance criteria:
  - [ ] Entity worker survives errors without crashing the server (AC-10)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-040.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🔴 Must fix. No schema change required. Adds try/catch + exponential backoff to the poll loop so unhandled rejections don't propagate to the main process.

### ST-041: Cypher injection hardening
- Type: security
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 5
- Blocked by: —
- Touches: `server/index.ts` (graph_traverse tool handler)
- Acceptance criteria:
  - [ ] `graph_traverse` rejects mutation keywords (AC-12)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-041.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🔴 Must fix. Current mitigation (`$$` stripping + MATCH-start check) is insufficient — mutation keywords after MATCH bypass it.

### ST-042: Migration framework
- Type: infrastructure
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 4
- Blocked by: —
- Touches: `server/src/migrate.ts` (new), `server/db/migrations/` (new directory), `server/index.ts`
- Acceptance criteria:
  - [ ] Schema changes are applied via numbered migrations (AC-9)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-042.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟡 Should fix. Includes bootstrap detection for existing databases. Enables ST-045 (worker idempotency) and ST-048 (metrics table).

### ST-043: Context validation + feature flags
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 3
- Blocked by: —
- Touches: `server/src/parseContext.ts`, `server/index.ts`
- Acceptance criteria:
  - [ ] Malformed context strings are rejected with a clear error (AC-6)
  - [ ] Feature flags disable graph/entity features when toggled off (AC-16)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-043.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟡 Should fix. Context parser currently silently ignores garbage. Feature flags enable safe progressive rollout.

### ST-044: Structured logging
- Type: observability
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 3
- Blocked by: —
- Touches: `server/src/logging.ts` (new), `server/index.ts` (middleware)
- Acceptance criteria:
  - [ ] Every MCP tool invocation emits structured JSON log with timing (AC-3)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-044.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟡 Should fix. Additive to ST-028 (worker observability). ST-028 covers worker-specific logs; this covers tool invocation timing.

### ST-056: Embedding request timeout resilience
- Type: hardening
- Source: MCP stall investigation 2026-06-05 (VS Code agent fetch failures + embedding-call timeout risk)
- phase: 2
- Value: 4
- Blocked by: —
- Touches: `server/src/embeddings.ts`, `server/index.ts` (`search`, `search_thoughts`, `capture_thought` call sites), `server/src/embeddingBackfill.ts`, focused tests under `server/tests/`
- Acceptance criteria:
  - [ ] `getEmbedding` aborts OpenRouter embedding requests after a configurable timeout and returns a clear timeout error without leaking secrets
  - [ ] `search_thoughts` does not hang when query embedding times out; it falls back to BM25/null-vector behavior and returns a bounded response
  - [ ] `capture_thought` and `embeddingBackfill` preserve ST-039 recovery semantics on timeout: rows remain recoverable via `needs_embedding`, attempts/error state is handled by the backfill path, and capture remains non-blocking
  - [ ] Timeout events produce an operator-visible log/error signal that distinguishes upstream timeout from no-results/no-memory outcomes
  - [ ] Focused tests cover timeout/cancellation behavior without real OpenRouter calls
  - [ ] Cross-model critical review passes (different model reviews implementation against ExecPlan contract before story moves to Review)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-056.md` (to be created by /plan)
- Query packet: `.github/planning/query-packets/QP-056-embedding-request-timeout-resilience.md`
- Relates to: ST-039 (embedding recoverability/backfill), ST-044 (general tool logging), ST-049 (query routing / vector-lane skipping), ST-053 (deep health check)
- Notes: Focused follow-up from 2026-06-05 MCP stall investigation. The service was healthy for direct `list_thoughts`, `search`, and `search_thoughts` probes, while VS Code logs showed client-side `fetch failed` / SSE termination during connection windows. Separately, source review found `server/src/embeddings.ts` uses `fetch` with no timeout; if OpenRouter or the network stalls, embedding-backed tools can appear to hang even though non-embedding tools stay fast. PO scoped this story to embedding calls only; entity extraction and consolidation OpenRouter timeouts are out of scope unless later pulled into a shared HTTP client story.

### ST-045: Worker idempotency
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 3
- Blocked by: ST-042 (needs migration framework)
- Touches: `server/src/entityWorker.ts`, `server/db/migrations/004_entity_extracted.sql` (new)
- Acceptance criteria:
  - [ ] Entity worker uses `entity_extracted` flag for safe replay (AC-10 extended, AC-11)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-045.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟡 Should fix. Depends on ST-042 for migration infrastructure. Prevents duplicate processing after crash.

### ST-047: Tool descriptions
- Type: dx
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 3
- Blocked by: —
- Touches: `server/index.ts` (tool registration descriptions)
- Acceptance criteria:
  - [ ] All MCP tool descriptions include usage examples and parameter docs (AC-15)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-047.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟡 Should fix. Current descriptions are minimal. AI agent consumers invoke tools more accurately with example values and error condition docs.

### ST-048: Queryable metrics table
- Type: observability
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: ST-042 (needs migration framework)
- Touches: `server/db/migrations/003_tool_metrics.sql` (new), `server/index.ts`
- Acceptance criteria:
  - [ ] Tool metrics are persisted to a queryable `metrics` table (AC-4)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-048.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Additive to ST-028 (worker observability) which covers worker-run metrics. This covers per-tool-invocation timing/error persistence.

### ST-049: Query routing (lane skipping)
- Type: performance
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: —
- Touches: `server/src/searchQuality.ts`, `server/index.ts`
- Acceptance criteria:
  - [ ] Query routing skips vector lane for keyword-only queries (AC-13)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-049.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Exact error codes, UUIDs, and short tokens benefit from BM25 precision without the vector lane's embedding call latency.

### ST-050: Latency assertions in tests
- Type: quality
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: —
- Touches: `server/tests/search-golden-set.test.ts`
- Acceptance criteria:
  - [ ] Search tests include latency assertions (AC-8)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-050.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Extends ST-046's golden-set test with timing checks (< 500ms on seeded local corpus).

### ST-051: Rate limiting
- Type: security
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: —
- Touches: `server/src/rateLimit.ts` (new), `server/index.ts`
- Acceptance criteria:
  - [ ] Rate limiting returns 429 after threshold exceeded (AC-14)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-051.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Single-instance in-memory token bucket. Document Redis needed for multi-instance. Protects against runaway agent loops burning embedding quotas.

### ST-052: Backpressure control
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: ST-045 (needs entity_extracted flag)
- Touches: `server/src/entityWorker.ts`
- Acceptance criteria:
  - [ ] Entity worker respects backpressure limits (AC-11)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-052.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Bounded queue with observational alerting when pending count exceeds configurable threshold. Items never dropped.

### ST-053: Deep health check
- Type: observability
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: ST-039, ST-040 (needs worker state to report)
- Touches: `server/index.ts` (/health endpoint)
- Acceptance criteria:
  - [ ] Health check reports DB latency, queue depth, and degraded state (operational polish)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-053.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Industry standard for container orchestration. Reports degraded state (e.g. embedding failures, worker backlog) in health response for monitoring.

---

## Refined

---

## In Progress

(Empty)

---

## Review

(Empty)

## Done

### ST-046: Golden-set regression tests (search-quality eval harness)
- Type: quality
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31); scope widened 2026-06-04 to serve as the ST-054 eval-harness gate (PO decision during ST-054 intake)
- phase: 2
- Value: 4
- Completed: 2026-06-05
- Blocked by: —
- ExecPlan status: ✅ Ready for /continue
- Touches: `server/tests/search-golden-set.test.ts` (new), `server/tests/_helpers/recall.ts` (new), `server/tests/fixtures/build-search-quality-corpus.ts`, `server/tests/fixtures/search-quality-corpus.sql`, `server/src/searchQuality.ts` (extract pure `rrfFuse`), `server/index.ts` (rewire `search_thoughts` to `rrfFuse` — no behaviour change)
- Acceptance criteria:
  - [x] Search quality regression catches RRF/MMR parameter drift (AC-7): a **deterministic pure-function test** asserts `rrfFuse` ordering flips between k=60 and k=10 and `mmrRerank` ordering changes with λ (no network); a complementary integration golden-set confirms default-parameter correctness end-to-end
  - [x] **Incident relevance + recall@k machinery (revised 2026-06-04, Option A):** the seeded corpus includes identifier-free build-failure-class memories, and the harness defines the incident relevance set + queries in **both forms** (`build 65008 PRI-5751 pipeline failure` vs `build pipeline failure`) with a reusable recall@k helper — consumable by ST-054
  - [x] **Baselines pinned to today's behaviour (revised 2026-06-04, Option A):** no-identifier form matches the full build-failure set via the deterministic BM25 lane; identifier form deterministically records the degraded value (BM25 ANDs unmatched id tokens to **0 rows**); a `search` D1 false-empty **characterization** pins that the incident memory is not surfaced by `search` today. A named `BASELINE`/`normalizeForBm25` TDD seam lets ST-054 flip these to targets. *(Target thresholds themselves are ST-054 ACs, not ST-046.)*
- ExecPlan: `.github/planning/execplans/exec-plan-ST-046.md`
- Query packet: `.github/planning/query-packets/QP-046-search-quality-eval-harness.md`
- Blocks: ST-054 (retrieval robustness) — ST-054 consumes this harness as its proof gate
- Notes: Completed 2026-06-05. Uses existing seeded test corpus. Verifies that tuning RRF/MMR parameters doesn't silently degrade recall quality. **Why widened:** during ST-054 intake the PO chose to build the retrieval-robustness eval harness here rather than duplicate it inside ST-054 — so ST-046 owns the incident-query relevance set + no-false-empty regression consumed by ST-054. Without a *seeded* corpus, "0 results" stays ambiguous between broken ranking and an empty store — the exact ambiguity that made the original incident hard to diagnose.

### ST-055: MMR null-embedding BM25 recall preservation
- Type: bug
- Source: ST-046 plan-review resolution (2026-06-05 Task 4.3 e2e failure after expanded corpus)
- phase: 2
- Value: 5
- Completed: 2026-06-05
- Blocked by: —
- Touches: `server/src/searchQuality.ts` (`mmrRerank` null-embedding merge behavior), `server/index.ts` only if caller-side merge is chosen during ExecPlan authoring, `server/tests/e2e.test.ts`, focused unit tests under `server/tests/`
- Acceptance criteria:
  - [x] A deterministic unit test proves a null-embedding candidate with a higher fused/BM25 score than at least one embedded candidate remains in the final top-k
  - [x] `mmrRerank` uses one selection loop over embedded and null-embedding candidates; null candidates participate with similarity-to-selected = `0`, making their MMR score `λ * score`
  - [x] The intentional equal-score bias is pinned: a null candidate may beat an embedded candidate when the embedded candidate is redundancy-penalized and their fused scores are equal
  - [x] The all-null degenerate case remains pure score order
  - [x] Embedded candidates still receive MMR diversity ranking; existing MMR behavior is not collapsed into plain score sorting
  - [x] `e2e: capture_thought → search_thoughts returns via BM25 lane` passes against the ST-046 expanded seeded corpus
  - [x] Existing e2e `MMR keeps null-embedding row returnable` still passes
  - [x] Full `mcp-test` server tests pass, or any unrelated pre-existing failure is documented with evidence
  - [x] Cross-model critical review passes before the story moves to Review
- ExecPlan: `.github/planning/execplans/exec-plan-ST-055.md`
- Query packet: `.github/planning/query-packets/QP-055-mmr-null-embedding-bm25-recall.md`
- Blocks: ST-046 (eval harness Task 4.3 should not resume until current-state e2e is green with the expanded corpus)
- Notes: Completed 2026-06-05. The ST-046 corpus expansion revealed a runtime recall bug: newly captured BM25-only rows can have `embedding = NULL` while embedding generation is fire-and-forget. Current MMR selection fills `k` from embedded candidates before appending null-embedding candidates, so a high-scoring BM25-only hit can be dropped once the corpus has enough embedded rows. Fixed via a unified MMR selection loop where null-embedding candidates participate with similarity-to-selected = `0` (intentional recency/lexical-recall bias), not by raising e2e limits or waiting synchronously for embeddings. Implementation, full verification, cross-model critical review, and PO acceptance passed 2026-06-05.

### ST-038: Startup safety & input guards
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 5
- Completed: 2026-06-02
- Blocked by: —
- Touches: `server/index.ts`, `server/src/startupValidation.ts`, `server/src/entityWorker.ts`, `server/tests/capture-size-limit.test.ts`, `server/tests/startup-validation.test.ts`
- Acceptance criteria:
  - [x] Server fails fast at startup if required env vars are missing (AC-1)
  - [x] `capture_thought` rejects content exceeding 32KB with clear error (AC-5)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-038.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🔴 Must fix resolved. Startup validation now fails fast on missing required env vars; 32KB byte-limit enforcement and boundary coverage added. Cross-model review gate passed.

### ST-037: Configure local MCP clients for dogfooding
- Type: enablement
- Source: PO (scoping session 2026-05-28, prerequisite for ST-034 data accumulation)
- phase: 2
- Value: 4
- Completed: 2026-05-29
- Blocked by: —
- Touches: `.vscode/mcp.json` (new), `README.md` (new section)
- Acceptance criteria:
  - [x] `.vscode/mcp.json` configures VS Code Copilot to connect to `http://localhost:3000/mcp` using `${env:MEMORY_API_KEY}` interpolation
  - [x] README.md "Connecting Clients" section documents setup for VS Code Copilot, Claude Code, and Claude Desktop
  - [x] PO manually performs capture+search round-trip from at least one configured client
- ExecPlan: `.github/planning/execplans/exec-plan-ST-037.md`
- Query packet: `.github/planning/query-packets/QP-037-local-mcp-client-config.md`
- Notes: Dev graph is empty (0 thoughts). Service is functional but no AI agent is connected. This story enables daily dogfooding so that real data accumulates for ST-034's cardinality analysis. Cloud clients (ChatGPT/Gemini) deferred to ST-023.
  - **Completed 2026-05-29:** `.vscode/mcp.json` committed with Streamable HTTP config; README updated with three-client setup section; all-tools smoke test passed (thought_stats, capture_thought, search_thoughts)
  - **Accepted 2026-06-02:** VS Code MCP visibility issue resolved; server visible after user-scoped env + global MCP config refresh and VS Code reload.

### ST-010: Integration testing for cloud MCP (Deno + Docker Compose)
- Type: debt
- Source: PO (rewritten post-ST-021 pivot)
- phase: 2
- Value: 4
- Blocked by: —
- Touches: `server/tests/` (new), `.github/workflows/ci.yml`, `docker-compose.test.yml`
- Acceptance criteria:
  - [x] E2E test: `capture_thought` → `search_thoughts` returns it via BM25 lane
  - [x] E2E test: `capture_thought` (with embedding settled) → `search_thoughts` returns it via vector lane
  - [x] E2E test: shard promoted to wiki via consolidation worker; both queryable
  - [x] E2E test: entity extraction populates AGE graph; `graph_traverse` returns expected nodes
  - [x] E2E test: context-scoped search filters correctly across `project` / `profile`
  - [x] CI pipeline runs `docker compose up` against test images on every push
  - [x] Recall event tracking verified end-to-end
- ExecPlan: `.github/planning/execplans/exec-plan-ST-010.md`
- Docs: `docs/investigations/interface-design-mcp-rest.md`
- Notes: Rewritten post-ST-021 pivot for TypeScript/Deno/Docker Compose. CI runs against the same `docker-compose.yml` used locally to keep dev and CI environments in sync.

### ST-008: Implement consolidation worker (shard → wiki promotion)
- Type: feature
- Source: PO (rewritten post-ST-021 pivot; scope locked 2026-05-20 in QP-008)
- phase: 1
- Value: 3
- Completed: 2026-05-27
- Touches: `server/src/consolidationWorker.ts` (new), `server/src/consolidationScoring.ts` (new), `server/src/consolidationLLM.ts` (new), `server/index.ts` (modify), `server/db/schema.sql` (modify), `server/tests/consolidation-worker.test.ts` (new), `server/tests/fixtures/consolidation-corpus.sql` (new)
- Acceptance criteria:
  - [x] Event-driven worker: triggers on `thoughts` INSERT and `recall_events` INSERT call `pg_notify('consolidation_event', thought_id::text)`; worker holds a `sql.listen('consolidation_event', ...)` connection and processes pending queue rows on each notification
  - [x] On worker startup, pending queue is drained once (miss recovery); MCP `consolidate({dry_run?, limit?})` tool exposes manual full-sweep as fallback
  - [x] Three-factor scoring per ADR-007: `0.40 × frequency_norm + 0.35 × diversity_norm + 0.25 × relevance`; frequency = recall_event count; diversity = distinct projects; relevance = `helpful` proportion in `feedback_events` OR `thoughts.confidence` as fallback when no feedback rows exist
  - [x] Threshold bands: ≥0.7 auto-promote; 0.5–0.69 flag (log only, no `thoughts` write); <0.5 skip
  - [x] Eligibility: `memory_type='shard'`, `active=true`, ≥2 recall events, `content_fingerprint` not already in a wiki row (dedup)
  - [x] Promotion: INSERT new `thoughts` row with `memory_type='wiki'`, `source='auto-promoted'`, `supersedes=NULL`, `confidence=score`, `content`=LLM-normalised; UPDATE original shard `active=false`; INSERT `consolidation_log` row
  - [x] LLM normalisation: OpenRouter `openai/gpt-4o-mini` call for every ≥0.5 candidate produces `normalised_content`; on call failure mark queue `status='llm_error'`, set `retry_after = now() + interval '1 hour'`
  - [x] 1:1 promotion model (one shard → one wiki). N:1 cluster-based promotion deferred to ST-031
  - [x] Integration tests: 7 cases — promote happy path, flag band, skip band, dry-run, dedup, relevance fallback, LLM failure defer
- ExecPlan: `.github/planning/execplans/exec-plan-ST-008.md`
- Query packet: `.github/planning/query-packets/QP-008-consolidation-worker.md`
- Docs: `docs/design/adr/ADR-007-consolidation-pipeline.md`, `docs/investigations/memory-architecture-design.md`
- Notes: Scope locked across 4 /plan rounds 2026-05-19/20. Wiki.supersedes=NULL per ADR-007. Relevance fallback to `thoughts.confidence` avoids blocking on ST-029 (feedback API). Event-driven LISTEN/NOTIFY replaces earlier "Configurable schedule (default: daily)" wording. 34/34 tests pass. Commits: 1825f76, ad56741, ae768d7, b3cf14a, 073db30, bd38629, 04b456b. Accepted by PO 2026-05-27.

### ST-030: Add `.gitattributes` and normalize line endings repo-wide
- Type: debt
- Source: PO scope-lock during /plan closeout (2026-05-19); plan-review resolved 2026-05-20
- phase: 0
- Value: 2
- Completed: 2026-05-27
- Touches: `.gitattributes` (created); 540 text files renormalized in commit `0611109`
- Acceptance criteria:
  - [x] `.gitattributes` created at repo root with policy: `* text=auto eol=lf` baseline + `*.bat`/`*.cmd`/`*.ps1` → `text eol=crlf` (commit `c1c1c7d`)
  - [x] `git add --renormalize .` applied; renormalized files committed in a single commit titled `build: add .gitattributes and normalize line endings` (commit `0611109`)
  - [x] `git status --porcelain` produces zero lines on a clean checkout (verified 2026-05-20)
  - [x] `git ls-files --eol -- server/Dockerfile server/db/graph.sql server/db/schema.sql server/src/parseContext.ts` shows `i/lf` in index under `attr/text=auto eol=lf` for each
  - [x] `git ls-files --eol -- '*.ps1'` shows `i/lf w/crlf` under `attr/text eol=crlf` for each
  - [x] `git diff 0611109^..0611109 -w --stat` produces empty output (Task 4.4 — completed 2026-05-27; empty output confirmed)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-030.md`
- Query packet: `.github/planning/query-packets/QP-030-gitattributes-line-endings.md`
- Notes: Accepted by PO 2026-05-27. Two plan-reviews resolved 2026-05-20 (Git EOL semantics; verification scope). All 6 ACs met. `git diff -w` proves renormalize commit is whitespace-only.

### ST-035: Entity↔thought provenance link (entity_mentions back-link table)
- Type: feature
- Source: PO (brainstorming session 2026-05-22)
- phase: 1 (foundational — enables Phase 3 consumers ST-019, ST-026 and future graph-expanded search)
- Value: 4
- Completed: 2026-05-26
- ExecPlan: `.github/planning/execplans/exec-plan-ST-035.md`
- Query packet: `.github/planning/query-packets/QP-035-entity-thought-provenance.md`
- Docs: `docs/design/specs/2026-05-22-entity-thought-provenance.md`, `docs/design/plans/2026-05-22-entity-thought-provenance.md`
- Notes: Accepted by PO 2026-05-26. All 7 tasks complete; 4/4 integration tests pass. `entity_mentions` table live with composite PK, CHECK, FK cascade, and secondary index. Entity worker writes batched DELETE+INSERT on every extraction. `server/index.ts` untouched — data-plane only. 4 pre-existing search test failures (seed-corpus gap on fresh DB) are not regressions — see exec-plan §6b Discovery 2.

### ST-036: Separate dev/test DB containers (Compose profiles)
- Type: debt
- Source: PO decision during ST-035 execution (2026-05-25); test-pollution incident surfaced the need
- phase: 2
- Value: 4
- Completed: 2026-05-26
- Query packet: `.github/planning/query-packets/QP-036-dev-test-db-separation.md`
- Notes: Accepted by PO 2026-05-26. 20/20 tests pass via `docker compose --profile test exec mcp-test`. Compose profiles separate dev DB (persistent, `db_data` volume) from test DB (ephemeral, tmpfs). `mcp-test` service connects to `db-test` on port 3001. Corpus-isolation filter retained for intra-run test ordering.

### ST-005: Search quality enhancements (MMR, project boosting, recall logging)
- Type: feature
- Source: PO (rewritten post-ST-021 pivot)
- phase: 1
- Value: 4
- Completed: 2026-05-19
- ExecPlan: `.github/planning/execplans/exec-plan-ST-005.md`
- Query packet: `.github/planning/query-packets/QP-005-search-quality-and-recall.md`
- Notes: Accepted by PO 2026-05-19. 16/16 tests pass; MMR diversification, 1.2× project boost, recall_events logging, strict? context flag all delivered.

### ST-022: Implement entity extraction worker (OpenRouter → AGE graph)
- Type: feature
- Source: ST-021 spike outcome (2026-05-16)
- phase: 1
- Value: 5
- Completed: 2026-05-19
- Blocked by: ST-021 (done)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-022.md`
- Query packet: `.github/planning/query-packets/QP-022-entity-extraction-worker.md`
- Notes: Accepted by PO 2026-05-19. 4/4 integration tests pass; graph_search, entity worker, AGE nested-array fix all delivered.

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
