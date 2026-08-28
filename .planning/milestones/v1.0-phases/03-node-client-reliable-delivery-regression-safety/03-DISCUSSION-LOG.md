# Phase 3: Node Client, Reliable Delivery & Regression Safety - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-15
**Phase:** 3-node-client-reliable-delivery-regression-safety
**Areas discussed:** Real-node test target, Client module format, Proof strategy, Enrolment & credentials

---

## Real-node test target

### Where should the real-node leg point when z2 talks to the hub?

| Option | Description | Selected |
|--------|-------------|----------|
| Dev hub, scoped cleanup | Point z2 at `:3000` as-is; node registers under its own `node_id`. No compose changes. `run_events`/`execution_nodes` are new Phase 2 tables no existing test reads | ✓ |
| Republish `mcp-test` on the tailnet | Bind `mcp-test`'s 3001 on all interfaces so z2 reaches the ephemeral stack; keeps dev pristine but widens a deliberately loopback-only surface | |
| Dedicated throwaway stack | A third compose stack purely for the experiment; maximum isolation, most setup, third stack to keep in sync | |

**User's choice:** Dev hub, scoped cleanup
**Notes:** The SAFE-01/02 risk that motivated this question turned out narrower than the loopback
finding first suggested — the tables a real node writes are new in Phase 2 and no pre-existing
test reads them. The question was still worth asking; the answer is now recorded as D-02 so a
later session does not re-raise it as a blocker.

### After the experiments run, what happens to the node's rows in the dev database?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave them as evidence | The rows *are* the criterion-6 proof the findings doc cites; deleting them destroys the artifact | ✓ |
| Delete `run_events`, keep the node | Capture findings, clear events, leave the registration so z2 stays enrolled for Phase 4 | |
| Full cleanup by `node_id` | Delete events and registration once findings are captured; re-running means re-enrolling | |

**User's choice:** Leave them as evidence

---

## Client module format

### How should the node client resolve the ESM-vs-CommonJS problem?

| Option | Description | Selected |
|--------|-------------|----------|
| Rename to `.mjs` | Unambiguous ESM regardless of any later `package.json`; zero new files; costs a one-line ROADMAP artifact-name correction | ✓ |
| Add `server/scripts/package.json` | `{"type":"module"}` preserves the `.js` name the ROADMAP promises, but introduces the repo's first `package.json` into a Deno-only directory | |
| Write it as CommonJS | No config at all, works on any Node, but diverges from the ESM idiom and from the STATE.md decision that already says "plain Node.js ESM" | |

**User's choice:** Rename to `.mjs`
**Notes:** Forced by a verified fact, not a preference — the repo has no `package.json` at any
level, so a bare `.js` resolves as CommonJS and the planned ESM client would not parse on z2.

### How should the client make HTTP calls, given Node 18's `fetch` ExperimentalWarning?

| Option | Description | Selected |
|--------|-------------|----------|
| Use `fetch`, silence the warning | Small client matching the Deno side; suppress the notice so captured stderr stays readable as evidence | ✓ |
| Use `node:http` directly | No experimental surface at all, but manual request/response plumbing, body accumulation, and timeouts | |
| Use `fetch`, leave the warning visible | Simplest client; every captured stderr in the findings doc opens with an unrelated notice | |

**User's choice:** Use `fetch`, silence the warning

---

## Proof strategy

### How should criteria 1-4 be proven?

| Option | Description | Selected |
|--------|-------------|----------|
| Deno tests + one real z2 run | Tests are the repeatable gate; the z2 run is the criterion-6 evidence. Each does what the other cannot | ✓ |
| Deno tests only | Everything provable in CI, but leaves criterion 6 UNPROVEN on exactly the point Stage 1 was honest about | |
| Real z2 run only | Directly proves the criterion, but nothing repeatable and no regression gate | |

**User's choice:** Deno tests + one real z2 run

### What runs the client-logic tests, given the client is Node and the suite is Deno?

| Option | Description | Selected |
|--------|-------------|----------|
| Deno imports the `.mjs` directly | Deno resolves `node:` specifiers; one runner, one command, new tests join the existing gate automatically; needs `--allow-write` for the spool | ✓ |
| `node --test` alongside Deno | Runs on the same runtime z2 uses, but adds a second runner, a second command, and a CI job that does not exist | |
| Deno spawns the client as a subprocess | Most faithful to real usage, matching `workflow-mvp-e2e.test.ts`; slowest, asserts on stdout and spool files | |

**User's choice:** Deno imports the `.mjs` directly

---

## Enrolment & credentials

### How does z2 get enrolled for the experiments?

| Option | Description | Selected |
|--------|-------------|----------|
| Set the secret, enrol, then unset | Exercises the real Phase 2 enrolment path end-to-end and leaves enrolment closed afterward | ✓ |
| Pre-seed the node row directly in SQL | Fastest, touches no config, but leaves the enrolment gate with no real caller | |
| Leave the secret set for the milestone | Re-enrolment always available during Phases 3-4; keeps the window open longer than needed | |

**User's choice:** Set the secret, enrol, then unset

### Should the client implement the enrolment handshake, or assume it is already enrolled?

| Option | Description | Selected |
|--------|-------------|----------|
| Client handles both | Sends `X-Node-Enrolment-Secret` when configured, omits it otherwise, persists the returned `node_id`; enrolment gets a real caller | ✓ |
| Assume pre-enrolled, `node_id` in config | Smallest client, keeps Phase 3 focused on delivery semantics, but enrolment stays untested by any client | |

**User's choice:** Client handles both

---

## Claude's Discretion

Explicitly declined for pre-decision; the researcher and planner choose, bounded by the recorded
decisions and the hub contract:

- Spool bounding specifics — byte-vs-entry cap, its value, and where the drop counter persists.
  Constrained by success criterion 4's requirement that the counter be **visible**, which needs a
  concrete, assertable meaning.
- Heartbeat and checkpoint cadence, and whether repo-rescan is in Phase 3 scope at all.
- The client's config location and format on z2.
- Batching policy — the hub accepts 1-500 events per request; per-flush count is unconstrained.

## Deferred Ideas

- Republishing `mcp-test` off loopback — revisit if a later phase needs a real node against an
  ephemeral database.
- A dedicated throwaway compose stack for remote-node experiments.
- `node --test` as a second runner — revisit only if Deno's `node:` compatibility becomes the
  thing under test rather than a transparent layer.
- Phase 4 items (`BLOCK-01`, `HOST-01`, `HOST-02`) — execution-blocking evidence and the final
  ADR-016 disposition belong to their own phase.
