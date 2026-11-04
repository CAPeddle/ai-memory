## Deferred Items

- OpenRouter rejects the test stack's configured key (401 "Missing Authentication header"), failing 9 LLM/embedding-dependent tests
  status: open
  **Found during:** 05-01 Task 3, full-suite run (2026-09-25).
  **What:** `OPENROUTER_API_KEY` is present (non-empty) in `mcp-test`'s environment, but every OpenRouter call returns 401. The 9 failures are the tests that need a live OpenRouter response: query embeddings (`e2e.test.ts` vector lane, in-project ranking, MMR), LLM normalisation in `consolidate` (`e2e.test.ts` shard-to-wiki promote; it fails in `normaliseContent()` before `promote()` runs), and LLM entity extraction (`e2e.test.ts` x4 entity tests, `entity-worker-observability.test.ts` "creates worker_runs record"). None of them mention `policy_scope`, 23502, or 23514; the other 551 tests pass.
  **Why deferred:** credential/environment issue, not caused by 05-01. The operator needs to refresh the key in `.env` and re-run the full suite to confirm it goes fully green. 05-01's promote carry-forward is covered directly by `policy-scope-migration.test.ts`, independently of the LLM path.
