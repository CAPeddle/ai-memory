# Query Packet — ST-028: Worker observability and `stats` MCP tool

> Story: ST-028
> Created: 2026-05-18
> Source: PO assessment of storyboard sufficiency (2026-05-18 follow-up to ST-021 closeout)
> Status: Seed packet — refine during `/plan`

---

## Intent

Close the operational visibility gap on the cloud MCP. ST-022 (entity extraction worker) and ST-008 (consolidation worker) introduce background, stateful processes that can fail silently. Without observability, a user only notices via missing entity edges or stale wikis — by which time several runs have failed.

This story adds three things:

1. Structured JSON logging from both workers (so log aggregators can ingest cleanly in the future).
2. A `worker_runs` table that persists per-run state (so failures persist across restarts).
3. A `stats` MCP tool that surfaces queue depths, run history, recall counts, and content counts in a single call — so any MCP-capable client (local synthesis service ST-019, storyboard view ST-026, ad-hoc debugging) can answer "is the cloud healthy?" without inventing its own checks.

---

## Current State

- Two background workers will exist after ST-022 and ST-008 land. Neither has structured logging or run-history persistence in the current designs.
- ST-005 adds the `recall_events` table; recall counts depend on it.
- The MCP server already exposes `thought_stats` (added by ST-021) returning counts of thoughts by `memory_type` and `active`. That is **content stats**, not **operational stats**. The new `stats` tool composes the existing content stats with the new operational stats.
- `requireApiKey` middleware (ADR-010) wraps all MCP tool calls; the new `stats` tool inherits the same authentication.

---

## Research Findings

1. PostgreSQL's `jsonb` type and `gen_random_uuid()` (from `pgcrypto`) are already available in the existing schema, so the new `worker_runs` table needs no extension additions.
2. The existing `entity_extraction_queue` schema (`server/db/graph.sql`) already supports `FOR UPDATE SKIP LOCKED` queue semantics; queue depth is a simple `COUNT(*) WHERE status = 'pending'`.
3. Stdout-based structured logging is the de facto contract for container orchestrators (Docker, Fly.io, Railway, DigitalOcean Apps) — no additional log shipper is required in v1.
4. MCP tools return JSON; a `stats` tool that returns a single nested object is consistent with how `thought_stats` is shaped today.

---

## Design Decisions To Lock In During `/plan`

1. **Logging format:** structured JSON to stdout, one line per event. Required fields: `ts` (ISO 8601), `level` (info|warn|error), `worker` (entity|consolidation), `run_id` (uuid), `event` (run_started|item_processed|run_completed|run_failed), and event-specific fields (`duration_ms`, `items_processed`, `errors`, `error_summary`).
2. **Persistence schema:** new `worker_runs` table:
   ```sql
   CREATE TABLE worker_runs (
     run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     worker          text NOT NULL CHECK (worker IN ('entity', 'consolidation')),
     started_at      timestamptz NOT NULL DEFAULT now(),
     ended_at        timestamptz,
     items_processed int NOT NULL DEFAULT 0,
     errors          int NOT NULL DEFAULT 0,
     error_summary   jsonb
   );
   CREATE INDEX worker_runs_worker_ended_at_idx ON worker_runs (worker, ended_at DESC);
   ```
3. **`stats` tool surface:** single JSON object with sections:
   ```json
   {
     "queues":  { "entity_extraction_pending": 3 },
     "workers": {
       "entity":        { "runs_24h": 48, "errors_24h": 0, "last_run_at": "...", "last_status": "ok" },
       "consolidation": { "runs_24h": 24, "errors_24h": 1, "last_run_at": "...", "last_status": "ok" }
     },
     "recall":  { "events_24h": 127 },
     "content": { "shards": 412, "wikis": 38, "active": 438 }
   }
   ```
4. **Retention:** `DELETE FROM worker_runs WHERE ended_at < now() - interval '30 days'` invoked at the end of each run (cheap; indexed).
5. **Failure semantics:** a single failed run does not halt the queue; the `errors` counter increments and the queue keeps draining. A sustained failure pattern is visible by `errors_24h > 0` and `last_status = 'failed'` in `stats` output.
6. **Authentication:** `stats` is a regular MCP tool under `requireApiKey`; no new auth surface.

---

## Research Questions

1. Should `stats` be a separate MCP tool or an HTTP endpoint (`/stats` alongside `/health`)? **Recommendation:** tool — clients already speak MCP and inherit auth.
2. Should worker logs go to a structured log aggregator (Datadog, Grafana Loki, etc.) in production, or is stdout sufficient? **Recommendation:** stdout in v1; aggregator is a deployment-host concern (ST-023). The structured JSON format leaves the door open.
3. How are recall events counted — row count on `recall_events` (ST-005) or an in-memory counter? **Recommendation:** row count; it reflects persisted state and is accurate after restarts.
4. Should the `worker_runs` table be exposed via its own `list_worker_runs` tool for deep debugging, or is the summary in `stats` enough? **Recommendation:** summary in `stats` for v1; defer a dedicated lister until a debug need surfaces.
5. Should the consolidation worker's "dry-run mode" (per ST-008) be reflected in the run record (`error_summary.dry_run = true` or similar)? **Recommendation:** yes — distinguish dry-run from real runs in `worker_runs` so the run history is not skewed.

---

## Scope Locked

In scope:
- Structured JSON logging from `entityWorker.ts` and `consolidationWorker.ts`
- New `worker_runs` table + insert on run start, update on run completion
- 30-day retention via end-of-run DELETE
- New `stats` MCP tool with the schema defined above
- Integration test: induce worker failure → `stats` reports `errors > 0`; recover → next run reports success

Out of scope:
- External log aggregation (Datadog, Loki, etc.) — deployment-host concern
- Per-request HTTP metrics (Prometheus exporter) — not needed at this scale
- Alerting / paging — manual `stats` checks are sufficient for single-user
- A web dashboard — `stats` output is consumed by MCP clients, not a browser UI
- Tracing / spans — out of scope for v1

---

## Risks And Watch Points

1. **Unbounded growth of `worker_runs`.** Mitigation: 30-day end-of-run DELETE; verified by integration test that runs across simulated time.
2. **Expensive `stats` queries under load.** Large `recall_events` row counts could spike MCP latency. Mitigation: index on `recall_events.created_at`; use efficient aggregate (`COUNT(*) WHERE created_at > now() - interval '24 hours'`).
3. **Log schema drift.** Once an external aggregator depends on the JSON log fields, breaking changes become disruptive. Mitigation: treat the log schema as v1; document the contract explicitly in `docs/runbooks/observability.md`.
4. **Race between concurrent worker runs.** Each run has its own UUID; no shared row, no locking required. Confirmed safe.
5. **Confusion between content stats (`thought_stats`) and operational stats (`stats`).** Mitigation: `stats` includes the content section verbatim so callers have one endpoint; `thought_stats` remains for backward compatibility but the README points to `stats` as primary.

---

## Artifacts To Read First During `/plan`

1. `.github/planning/execplans/exec-plan-ST-022.md` (entity worker design — once written)
2. `.github/planning/execplans/exec-plan-ST-008.md` (consolidation worker design — once written)
3. `.github/planning/execplans/exec-plan-ST-005.md` (recall_events schema — once written)
4. `docs/design/adr/ADR-007-consolidation-pipeline.md` (consolidation pipeline + worker model)
5. `docs/design/adr/ADR-010-authentication.md` (existing auth middleware that wraps the new tool)
6. `server/index.ts` (existing `thought_stats` tool — surface consistency baseline)
7. `server/db/graph.sql` (existing `entity_extraction_queue` schema — queue depth query)

---

## Suggested Outcome For ST-028

Produce an ExecPlan that:

1. Adds structured JSON logging to both workers (one line per `run_started`/`item_processed`/`run_completed`/`run_failed` event).
2. Persists run-level state in a new `worker_runs` table with 30-day retention.
3. Exposes a `stats` MCP tool returning queue depths, recent-run summaries, recall counts, and content counts in a single response.
4. Documents the log schema and `stats` contract in `docs/runbooks/observability.md` (new) so future deployment work (ST-023) and downstream view clients (ST-019, ST-026) have a stable contract to integrate against.
