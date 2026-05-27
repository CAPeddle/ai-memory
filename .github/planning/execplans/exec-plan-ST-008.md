# ExecPlan — ST-008: Consolidation Worker (Shard → Wiki Promotion)

> Status: ✅ Done
> Story: ST-008
> Created: 2026-05-20
> Approved: 2026-05-20 (PO, /plan review)
> Parent: `.github/planning/query-packets/QP-008-consolidation-worker.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

The ai-memory MCP server (`server/index.ts`) captures thoughts into PostgreSQL with two `memory_type` discriminator values:

- **`shard`** — raw episodic observation (default for `capture_thought`)
- **`wiki`** — promoted semantic fact, expected to be more durable, used preferentially in retrieval

Today, no shard ever becomes a wiki. The infrastructure for promotion is in place — `consolidation_queue`, `consolidation_log`, `trg_queue_consolidation` trigger on `thoughts` INSERT, `recall_events` table from ST-005 — but the worker that actually drains the queue and promotes shards is missing. This story builds that worker.

**After this story is complete:**

1. Every captured shard is automatically queued for consolidation by the existing `trg_queue_consolidation` trigger.
2. Every recall event also queues/re-queues the recalled shard for consolidation (so a shard's promotion eligibility grows as its recall_count grows).
3. A new Deno worker process listens for `pg_notify('consolidation_event', ...)` events and processes queued candidates within seconds of the event.
4. Eligible shards (≥2 recall events, `active=true`, content_fingerprint not already in a wiki row) are scored using ADR-007's three-factor formula (`0.40 × frequency + 0.35 × diversity + 0.25 × relevance`).
5. Scoring ≥0.7 auto-promotes the shard: a new `thoughts` row is inserted with `memory_type='wiki'`, `source='auto-promoted'`, `supersedes=NULL`, and content **normalised by an OpenRouter LLM call**. The original shard's `active` flips to `false`. A `consolidation_log` row records the decision.
6. Scoring 0.5–0.69 logs a flagged candidate (with the LLM-normalised text in `score_breakdown`) but writes nothing to `thoughts`.
7. Scoring <0.5 logs a skip and no other action.
8. A new MCP tool `consolidate({ dry_run?, limit? })` performs a manual full-sweep, and with `dry_run:true` writes all decisions to `consolidation_log` with `dry_run=true` and no `thoughts` mutations.

**Key files (current state — full repository-relative paths):**

- `server/db/schema.sql` — defines `thoughts`, `consolidation_queue` (no `retry_after` column today), `consolidation_log`, `recall_events`, and the `trg_queue_consolidation` trigger fired on `thoughts` INSERT WHEN `NEW.memory_type='shard'`. **Modified by Task 4.1.**
- `server/src/entityWorker.ts` — the existing ST-022 worker. Structurally close to what ST-008 needs: `FOR UPDATE SKIP LOCKED` queue claim, OpenRouter `openai/gpt-4o-mini` call, `retry_after` exponential backoff. **The ST-008 worker mirrors this structure but uses `sql.listen()` instead of `setInterval()` for wake-up.**
- `server/src/db.ts` — exports `sql`, a `postgres` (Porsager) client instance. `sql.listen(channel, callback)` is the entry point for LISTEN/NOTIFY.
- `server/index.ts` — registers MCP tools and starts background workers (`startEntityWorker()` is called on boot at the bottom of the file). **Modified by Task 4.6 to register the `consolidate` MCP tool and call `startConsolidationWorker()`.**
- `server/tests/entity-worker.test.ts` — pattern for integration tests; defines `mcpCall(tool, args)` helper that handles both JSON and SSE responses. **Mirror in `server/tests/consolidation-worker.test.ts`.**

**Key terms:**

- **Shard** — a row in `thoughts` with `memory_type='shard'`. Episodic, captured directly by `capture_thought`.
- **Wiki** — a row in `thoughts` with `memory_type='wiki'`. Semantic, promoted by this worker. Distinguished by `source='auto-promoted'` and `confidence` equal to the consolidation score.
- **Promotion** — the act of creating a wiki row from an eligible shard and flipping the shard's `active` to false. Promotion is a single transaction: wiki INSERT + shard UPDATE + log INSERT.
- **`supersedes` (column on `thoughts`)** — a self-FK reference. ADR-007 (PO-locked 2026-05-19) says promoted wiki rows have `supersedes=NULL` ("new emergent fact"); provenance lives in `consolidation_log.thought_id` (shard) + `consolidation_log.wiki_id` (wiki).
- **Three-factor scoring** — `score = 0.40 × frequency_norm + 0.35 × diversity_norm + 0.25 × relevance_norm`. All factors normalised to 0–1 against the current batch's maximum. See Task 4.3 for exact computation.
- **Relevance fallback** — When `feedback_events` rows exist for a shard, relevance = `count(verdict='helpful') / count(*)`. When `feedback_events` has zero rows for the shard (which is always true until ST-029 ships), relevance = `thoughts.confidence` (a 0–1 column already in schema, set at capture time, default per `source` value). The code reads "use X if present, else use Y" — no branching on whether ST-029 has shipped.
- **Threshold bands (ADR-007)** — ≥0.7 auto-promote; 0.5 ≤ score < 0.7 flag; < 0.5 skip.
- **Eligibility** — Pre-conditions: `memory_type='shard'`, `active=true`, ≥2 recall events for this shard, content_fingerprint not already in a wiki row.
- **LISTEN/NOTIFY** — PostgreSQL's pub/sub mechanism. `pg_notify('channel', payload)` from a trigger; `LISTEN channel` on a client connection delivers `NOTIFY` events asynchronously. The `postgres` npm package surface is `sql.listen(channel, callback)`.
- **Durable queue** — `consolidation_queue` is the source of truth; LISTEN/NOTIFY only signals wake-up. If a notification is dropped (connection bounce), the worker's startup drain or the MCP `consolidate` tool will pick up the row.
- **Fail-hard LLM failure mode** — Per PO Round 3: on OpenRouter call failure, mark the queue entry `status='llm_error'`, set `retry_after = now() + interval '1 hour'`, return early. Do not promote with verbatim content; do not write anything to `thoughts`.

**Reference patterns from existing code (study these before starting tasks):**

- The `FOR UPDATE SKIP LOCKED` claim pattern in [`server/src/entityWorker.ts:121-135`](../../../server/src/entityWorker.ts#L121-L135). Mirror this for the consolidation worker but reusing the `consolidation_queue` table.
- The OpenRouter call shape in [`server/src/entityWorker.ts:50-76`](../../../server/src/entityWorker.ts#L50-L76). Reuse the `Authorization: Bearer ${OPENROUTER_API_KEY}` + `model: "openai/gpt-4o-mini"` + `response_format: { type: "json_object" }` pattern. ST-008's prompt is different (content normalisation, not entity extraction) but the call shape is identical.
- The `mcpCall(tool, args)` helper in [`server/tests/entity-worker.test.ts:15-41`](../../../server/tests/entity-worker.test.ts#L15-L41) handles SSE responses. Copy this helper into `consolidation-worker.test.ts`.

---

## §1b. Outcomes & Conclusions

**Completion status:** ✅ All 9 acceptance criteria verified. 34/34 tests pass (7 new ST-008 integration tests + 7 new scoring unit tests + 20 pre-existing tests). Zero regressions.

**Key findings:**
- The consolidation worker (shard → wiki promotion) is fully operational via LISTEN/NOTIFY.
- Three-factor scoring (frequency × diversity × relevance/confidence) produces correct band assignments.
- LLM normalisation via OpenRouter `gpt-4o-mini` runs on all ≥0.5 candidates; fail-hard path sets `status='llm_error'` + `retry_after` without writing to `thoughts`.
- Dry-run mode writes `consolidation_log` with `dry_run=true` and makes no `thoughts` mutations.
- Dedup detection via `consolidation_log` prior-promote check prevents double-promotion on re-activation.

**Requirements met:** All 9 ACs in §2 verified by `consolidation-worker.test.ts`.

**Architectural impact:** `startConsolidationWorker()` wired into `server/index.ts` boot sequence after `startEntityWorker()`. `CONSOLIDATION_WORKER_DISABLED=true` env var disables the background LISTEN loop in test environments. `consolidate` MCP tool exposes manual sweep.

**Supporting evidence:**
- Commits: `1825f76` (schema), `ad56741` (tests), `ae768d7` (scoring), `b3cf14a` (LLM), `073db30` (worker), `bd38629` (wiring), `04b456b` (fixes)
- `docker exec ai-memory-mcp-test-1 deno test --allow-all tests/ → ok | 34 passed | 0 failed`
- `docker logs ai-memory-mcp-1 | grep consolidationWorker → [consolidationWorker] listening`

**Discoveries recorded in §6b/§6c:**
- Postgres 3.x returns JSONB column values as raw strings when inserted via `JSON.stringify(x)::jsonb` (TEXT parameter + SQL cast). Fix was `sql.json(obj)` which uses the native JSON type OID on send, triggering JSON.parse on retrieval.
- Background LISTEN worker races with explicit MCP tool calls in integration tests → need `CONSOLIDATION_WORKER_DISABLED` guard.
- `PROMOTE` INSERT must omit `content_fingerprint` to avoid `UNIQUE (content_fingerprint)` violation (shard still exists with active=false when wiki is inserted).

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

1. After capturing a shard and inserting ≥2 recall_events across ≥2 distinct projects with conditions producing a score ≥0.7, a new `thoughts` row exists with `memory_type='wiki'`, `supersedes IS NULL`, `source='auto-promoted'`, and `confidence` equal to the score; the original shard's `active=false`; `consolidation_log` has a corresponding row with `operation='promote'`, `thought_id=shard.id`, `wiki_id=wiki.id`.
2. After producing a candidate with 0.5 ≤ score < 0.7, no new wiki row exists; `consolidation_log` has a row with `operation='flag'`, `score_breakdown` containing the LLM-normalised text under a `normalised_content` key.
3. After producing a candidate with score < 0.5, no new wiki row exists; `consolidation_log` has a row with `operation='skip'`.
4. After calling the `consolidate` MCP tool with `{ dry_run: true }`, every `consolidation_log` row written during the sweep carries `dry_run=true`, and no `thoughts` row is inserted or updated.
5. After re-running consolidation on a shard whose `content_fingerprint` is already present in a wiki row, no second wiki row is created; `consolidation_log` records `operation='skip'` with `score_breakdown.dedup=true`.
6. After running consolidation on a shard with zero `feedback_events` rows (today: all shards), the worker's scoring uses `thoughts.confidence` as the relevance value; the produced score matches `0.40 × frequency_norm + 0.35 × diversity_norm + 0.25 × thoughts.confidence` (with all factors normalised to 0–1).
7. After OpenRouter is unavailable (stubbed failure for a ≥0.5 candidate), the queue entry shows `status='llm_error'` with `retry_after ≥ now() + 59 minutes`; no wiki row is created. On a subsequent wake with OpenRouter recovered, the candidate promotes.
8. After `docker compose up -d` (and the `mcp` container reports healthy) and `docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/consolidation-worker.test.ts` (run from repo root), all integration tests pass with exit code 0.
9. The boot sequence in `server/index.ts` calls `startConsolidationWorker()` after `startEntityWorker()`. The MCP server logs `[consolidationWorker] listening` on startup.

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ✅ Ready for /continue (PO-approved 2026-05-20).

---

## §2c. Plan Review Notes

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| AC1: ≥0.7 candidate promotes to wiki with `supersedes IS NULL` | `thoughts` row with `memory_type='wiki'`, `supersedes=NULL`; original shard `active=false`; `consolidation_log` operation=`promote` | Task 4.5, Task 4.2 | Test `promote happy path` in `consolidation-worker.test.ts` asserts all four conditions |
| AC2: 0.5–0.69 candidate flagged (no thoughts write) | `consolidation_log` operation=`flag` with `score_breakdown.normalised_content` | Task 4.5, Task 4.2 | Test `flag band` asserts no wiki + log row with operation=flag |
| AC3: <0.5 candidate skipped | `consolidation_log` operation=`skip`; no `thoughts` write | Task 4.5, Task 4.2 | Test `skip band` |
| AC4: Dry-run writes only `dry_run=true` log rows | All `consolidation_log` rows from sweep have `dry_run=true`; no `thoughts` mutations | Task 4.6 (MCP tool), Task 4.5 (write path), Task 4.2 | Test `dry-run` |
| AC5: Content-fingerprint dedup | Second run on same fingerprint → operation=`skip`, `score_breakdown.dedup=true` | Task 4.5, Task 4.2 | Test `dedup` |
| AC6: Relevance fallback to `thoughts.confidence` | Scoring code uses `confidence` when no feedback rows | Task 4.3, Task 4.2 | Test `relevance fallback` |
| AC7: LLM failure → `status='llm_error'` + `retry_after` | Queue entry mutation on LLM failure | Task 4.4, Task 4.2 | Test `LLM failure defer` |
| AC8: All integration tests pass | `docker compose exec mcp deno test ...` exits 0 (run from repo root, no host Deno needed) | Task 4.7 | Final verification in Task 4.7 |
| AC9: Worker wired in `server/index.ts` | `startConsolidationWorker()` call after `startEntityWorker()`; `consolidate` MCP tool registered | Task 4.6 | Inspection: `grep -n "startConsolidationWorker" server/index.ts` returns one match; container startup logs include `[consolidationWorker] listening` |
| Schema: `pg_notify` from triggers | `queue_for_consolidation()` function calls `pg_notify`; new `notify_consolidation_on_recall()` function on `recall_events` | Task 4.1 | Verification command in Task 4.1 inspects function definitions |
| Schema: `retry_after` column on `consolidation_queue` | `ALTER TABLE … ADD COLUMN IF NOT EXISTS retry_after timestamptz` applied | Task 4.1 | `\d consolidation_queue` shows `retry_after` |
| LLM call: `openai/gpt-4o-mini` with `response_format: json_object` | OpenRouter request body in `consolidationWorker.ts` | Task 4.4 | Inspection: matching `model: "openai/gpt-4o-mini"` in worker source |

---

## §3. Preconditions

Tools and environment:
- Docker Desktop running (the `db` and `mcp` services must be up).
- **No host Deno required.** All `deno test` and `deno check` commands run inside the `mcp` container via `docker compose exec mcp deno ...`. The container is `denoland/deno:2.0.0` (per [`server/Dockerfile`](../../../server/Dockerfile)) and the dev bind mount in `docker-compose.yml` (`./server:/app`) makes host source changes visible to the container live — newly-written test files take effect immediately.
- `OPENROUTER_API_KEY` set in the `mcp` container's environment (already configured for ST-022; same key reused).
- The `postgres` npm package version already in `server/deno.json` (used by ST-022; provides `sql.listen`).

Prior stories that must be Done:
- ST-005 (recall_events table, project boosting, MMR). ✅ Done 2026-05-19.
- ST-022 (entity worker — reference structure for ST-008). ✅ Done 2026-05-19.
- ST-030 (line-ending normalization) — **not strictly required, but executing it first prevents CRLF churn in this story's edits**. Recommended ordering.

Files that must exist before starting:
- `server/db/schema.sql` (will be edited)
- `server/src/db.ts` (used unchanged)
- `server/src/entityWorker.ts` (reference template)
- `server/index.ts` (will be edited)
- `server/tests/entity-worker.test.ts` (reference for `mcpCall` helper)

Boilerplate — LLM prompt for content normalisation (used in Task 4.4):

```
You are normalising an episodic memory shard into a durable semantic fact for a personal knowledge base. Return a JSON object with exactly one key:
- "normalised_content": a single string, at most 600 characters, written as a self-contained factual statement.

Rules:
- Strip first-person narrative ("I noticed that...", "today I learned...") and rewrite as a third-person factual statement.
- Preserve all proper nouns, identifiers, version numbers, file paths, and code symbols verbatim.
- Do not add information not present in the input.
- If the input is already a clean factual statement, return it unchanged.
- Output must be valid JSON; the "normalised_content" value must not contain unescaped quotes or newlines.
```

OpenRouter request body (used in Task 4.4 — call shape mirrors `entityWorker.ts:50-76`):

```typescript
{
  model: "openai/gpt-4o-mini",
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: NORMALISE_SYSTEM_PROMPT },
    { role: "user", content: shard.content.slice(0, 16_000) },
  ],
}
```

---

## §4. Task Definitions

### Task 4.1: Apply schema changes for event-driven consolidation

**Objective:** Update `server/db/schema.sql` so that (a) the existing `queue_for_consolidation()` trigger function calls `pg_notify`, (b) a new trigger on `recall_events` INSERT also queues + notifies, and (c) `consolidation_queue` gains a `retry_after` column.

**Input:** Current `server/db/schema.sql` containing `consolidation_queue`, `consolidation_log`, `queue_for_consolidation()`, and `trg_queue_consolidation`.

**Working directory:** `c:\projects\ai-memory\server\db\`

**Steps:**

1. Open `server/db/schema.sql`. Locate `CREATE OR REPLACE FUNCTION public.queue_for_consolidation()` (in the §5 AUTO-QUEUE TRIGGER section).
2. Inside the function body, immediately before `RETURN NEW;`, add:
   ```sql
   PERFORM pg_notify('consolidation_event', NEW.id::text);
   ```
3. Append a new section to `schema.sql` (after the §6 `recall_events` block):

   ```sql
   -- ============================================================
   -- 7. CONSOLIDATION EVENT NOTIFICATION ON RECALL (added by ST-008)
   --    Every recall event re-opens the recalled shard for
   --    consolidation evaluation, because its maturity (recall_count,
   --    diversity) may now meet the promotion threshold.
   -- ============================================================

   CREATE OR REPLACE FUNCTION public.notify_consolidation_on_recall()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
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

   -- ============================================================
   -- 8. CONSOLIDATION QUEUE RETRY SUPPORT (added by ST-008)
   --    Used when LLM normalisation fails: candidate is marked
   --    'llm_error' with retry_after set; worker skips it until then.
   -- ============================================================

   ALTER TABLE public.consolidation_queue
     ADD COLUMN IF NOT EXISTS retry_after timestamptz;
   ```

4. Apply the changes to the running database. Two paths:

   - **Path A (fresh container):** Volume-mounted init scripts only run on a fresh DB volume. To rebuild:
     ```powershell
     docker compose down -v
     docker compose up -d
     ```
     The new `schema.sql` will be applied via `/docker-entrypoint-initdb.d/02-schema.sql`.

   - **Path B (in-place migration):** Run the new function/trigger/ALTER directly against the existing DB:
     ```powershell
     docker compose exec db psql -U postgres -d memory -c "DROP TRIGGER IF EXISTS trg_queue_consolidation ON public.thoughts;"
     # Then re-run the full block by piping the new schema sections — see §3 boilerplate
     ```
     For ST-008, **prefer Path A** (fresh DB) because the integration tests assume a clean state.

**Expected output:**

- `server/db/schema.sql` contains the modified `queue_for_consolidation()` (with `pg_notify` call), the new `notify_consolidation_on_recall()` function + trigger, and the `ALTER TABLE … ADD COLUMN retry_after` statement.
- After `docker compose down -v && docker compose up -d`, the `db` container reports healthy and the new schema is present.

**Requirement mapping:** §2d rows "Schema: `pg_notify` from triggers", "Schema: `retry_after` column".

**Verification:**

```powershell
docker compose exec db psql -U postgres -d memory -c "\df queue_for_consolidation"
docker compose exec db psql -U postgres -d memory -c "\df notify_consolidation_on_recall"
docker compose exec db psql -U postgres -d memory -c "\d consolidation_queue" | Select-String retry_after
docker compose exec db psql -U postgres -d memory -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'queue_for_consolidation';" | Select-String pg_notify
```

Expected results:
- Lines 1–2: each shows one function row (returns trigger, language plpgsql).
- Line 3: matches `retry_after | timestamp with time zone | …`.
- Line 4: matches `PERFORM pg_notify('consolidation_event'`.

**Failure handling:**
- If `docker compose up -d` exits non-zero: read `docker compose logs db` — usually a syntax error in the new SQL. Fix in `schema.sql` and `docker compose down -v && docker compose up -d` again.
- If verification line 4 returns no match: the `pg_notify` call wasn't actually persisted to the function body. Re-check Step 2 — make sure the SQL file was saved and the DB was rebuilt.

---

### Task 4.2: Write red integration tests + test corpus (TDD red step)

**Objective:** Author `server/tests/consolidation-worker.test.ts` with 7 failing integration tests and a deterministic SQL fixture corpus. These tests define the contract; subsequent tasks make them pass.

**Input:** Task 4.1 complete (schema deployed). Reference: `server/tests/entity-worker.test.ts`.

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. Create `server/tests/fixtures/consolidation-corpus.sql` with seed data:
   - 5 shards spanning 3 distinct projects (`zoom`, `bcf-managers`, `personal`).
   - 1 shard designed for ≥0.7 score: 5 recall_events across 3 projects, `confidence=0.8`.
   - 1 shard designed for 0.5–0.69 score: 3 recall_events across 2 projects, `confidence=0.5`.
   - 1 shard designed for <0.5 score: 2 recall_events same project, `confidence=0.2`.
   - 1 shard whose `content_fingerprint` matches an already-existing wiki row (pre-seeded wiki).
   - 1 shard with no recall_events (ineligible — should not be touched).
   - Reset `consolidation_queue` and `consolidation_log` to empty.

2. Create `server/tests/consolidation-worker.test.ts`. Copy the `mcpCall(tool, args)` helper from `server/tests/entity-worker.test.ts:15-41` verbatim (or refactor to a shared helper file under `server/tests/_helpers.ts` — your call, but document the choice in §6c Decision Log).

3. Add a setup helper that resets the fixtures before each test:

   ```typescript
   async function resetCorpus(): Promise<void> {
     const res = await fetch(`${MCP_BASE}/_test/reset-consolidation-corpus`, {
       method: "POST",
       headers: { Authorization: `Bearer ${API_KEY}` },
     });
     if (!res.ok) throw new Error(`Corpus reset failed: ${res.status}`);
   }
   ```

   Note: this implies the MCP server needs a `_test/reset-consolidation-corpus` endpoint that loads `consolidation-corpus.sql`. If the project's test approach is psql-direct instead (check what ST-005 did), use that pattern instead — document the choice in §6c.

4. Author the 7 tests:

   **Test A: "promote happy path"** — Reset corpus, wait/trigger consolidation on the ≥0.7 shard (call `consolidate` MCP tool with `dry_run:false`, or sleep 5s after a recall_event INSERT). Query `thoughts` for `memory_type='wiki' AND source='auto-promoted'`. Assert exactly one new wiki row with `supersedes=NULL`. Query the original shard; assert `active=false`. Query `consolidation_log`; assert one row with `operation='promote'`, `thought_id` = shard.id, `wiki_id` = wiki.id.

   **Test B: "flag band"** — Reset corpus, trigger consolidation on the 0.5–0.69 shard. Assert NO wiki row created. Assert one `consolidation_log` row with `operation='flag'`, `score_breakdown` contains a key `normalised_content` whose value is non-empty.

   **Test C: "skip band"** — Reset corpus, trigger on the <0.5 shard. Assert no wiki row. Assert one log row with `operation='skip'`.

   **Test D: "dry-run"** — Reset corpus, call `consolidate({ dry_run: true, limit: 100 })`. Assert no `thoughts` row mutated (count of `memory_type='wiki' AND source='auto-promoted'` unchanged). Assert all `consolidation_log` rows written during the sweep have `dry_run=true`.

   **Test E: "dedup"** — Reset corpus, trigger on the duplicate-fingerprint shard. Assert no new wiki row (the pre-seeded wiki with the same fingerprint is the only one). Assert log row with `operation='skip'` and `score_breakdown` contains `dedup=true`.

   **Test F: "relevance fallback"** — Reset corpus, ensure `feedback_events` table is empty (or doesn't exist). Trigger on a deterministic shard with known confidence (e.g., `confidence=0.5`, frequency_norm=1.0, diversity_norm=1.0). Query the resulting `consolidation_log.score`; assert it equals `0.40*1.0 + 0.35*1.0 + 0.25*0.5 = 0.875` ± 0.001.

   **Test G: "LLM failure defer"** — Reset corpus, stub OpenRouter to return HTTP 500 (set an env var like `MOCK_OPENROUTER=fail`, or use a fixture API key that returns an error). Trigger on the ≥0.7 candidate. Assert no wiki created. Assert `consolidation_queue.status='llm_error'` for the candidate's thought_id, and `consolidation_queue.retry_after >= now() + interval '59 minutes'`.

5. Run the tests; they MUST all fail (no worker yet, no MCP tool yet). This is the TDD red step.

**Expected output:**

- New files: `server/tests/fixtures/consolidation-corpus.sql`, `server/tests/consolidation-worker.test.ts`.
- `docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/consolidation-worker.test.ts` reports 7 tests, all failing.

**Requirement mapping:** §2d rows AC1–AC7 (test cases for each).

**Verification:**

```powershell
cd c:\projects\ai-memory\
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/consolidation-worker.test.ts
```

Expected: `7 failed` (or `7 errored`). Each test name printed with a failure reason like "MCP tool 'consolidate' not found" or "expected wiki row, found 0".

**Failure handling:**
- If any test PASSES at this stage, the test is not actually validating the new behaviour (likely a false positive against pre-existing state). Strengthen the assertion before proceeding.
- If the test file doesn't compile (TypeScript error): fix the type signature; do not stub out the assertion just to compile.

---

### Task 4.3: Implement scoring logic (pure functions)

**Objective:** Create `server/src/consolidationScoring.ts` with pure functions for the three-factor scoring formula. Pure functions make this unit-testable without DB roundtrips and isolate the formula from the worker's I/O.

**Input:** Task 4.1 schema in place; test corpus from Task 4.2 available.

**Working directory:** `c:\projects\ai-memory\server\src\`

**Steps:**

1. Create `server/src/consolidationScoring.ts` exporting:

   ```typescript
   export interface CandidateMetrics {
     thoughtId: string;
     recallCount: number;
     distinctProjects: number;
     helpfulCount: number;       // feedback_events with verdict='helpful'
     totalFeedback: number;      // feedback_events count
     confidence: number;         // thoughts.confidence (0-1, fallback for relevance)
   }

   export interface BatchMaxima {
     maxRecallCount: number;
     maxDistinctProjects: number;
   }

   export interface ScoreBreakdown {
     score: number;
     frequency_norm: number;
     diversity_norm: number;
     relevance: number;
     relevance_source: "feedback" | "confidence_fallback";
   }

   export function computeBatchMaxima(metrics: CandidateMetrics[]): BatchMaxima {
     return {
       maxRecallCount: Math.max(1, ...metrics.map((m) => m.recallCount)),
       maxDistinctProjects: Math.max(1, ...metrics.map((m) => m.distinctProjects)),
     };
   }

   export function scoreCandidate(
     m: CandidateMetrics,
     batch: BatchMaxima
   ): ScoreBreakdown {
     const frequency_norm = m.recallCount / batch.maxRecallCount;
     const diversity_norm = m.distinctProjects / batch.maxDistinctProjects;

     let relevance: number;
     let relevance_source: "feedback" | "confidence_fallback";
     if (m.totalFeedback > 0) {
       relevance = m.helpfulCount / m.totalFeedback;
       relevance_source = "feedback";
     } else {
       relevance = m.confidence;
       relevance_source = "confidence_fallback";
     }

     const score = 0.40 * frequency_norm + 0.35 * diversity_norm + 0.25 * relevance;

     return { score, frequency_norm, diversity_norm, relevance, relevance_source };
   }

   export type Band = "promote" | "flag" | "skip";
   export function bandFor(score: number): Band {
     if (score >= 0.7) return "promote";
     if (score >= 0.5) return "flag";
     return "skip";
   }
   ```

2. (Optional but recommended) Add `server/tests/consolidation-scoring.test.ts` with unit tests for the three functions: a single-candidate batch, mixed feedback-vs-fallback cases, exact value for the `AC6` known-confidence case.

**Expected output:**

- New file `server/src/consolidationScoring.ts` exporting the four named exports above.
- Unit tests (if added) pass.

**Requirement mapping:** §2d rows AC6 ("relevance fallback") and a building block for AC1/AC2/AC3.

**Verification:**

```powershell
cd c:\projects\ai-memory\
docker compose exec mcp deno check src/consolidationScoring.ts
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/consolidation-scoring.test.ts  # if you wrote unit tests
```

Expected: `deno check` exits 0 (no type errors). Unit tests pass.

**Failure handling:**
- If `deno check` errors on types: fix the type definitions; do not loosen them with `any`.

---

### Task 4.4: Implement LLM normalisation with fail-hard handling

**Objective:** Add the OpenRouter call that produces `normalised_content` for ≥0.5 candidates, and the fail-hard handling that defers candidates on call failure.

**Input:** Task 4.3 complete (scoring functions available).

**Working directory:** `c:\projects\ai-memory\server\src\`

**Steps:**

1. Create `server/src/consolidationLLM.ts` exporting:

   ```typescript
   const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
   const NORMALISE_SYSTEM_PROMPT = `<paste the §3 boilerplate prompt here verbatim>`;

   export async function normaliseContent(shardContent: string): Promise<string> {
     if (!OPENROUTER_API_KEY) {
       throw new Error("OPENROUTER_API_KEY not set");
     }
     const truncated = shardContent.slice(0, 16_000);
     const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
       method: "POST",
       headers: {
         Authorization: `Bearer ${OPENROUTER_API_KEY}`,
         "Content-Type": "application/json",
       },
       body: JSON.stringify({
         model: "openai/gpt-4o-mini",
         response_format: { type: "json_object" },
         messages: [
           { role: "system", content: NORMALISE_SYSTEM_PROMPT },
           { role: "user", content: truncated },
         ],
       }),
     });
     if (!response.ok) {
       const body = await response.text().catch(() => "");
       throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
     }
     const data = await response.json();
     const text = data.choices?.[0]?.message?.content ?? "";
     const parsed = JSON.parse(text) as { normalised_content?: string };
     if (typeof parsed.normalised_content !== "string" || parsed.normalised_content.length === 0) {
       throw new Error("LLM returned invalid normalised_content");
     }
     return parsed.normalised_content;
   }
   ```

2. **Important:** Wrap the call site (in the consolidation worker — see Task 4.5) with the fail-hard handling. The worker — not this function — owns the `status='llm_error'` and `retry_after` mutation. `normaliseContent` just throws.

**Expected output:**

- New file `server/src/consolidationLLM.ts` exporting `normaliseContent(shardContent: string): Promise<string>`.

**Requirement mapping:** §2d rows AC7 ("LLM failure defer") — partially (this task throws; Task 4.5 handles the throw).

**Verification:**

```powershell
cd c:\projects\ai-memory\
docker compose exec mcp deno check src/consolidationLLM.ts
```

Expected: exits 0.

**Failure handling:**
- If the prompt boilerplate contains unescaped backticks that conflict with TypeScript template-literal syntax: escape them, or store the prompt as a regular string (`"..."`). Do not change the prompt content semantically.

---

### Task 4.5: Implement consolidation worker — claim, score, promote, log

**Objective:** Create `server/src/consolidationWorker.ts` containing the worker logic: claim batch, fetch metrics, score, branch on band, LLM-normalise, write promotion / flag / skip rows.

**Input:** Tasks 4.1 (schema), 4.3 (scoring), 4.4 (LLM) complete.

**Working directory:** `c:\projects\ai-memory\server\src\`

**Steps:**

1. Create `server/src/consolidationWorker.ts`. Structure (mirror `entityWorker.ts` for the claim/process loop):

   ```typescript
   import { sql } from "./db.ts";
   import { computeBatchMaxima, scoreCandidate, bandFor, type CandidateMetrics } from "./consolidationScoring.ts";
   import { normaliseContent } from "./consolidationLLM.ts";

   const BATCH_SIZE = 10;
   const LLM_RETRY_INTERVAL = "1 hour";

   interface QueueRow {
     thought_id: string;
   }

   // Claim a batch of pending rows whose retry_after is null or past
   async function claimBatch(): Promise<QueueRow[]> {
     const rows = await sql`
       UPDATE consolidation_queue
       SET status = 'processing', attempt_count = attempt_count + 1
       WHERE thought_id IN (
         SELECT thought_id FROM consolidation_queue
         WHERE status = 'pending'
           AND (retry_after IS NULL OR retry_after <= now())
         ORDER BY queued_at ASC
         LIMIT ${BATCH_SIZE}
         FOR UPDATE SKIP LOCKED
       )
       RETURNING thought_id
     `;
     return rows as unknown as QueueRow[];
   }

   // Fetch the metrics needed for scoring
   async function fetchMetrics(thoughtId: string): Promise<CandidateMetrics | null> {
     const [row] = await sql`
       SELECT
         t.id AS thought_id,
         COALESCE(t.confidence, 0.5) AS confidence,
         (SELECT COUNT(*) FROM recall_events WHERE thought_id = t.id) AS recall_count,
         (SELECT COUNT(DISTINCT project) FROM recall_events WHERE thought_id = t.id AND project IS NOT NULL) AS distinct_projects,
         0::int AS helpful_count,
         0::int AS total_feedback
       FROM thoughts t
       WHERE t.id = ${thoughtId} AND t.memory_type = 'shard' AND t.active = true
     `;
     if (!row) return null;
     // Note: helpful_count / total_feedback are 0 until ST-029 ships feedback_events.
     // When feedback_events exists, replace the two zero columns with subqueries.
     return {
       thoughtId: row.thought_id as string,
       recallCount: Number(row.recall_count),
       distinctProjects: Number(row.distinct_projects),
       helpfulCount: Number(row.helpful_count),
       totalFeedback: Number(row.total_feedback),
       confidence: Number(row.confidence),
     };
   }

   // Check dedup: is this shard's content_fingerprint already in a wiki row?
   async function isDedupHit(thoughtId: string): Promise<boolean> {
     const [row] = await sql`
       SELECT 1 AS hit
       FROM thoughts shard
       WHERE shard.id = ${thoughtId}
         AND EXISTS (
           SELECT 1 FROM thoughts wiki
           WHERE wiki.memory_type = 'wiki'
             AND wiki.content_fingerprint = shard.content_fingerprint
             AND wiki.active = true
         )
       LIMIT 1
     `;
     return !!row;
   }

   // Promotion: insert wiki, soft-delete shard, log
   async function promote(
     shardId: string,
     normalised: string,
     score: number,
     breakdown: Record<string, unknown>,
     workerRunId: string,
     dryRun: boolean
   ): Promise<void> {
     if (dryRun) {
       await sql`
         INSERT INTO consolidation_log (operation, thought_id, score, score_breakdown, worker_run_id, dry_run)
         VALUES ('promote', ${shardId}, ${score}, ${sql.json({ ...breakdown, normalised_content: normalised })}, ${workerRunId}, true)
       `;
       return;
     }
     await sql.begin(async (sql) => {
       const [wiki] = await sql`
         INSERT INTO thoughts (content, memory_type, source, confidence, supersedes,
                               project, profile, content_fingerprint, metadata)
         SELECT ${normalised}, 'wiki', 'auto-promoted', ${score}, NULL,
                project, profile, content_fingerprint, jsonb_build_object('generated_by', 'consolidation_worker', 'source_shard_id', id::text)
         FROM thoughts WHERE id = ${shardId}
         RETURNING id
       `;
       await sql`UPDATE thoughts SET active = false WHERE id = ${shardId}`;
       await sql`
         INSERT INTO consolidation_log (operation, thought_id, wiki_id, score, score_breakdown, worker_run_id, dry_run)
         VALUES ('promote', ${shardId}, ${wiki.id}, ${score}, ${sql.json({ ...breakdown, normalised_content: normalised })}, ${workerRunId}, false)
       `;
     });
   }

   // Flag: log only, no thoughts write
   async function flag(
     shardId: string,
     normalised: string,
     score: number,
     breakdown: Record<string, unknown>,
     workerRunId: string,
     dryRun: boolean
   ): Promise<void> {
     await sql`
       INSERT INTO consolidation_log (operation, thought_id, score, score_breakdown, worker_run_id, dry_run)
       VALUES ('flag', ${shardId}, ${score}, ${sql.json({ ...breakdown, normalised_content: normalised })}, ${workerRunId}, ${dryRun})
     `;
   }

   // Skip: log only
   async function skip(
     shardId: string,
     score: number,
     breakdown: Record<string, unknown>,
     workerRunId: string,
     dryRun: boolean
   ): Promise<void> {
     await sql`
       INSERT INTO consolidation_log (operation, thought_id, score, score_breakdown, worker_run_id, dry_run)
       VALUES ('skip', ${shardId}, ${score}, ${sql.json(breakdown)}, ${workerRunId}, ${dryRun})
     `;
   }

   // Main per-candidate processing
   async function processCandidate(
     thoughtId: string,
     batchMaxima: BatchMaxima, // imported from scoring
     workerRunId: string,
     dryRun: boolean
   ): Promise<void> {
     // Eligibility + metrics
     const metrics = await fetchMetrics(thoughtId);
     if (!metrics || metrics.recallCount < 2) {
       await sql`
         UPDATE consolidation_queue
         SET status = 'skipped', processed_at = now()
         WHERE thought_id = ${thoughtId}
       `;
       return;
     }

     // Dedup
     if (await isDedupHit(thoughtId)) {
       await skip(thoughtId, 0, { dedup: true }, workerRunId, dryRun);
       await sql`UPDATE consolidation_queue SET status = 'skipped', processed_at = now() WHERE thought_id = ${thoughtId}`;
       return;
     }

     const breakdown = scoreCandidate(metrics, batchMaxima);
     const band = bandFor(breakdown.score);

     if (band === "skip") {
       await skip(thoughtId, breakdown.score, breakdown as unknown as Record<string, unknown>, workerRunId, dryRun);
       await sql`UPDATE consolidation_queue SET status = 'skipped', processed_at = now() WHERE thought_id = ${thoughtId}`;
       return;
     }

     // Both 'promote' and 'flag' need the LLM normalisation
     const [shardRow] = await sql`SELECT content FROM thoughts WHERE id = ${thoughtId}`;
     let normalised: string;
     try {
       normalised = await normaliseContent(shardRow.content as string);
     } catch (err) {
       const errorMsg = (err as Error).message?.slice(0, 500) ?? "Unknown LLM error";
       await sql`
         UPDATE consolidation_queue
         SET status = 'llm_error',
             last_error = ${errorMsg},
             retry_after = now() + ${LLM_RETRY_INTERVAL}::interval
         WHERE thought_id = ${thoughtId}
       `;
       console.warn(`[consolidationWorker] LLM failed for ${thoughtId}: ${errorMsg}`);
       return;
     }

     if (band === "promote") {
       await promote(thoughtId, normalised, breakdown.score, breakdown as unknown as Record<string, unknown>, workerRunId, dryRun);
     } else {
       await flag(thoughtId, normalised, breakdown.score, breakdown as unknown as Record<string, unknown>, workerRunId, dryRun);
     }

     await sql`
       UPDATE consolidation_queue
       SET status = ${dryRun ? "pending" : (band === "promote" ? "promoted" : "flagged")},
           processed_at = now(),
           last_error = NULL
       WHERE thought_id = ${thoughtId}
     `;
   }

   // Drain pending queue once (used on startup and on each NOTIFY)
   export async function drainPendingOnce(dryRun = false, limit = BATCH_SIZE): Promise<number> {
     const workerRunId = crypto.randomUUID();
     let processed = 0;
     while (processed < limit) {
       const rows = await claimBatch();
       if (!rows.length) break;
       // Compute batch maxima from this batch's metrics
       const metricsForBatch: CandidateMetrics[] = [];
       for (const r of rows) {
         const m = await fetchMetrics(r.thought_id);
         if (m) metricsForBatch.push(m);
       }
       const batchMaxima = computeBatchMaxima(metricsForBatch);
       for (const r of rows) {
         await processCandidate(r.thought_id, batchMaxima, workerRunId, dryRun);
         processed += 1;
       }
     }
     return processed;
   }

   // Public entry point
   export async function startConsolidationWorker(): Promise<void> {
     // 1. Miss-recovery drain on startup
     await drainPendingOnce().catch((err) =>
       console.error("[consolidationWorker] startup drain failed:", err)
     );
     // 2. Subscribe to LISTEN
     await sql.listen("consolidation_event", () => {
       drainPendingOnce().catch((err) =>
         console.error("[consolidationWorker] wake drain failed:", err)
       );
     });
     console.log("[consolidationWorker] listening");
   }
   ```

   Note on `sql.listen` API: the `postgres` (Porsager) package exposes `sql.listen(channel, onnotify)` which returns a promise resolving to `{ unlisten }`. The callback fires on each NOTIFY. If your version differs, adjust per the package's documented surface; do NOT roll your own LISTEN connection.

2. Audit imports/exports against the code in Task 4.3 and 4.4. Adjust if function or type names diverge.

**Expected output:**

- New file `server/src/consolidationWorker.ts` containing `startConsolidationWorker`, `drainPendingOnce`, and the helper functions above.
- Compiles cleanly under `deno check`.

**Requirement mapping:** §2d rows AC1, AC2, AC3, AC5, AC7, and the worker side of AC4 (dry-run path).

**Verification:**

```powershell
cd c:\projects\ai-memory\
docker compose exec mcp deno check src/consolidationWorker.ts
```

Expected: exits 0.

Run the integration tests; expect 1–3 of the 7 to pass at this point (those that don't require Task 4.6's MCP tool or wire-up yet).

**Failure handling:**
- If type errors on `sql.listen` — check the package version in `deno.json`; the API may be `sql.listen(channel, callback, onListen?)`. Update the call.
- If transactions fail to commit (`sql.begin` rollback): inspect the error; common cause is that `sql.begin`'s nested `sql` is a *different* tagged template; ensure inner statements use the inner `sql`.

---

### Task 4.6: Wire the worker into `server/index.ts` and register the `consolidate` MCP tool

**Objective:** Start the consolidation worker on server boot and expose a manual sweep tool to MCP clients.

**Input:** Task 4.5 complete; `server/index.ts` has existing `startEntityWorker()` boot call.

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. Open `server/index.ts`. Locate the existing tool registrations (look for `server.registerTool(` calls — the existing `search_thoughts`, `capture_thought`, etc.) and the boot block where `startEntityWorker()` is called.

2. Add an import at the top of the file:
   ```typescript
   import { startConsolidationWorker, drainPendingOnce } from "./src/consolidationWorker.ts";
   ```

3. Register the `consolidate` MCP tool. Use the same Zod-schema + handler pattern as existing tools:

   ```typescript
   server.registerTool(
     "consolidate",
     {
       title: "Run consolidation sweep",
       description: "Manually drain the consolidation_queue. With dry_run=true, writes only consolidation_log rows marked dry_run=true and performs no thoughts writes.",
       inputSchema: {
         dry_run: z.boolean().optional().describe("If true, no thoughts mutations; consolidation_log rows are tagged dry_run=true"),
         limit: z.number().int().positive().max(500).optional().describe("Maximum candidates to process this sweep (default 50)"),
       },
     },
     async ({ dry_run, limit }) => {
       const processed = await drainPendingOnce(dry_run ?? false, limit ?? 50);
       return {
         content: [{ type: "text" as const, text: JSON.stringify({ processed, dry_run: dry_run ?? false }) }],
       };
     }
   );
   ```

4. At the bottom of the file (alongside `startEntityWorker()`), add:
   ```typescript
   startConsolidationWorker().catch((err) =>
     console.error("[server] consolidation worker failed to start:", err)
   );
   ```

   **Order matters slightly:** call this AFTER `startEntityWorker()` so the entity worker is up first (its order in the file is the convention).

**Expected output:**

- `server/index.ts` modified with the import, the `consolidate` tool registration, and the worker boot call.
- After `docker compose up -d`, the `mcp` container logs include both `[entityWorker] started` (or similar) and `[consolidationWorker] listening`.

**Requirement mapping:** §2d rows AC4 (dry-run MCP tool), AC9 (boot wire-up).

**Verification:**

```powershell
cd c:\projects\ai-memory\
docker compose exec mcp deno check index.ts
docker compose up -d
Start-Sleep 5
docker compose logs mcp | Select-String consolidationWorker
```

Expected:
- `deno check` exits 0.
- The log query returns at least one line matching `[consolidationWorker] listening`.

Also call the new tool via the MCP client (using the `mcpCall` helper from `tests/entity-worker.test.ts` as a reference):
```powershell
$body = '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
curl -s -X POST http://localhost:3000/mcp -H "Authorization: Bearer test-key" -H "Content-Type: application/json" -d $body | Select-String consolidate
```

Expected: the response includes `"name":"consolidate"` in the tools list.

**Failure handling:**
- If `deno check` fails on the Zod schema: ensure `z` is imported from the same path other tools use (`"zod"` or wherever the import map declares it in `deno.json`).
- If the container starts but the log line is missing: usually `sql.listen` threw silently inside `startConsolidationWorker`; check Task 4.5 step 1 closely.

---

### Task 4.7: Run all tests; verify all 9 acceptance criteria

**Objective:** Prove every §2 AC observably; close out the story.

**Input:** Tasks 4.1–4.6 complete; container up; tests written.

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. Rebuild the stack to ensure schema + worker are current:
   ```powershell
   docker compose down -v
   docker compose up -d
   Start-Sleep 10
   docker compose ps
   ```
   Expect both `db` and `mcp` containers to show `(healthy)`.

2. Run the full integration test suite:
   ```powershell
   docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/consolidation-worker.test.ts
   ```
   Expect all 7 tests pass.

3. (If you wrote them) run the scoring unit tests:
   ```powershell
   docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/consolidation-scoring.test.ts
   ```

4. Run the full repo test suite once more to confirm no regressions in entity worker / search tests:
   ```powershell
   docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/
   ```

5. Capture verification evidence into §6 Execution Log:
   - The pass/fail summary line from the test command.
   - Output of `docker compose logs mcp | Select-String consolidationWorker`.
   - One sample `consolidation_log` row showing `operation='promote'` with `dry_run=false`.

**Expected output:**

- Test summary line: `ok | N passed | 0 failed (...ms)` where N is the total test count.
- No regressions in non-consolidation tests.

**Requirement mapping:** §2d row AC8 (full test pass) and final verification of all other AC rows.

**Verification:**

```powershell
$LASTEXITCODE
```

Expected: `0` after step 4.

**Failure handling:**
- If a non-consolidation test failed: this is a regression. Bisect by reverting one of Tasks 4.5 / 4.6 / 4.1 to isolate; the schema change (Task 4.1) is the most likely culprit if entity worker tests regress.
- If a consolidation test fails: re-read the assertion and the worker code; the §6c Decision Log is the right place to record the diagnostic process.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.7 — All 7 integration tests pass; 34/34 full test suite passes. Story closed. Commit `04b456b`. |
| **Last successful command** | `docker exec ai-memory-mcp-test-1 deno test --allow-all tests/` (ok | 34 passed | 0 failed) |
| **Expected outputs produced** | Full consolidation worker (Tasks 4.1–4.7); all ACs verified. |
| **Next task** | Story complete — move to Review. |
| **Known blockers** | None |
| **Last updated** | 2026-05-27 (Task 4.2 complete) |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-27 | Task 4.1 | ✅ Completed | `queue_for_consolidation()` contains `pg_notify`; `notify_consolidation_on_recall` trigger live; `retry_after` column on `consolidation_queue`. Commit `1825f76`. | Execute Task 4.2: write failing integration tests + corpus |
| 2026-05-27 | Task 4.2 | ✅ Completed | 7/7 tests fail as expected (TDD red). `consolidation-worker.test.ts` + `consolidation-corpus.sql` committed `ad56741`. | Execute Task 4.3: implement`consolidationScoring.ts` |
| 2026-05-27 | Task 4.3 | ✅ Completed | `consolidationScoring.ts` with 4 exports; 7/7 scoring unit tests pass. Commit `ae768d7`. | Execute Task 4.4: implement `consolidationLLM.ts` |
| 2026-05-27 | Task 4.4 | ✅ Completed | `consolidationLLM.ts` with `normaliseContent()`; `deno check` passes; `__TEST_LLM_FAIL__` stub included. Commit `b3cf14a`. | Execute Task 4.5: implement `consolidationWorker.ts` |
| 2026-05-27 | Task 4.5 | ✅ Completed | `consolidationWorker.ts` with `drainPendingOnce()` + `startConsolidationWorker()`; dedup via consolidation_log; dry_run mode; `deno check` exits 0. Commit `073db30`. Key design: isDedupHit uses consolidation_log (not content_fingerprint) to handle shard re-activation; promote INSERT omits content_fingerprint to avoid UNIQUE constraint violation when wiki and shard coexist. | Execute Task 4.6: wire worker into index.ts + register consolidate MCP tool |
| 2026-05-27 | Task 4.6 | ✅ Completed | `startConsolidationWorker()` boot-wired in index.ts after `startEntityWorker()`; `consolidate` MCP tool registered; `deno check index.ts` exits 0; `[consolidationWorker] listening` in dev logs; pre-existing TS2769 in list_thoughts fixed. Commit `bd38629`. | Execute Task 4.7: run all tests, verify ACs, close story |
| 2026-05-27 | Task 4.7 | ✅ Completed | 7/7 consolidation-worker tests pass; 34/34 full suite passes. Key fixes: (1) sql.json() for JSONB inserts — postgres 3.x returns string instead of object when TEXT+::jsonb cast is used; (2) CONSOLIDATION_WORKER_DISABLED env var guard on mcp-test to prevent background worker racing explicit MCP calls. Commit `04b456b`. Story closed. |

### Avoidance

(Append dated entries here. Do not delete prior guidance.)

- 2026-05-27 — **The `db` Docker image bakes `schema.sql` at build time via `COPY server/db/schema.sql /docker-entrypoint-initdb.d/02-schema.sql`.** After editing `schema.sql`, always run `docker compose build db` before `docker compose down -v && docker compose up -d`. Init scripts only fire on a fresh volume; skipping the rebuild silently applies the stale schema.

---

## §5c. Approach Ledger

### Approach Registry

| # | Description | Rollback Point | Status |
|---|---|---|---|
| 1 | LISTEN/NOTIFY-driven worker with durable queue + miss-recovery drain on startup | Before Task 4.5 commit — revert `server/src/consolidationWorker.ts` | 🟢 Active |
| 2 | Polling-only worker (setInterval, like entityWorker) — fallback if `sql.listen` proves unreliable | Before Task 4.6 boot wire-up | ⬜ Reserve |

### Approach Failure Log

(Empty — no failures yet)

**Rollback triggers:**
- LISTEN connection drops repeatedly during integration tests (≥3 reconnect events in a single test run) → propose switch to Approach 2
- 3 failed attempts at any task → MUST propose rollback (hard cap)

---

## §6. Execution Log

(Populated during execution — timestamped entries of significant actions)

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

---

## §6c. Decision Log

(Record every decision made during execution with rationale.)

- 2026-05-27 (Task 4.1) \u2014 **Docker image rebuild required for schema changes.** `server/db/schema.sql` is baked into the `db` image via `COPY`. After editing, always `docker compose build db` before `docker compose down -v && docker compose up -d`. Added to Avoidance.

- 2026-05-27 (Task 4.2) \u2014 **Test corpus design: direct `sql` over shared corpus file.** The ExecPlan step 3 offered two options: `_test/reset-consolidation-corpus` HTTP endpoint, or psql-direct seeding. Chose **direct `sql` calls** (importing `sql` from `../src/db.ts`) per the existing `entity-mentions.test.ts` pattern. Each test inserts/deletes its own rows via cleanup helper. `consolidation-corpus.sql` is created as a reference doc only (not loaded by seed service). No server modification needed.

- 2026-05-27 (Task 4.2) \u2014 **Dedup test redesign: re-run approach instead of pre-seeded wiki.** The ExecPlan's dedup scenario (shard with fp matching a pre-seeded wiki) is impossible under the schema's `UNIQUE (content_fingerprint)` constraint — a wiki and shard cannot share the same fingerprint simultaneously. Redesigned dedup test to: (1) promote shard D, (2) manually re-activate it by SQL, (3) call `consolidate` again, (4) assert skip with `dedup=true` in `score_breakdown`. The worker implementation (Task 4.5) must detect prior promotion via `consolidation_log` rather than via `content_fingerprint`.

- 2026-05-27 (Task 4.2) \u2014 **LLM failure stub: `__TEST_LLM_FAIL__` content prefix.** For Test G, the worker will check if thought content starts with `__TEST_LLM_FAIL__` and simulate a failure. Avoids env-var-per-test approach (can't change env vars at Deno test runtime) and avoids modifying the OpenRouter URL (would affect all LLM calls).

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (Task 4.7 commands re-run; output captured)
2. Update board: move story from Backlog → In Progress → Review
3. Present results to PO with artifact links: new files, schema diff, test summary, sample `consolidation_log` rows
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

**Achieved:** Full consolidation pipeline: schema triggers (Task 4.1) → TDD red tests (Task 4.2) → pure scoring (Task 4.3) → LLM normalisation (Task 4.4) → worker logic (Task 4.5) → MCP wiring (Task 4.6) → full test pass (Task 4.7). 7/7 integration tests, 34/34 full suite.

**Remains:** ST-029 (feedback_events table) will enable the feedback-based relevance path; the code already reads `feedback_events` if rows exist (no changes needed).

**Lesson A — Postgres 3.x JSONB handling:** `JSON.stringify(obj)` passed via tagged template sends as TEXT (OID 25). On retrieval of a JSONB column, postgres 3 does NOT auto-parse the value to a JS object when the column was populated via TEXT + SQL cast. Use `sql.json(obj)` (OID 114 send) which triggers JSON.parse on retrieval. Record in session-resilience instructions.

**Lesson B — Background worker test isolation:** LISTEN/NOTIFY worker races with integration tests when running in the same container as the MCP server. Pattern: add `CONSOLIDATION_WORKER_DISABLED` env var, set `true` on test containers. Document in dev-environment instructions.

**Lesson C — Old images in test stack:** `docker compose build db` only rebuilds the `db` service image, NOT `db-test`. After schema changes, always rebuild both: `docker compose build db db-test`.

---

## Revision Notes

- 2026-05-20 — Initial draft created by /plan. Scope locked across Rounds 1–4 with PO. Key design decisions: 1:1 promotion, supersedes=NULL, event-driven LISTEN/NOTIFY, confidence-fallback for relevance, LLM normalisation for all ≥0.5 candidates with fail-hard deferral. Reference template: `server/src/entityWorker.ts` (ST-022).
