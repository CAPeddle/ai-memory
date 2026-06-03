# QP-039: Embedding Resilience

> Story: ST-039
> Status: Complete — ready for Phase 2
> Created: 2026-06-02
> Seed: QP-038 §4.5–§4.7 (Phase B: Embedding Resilience) — refined here into a story-specific packet

---

## PO Intent

Stop silently losing data when an embedding call fails. Today a captured thought
whose embedding API call fails keeps a `NULL` embedding **forever** and is invisible
to the vector search lane — with no record that anything went wrong and no path to
recovery. ST-039 makes failed embeddings durably recoverable and records which model
produced each embedding.

## Problem Statement

Current capture flow ([server/index.ts:281-284](../../../server/index.ts#L281-L284)):

```ts
// Fire-and-forget embedding update; log failure so misconfigured deployments surface the issue
getEmbedding(content).then((emb) =>
  sql`UPDATE thoughts SET embedding = ... WHERE id = ${insertResult.id}`
).catch((err) => console.error(`[capture_thought] embedding update failed ...`, err));
```

The `.catch` only logs to stderr. On any transient OpenRouter failure (network blip,
5xx, rate limit) the row is committed with `embedding = NULL` and **never retried**.
It will not appear in the vector lane of `search`/`search_thoughts`
([server/index.ts:75-76](../../../server/index.ts#L75-L76) — `WHERE ... embedding IS NOT NULL`).

The `thoughts` table ([server/db/schema.sql:13-46](../../../server/db/schema.sql#L13-L46))
has no column to mark a row as needing an embedding, no record of which model embedded
it, and no failure bookkeeping.

**Why this is 🔴 must-fix:** it is active, silent data loss in current single-user
dogfooding (ST-037). Every transient failure permanently degrades recall with no
operator signal.

## Scope (PO-confirmed 2026-06-02)

In scope: **AC-2** (failed embeddings recoverable via backfill) and **AC-17**
(embedding model recorded per thought) from QP-038, implemented via a **standalone
idempotent DDL file** — explicitly NOT the ST-042 migration runner, and NOT building
the ST-043 feature-flag framework.

## PO Decisions (from scoping 2026-06-02)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope boundary | AC-2 + AC-17 only, standalone DDL | Matches QP-038 Story→AC mapping (ST-B) and the board note. Decouples the highest-impact data-loss fix from migration-framework (ST-042) and feature-flag (ST-043) work so it ships independently. |
| Schema delivery | `server/db/002_needs_embedding.sql`, idempotent | No migration runner exists yet (ST-042 not done). Idempotent DDL (`ADD COLUMN IF NOT EXISTS`) is safe to apply to dev + test DBs now and harmless to re-apply if ST-042 later adopts it. Consistent with the "don't gate one feature on another's completion" preference. |
| Permanent-failure handling | Retry-count + error column | AC-2 requires failed embeddings stay *recoverable*. The QP's original "set `needs_embedding=false` on 4xx" contradicts that (row becomes invisible to the sweep). Keeping `needs_embedding=true` + an attempts cap means bad rows stop burning API calls but remain findable/recoverable. |
| Retry model | Sweep-as-retry: one attempt per sweep per row | Collapses the QP's two overlapping retry mechanisms (nested in-call exponential backoff *and* a cross-sweep counter) into one. The 60s sweep cadence **is** the retry interval. Simpler, no nested async timing, far easier to test deterministically. |
| Trigger | 60s interval timer + run-once on boot | Backfill is a *reconciliation sweep* ("find rows that should have an embedding but don't"), not a reaction to a DB event. There is no clean DB event for an OpenRouter API-call failure; a `NOTIFY`-on-`INSERT` trigger would race the inline fire-and-forget attempt and need extra `SKIP LOCKED` dedup. Polling mirrors the existing `entityWorker` ([server/src/entityWorker.ts:213-218](../../../server/src/entityWorker.ts#L213-L218)) and gets miss-recovery for free. |
| Backfill gating | Inline `Deno.env.get('FEATURE_EMBEDDING_BACKFILL') !== 'false'` (default ON) | Provides a kill-switch without depending on ST-043's `Config` framework. A single inline env read is self-contained; ST-043 can later fold it into the central flag system. |
| Test isolation | `EMBEDDING_BACKFILL_DISABLED=true` suppresses auto-start | Mirrors the existing `CONSOLIDATION_WORKER_DISABLED` pattern ([server/src/consolidationWorker.ts:336](../../../server/src/consolidationWorker.ts#L336)) so the auto-timer doesn't race explicit test-driven sweeps. |
| Manual-trigger surface | Exported `runBackfillSweep()` function; **no new MCP tool** | AC-2's test ("run backfill, confirm embedding populated") only needs an invokable sweep. The timer and the test both call the exported function. Avoids adding an agent-facing tool + auth surface for an internal-resilience story. |
| `embedding_model` value | Literal `openai/text-embedding-3-small` (the exact id sent to OpenRouter) | Source of truth is the model string passed to the API ([server/index.ts:37](../../../server/index.ts#L37)). Recording the bare name would not match the actual provider id. Reconciles AC-17's verification (see ACs below). |
| Attempts cap | `MAX_ATTEMPTS = 5` | Aligns with the existing `entityWorker` `MAX_ATTEMPTS` convention so failure semantics are consistent across workers. |
| Embed dependency injection | `runBackfillSweep({ embed }) ` accepts an injectable embed fn (default `getEmbedding`) | Lets tests stub success/failure without calling real OpenRouter — the only clean seam for deterministic AC-2 and failure-path tests. |

## Schema Delta — `server/db/002_needs_embedding.sql` (standalone, idempotent)

```sql
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS needs_embedding   boolean NOT NULL DEFAULT true;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS embedding_model   text;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS embedding_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS embedding_error   text;

-- Reconcile existing data (idempotent): rows that already have an embedding are done.
UPDATE public.thoughts SET needs_embedding = false WHERE embedding IS NOT NULL AND needs_embedding = true;

-- Rows with a NULL embedding from PAST silent failures keep needs_embedding = true,
-- so the first backfill sweep recovers already-lost data.

-- Partial index for the sweep query.
CREATE INDEX IF NOT EXISTS idx_thoughts_needs_embedding
  ON public.thoughts (needs_embedding) WHERE needs_embedding = true;
```

**Application path** (no migration runner yet):
- Fresh DBs: place where the Docker init entrypoint runs it after `schema.sql`.
- Existing dev + test DBs: apply manually via `docker compose exec db psql ...` and
  `docker compose --profile test exec db-test psql ...` (Phase 2 ExecPlan provides exact commands).

## Behavioural Design

**Capture flow** (modify [server/index.ts:272-284](../../../server/index.ts#L272-L284)):
1. INSERT keeps default `needs_embedding = true`.
2. Inline fire-and-forget attempt (unchanged fast path).
3. On success: `UPDATE ... SET embedding = ..., needs_embedding = false, embedding_model = 'openai/text-embedding-3-small'`.
4. On failure: leave `needs_embedding = true` (do not touch `embedding_attempts` — the
   inline attempt is best-effort; the sweep owns the counter). Backfill recovers it.

**Backfill sweep** (`server/src/embeddingBackfill.ts`, new):
1. `SELECT id, content FROM thoughts WHERE needs_embedding = true AND embedding_attempts < 5 ORDER BY created_at LIMIT 50`.
2. For each row, one embedding attempt via the injected `embed` fn.
3. On success: `UPDATE ... SET embedding = ..., needs_embedding = false, embedding_model = 'openai/text-embedding-3-small', embedding_error = NULL`.
4. On failure: `UPDATE ... SET embedding_attempts = embedding_attempts + 1, embedding_error = <message>` (leave `needs_embedding = true`). Rows reaching `embedding_attempts = 5` fall out of the sweep query automatically.
5. Started from `index.ts`: run once on boot (miss-recovery) + `setInterval` at
   `EMBEDDING_BACKFILL_INTERVAL_MS` (default 60000), guarded by the feature flag and
   `EMBEDDING_BACKFILL_DISABLED`.

**Recovery action** (operator): `UPDATE thoughts SET embedding_attempts = 0 WHERE id = ...`
re-admits an exhausted row to the next sweep. Documented in the ExecPlan.

## In Scope

1. `server/db/002_needs_embedding.sql` — the four columns + reconcile UPDATE + partial index.
2. `server/src/embeddingBackfill.ts` — exported `runBackfillSweep({ embed })` + `startEmbeddingBackfill()`.
3. `server/index.ts` — capture-flow update (success path sets the flag + model), `EMBEDDING_MODEL` constant, start the backfill worker.
4. `server/tests/embedding-backfill.test.ts` — TDD: recovery happy path, failure increments attempts, attempts cap stops the sweep, AC-17 model recorded.
5. DDL applied to dev + test databases.

## Out of Scope

- Migration framework (ST-042) — this story uses standalone DDL by design.
- Feature-flag framework / `Config` object (ST-043) — only a single inline env read here.
- A `backfill_embeddings` MCP tool — exported function only.
- Structured logging middleware (ST-044), metrics table (ST-048), deep health check (ST-053).
- Changing the embedding model, dimension, or the inline fire-and-forget fast path itself.

## Acceptance Criteria (proposed)

1. **AC-2** — A thought whose embedding failed (row with `needs_embedding = true`,
   `embedding IS NULL`) is populated after a backfill sweep runs. Verified by an
   integration test that inserts such a row, runs `runBackfillSweep` with a stub embed,
   and asserts `embedding IS NOT NULL` and `needs_embedding = false`.
2. **AC-2 (failure path)** — A row whose embed stub always fails accrues
   `embedding_attempts` up to 5 and is then skipped by the sweep query; `embedding_error`
   records the failure message. Verified by test.
3. **AC-17** — After a successful capture (or backfill), `SELECT embedding_model FROM
   thoughts WHERE id = $1` returns `openai/text-embedding-3-small`. (Note: reconciles
   QP-038 AC-17's bare-name wording to the actual provider id sent to OpenRouter.)
4. The DDL is idempotent: applying `002_needs_embedding.sql` twice produces no error and
   no duplicate columns/index.

## Dependencies

- Requires: Docker dev + test stacks (`docker compose --profile test up -d`), `.env` populated.
- Blocks: none. ST-053 (deep health check) later reads the embedding queue depth this story makes queryable.
- Independent of: ST-042, ST-043, ST-040, ST-041 (sibling QP-038 hardening stories).

## Estimated Complexity

Medium — one new module, one DDL file, a focused capture-flow change, and a test file.
No new agent-facing API surface.
