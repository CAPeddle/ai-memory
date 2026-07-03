---
title: "fix: Type the capture_thought metadata jsonb bind (TS2769)"
type: fix
status: ready
date: 2026-07-03
story: ST-072
---

# fix: Type the `capture_thought` metadata jsonb bind (TS2769)

## Summary

`deno check server/index.ts` fails with a single `TS2769` because the `capture_thought` tool binds a bare `metadata` object into a postgres.js `sql\`\`` template. Wrap the object in `sql.json(...)` — the pattern already used for every other `jsonb` bind in the codebase — so the file type-checks clean while `capture_thought` still round-trips `metadata.identifiers` unchanged.

---

## Problem Frame

`server/index.ts` is **not imported by any test** (tests hit the running server over HTTP), so it sits outside CI's `deno test tests/` type-check graph. The error is therefore latent: the server boots and runs fine, CI stays green, but `deno check server/index.ts` reports:

```
TS2769 [ERROR]: No overload matches this call.
  Argument of type '[string, string, number, { identifiers: IdentifierFacets; }, "wiki" | "shard", string | null, ValidatedTag[], string]'
  is not assignable to parameter of type 'never'.
  Overload 2 of 2 … Argument of type '{ identifiers: IdentifierFacets; }' is not assignable to parameter of type 'ParameterOrFragment<never>'.
    at server/index.ts:453:36
```

Root cause: the handler builds `const metadata = { identifiers: normalized.facets }` and interpolates it as a raw `${metadata}` bind in the `INSERT INTO thoughts (…) VALUES (…, ${metadata}, …)` template. postgres.js's typed template rejects a bare object as a scalar bind parameter, collapsing the overload set to `never`.

---

## Requirements

- R1. `deno check server/index.ts` passes with 0 errors.
- R2. `deno check` stays clean across all of `server/` (no new errors introduced elsewhere).
- R3. `capture_thought` still persists `metadata.identifiers` (tickets/builds) exactly as before — no behavioral change to what is stored or read back.
- R4. Use the established jsonb-bind pattern already in the codebase; do not introduce a new suppression or a bespoke workaround.

---

## Scope Boundaries

- Change only the `metadata` bind in the `capture_thought` `INSERT INTO thoughts` statement (and, if the compiler requires it, a matching cast on the `metadata` local — mirroring existing call sites).
- Do not touch the `ON CONFLICT … DO UPDATE` clause semantics, the fingerprint/dedup logic, or the fire-and-forget embedding path.
- Do not refactor other tool handlers, change the `thoughts` schema, or alter how `metadata` is read back in `fetch`/`list_thoughts`.

### Deferred to Follow-Up Work

- None. This is a single-defect cleanup.

---

## Context & Research

### Relevant Code and Patterns

- **Defect site:** `server/index.ts` — the `capture_thought` tool. `const metadata = { identifiers: normalized.facets }` (~L446) bound as `${metadata}` inside the `INSERT INTO thoughts (…)` `sql\`\`` template (statement opens ~L453; the bind is ~L469). Line numbers are approximate — re-locate by content, not by number.
- **Proven fix pattern (already in the repo):**
  - `server/src/entityWorker.ts:255` — `error_summary = ${errorSummary ? sql.json(errorSummary) : null}`
  - `server/src/consolidationWorker.ts:116/142/161/177` — `${sql.json(breakdownObj as unknown as Record<string, string | number | boolean | null>)}` and `error_summary = ${sql.json({ error: errorMsg })}`
  - Apply the same shape: `${sql.json(metadata)}` (add the `as unknown as Record<string, …>` cast only if the compiler still complains, matching the `consolidationWorker` call sites).
- **Read-back is unaffected:** `fetch` reads `metadata` at `server/index.ts:212/226` and spreads it as an object; `sql.json` on write stores the same jsonb shape, so those reads are unchanged.

### Institutional Learnings

- `server/index.ts` is outside CI's test type-check graph (not imported by any test), so **`deno check server/index.ts` is the only gate** — CI will not catch a regression here.
- Editing server code requires `docker compose --profile test restart mcp-test` before re-running integration tests (the running server loads `index.ts` at boot; Deno does not hot-reload it).
- Local integration runs are **not** a faithful CI mirror: the placeholder `OPENROUTER_API_KEY` in local `.env` produces ~9 false `401` e2e failures that pass in CI (see `.github/instructions/dev-environment.instructions.md` §Gotchas). Treat CI as the arbiter for the LLM-dependent e2e tests.

### External References

- postgres.js `sql.json()` helper — the supported way to bind a JS object to a `jsonb` column.

---

## Key Technical Decisions

- Prefer `sql.json(metadata)` over a type suppression or `JSON.stringify` string bind: it matches every existing jsonb bind in the codebase and preserves the jsonb column semantics (including the `metadata = thoughts.metadata || EXCLUDED.metadata` merge in the `ON CONFLICT` clause).
- Add a cast only if strictly required by the compiler, and keep it identical in shape to the `consolidationWorker` precedent to avoid introducing a novel pattern.

---

## Implementation Units

### IU1 — Bind metadata via `sql.json` and verify type-check

1. In `server/index.ts`, change the `capture_thought` INSERT bind from `${metadata}` to `${sql.json(metadata)}` (add the `as unknown as Record<string, string | number | boolean | null>` cast only if `deno check` still errors, matching `consolidationWorker`).
2. Run the gate:
   ```bash
   export PATH="$HOME/.deno/bin:$PATH"
   DATABASE_URL="postgres://x:x@127.0.0.1:5432/x" deno check server/index.ts
   ```
   Expect: 0 errors. (The dummy `DATABASE_URL` is required because `server/src/db.ts` throws at import if it is unset.)
3. Run `deno check` across `server/` to confirm no new errors were introduced elsewhere.

### IU2 — Prove behavior is unchanged

1. Restart the test server so it loads the edited code:
   ```bash
   docker compose --profile test restart mcp-test
   ```
2. Run the integration suite (or at minimum the e2e identifier-normalization assertions that read `metadata.identifiers.tickets/builds`):
   ```bash
   docker compose --profile test exec -T mcp-test \
     deno test --frozen --allow-net --allow-env --allow-read tests/
   ```
   Expect: 225 passed / 0 failed **in CI** (the container needs the real `OPENROUTER_API_KEY`; locally the placeholder key yields ~9 false `401` failures — rely on CI as the arbiter for those).

---

## Verification

- [ ] `DATABASE_URL="postgres://x:x@127.0.0.1:5432/x" deno check server/index.ts` → 0 errors.
- [ ] `deno check` clean across `server/`.
- [ ] Integration suite green in CI (225 passed / 0 failed); `capture_thought` still stores and returns `metadata.identifiers`.
- [ ] No new analyzer/type suppressions introduced.
- [ ] Commit uses Conventional Commits with a `Story: ST-072` trailer; board ST-072 moved to Done with criteria checked.
