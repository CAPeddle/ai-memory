---
phase: 03-node-client-reliable-delivery-regression-safety
plan: 02
subsystem: node-client
tags: [node-client, awcp, d-09, d-14, event-01, tracer, deno-node-interop]
dependency-graph:
  requires:
    - "03-01: FEATURE_WORKFLOW=true on the base mcp service (dev hub node surface mounted)"
  provides:
    - "server/scripts/awcp-node-client.mjs (tracer scope: register, appendEvent, flush, ack-gated removal)"
    - "server/tests/workflow-node-client-hub-e2e.test.ts (tracer proof, entry-point-guard inertness proof, EVENT-01 real-HTTP replay proof)"
    - "Deno node: compatibility layer proven feasible for importing this repo's first Node .mjs artifact"
  affects:
    - "03-03 (spool bounding, D-14 restart-with-drained-spool proof) — builds directly on allocateSeq/appendEvent/writeSpool"
    - "03-04 (backoff, 400/401 branches, heartbeat/checkpoint, status subcommand) — builds directly on flushOnce/flush/registerNode's typed-error seams"
    - "03-06 (real z2 enrolment) — this client is what actually runs on z2"
tech-stack:
  added:
    - "server/scripts/awcp-node-client.mjs — zero-dependency Node 18 ESM (node:fs, node:path, node:os, node:url, node:crypto only)"
  patterns:
    - "Rewrite-and-rename (write temp file in same dir, fsyncSync, renameSync) for spool shrink operations — atomic on the same POSIX filesystem"
    - "Entry-point guard via pathToFileURL(process.argv[1]).href comparison against import.meta.url — inert under both real Node and Deno's node: import"
    - "Injectable config object (resolveConfig) for every persisted path and every dependency (fetchImpl), defaulted from env vars only when no override is passed"
key-files:
  created:
    - server/scripts/awcp-node-client.mjs
    - server/tests/workflow-node-client-hub-e2e.test.ts
  modified: []
decisions:
  - "flushOnce's return shape extends the plan's literal {outcome, acked} with an additional acknowledged field (the raw, unmapped acknowledgement array) — additive only, does not change the {outcome, acked} contract Task 1 specifies, and is what makes Task 2's event_id-inclusive deep-equality assertion possible without a second HTTP call"
  - "node:os's hostname() is wrapped in try/catch inside registerNode, falling back to omitting the field — Deno's node: compat layer requires --allow-sys=hostname for this call, which the phase's verify command deliberately does not grant (see Host-Fit Friction below); process.platform is used directly instead of os.platform() since it needs no syscall"
metrics:
  duration: "~45 min"
  completed: 2026-08-16
actuals:
  tokens: 6760
  tasks: 2
  commits: 2
status: complete
---

# Phase 3 Plan 2: Node Client Tracer & EVENT-01 Replay Proof Summary

Built `server/scripts/awcp-node-client.mjs` — the first Node.js artifact in an
otherwise all-Deno repository — carrying the complete client→hub→ack→spool-removal
path for one event, and proved it three ways over a real hub process: the tracer path
itself, the entry-point guard's inertness on import, and hub-side duplicate
suppression (EVENT-01) that no in-process test could observe.

## What Was Built

**Task 1 — Tracer.** `server/scripts/awcp-node-client.mjs` exports `resolveConfig`,
`ensureStateDir`, `allocateSeq`, `appendEvent`, `readSpool`, `writeSpool`, `flushOnce`,
`flush`, `registerNode`, `main`, plus `FLUSH_MAX_EVENTS`, `MAX_PAYLOAD_BYTES`,
`BEARER_FORMAT`, and an `AwcpHttpError` class carrying the HTTP status. `allocateSeq`
persists a monotonic counter in its own file, never derived from spool contents
(D-14) — its body references only `config.seqPath`. `writeSpool` implements the
rewrite-and-rename pattern (temp file in the same directory, `fsyncSync`, then
`renameSync`) for the two operations that shrink the spool; a plain append (`appendEvent`)
uses a cheaper open-write-fsync-close path since it never needs the atomic swap.
`registerNode` sends `X-Node-Enrolment-Secret` only on a node's first registration
(no persisted `node_id` yet) and persists only the returned `node_id`, at mode `0600`
inside a `0700` `~/.awcp/` — never the bearer, never the secret. `flushOnce` reads
`acknowledged[].client_seq` with no `Number()` coercion, matching how the hub's
`store.acknowledgeSeqs` already returns it as a JS number. An entry-point guard
(`pathToFileURL(process.argv[1]).href === import.meta.url`) keeps importing the module
inert — no network call, no real-`$HOME` write.

`server/tests/workflow-node-client-hub-e2e.test.ts` (port 3146) proves the tracer over
a real spawned hub process: register, append one event, flush, and assert the spool is
empty with exactly one `node_id`-scoped `run_events` row. A second test proves the
entry-point guard is inert by capturing a fetch-call counter across a cache-busted
dynamic `import()` and asserting it stays zero, and by asserting the real `$HOME`'s
`.awcp` directory existence is unchanged before/after.

**Task 2 — EVENT-01.** Extends the same test file with a third `Deno.test` that calls
`flushOnce(config, batch)` directly with an identical `{client_seq: 1, ...}` batch
twice (not `appendEvent` twice, which would allocate seq 1 then 2) and asserts: both
responses' `acknowledged` arrays are deep-equal including `event_id`; `client_seq` is
a JS `number` in both, asserted with no coercion at the assertion site; and a
`node_id`-scoped `count(*)` over `workflow.run_events` is exactly `1`. A third
submission with the same `client_seq` but different payload content is followed by a
readback proving the stored row still holds the FIRST submission's payload — the
payload half of `normalizeBatch`'s "never reuse a client_seq for different content"
contract.

## Deviations from Plan

**1. [Rule 2 — missing critical functionality] `flushOnce`'s return shape gained an
`acknowledged` field beyond the plan's literal `{outcome, acked}`.** Task 1's action
text specifies `flushOnce` returns `{outcome: "acked", acked: number[]}`. Task 2's own
acceptance criteria then require asserting the raw `acknowledged` array (with
`event_id`) deep-equal between two calls — information the mapped `acked: number[]`
field cannot carry. Rather than have the test perform a second, parallel raw `fetch`
call outside the client (which would test the test's own HTTP handling, not the
client's), `flushOnce` now returns `{outcome, acked, acknowledged}` — the original two
fields unchanged, with the raw hub response appended. This is additive only: every
Task 1 acceptance criterion referencing `acked` still holds unmodified.
- **Found during:** Task 2 (writing the EVENT-01 test's assertions)
- **Files modified:** `server/scripts/awcp-node-client.mjs` (`flushOnce`, `flush`)
- **Commit:** `970a84f` (the field was added while implementing Task 1, once the
  Task 2 requirement was read ahead per plan review discipline)

**2. [Rule 3 — blocking issue] `node:os`'s `hostname()` requires `--allow-sys=hostname`
under Deno's `node:` compatibility layer, which the phase's own verify command does not
grant.** Verified directly: a bare `hostname()` call under
`deno run --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno`
throws `NotCapable: Requires sys access to "hostname"`. Since `registerNode` calls
`hostname()` to populate the optional `registerBody.hostname` field, an unguarded call
would have made Task 1's own automated `<verify>` fail — not on z2 (where it runs under
real Node with no such restriction), but inside the Deno test that imports and drives
the client in-process. Fixed by wrapping the call in try/catch, falling back to
omitting the field (`registerBody`'s schema already makes `hostname` optional). Also
switched from `os.platform()` to the plain `process.platform` property, which requires
no syscall permission at all and works identically under both runtimes.
- **Found during:** Task 1, before running `<verify>` for the first time (anticipated
  from the permission-grant inventory in `03-CONTEXT.md`/`CLAUDE.md`, then confirmed
  empirically with a standalone repro script)
- **Files modified:** `server/scripts/awcp-node-client.mjs` (`registerNode`,
  `detectHostname`)
- **Commit:** `970a84f`

## Host-Fit Friction (criterion-7 input, per Open Question #3)

Recorded per `03-CONTEXT.md`'s Open Question #3 and `03-RESEARCH.md` Open Question #3
— input for Phase 4's criterion-7 assessment, not a decision made here:

- **The `.mjs`-not-`.js` resolution (D-04) worked exactly as decided.** No friction
  beyond the decision itself: the repo has no `package.json` anywhere, confirmed again
  by this plan's own acceptance criteria, and Node resolved the `.mjs` as ESM with no
  further accommodation needed.
- **Being the first Node artifact in an otherwise 100% Deno TypeScript directory
  (`server/scripts/`) meant zero in-repo code analog existed for the client's core
  logic** (confirmed by `03-PATTERNS.md`'s own "No Analog Found" table). Every pattern
  — rewrite-and-rename, the entry-point guard, injectable config — had to be sourced
  from `03-RESEARCH.md`'s citations to Node's own docs and GitHub issues rather than
  from a sibling file in this repo, which is a slower path than the pattern-mapper
  usually provides and is itself a fact about inheriting this codebase.
- **Deno 2.0's `node:` compatibility layer imported the `.mjs` cleanly for every
  built-in this client uses (`node:fs`, `node:path`, `node:os`, `node:url`,
  `node:crypto`) with one exception, and that exception is concrete, not theoretical:**
  `node:os`'s `hostname()` requires `--allow-sys=hostname` under Deno but not under
  real Node — see Deviation 2 above, empirically reproduced. This is the one piece of
  Deno/Node non-parity this plan actually hit, as opposed to a hypothetical one. Every
  other built-in (`node:fs`'s sync APIs, `node:path`, `node:url`'s `pathToFileURL`,
  `node:crypto`'s `randomBytes`) behaved identically under both runtimes with no
  permission delta and no code-shape accommodation.
- **The D-09 permission-grant expansion did not, in the end, need to expand beyond
  what CLAUDE.md's existing test command already grants** (`--allow-net --allow-env
  --allow-read --allow-write=/tmp --allow-run=deno`) — the `--allow-sys` friction above
  was absorbed in application code (the try/catch) rather than by widening the grant,
  which keeps this plan's actual permission footprint unchanged from what
  `03-RESEARCH.md` assumed.

## Requirements

This plan's frontmatter lists `requirements: [EVENT-01, EVENT-03]`. Both are
discharged by this plan's tests:
- **EVENT-01** — the new hub-interaction test (Task 2) proves replaying the same
  `(node_id, client_seq)` over real HTTP produces one row and identical acknowledgements.
- **EVENT-03** — the tracer test (Task 1) proves a spool entry is removed only after
  the hub's 200 acknowledgement names its `client_seq`; `flush`'s implementation
  removes entries only inside the `result.outcome === "acked"` branch, never on send.

EVENT-02 (bounded local retention + oldest-first replay) and EVENT-04 (overflow
eviction with a visible counter) remain for 03-03, as scoped by this plan's frontmatter.

## Verification Evidence

```
$ docker compose --profile test exec -T mcp-test deno test --frozen --allow-net \
    --allow-env --allow-read --allow-write=/tmp --allow-run=deno \
    tests/workflow-node-client-hub-e2e.test.ts
running 3 tests from ./tests/workflow-node-client-hub-e2e.test.ts
ST-088 tracer: one event travels client -> real hub -> ack -> spool removal ... ok (418ms)
ST-088 guard: importing awcp-node-client.mjs performs zero network requests and
  creates nothing under the real HOME ... ok (4ms)
ST-088 EVENT-01: replaying the same (node_id, client_seq) over real HTTP creates no
  duplicate hub state ... ok (386ms)

ok | 3 passed | 0 failed (814ms)
```

Run twice consecutively in the same `mcp-test` container — both runs `ok | 3 passed |
0 failed` (SAFE-02 repeatability, each test mints its own bearer so no cross-run
collision is possible).

```
$ find . -name package.json -not -path './node_modules/*'
(empty)

$ git status --porcelain server/src server/index.ts
(empty)

$ grep -n "^import" server/scripts/awcp-node-client.mjs
44:import {
55:import { dirname, join } from "node:path";
56:import { homedir, hostname as osHostname } from "node:os";
57:import { pathToFileURL } from "node:url";
58:import { randomBytes } from "node:crypto";
```

Every import is `node:`-prefixed; no bare or URL specifier appears.

## Self-Check: PASSED

- `server/scripts/awcp-node-client.mjs` — FOUND
- `server/tests/workflow-node-client-hub-e2e.test.ts` — FOUND
- Commit `970a84f` (Task 1) — FOUND in `git log --oneline --all`
- Commit `7030d45` (Task 2) — FOUND in `git log --oneline --all`
