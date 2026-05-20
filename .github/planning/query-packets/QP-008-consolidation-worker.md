# QP-008 — Consolidation Worker (Shard → Wiki Promotion)

## Story

**ST-008** — Implement consolidation worker (shard → wiki promotion)

Board entry: [story-board.md (Backlog)](../story-board.md) (Phase 1 — Cloud MCP Intelligence)

## Summary

Build the Deno consolidation worker that drains `consolidation_queue` and promotes eligible shard thoughts to `memory_type='wiki'` rows. The worker is **event-driven via PostgreSQL LISTEN/NOTIFY** — triggers on both `thoughts` INSERT and `recall_events` INSERT fire a `pg_notify('consolidation_event', ...)`; the worker holds a LISTEN connection and processes queued candidates on each notification. The durable queue table remains the source of truth; notifications are wake signals.

The worker scores each candidate using the **ADR-007 three-factor formula** (frequency / diversity / relevance) and the **1:1 promotion model** (one shard → one wiki row, `supersedes = NULL`). Candidates scoring ≥0.7 are auto-promoted with LLM-normalised content; 0.5–0.69 are flagged in `consolidation_log` (no `thoughts` write); <0.5 are skipped.

A new `consolidate` MCP tool provides on-demand full-sweep and dry-run capability.

## Decisions

| # | Question | Decision | Source |
|---|---|---|---|
| 1 | Promotion model | 1:1 (one shard → one wiki row). N:1 cluster-based promotion deferred to ST-031 | PO Round 1 (2026-05-19) |
| 2 | `supersedes` on new wiki row | `NULL` — wiki is a "new emergent fact"; provenance traceable via `consolidation_log` joining `thought_id` (shard) and `wiki_id` | PO Round 2 (ADR-007 wins over board AC) |
| 3 | Relevance scoring fallback | Read `feedback_events` rows when present; fall back to `thoughts.confidence` (already in schema, 0–1) when no feedback exists. Code reads "use X if present, else use Y" — no branching on whether ST-029 has shipped | PO Round 1 |
| 4 | Trigger mechanism | LISTEN/NOTIFY: `pg_notify('consolidation_event', thought_id::text)` fired by triggers on (a) `thoughts` INSERT (existing trigger, modify the function) and (b) `recall_events` INSERT (new trigger). Worker holds LISTEN connection; durable queue table is the recovery source. MCP `consolidate` tool is the manual full-sweep fallback. No cron, no periodic timer | PO Round 3 |
| 5 | LLM normalisation scope | Every ≥0.5 candidate gets an OpenRouter call to produce normalised wiki content. Model: `openai/gpt-4o-mini` (matches entity worker). For 0.5–0.69 candidates, the normalised text is stored in `consolidation_log.score_breakdown` for review; no `thoughts` write. For ≥0.7 candidates, the normalised text is the new wiki row's `content` field | PO Round 2 + Round 3 |
| 6 | LLM failure handling | Fail-hard: mark queue entry `status='llm_error'`, set `retry_after = now() + interval '1 hour'`, retry on next wake. Promotion stalls until OpenRouter recovers | PO Round 3 |
| 7 | Eligibility | `memory_type='shard'`, `active=true`, ≥2 recall events, `content_fingerprint` not already in a wiki row | ADR-007 (PO locked Round 3) |
| 8 | Threshold bands | ≥0.7 auto-promote; 0.5–0.69 flag; <0.5 skip | ADR-007 (PO locked Round 3) |
| 9 | Frequency normalisation | Recall-event count, normalised 0–1 against current batch maximum | ADR-007 |
| 10 | Diversity normalisation | Distinct `project` values in recall events for this shard, normalised 0–1 against current batch maximum | ADR-007 |
| 11 | Dry-run mechanism | MCP `consolidate({dry_run:true})` parameter. Worker writes `consolidation_log` row with `dry_run=true`, skips the `thoughts` INSERT and shard UPDATE | ADR-007 |
| 12 | Worker startup | Mirror ST-022 entity worker pattern: started from `server/index.ts` on boot via `startConsolidationWorker()`. Drains queue once on startup (miss recovery), then begins LISTEN loop | ADR-007 + ST-022 precedent |

## In Scope

### Schema changes (server/db/schema.sql)

1. **Modify** `queue_for_consolidation()` trigger function to also call:
   ```
   PERFORM pg_notify('consolidation_event', NEW.id::text);
   ```
2. **New trigger** on `recall_events` AFTER INSERT:
   ```sql
   CREATE OR REPLACE FUNCTION public.notify_consolidation_on_recall()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   AS $$
   BEGIN
     INSERT INTO public.consolidation_queue (thought_id, status)
     VALUES (NEW.thought_id, 'pending')
     ON CONFLICT (thought_id) DO UPDATE SET
       status = 'pending',
       queued_at = now()
     WHERE consolidation_queue.status IN ('skipped', 'flagged');
     PERFORM pg_notify('consolidation_event', NEW.thought_id::text);
     RETURN NEW;
   END;
   $$;

   DROP TRIGGER IF EXISTS trg_notify_consolidation_on_recall ON public.recall_events;
   CREATE TRIGGER trg_notify_consolidation_on_recall
     AFTER INSERT ON public.recall_events
     FOR EACH ROW
     EXECUTE FUNCTION public.notify_consolidation_on_recall();
   ```
3. **`ALTER TABLE consolidation_queue ADD COLUMN IF NOT EXISTS retry_after timestamptz`** (matches the ST-022 precedent on `entity_extraction_queue`).

### `server/src/consolidationWorker.ts` (new)

Mirrors `server/src/entityWorker.ts` structure:

- `startConsolidationWorker(sql)` — exported function called from `server/index.ts` on boot.
- On startup:
  1. Drain pending queue once (miss recovery).
  2. Begin `LISTEN consolidation_event` on a dedicated connection.
  3. On each NOTIFY, process the referenced thought_id (also drains any other pending items).
- Per-candidate processing:
  1. `SELECT … FOR UPDATE SKIP LOCKED` the queue row.
  2. Check eligibility (memory_type/active/recall_count/content_fingerprint dedup).
  3. Compute three-factor score against the current batch's normalisation maxima.
  4. Branch on score band: skip / flag / promote.
  5. For score ≥ 0.5: call OpenRouter for normalised content. On failure → `status='llm_error'`, `retry_after = now() + interval '1 hour'`, return early.
  6. For ≥ 0.7: INSERT wiki thought, UPDATE shard `active=false`, INSERT `consolidation_log` (operation='promote').
  7. For 0.5–0.69: INSERT `consolidation_log` (operation='flag') with normalised content in `score_breakdown`. No `thoughts` write.
  8. For < 0.5: INSERT `consolidation_log` (operation='skip'). Mark queue entry `processed_at=now()`.
- Concurrency: one worker process; `FOR UPDATE SKIP LOCKED` makes future multi-worker safe.

### `server/index.ts` (modify)

- Register `consolidate` MCP tool with schema `{ dry_run?: boolean, limit?: number }` (default `limit=50`). Runs a full-sweep over all pending queue rows (up to `limit`). With `dry_run:true`, writes log rows with `dry_run=true` and skips all `thoughts` mutations.
- Wire `startConsolidationWorker(sql)` into the boot sequence next to `startEntityWorker(sql)`.

### `server/tests/consolidation-worker.test.ts` (new)

Integration tests (Deno test runner; same pattern as `server/tests/entity-worker.test.ts`):

1. **Promote happy path** — capture shard, seed ≥2 recall events spanning ≥2 projects, trigger consolidation, assert wiki row created (`memory_type='wiki'`, `supersedes IS NULL`, `source='auto-promoted'`), shard `active=false`, `consolidation_log` has operation='promote'.
2. **Flag band** — seed conditions producing 0.5 ≤ score < 0.7, assert no wiki row, `consolidation_log` has operation='flag' with normalised content in `score_breakdown`.
3. **Skip band** — score < 0.5, assert no writes to thoughts, `consolidation_log` has operation='skip'.
4. **Dry-run** — call `consolidate` MCP tool with `dry_run:true`, assert no `thoughts` mutations, all `consolidation_log` rows have `dry_run=true`.
5. **Dedup** — re-run on a shard whose `content_fingerprint` already exists in a wiki row; assert no second wiki created, `consolidation_log` has operation='skip' with breakdown noting dedup.
6. **Relevance fallback** — when `feedback_events` table absent or empty for a shard, scoring uses `thoughts.confidence`; assert produced score equals expected value.
7. **LLM failure → defer** — stub OpenRouter to fail; assert queue entry shows `status='llm_error'` with `retry_after` in the future; no wiki created.

### Test corpus (`server/tests/fixtures/consolidation-corpus.sql`)

Hand-crafted SQL seed file: ~12 shards spanning ≥2 projects, ~30 recall_events seeded with distributions that produce one promote-band candidate, one flag-band candidate, one skip-band candidate, one dedup case, and one LLM-failure case (controlled via env var or stub).

## Out of Scope

- **N:1 cluster-based consolidation** — Deferred to **ST-031** (new placeholder added to backlog). 1:1 is the v1 model.
- **Feedback API** (`report_feedback` MCP tool, `feedback_events` table) — owned by **ST-029** (already in backlog). ST-008 reads `feedback_events` rows when present and falls back to `thoughts.confidence` when not.
- **Cron / periodic scheduler** — Replaced by LISTEN/NOTIFY; no scheduled re-sweep in v1.
- **Worker observability** (structured logs to `worker_runs` table, `stats` MCP tool) — Owned by **ST-028**.
- **Manual approval UI for flagged 0.5–0.69 candidates** — `consolidation_log` records them; UI is downstream.
- **Tuning weights/thresholds via environment variable** — Locked to ADR-007 defaults for v1; tuning belongs to a future story once we have baseline data.
- **Retroactive consolidation of pre-existing shards** — Worker processes whatever ends up in the queue from triggers. If we need a one-time scan of old shards, that's a separate story.

## Risks

| Risk | Mitigation |
|---|---|
| LISTEN connection drops silently → notifications missed | Durable `consolidation_queue` table is the recovery source; worker drains the queue on startup. On reconnect, drains again. Worst case: stalled candidates are processed once the worker next wakes. The MCP `consolidate` tool provides operator escape-hatch. |
| OpenRouter outage stalls promotion entirely | `retry_after` defers candidates 1h; queue grows but is bounded. ST-028's worker observability story will expose this via `stats`. Acceptable for v1 given OpenRouter SLA. |
| Frequency/diversity batch-relative normalisation produces unstable scores between batches | Documented limitation. ADR-007 acknowledges this. v1 deliberately keeps the formula heuristic; tuning deferred. |
| The new recall-events trigger creates queue churn (every recall enqueues) | `ON CONFLICT (thought_id) DO UPDATE … WHERE status IN ('skipped', 'flagged')` keeps already-pending rows untouched and only re-opens previously-rejected candidates whose maturity may have changed. PROMOTED shards have `active=false` so their re-triggering on a stale recall is a no-op when the worker filters `active=true`. |
| Wiki content quality depends on `openai/gpt-4o-mini` prompt — bad prompts produce bad wikis | Prompt embedded in ExecPlan §3 (executor cannot drift). Future prompt tuning is a separate story. |

## Acceptance Criteria

Phrased as observable behaviour:

1. After capturing a shard and inserting ≥2 recall_events across ≥2 projects with conditions producing a score ≥0.7, a new `thoughts` row exists with `memory_type='wiki'`, `supersedes IS NULL`, `source='auto-promoted'`, `confidence` equal to the score; the original shard has `active=false`; `consolidation_log` has a corresponding row with `operation='promote'`.
2. After producing a 0.5 ≤ score < 0.7 case, no wiki row exists; `consolidation_log` has `operation='flag'` with normalised content in `score_breakdown`.
3. After producing a score < 0.5 case, no wiki row exists; `consolidation_log` has `operation='skip'`.
4. After calling the `consolidate` MCP tool with `{dry_run:true}`, all matching `consolidation_log` rows carry `dry_run=true`, and no `thoughts` mutations occur.
5. After re-running consolidation on a shard whose `content_fingerprint` is already in a wiki row, no second wiki is created and `consolidation_log` has `operation='skip'` with a deduplication note in `score_breakdown`.
6. After running on a shard with zero `feedback_events` rows, the relevance factor uses `thoughts.confidence` and the score equals the value predicted from the formula with that substitution.
7. After OpenRouter is unavailable (stubbed failure), the queue entry shows `status='llm_error'` with `retry_after` ≥ `now() + 59 minutes`; no wiki row created; on the next wake with OpenRouter recovered, the candidate promotes successfully.
8. After `docker compose up -d` and `deno test --allow-net --allow-env --allow-read` from `server/`, all 7+ tests pass.
9. The MCP server boot sequence in `server/index.ts` calls `startConsolidationWorker(sql)` alongside `startEntityWorker(sql)`.

## Open Questions for PO

None. All scoping decisions captured in Decisions table.
