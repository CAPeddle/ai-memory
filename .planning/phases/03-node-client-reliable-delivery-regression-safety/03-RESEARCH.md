# Phase 3: Node Client, Reliable Delivery & Regression Safety - Research

**Researched:** 2026-08-15
**Domain:** Zero-dependency Node.js ESM client (JSONL spool, HTTP delivery, crash-safe durability) against an already-shipped Deno/Hono hub
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Real-node test target**
- **D-01:** Real-node leg points at the dev hub on `:3000`, with `FEATURE_WORKFLOW` enabled on the base `mcp` service in `docker-compose.yml` (not the `.workflow.yml` overlay). Plain `http://` is acceptable only because the tailnet path is WireGuard-encrypted end to end. Reversible.
- **D-02:** A real node writing into the dev database does not put the existing suite at risk because every read over `execution_nodes`/`run_events` in `workflow-remote-node-hub.test.ts` is scoped by `node_id` or `bearer_token_hash`. Every new Phase 3 assertion over those tables must carry the same scoping.
- **D-03:** After the experiments, the node's rows stay in the dev database, but the durable criterion-6 artifact is the §13 write-up (captured transcript + committed SQL readback), not the rows — the existing suite's `DROP SCHEMA IF EXISTS workflow CASCADE` destroys the rows and de-enrolls the node. Capture evidence at experiment time. Reversible.
- **D-18:** Experiment 4 simulates disconnection client-side on z2 only (dropped tailnet link or misconfigured hub endpoint in client config) — never by stopping/restarting/recreating the dev hub or its database.

**Client shape**
- **D-04:** The client is `server/scripts/awcp-node-client.mjs` — `.mjs`, not `.js`, because the repo has no `package.json` at any level and a bare `.js` would resolve as CommonJS. ROADMAP.md's Delivery artifacts line is corrected; the canonical plan's §U3 still names `.js` and is deliberately left unedited (Tier-1 authority; this document is the supersession note). Costly to reverse.
- **D-05:** Rejected: adding `server/scripts/package.json` — would preserve `.js` but introduce the repo's first `package.json`.
- **D-06:** HTTP calls use global `fetch`, with the Node 18 ExperimentalWarning suppressed via a targeted filter (not blanket `--no-warnings`, which would also silence genuine runtime warnings in the captured stderr evidence).
- **D-07:** Zero npm dependencies stands (carried from STATE.md). Node built-ins only.
- **D-14:** The client persists its `client_seq` counter in its own state file, separate from `spool.jsonl`, advanced monotonically on append and never derived from spool contents. A Deno test must restart the client with a drained spool and assert the next allocated seq exceeds the highest previously delivered one.
- **D-15:** Each flush is capped at 500 events, and a permanent rejection drops the offending entries rather than retrying them. On a 400 whose `issues` array names specific `client_seq` values, drop exactly those entries and increment the same visible counter criterion 4 defines.
- **D-17:** The authentication-failure path must reach a stated terminal state — stop attempting, keep the spool intact, surface the condition — rather than retrying indefinitely. Backoff shape and ceiling are Claude's Discretion; the terminal state is not.

**Proof strategy**
- **D-08:** Criteria 1–4 are proven both ways: Deno tests are the repeatable gate; one captured real z2 run is the criterion-6 evidence. Not interchangeable.
- **D-09:** Client-logic tests run under Deno, importing the `.mjs` directly via `node:` specifier support, driving spool functions in-process. The client must carry an explicit entry-point guard (`import.meta.url === file://${process.argv[1]}`) and its spool path must be injectable so tests stay inside `--allow-write=/tmp`.
- **D-10:** Criterion 5 (SAFE-01/02) is proven by the existing suite passing unmodified — compared by test identity, not by count (record file+test name of each of the nine known provider-401 failures over the pre-Phase-3 test files only).
- **D-16:** Node bearer provenance: z2's 64-lowercase-hex bearer is generated out of band with `openssl rand -hex 32` and supplied via a dedicated env var (proposed name `AWCP_NODE_BEARER`), not a config file. The client creates `~/.awcp/` with mode `0700` and writes the persisted `node_id` file with mode `0600`.

**Enrolment and credentials**
- **D-11:** z2 is enrolled by opening the enrolment window, registering once, then closing it. The mechanism requires recreating the serving process (container or native) after setting `AWCP_NODE_ENROLMENT_SECRET` in the matching env file, since the hub reads it from a container/process environment fixed at creation. Verify the value inside the running process, never infer it from the response. Reversible.
- **D-12:** The client implements the enrolment handshake itself. It reads the enrolment secret from an environment variable supplied only for the one enrolling invocation, never writes it into the persisted `~/.awcp/` config, and after the first registration persists only the returned `node_id`.
- **D-13:** Neither the raw bearer nor the enrolment secret may reach a column, log line, response body, or captured transcript. Any registration transcript quoted into §13 must have the header value redacted before commit. D-09's test set must include an assertion that captures the client's stdout/stderr across a register-flush-retry cycle and asserts neither credential string appears.

### Claude's Discretion

- **Spool bounding specifics** — cap expressed in bytes or entries, its value, and where the drop counter is persisted. The spool location itself is NOT open — criterion 2 fixes it at `~/.awcp/spool.jsonl`. "Visible" needs a concrete, assertable meaning.
- **Heartbeat and checkpoint cadence** — their inclusion is settled (Phase Boundary); only how often they fire is open. Whether repo-rescan is in Phase 3 scope at all remains open.
- **The client's config file location and format** on z2. Per D-16 the bearer and enrolment secret do not live in this file at all.
- **Batching policy** — how many events per flush, bounded by D-15's 500-event cap.
- **Retry policy** — backoff shape and ceiling, bounded by D-17's required terminal state.

### Deferred Ideas (OUT OF SCOPE)

- Republishing `mcp-test` off loopback — rejected for Phase 3 (D-01/D-02); revisit only if a later phase needs a real node against an ephemeral database.
- A dedicated throwaway compose stack for remote-node experiments — not worth it for one experiment window.
- `node --test` as a second test runner — rejected in favour of Deno importing the `.mjs` (D-09).
- Phase 4 items (`BLOCK-01`, `HOST-01`, `HOST-02`) stay out of scope: execution-blocking evidence and the final ADR-016 disposition are a separate phase.

**Also surfaced, not blocking (FYI tier):** no proportionality principle tells the planner how durable this spike-grade client needs to be; D-03's permanent retention has no matching decision about what event payloads may contain (synthetic payloads would settle it).

**Open Questions the planner must resolve** (three `ce-doc-review` findings deliberately not pre-applied): co-tenancy observation gap, EVENT-01 hub-interaction proof gap, and host-fit-friction routing to criterion 7. See the `## Open Questions` section below for this research's take on each.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVENT-01 | Replaying the same `(node_id, client_seq)` event does not create duplicate hub state. | Hub-side dedup already shipped and tested in-process (`store.ts` `ON CONFLICT DO NOTHING` + read-back ack, `workflow-remote-node-hub.test.ts` NODE-02b). Client-side proof requires a NEW real-HTTP test following `workflow-node-hub-e2e.test.ts`'s `startServerProcess` pattern — see Architecture Patterns Pattern 5 and Validation Architecture. |
| EVENT-02 | A node disconnected from the hub retains bounded local events and replays them oldest-first after connectivity returns. | JSONL append-only spool pattern (Architecture Patterns, Recommended Project Structure); D-18's client-side-only disconnection simulation; in-process Deno test via D-09's `.mjs` import. |
| EVENT-03 | A node removes a spooled event only after receiving the hub acknowledgement for that event. | Ack-gated, crash-safe rewrite-and-rename pattern (Pattern 1); correct ack-shape handling (Pattern 5, citing `store.ts:840-857`'s documented past bug class). |
| EVENT-04 | Spool overflow drops the oldest event and records a visible dropped-event counter rather than silently filling disk. | Bounded eviction via the same rewrite-and-rename primitive (Pattern 1); "visible counter" mechanism left as Claude's Discretion, options enumerated in Open Questions #5. |
| SAFE-01 | The existing authenticated MCP memory tools and workflow operations remain functional after remote-node changes. | D-10's test-identity comparison methodology; Validation Architecture's Sampling Rate section; D-01's confirmation that enabling `FEATURE_WORKFLOW` alone does not touch `FEATURE_ENTITY_WORKER`/`FEATURE_CONSOLIDATION_WORKER` (both default `true`, unlisted in the base `mcp` compose block). |
| SAFE-02 | Tests for the milestone are repeatable against the shared test stack and do not mutate or deactivate seeded search-corpus rows. | No new Phase 3 test touches the search corpus; existing regression suite already enforces this — see Validation Architecture. |

</phase_requirements>

## Summary

This phase has almost no open design space at the protocol level — the hub contract (`server/src/workflow/remoteNodeHub.ts`, `server/src/workflow/store.ts`) is fixed and was read directly this session, and `03-CONTEXT.md` already locks 18 decisions about the client's shape, credentials, test strategy, and proof strategy. What remains is translating those decisions into a concrete, zero-dependency Node 18 ESM implementation and a Deno test suite that can actually gate regressions.

The single hardest fact this research surfaces, beyond what CONTEXT.md already states: **`docker-compose.yml`'s `mcp` service does not merely lack `FEATURE_WORKFLOW=true` in the environment — it does not enumerate the variable at all.** The `environment:` block for `mcp` is a fixed allowlist (`DATABASE_URL`, `MEMORY_API_KEY`, `OPENROUTER_API_KEY`, `AWCP_AGENT_API_KEY`, `AWCP_NODE_ENROLMENT_SECRET`), and Compose only passes through variables that are named there — a value present in `.env` alone would not reach the container. D-01's fix must therefore add a **new line to that block** (`FEATURE_WORKFLOW: "true"`), not just set an env var in `.env`, mirroring the pattern already used for `AWCP_NODE_ENROLMENT_SECRET` at `docker-compose.yml:45`. This is one line, additive, and — because `FEATURE_ENTITY_WORKER`/`FEATURE_CONSOLIDATION_WORKER` both default to `true` when unset (`server/index.ts:1313-1314`) and are not listed in the base `mcp` block either — turning on `FEATURE_WORKFLOW` alone does **not** touch the memory subsystem. It applies the workflow schema's migrations to the persistent dev database (idempotently, tracked via `schema_migrations`), mounts `/api/workflow/*`, `/workflow/nodes/*`, and the unauthenticated `/workflow` dashboard shell.

The hub itself is deliberately minimal: **two endpoints, no heartbeat/checkpoint/control-channel routes exist.** `POST /workflow/nodes/register` and `POST /workflow/nodes/:node_id/events` are the entire surface — `remoteNodeHub.ts`'s docblock states explicitly that the §7.1 allow-listed control messages are "NOT dispatched to nodes from here." Heartbeat and checkpoint reporting (required in scope per the Phase Boundary) are therefore not new endpoints to call — they are just periodic `event_type: "heartbeat"` / `event_type: "checkpoint"` entries POSTed through the same `/events` batch endpoint the spool already drains through. There is no bidirectional control protocol to implement.

The client-side reliability mechanics (append-only JSONL, fsync, bounded eviction, ack-gated removal, a separately-persisted `client_seq` counter) are all achievable with Node 18 built-ins only (`node:fs`, `node:path`, `node:os`, `node:crypto`, `node:process`) — no third-party packages are needed or permitted (D-07). The correct crash-safe pattern for the two file-mutating operations (post-ack removal, overflow eviction) is the same one: write the new full content to a temp file in the same directory, `fsync` it, then `rename()` over the original — atomic on the same POSIX filesystem, and the only pattern that avoids a truncated spool if the process dies mid-write.

**Primary recommendation:** Implement `server/scripts/awcp-node-client.mjs` as a single file with pure, exported, unit-testable functions (spool append/read/evict/rewrite, client_seq allocation, batch-building, flush-with-ack-gated-removal) behind an entry-point guard, all state paths (`~/.awcp/spool.jsonl`, `~/.awcp/client_seq`, `~/.awcp/node_id`, and wherever the drop counter lives) injectable via a config object rather than hardcoded, so the Deno test suite can drive the same logic against `/tmp` without widening the existing `--allow-write=/tmp` grant. Prove EVENT-01 with a new hub-interaction Deno test that follows `workflow-node-hub-e2e.test.ts`'s `startServerProcess` pattern (submit `(node_id, client_seq)` twice over real HTTP), not with the in-process spool tests alone — CONTEXT.md's own Open Question #2 already flags this gap.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event durability before send (spool append + fsync) | Client (Node process on z2) | — | Must survive process crash and disconnection; no server round-trip involved |
| Exactly-once delivery semantics | API/Backend (hub) | Client | Hub owns the idempotency key enforcement (`UNIQUE(node_id, client_seq)`, `ON CONFLICT DO NOTHING`); client owns retry/replay and never re-derives `client_seq` from spool state (D-14) |
| Bounded local storage / overflow eviction | Client | — | Purely local disk-management concern; hub has no visibility into what the client dropped |
| Authentication (node bearer, enrolment secret) | Client (presents) + API/Backend (validates) | — | Bearer is generated out-of-band and lives only in client env/config (D-16); hub validates and stores only a digest (`remoteNodeHub.ts:66-78`, `store.ts:626-641`) |
| Node identity resolution / cross-node injection guard | API/Backend (hub) | — | `store.nodeOwnsBearer` — the client cannot and must not decide whether it "owns" a node_id; that is a hub-side SQL predicate (`remoteNodeHub.ts:414-432`) |
| Heartbeat / checkpoint reporting | Client | API/Backend | No dedicated hub route exists; these are `event_type` values sent through the same `/events` endpoint the spool already uses — the hub tier's role is unchanged from ordinary event ingestion |
| Test-time process orchestration (real HTTP proof) | Test infra (Deno, `serverProcess.ts` pattern) | — | Only a real process boundary proves the composition-root mount and hub-side dedup; in-process route-factory tests cannot (see `workflow-node-hub-e2e.test.ts` docblock, already exploiting this distinction for NODE-01..03) |
| Regression safety of existing MCP/workflow tools | API/Backend (existing suite) | — | Unmodified by this phase; proven by identity-comparing the existing test suite's pass/fail set before and after (D-10), not by re-architecting anything server-side |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs` (sync APIs: `openSync`, `writeSync`, `fsyncSync`, `readFileSync`, `renameSync`, `mkdirSync`, `chmodSync`) | Node 18 built-in `[VERIFIED: nodejs.org/api/fs]` | Durable append, atomic rewrite-and-rename, `0700`/`0600` permission enforcement (D-16) | Zero-dependency mandate (D-07); Node 18.19.1 confirmed running on z2 (STATE.md Blockers/Concerns, resolved 2026-08-15) |
| `node:path`, `node:os`, `node:crypto`, `node:process`, `node:url` | Node 18 built-in `[VERIFIED: nodejs.org]` | Path joins, `os.homedir()`, `randomUUID`/hex helpers, argv/env access, `pathToFileURL` for the entry-point guard | Same |
| Global `fetch` (undici-backed) | Stable in Node 18, but still emits `ExperimentalWarning: The Fetch API is an experimental feature` on every process start `[CITED: github.com/nodejs/node/issues/45580, github.com/nodejs/node/releases/tag/v18.0.0]` | HTTP calls to the hub | D-06 mandates global `fetch` with the warning suppressed via a targeted filter, not `--no-warnings` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Deno 2.0.0's `node:` specifier compatibility | Pinned by this repo's `deno.json` (`"lock": {"frozen": true}`, `"strict": true` compiler option — `[VERIFIED: /home/cpeddle/projects/ai-memory/deno.json]`) | Lets the Deno test suite `import` the `.mjs` directly and drive spool functions in-process (D-09) | Test-only; never used by the client itself, which runs under real Node on z2 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Global `fetch` | `node:http`/`node:https` request API | No experimental warning to suppress, but far more boilerplate for JSON POST + status/body handling; D-06 already decided in favor of `fetch` |
| Rewrite-and-rename spool eviction | Segment rotation (Kafka-style log segments) | Segment rotation amortizes eviction cost at scale but is unjustified complexity for a spike-grade client bounded to hundreds–low-thousands of ≤16 KiB entries; the Deferred section already flags proportionality as an open, unresolved question — full-file rewrite is the right default absent a stated durability/scale requirement |
| Rewrite-and-rename | Tombstoning (mark consumed, compact later) | Handles ack-gated removal naturally but not "drop-the-oldest-on-overflow" without a second mechanism; two mechanisms cost more than one for this scale |
| Separate `client_seq` counter file (D-14, locked) | Deriving next seq from `spool.jsonl`'s last line | **Rejected by D-14 with a concrete failure mode already traced**: resets to 0 every time the spool drains (the steady state after every successful flush), causing a fresh event to collide with an old acknowledged `client_seq` and be silently discarded by the hub's `ON CONFLICT DO NOTHING` |

**Installation:**
```bash
# No installation step. Zero npm dependencies (D-07); the repo has no package.json
# at any level (D-05 rejects adding one). The client is a single .mjs file using
# only Node 18 built-ins, copied to z2 and run with `node`.
```

**Version verification:** No package versions to verify — Node 18.19.1 itself was confirmed running on z2 directly (`STATE.md`: "Node v18.19.1, no Deno", cross-checked against the plan's §7.1 assumption). No `npm view` step applies; there is nothing installed.

## Package Legitimacy Audit

**Not applicable — zero external packages are installed in this phase.** D-07 (carried from STATE.md, restated in CONTEXT.md) mandates Node built-ins only, and D-05 explicitly rejects adding a `package.json` anywhere in the repo. There is no `npm install`, `pip install`, or `cargo add` step for this phase's deliverable. If a future phase revisits this constraint, run the Package Legitimacy Gate at that time.

## Architecture Patterns

### System Architecture Diagram

```
                         z2 (Ubuntu, Node v18.19.1, no Deno)
┌──────────────────────────────────────────────────────────────────────┐
│  awcp-node-client.mjs                                                │
│                                                                        │
│  entry-point guard: import.meta.url === pathToFileURL(argv[1]).href  │
│  (importing the module for tests must NOT trigger a real network op) │
│                                                                        │
│   ┌─────────────┐   allocate    ┌──────────────────┐                 │
│   │ new event    │──seq (D-14)─▶│ ~/.awcp/client_seq│ (separate file,│
│   │ produced      │             │ advanced on append,│  never derived│
│   └──────┬───────┘             │ never from spool)   │  from spool)  │
│          │ append + fsync                                            │
│          ▼                                                            │
│   ┌─────────────────────┐  overflow? evict oldest,   ┌──────────────┐│
│   │ ~/.awcp/spool.jsonl   │─increment dropped counter─▶│ drop counter ││
│   │ (append-only, JSONL,  │  (criterion 4)             │  (visible,   ││
│   │  oldest-first)         │                            │  Claude's    ││
│   └──────────┬────────────┘                            │  discretion) ││
│              │ read oldest-first, batch ≤500 (D-15)     └──────────────┘│
│              ▼                                                          │
│   ┌─────────────────────────┐   POST /workflow/nodes/:id/events        │
│   │ flush: fetch() with       │──Authorization: Bearer <AWCP_NODE_BEARER>─┐
│   │ Authorization header      │                                            │
│   └──────────┬───────────────┘                                            │
│              │ 200 {acknowledged:[{client_seq,event_id}]}  ◀──────────────┤
│              ▼                                                            │
│   remove ONLY acked entries from spool (rewrite-and-rename, fsync)        │
│   — never on send, never on retry attempt (EVENT-03)                      │
│                                                                            │
│   400 (issues[].client_seq) → drop exactly those entries, ++counter (D-15)│
│   401 → stop, keep spool intact, surface terminal state (D-17)            │
└────────────────────────────────────────────────┬─────────────────────────┘
                                                   │ tailnet (WireGuard, D-01)
                                                   ▼
        dev hub :3000 (Deno/Hono, FEATURE_WORKFLOW=true — see D-01)
┌──────────────────────────────────────────────────────────────────────┐
│ app.use("/workflow/nodes/*", validateNodeBearer)  [index.ts:1252-1255]│
│                                                                        │
│  POST /register ──▶ store.upsertExecutionNode                         │
│    - known bearer: UPDATE, no secret needed (re-register on boot)     │
│    - unknown bearer: needs X-Node-Enrolment-Secret (D-11/D-12)        │
│                                                                        │
│  POST /:node_id/events ──▶ normalizeBatch (16 KiB/event, dedup-first- │
│    -occurrence-wins) ──▶ store.ingestRunEvents                        │
│    (ON CONFLICT (node_id, client_seq) DO NOTHING)                     │
│    ──▶ store.acknowledgeSeqs (READ-BACK, not INSERT output —          │
│        covers duplicates too; client_seq coerced to Number)           │
└──────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
server/scripts/
└── awcp-node-client.mjs      # the ONLY new production artifact (D-04); first
                                # Node file in a directory otherwise Deno TS

server/tests/
├── workflow-remote-node-hub.test.ts   # existing Phase 2 file — natural home for
│                                       # new in-process client-logic tests, OR
├── awcp-node-client.test.ts           # a new sibling file (planner's call —
│                                       # CONTEXT.md leaves this open)
└── workflow-node-hub-e2e.test.ts      # existing pattern to imitate for the
                                        # hub-interaction (real HTTP, real process)
                                        # test that Open Question #2 asks for
```

### Pattern 1: Ack-gated, crash-safe spool removal (rewrite-and-rename)

**What:** Never mutate the spool file in place. To remove acknowledged entries (or evict the oldest on overflow), compute the new full line set in memory, write it to a temp file in the same directory, `fsyncSync` the temp file descriptor, then `renameSync` over the original.

**When to use:** Any time the spool file's *contents* need to shrink — after a flush ack (EVENT-03), or when appending would exceed the bound (criterion 4). Appending a single new line does NOT need this pattern — a plain `fs.appendFileSync`/`writeSync` + `fsyncSync` on the open fd suffices and is cheaper.

**Why this is the correct crash-consistency pattern (not merely a preference):** a bare in-place truncate-and-rewrite risks leaving a half-written file if the process dies mid-write; `rename()` on the same POSIX filesystem is atomic, so a reader (including the client's own next flush) either sees the old complete file or the new complete file, never a partial one. Combining `writeSync` alone without `fsyncSync` is insufficient — a synchronous Node write blocks the event loop but does not itself force the OS page cache to disk, so data can still be lost on a hard crash between the write and the OS's own writeback `[CITED: gauravsarma1992.medium.com "How safe is your fsync?"]`.

```javascript
// Illustrative pattern, not the final implementation. Source: Node fs docs
// (node:fs sync API) + standard crash-safe-write-file idiom.
import { openSync, writeSync, fsyncSync, closeSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

function atomicRewrite(targetPath, lines) {
  const tmpPath = join(dirname(targetPath), `.${Date.now()}.tmp`);
  const fd = openSync(tmpPath, "w", 0o600);
  try {
    writeSync(fd, lines.map((l) => l + "\n").join(""));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, targetPath); // atomic on the same filesystem
}
```

### Pattern 2: Entry-point guard so importing the module never triggers network I/O

**What:** Guard any top-level "run the client now" logic behind a check that the module was invoked directly, not imported.

**When to use:** Required by D-09 — the Deno test suite imports `awcp-node-client.mjs` directly via a `node:` specifier to drive spool functions in-process, and that import must not open a real network connection or read the real `~/.awcp/` directory.

```javascript
// CONTEXT.md D-09's literal form: import.meta.url === `file://${process.argv[1]}`.
// The more robust form below handles path edge cases (spaces, non-ASCII) that a
// bare string-concat file:// prefix can mis-encode; both are equivalent on a plain
// Linux path with no such characters, which is what z2 will always have.
import { pathToFileURL } from "node:url";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(); // real invocation: register / flush / heartbeat / etc.
}
```

### Pattern 3: Injectable state paths for test isolation

**What:** Every persisted path (`spool.jsonl`, the separate `client_seq` file, the persisted `node_id` file, wherever the drop counter is recorded) is a parameter with a production default of `os.homedir()/.awcp/...`, not a hardcoded constant.

**When to use:** Always, in this client. Required so the Deno test suite can point the client at `/tmp` (staying inside CLAUDE.md's existing `--allow-write=/tmp` grant) instead of writing into the real `$HOME/.awcp/` of whatever machine runs the test — including CI.

```javascript
export function createSpool(config = {}) {
  const home = config.home ?? new URL(".awcp/", `file://${process.env.HOME}/`);
  const spoolPath = config.spoolPath ?? new URL("spool.jsonl", home).pathname;
  const seqPath = config.seqPath ?? new URL("client_seq", home).pathname;
  // ...
}
```

### Pattern 4: Batch-then-flush with a client-side 500-event cap and permanent-rejection dropping (D-15)

**What:** Never send more than 500 events per POST (the hub's `eventsBody` schema hard-caps the array at `.max(500)` — `remoteNodeHub.ts:238`); on a `400` whose body carries an `issues` array of `{client_seq, bytes}` (the oversized-single-payload path — `remoteNodeHub.ts:301-303,402-404`), drop exactly those `client_seq` values from the spool and increment the visible drop counter. Never retry a permanent rejection.

**Why this matters — verified from source, not inferred:** `normalizeBatch` in `remoteNodeHub.ts:291-324` returns `{ accepted, oversized }`; `oversized` entries short-circuit the whole batch to `badRequest(c, ..., oversized)` **before any accepted event in that batch is stored or acked** (`remoteNodeHub.ts:401-404`). Without D-15's rule, ack-before-drop (EVENT-03) forbids removing the oversized entry, so it is resent forever, blocking every other entry queued behind it in the same flush — this is the exact livelock D-15's rationale describes for a long-outage replay.

```javascript
// Source: server/src/workflow/remoteNodeHub.ts:291-338,401-404 (read this session).
// Shape of the 400 response body for the oversized-payload path:
//   { error: "BadRequest", message: "...", issues: [{ client_seq: 5, bytes: 20000 }] }
async function flushOnce(batch, hubUrl, bearer) {
  const res = await fetch(hubUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ events: batch }),
  });
  if (res.status === 400) {
    const body = await res.json();
    if (Array.isArray(body.issues)) {
      const rejected = new Set(body.issues.map((i) => i.client_seq));
      return { acked: [], permanentlyDropped: rejected };
    }
  }
  if (res.status === 401) return { terminal: true };
  const { acknowledged } = await res.json();
  return { acked: acknowledged.map((a) => a.client_seq), permanentlyDropped: new Set() };
}
```

### Pattern 5: Reading the ack shape correctly (a documented past bug class)

**What:** `store.acknowledgeSeqs` returns `{ client_seq: number; event_id: string }[]`, with `client_seq` explicitly coerced from Postgres `bigint` (which `postgres.js` otherwise returns as a string) — `store.ts:840-857`. Compare spool entries against the **unwrapped `client_seq` field**, not the raw array element.

**Why:** `store.ts:840-846`'s own comment records that an earlier version of this exact acknowledgement omitted the `Number()` coercion and a client comparing with `===` would never clear a spool entry — retrying acknowledged events forever. This is not a hypothetical pitfall; it is a defect the hub code was already changed to prevent, and the client must not reintroduce the client-side half of the same class of bug (e.g. by comparing `event.client_seq` — likely a JS `number` from `JSON.parse`d spool JSONL — against a stringified ack value).

### Anti-Patterns to Avoid

- **Deriving `client_seq` from the spool's last line (D-14, locked reject):** resets to 0 on every drain, causing silent data loss via `ON CONFLICT DO NOTHING` on the next event.
- **Retrying forever on a permanent 400 or 401:** livelocks the client and hammers a hub reachable on all interfaces (`docker-compose.yml:53-54` publishes `3000:3000`), per D-15 and D-17.
- **Treating spool removal on send or on retry-attempt as acceptable:** violates EVENT-03/criterion 3 directly; removal is legal only after a 200 with the entry's `client_seq` present in `acknowledged`.
- **Writing the enrolment secret to `~/.awcp/`:** D-12 requires it to exist only in the environment of the one enrolling invocation. A config-file write (even transient) risks it outliving the process it was scoped to.
- **Logging or printing the raw bearer or enrolment secret anywhere, including captured stdout/stderr used as §13 evidence:** D-13. The repeatable gate for this is a Deno test that captures the client's full stdout+stderr across a register→flush→retry cycle and asserts neither credential string appears (see Validation Architecture below).
- **Assuming `mcp-test` (port 3001, `127.0.0.1`-only) is a viable real-node target:** D-01/D-02 fix the target at the dev hub `:3000`, published on all interfaces; `mcp-test` is unreachable from z2 by construction (`docker-compose.yml:120` vs `:54`).
- **Building or expecting a bidirectional control channel** (`request-status`, `request-checkpoint`, `pause-reporting`, etc. from the canonical plan's §7.1 list): the shipped hub does not implement any of them (`remoteNodeHub.ts:8-12` docblock, verified this session) — heartbeat/checkpoint are one-way `event_type` values through `/events`, nothing more.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent duplicate suppression | A client-side "have I sent this seq before" cache separate from the spool | Trust the hub's `UNIQUE(node_id, client_seq)` + `ON CONFLICT DO NOTHING` (already shipped, `store.ts:807-829`) and the read-back ack (`store.ts:847-857`) | The server already proves this correctly (`NODE-02b`, `workflow-remote-node-hub.test.ts:329-368`); duplicating the logic client-side only creates a second place it can disagree with the source of truth |
| Random bearer / node bearer generation | A custom PRNG-based hex generator | `openssl rand -hex 32` out of band (D-16, matching the pattern already documented at `docker-compose.yml:44` for the enrolment secret) | The client never generates its own bearer — it is provisioned externally and only ever *read* by the client from `AWCP_NODE_BEARER` |
| HTTP retry/backoff library | A hand-rolled exponential-backoff-with-jitter module modeled on a general-purpose retry library | A small, explicit backoff function bounded by D-17's required terminal state | Zero-dependency mandate forbids pulling in a retry package; but the *shape* (bounded attempts, explicit terminal state, no silent infinite loop) should still follow the well-known pattern, not be improvised ad hoc |
| Validating the node bearer's format client-side | A custom regex re-implementing `^[0-9a-f]{64}$` scattered across the client | One constant, matching `remoteNodeHub.ts:78`'s `BEARER_FORMAT`, used only to fail fast with a clear local error before wasting a round trip — the hub is still the authority | Avoids the two constants silently drifting apart; the hub's copy is the one that matters for correctness, this one is purely a client-side UX/fast-fail nicety |

**Key insight:** Because D-07 forbids all npm dependencies, "don't hand-roll" here is less about *substituting a library* (none is available) and more about *not re-deriving protocol guarantees the hub already provides*. The client's job is to be a faithful, disk-durable producer against a contract that is already correct; re-implementing dedup, ack semantics, or bearer validation client-side risks the two sides disagreeing about what "delivered" means.

## Common Pitfalls

### Pitfall 1: Setting `FEATURE_WORKFLOW=true` in `.env` and expecting it to take effect

**What goes wrong:** `.env` values only reach the `mcp` container for variables explicitly named in `docker-compose.yml`'s `environment:` block for that service (`docker-compose.yml:27-45`, confirmed this session: no `FEATURE_WORKFLOW` line exists there today). Setting it only in `.env` leaves the container unaware of it — `POST /workflow/nodes/register` keeps 404ing.
**Why it happens:** Compose does not pass through the shell/`.env` environment wholesale to a service; each service's `environment:` block is an explicit allowlist, as the file's own inline comments already explain for `AWCP_AGENT_API_KEY` and `AWCP_NODE_ENROLMENT_SECRET`.
**How to avoid:** Add `FEATURE_WORKFLOW: "true"` as a new line inside the `mcp` service's `environment:` block in `docker-compose.yml` itself (not the `.workflow.yml` overlay — see D-01), then `docker compose up -d mcp` to recreate the container with the new env baked in.
**Warning signs:** `curl -X POST http://<host>:3000/workflow/nodes/register` returns 404 (route not mounted) rather than 401 (route mounted, auth refused) — the two are diagnostically distinct and D-01 already records this exact confusion happened once (the "quiet 401" that was actually a 404, inferred rather than observed).

### Pitfall 2: Confusing the two distinct 400 shapes from the events endpoint

**What goes wrong:** A client that treats every 400 the same way (e.g., always retries, or always drops the whole batch) either livelocks or discards events that were never actually rejected.
**Why it happens:** `eventsBody`'s `.max(500)` violation (batch too large) produces a **zod-issue-shaped** 400 via `normalizeZodIssues` (no `client_seq` field, path points at `["events"]`), while the oversized-single-payload path produces a 400 with `issues: [{client_seq, bytes}]`. These look similar (`{error, message, issues}`) but `issues` means something different in each — verified by reading `remoteNodeHub.ts:326-338,391-404` this session.
**How to avoid:** Never let the client send more than 500 events in one flush (self-imposed cap per D-15 — this makes the `.max(500)` 400 unreachable by construction, so the client never needs to parse that shape at all). Only the oversized-payload 400 (`issues[].client_seq`) is reachable in normal operation, and only that shape needs a drop-by-`client_seq` handler.
**Warning signs:** A test that submits >500 events in one flush and expects `issues[].client_seq` handling to fire will observe a differently-shaped body and either crash or silently no-op.

### Pitfall 3: The existing suite destroys the criterion-6 evidence and de-enrolls the node

**What goes wrong:** Running `workflow-mvp-e2e.test.ts` (or any command that reaches the same `DATABASE_URL` as the real-node experiment) after the z2 run wipes `workflow.execution_nodes` via its unconditional `DROP SCHEMA IF EXISTS workflow CASCADE` (`workflow-mvp-e2e.test.ts:104,601` — confirmed this session). Because `upsertExecutionNode` returns `null` for an unknown bearer once enrolment is closed (`store.ts:704-716`), the node is now locked out behind an indistinguishable 401 until the operator re-opens the enrolment window.
**Why it happens:** The dev inner loop (`./dev.sh` + native `deno test ... server/tests/...`, documented in CLAUDE.md) points at the same shared dev Postgres the real-node experiment used.
**How to avoid:** Capture the §13 evidence (transcript + SQL readback) **at experiment time**, immediately after the z2 run, before running any test file that touches `DATABASE_URL`. D-03 already mandates this ordering.
**Warning signs:** A subsequent registration attempt from z2 (even with the correct bearer) returns 401 with no diagnostic distinguishing it from a wrong credential.

### Pitfall 4: Forgetting the "recreate the process" step when opening/closing enrolment

**What goes wrong:** `AWCP_NODE_ENROLMENT_SECRET` is read from the container's environment, fixed at container creation. Exporting the variable in a shell, or editing `.env`/`.env.dev` without recreating the `mcp` process, leaves the running process's `Deno.env.get(ENROLMENT_SECRET_ENV)` returning the old (possibly unset) value.
**Why it happens:** Deno reads `Deno.env` from the process's own environment, established at process start; editing a file on disk after the fact does not retroactively change it.
**How to avoid:** D-11's five-step sequence: confirm which process serves `:3000`, set the secret in the matching env file, **recreate** (`docker compose up -d mcp`), register, clear the value, **recreate again**. Verify the value **inside the running process**, never by inferring it from the HTTP response — every failure mode along this path (wrong bearer, unenrolled bearer, secret never received) answers the identical 401.
**Warning signs:** A registration attempt that "should" succeed keeps 401ing with no way to tell why from the response alone.

### Pitfall 5: Testing the entry-point guard incorrectly under Deno's `node:` import

**What goes wrong:** `import.meta.url === file://${process.argv[1]}` (D-09's literal form) depends on `process.argv[1]` being the exact path Node/Deno resolved for the invoked script. Under Deno's `node:` compatibility layer, `process.argv[1]` may not be populated the same way it is for a real `node` invocation, and a naive guard could either always-fire (leaking a live network flush into every test import) or never-fire (silently no-op'ing the intended production entry point).
**Why it happens:** D-09 explicitly states the import was "verified feasible" for the compatibility layer generally, but does not claim the guard's specific string-equality check was verified under Deno.
**How to avoid:** Write one Deno test whose only assertion is "importing the module performs zero network calls and zero writes to the real `$HOME`" before relying on the guard for anything else — this is the fastest way to catch a guard that fires under the wrong runtime.
**Warning signs:** A Deno test that imports the client for its pure functions unexpectedly attempts (and fails, or worse succeeds) an HTTP call, or writes into the test-runner's actual home directory.

## Code Examples

Verified patterns from official/first-party sources:

### Reading the hub's ack contract correctly
```typescript
// Source: server/src/workflow/store.ts:807-857 (read this session).
// ingestRunEvents uses ON CONFLICT (node_id, client_seq) DO NOTHING — a duplicate
// insert returns no row from the INSERT itself, which is why acknowledgeSeqs is a
// separate READ-BACK rather than deriving the ack from the INSERT's own output:
export async function acknowledgeSeqs(
  nodeId: string,
  seqs: number[],
): Promise<{ client_seq: number; event_id: string }[]> {
  const rows = await sql<{ client_seq: string; event_id: string }[]>`
    SELECT event_id, client_seq FROM workflow.run_events
    WHERE node_id = ${nodeId} AND client_seq = ANY(${seqs}::bigint[])
    ORDER BY client_seq
  `;
  return rows.map((r) => ({ event_id: r.event_id, client_seq: Number(r.client_seq) }));
}
```
The client must treat `acknowledged` as the authoritative "these client_seqs are safe to remove from the spool" list — not the request it sent, not the HTTP status alone.

### Real-process HTTP proof pattern to imitate for the EVENT-01 gate
```typescript
// Source: server/tests/workflow-node-hub-e2e.test.ts:88-177 (read this session) —
// the established pattern for proving a claim over a REAL process boundary rather
// than an in-process app.fetch() call. A new Phase 3 test (per CONTEXT.md's Open
// Question #2) should follow this exact shape: startServerProcess(), POST /register,
// POST /:node_id/events with the SAME (node_id, client_seq) TWICE, assert one row
// and an identical ack both times, then server.stop() and DELETE the test's own row.
const server = await startServerProcess(NODE_HUB_ENV, PORT);
try {
  // ...register, then POST the same client_seq twice, assert identical ack...
} finally {
  await server.stop();
  await sql`DELETE FROM workflow.execution_nodes WHERE bearer_token_hash = ${hash}`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Recorded 401 for `/workflow/nodes/register` on the dev hub | Actual observed 404 (route not mounted; `FEATURE_WORKFLOW` unset on base `mcp` service) | Corrected 2026-08-15 during Phase 3 preflight (`ce-doc-review` P0 finding) | The real-node leg cannot start until D-01's compose change lands; earlier planning that assumed "just point the client at :3000" would have failed opaquely |
| D-02's original stated reason ("hub tests don't read execution_nodes/run_events") | Corrected: they DO read those tables throughout, but every read is `node_id`- or `bearer_token_hash`-scoped | Corrected 2026-08-15 | Any new Phase 3 assertion over those tables must carry the same scoping or it becomes nondeterministic once a real node streams into the same database |

**Deprecated/outdated:**
- The canonical plan's §U3 naming `awcp-node-client.js` is superseded by D-04's `.mjs` — the repo still has no `package.json` anywhere, confirmed by D-05's rejection of adding one, so a bare `.js` would resolve as CommonJS and a top-level `import` statement would be a `SyntaxError`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `process.emit`/`process.emitWarning` override pattern is the correct "targeted filter" D-06 asks for (vs. blanket `--no-warnings`) | Standard Stack, Pattern discussion | Low — this is implementation detail within Claude's Discretion; if the exact filter shape is wrong, the fallback is simply a noisier captured transcript, not a functional break |
| A2 | `pathToFileURL(process.argv[1]).href` is a safe, equivalent-on-Linux alternative to D-09's literal `` `file://${process.argv[1]}` `` guard | Architecture Patterns, Pattern 2 | Low-Medium — if Deno's `node:` compatibility layer populates `process.argv[1]` unexpectedly, either form could misfire; Pitfall 5 already recommends a dedicated test to catch this before relying on it |
| A3 | Node 18.19.1's global `fetch` behaves identically to the general "stable since 18, warns until later majors" behavior found via web search, with no distribution-specific patch on z2's Ubuntu build | Standard Stack | Low — even if the warning text or suppression mechanism differs slightly, D-06's fallback (blanket `--no-warnings`, explicitly de-prioritized but not forbidden) still works |

**If this table is empty:** N/A — three low-risk assumptions remain, all implementation-detail-level; nothing here contradicts a locked CONTEXT.md decision or introduces a new architectural claim.

## Open Questions

Carried forward from CONTEXT.md's own `## Deferred / Open Questions` section — these are surfaced findings the user explicitly declined to pre-decide, not settled scope. The planner must resolve them, not this research:

1. **Co-tenancy observation gap (product-lens, P1).** Nothing in the currently-planned proof strategy exercises an authenticated `search_thoughts`/`capture_thought` call against the same stack the real node is streaming into. Recommendation from CONTEXT.md: immediately after the captured z2 run, exercise one authenticated memory-tool call against the dev stack and record it in §13 as the co-tenancy observation.
2. **EVENT-01 proof gap (scope-guardian, P1).** D-09's in-process spool-function tests cannot prove hub-side duplicate suppression. **This research recommends resolving it concretely**: add a hub-interaction Deno test following `workflow-node-hub-e2e.test.ts`'s `startServerProcess` pattern (see Code Examples above) rather than leaving it open.
3. **Host-fit friction routing (product-lens, P2).** Concrete inheritance costs discovered while building this client (the `.mjs` resolution, being the first Node artifact in a Deno-only tree, the D-09 permission-grant expansion) should be recorded in §13 as input to Phase 4's criterion-7 assessment, or they will be written from recall later.
4. **§13 section-numbering collision (new finding, this research).** `docs/investigations/ST-084-awcp-host-spike-findings.md` already contains **two** sections both headed `## 13.` — the original Stage 1 "Proposed ADR-016 amendments" (line 730) and Phase 1's appended "Stage 2 Unit 1: Policy-Scope Enforcement Pricing" (line 1039, physically the last section in the file, positioned after `## 14` and `## 15`). ROADMAP.md's Phase 3 delivery artifact line names "§13" for this phase's findings too. **Recommendation:** the planner should pick a heading that does not triple the collision — e.g. `## 16. Stage 2 Unit 3: Node Client, Reliable Delivery & Regression Safety` — and note in the entry that it supersedes the stale "§13" reference in ROADMAP.md/CONTEXT.md, the same supersession-note pattern D-04 already used for the `.mjs` filename.
5. **"Visible" drop counter — no concrete mechanism chosen.** Criterion 4 requires a counter that increments visibly; CONTEXT.md leaves the exact meaning to Claude's Discretion. Candidates worth planner consideration: (a) a `~/.awcp/state.json` sidecar file the client rewrites on every drop/evict, readable by a future `--status` subcommand; (b) a structured log line to stderr on every drop (captured naturally in any transcript); (c) both. Given D-13 already requires stdout/stderr capture-and-assert testing for credential absence, a stderr log line is nearly free to make assertable in the same test.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js on z2 | Running the client at all | ✓ (verified via SSH, STATE.md) | v18.19.1 | — |
| Deno on z2 | — | ✗ (confirmed absent) | — | Not needed — the client runs under Node; only the *test suite* needs Deno, and that runs in the existing dev container/native-Deno environment, not on z2 |
| Tailnet reachability z2 → dev hub `:3000` | Real-node experiments (D-01) | ✓ (verified 2026-08-15, `curl http://100.106.232.78:3000/health` from z2 → `{"status":"healthy"}`) | — | — |
| SSH access to z2 | Running/observing the client during experiments | ✓ via `ssh personal-server` alias (NOT a bare `ssh z2`, which fails publickey — near-miss already documented in CONTEXT.md) | — | — |
| `FEATURE_WORKFLOW=true` on the dev `mcp` service | `/workflow/nodes/*` routes existing at all | ✗ today — must be added per D-01 before any real-node leg runs | — | No fallback; this is a hard blocker addressed by one compose-file line + recreate |
| `openssl` (for generating the node bearer / enrolment secret) | D-11, D-16 | Assumed present on the operator's machine (already the documented command at `docker-compose.yml:44`) | — | Any equivalent 32-byte-hex generator (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |

**Missing dependencies with no fallback:**
- `FEATURE_WORKFLOW=true` on the base `mcp` service's compose environment block — must be added before the real-node leg can run at all (see Pitfall 1).

**Missing dependencies with fallback:**
- None beyond the openssl note above.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Deno's built-in test runner (`Deno.test`), pinned by `deno.json` (`"lock": {"path": "./deno.lock", "frozen": true}`, `"strict": true`) `[VERIFIED: /home/cpeddle/projects/ai-memory/deno.json]` |
| Config file | `deno.json` (repo root) |
| Quick run command | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read server/tests/awcp-node-client.test.ts` (or wherever the new client tests land) |
| Full suite command | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/` (from `server/`, per CLAUDE.md — note the `--allow-write=/tmp` and `--allow-run=deno,git` grants already exist for other files; D-09's new tests must fit inside them, not add new ones) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVENT-01 | Replaying `(node_id, client_seq)` produces no duplicate hub state, same ack both times | integration (real HTTP, real process — `startServerProcess` pattern) | `deno test ... server/tests/<new-or-existing>.test.ts -x --allow-run=deno` | ❌ Wave 0 — new test, per CONTEXT.md Open Question #2 |
| EVENT-02 | Disconnected node retains bounded local events, replays oldest-first on reconnect | unit (in-process, imports `.mjs` via `node:` specifier, D-09) | `deno test ... server/tests/<file>.test.ts -x` | ❌ Wave 0 |
| EVENT-03 | Spool entry removed only after hub ack | unit (same pattern; simulate a 401/timeout mid-flush and assert entry survives) | same | ❌ Wave 0 |
| EVENT-04 | Overflow drops oldest, visible counter increments | unit (drive spool append past the cap, assert eviction + counter) | same | ❌ Wave 0 |
| SAFE-01 | Existing authenticated MCP/workflow tools pass unmodified | regression (existing suite, test-identity comparison per D-10) | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/` (pre-Phase-3 file set only) | ✅ existing |
| SAFE-02 | Tests repeatable against shared test stack, no mutation of seeded corpus | regression (existing suite already enforces this; Phase 3 adds no new corpus-touching test) | same as SAFE-01 | ✅ existing |
| D-13 (credential leak gate, not a numbered REQ but explicitly mandated as "the same repeatable gate as the others") | Captured stdout/stderr across register→flush→retry never contains the raw bearer or enrolment secret | unit/integration (capture output, `assert(!output.includes(secret))`) | same file as EVENT-01/02/03 candidates | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the quick run command above, scoped to the new client test file(s)
- **Per wave merge:** the full suite command (D-10's baseline: record file+test name of each of the nine known provider-401 failures against the pre-Phase-3 file set, then compare name-for-name — not by count, since D-09's new tests change the total)
- **Phase gate:** full suite green (modulo the nine documented provider-401 failures, unchanged) before `/gsd-verify-work`; separately, the real z2 run captured into §13 (D-08 — the repeatable Deno gate and the one-shot z2 evidence are not interchangeable)

### Wave 0 Gaps
- [ ] New Deno test file (existing `workflow-remote-node-hub.test.ts` or a new sibling — planner's call) covering EVENT-02, EVENT-03, EVENT-04 via in-process `.mjs` import (D-09)
- [ ] New hub-interaction Deno test using the `startServerProcess` pattern for EVENT-01 (Open Question #2) — the in-process tests alone cannot discharge this requirement
- [ ] A test asserting the D-14 client_seq-persistence invariant specifically: restart the client with a drained spool, assert the next allocated seq exceeds the highest previously delivered one
- [ ] A test capturing stdout/stderr across register→flush→retry and asserting neither the bearer nor the enrolment secret string appears (D-13's repeatable gate)
- [ ] Baseline capture of the pre-Phase-3 test file/test-name set (for D-10's identity comparison) — run and record before any Phase 3 code lands
- [ ] The one-shot §13 real z2 experiment capture (not a Deno test — a manual/scripted run whose transcript and SQL readback become the criterion-6 evidence, per D-03/D-08)

*(These are genuine gaps, not covered by existing infrastructure — Phase 2's `workflow-remote-node-hub.test.ts` and `workflow-node-hub-e2e.test.ts` prove the HUB half only; nothing today drives the client.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Per-node bearer, 64-lowercase-hex, generated out-of-band with `openssl rand -hex 32`; hub stores only a SHA-256 digest, never the raw value (`store.ts:626-641`, `remoteNodeHub.ts:66-78`) — client-side obligation is to never persist the raw bearer anywhere but the one env var it reads from (D-16) |
| V3 Session Management | n/a | No session concept — every request is independently bearer-authenticated; not applicable to this client |
| V4 Access Control | yes | Cross-node injection guard is entirely hub-side (`store.nodeOwnsBearer`, `remoteNodeHub.ts:414-432`) — client has no access-control logic of its own to get wrong, only the obligation to send its own bearer, never another node's |
| V5 Input Validation | yes | Client-side pre-validation of its own outgoing batch (≤500 events, ≤16 KiB payload) is a fast-fail nicety; the hub is the authority (`normalizeBatch`, `eventsBody` — already validated server-side) |
| V6 Cryptography | yes | SHA-256 digesting and constant-time comparison are entirely hub-side (`checksumOfText`, `timingSafeEqual` — `remoteNodeHub.ts:120-128`); the client never hand-rolls comparison or hashing of credentials — it only ever transmits the raw bearer/secret over the tailnet-encrypted (WireGuard) link, matching D-01's "plain http:// acceptable only because tailnet-encrypted end to end" constraint |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential leakage into logs/transcripts (this phase's specific, elevated risk — captured stderr is deliberately used as evidence) | Information Disclosure | D-13: redact any registration transcript quoted into §13 before commit; automated test asserting captured stdout/stderr never contains the raw bearer or enrolment secret string |
| Enrolment-window replay by a third party sniffing the wire during the one-time enrolment POST | Spoofing | Tailnet (WireGuard) encryption is the actual control here — D-01 explicitly conditions plain `http://` acceptability on staying on the tailnet; any repointing of the client off-tailnet requires TLS |
| Infinite retry against a hub that is reachable on all interfaces (`0.0.0.0:3000`) after a permanent 401 | Denial of Service (self-inflicted, against the shared dev hub) | D-17's mandatory terminal state on auth failure — stop attempting, keep spool intact, surface the condition |
| Silent data loss from `client_seq` collision after a spool drain | Tampering (of the delivery-exactly-once guarantee, not of data in the security sense, but the mechanism is identical to a replay-collision bug) | D-14: persist `client_seq` in a separate, monotonic file, never derived from spool contents |

## Sources

### Primary (HIGH confidence — read directly this session)
- `server/src/workflow/remoteNodeHub.ts` — full file read; endpoint contracts, `MAX_PAYLOAD_BYTES`, `normalizeBatch`, auth flow, mount comments
- `server/src/workflow/store.ts` — full file read; `upsertExecutionNode`, `nodeOwnsBearer`, `ingestRunEvents`, `acknowledgeSeqs`
- `server/src/workflow/bootstrap.ts` — full file read; `workflowFeatureEnabled`, `bootstrapWorkflow`, feature-flag polarity
- `server/index.ts` (relevant ranges: 1-120, 1170-1280, 1310-1335) — workflow mount, node-hub mount, `FEATURE_ENTITY_WORKER`/`FEATURE_CONSOLIDATION_WORKER` default-true confirmation
- `docker-compose.yml`, `docker-compose.workflow.yml` — full read; confirmed `FEATURE_WORKFLOW` absent from base `mcp` environment block
- `server/tests/_helpers/serverProcess.ts` — full file read; `startServerProcess` pattern
- `server/tests/workflow-node-hub-e2e.test.ts` — full file read; the real-HTTP-mount-proof pattern to imitate for EVENT-01
- `server/tests/workflow-remote-node-hub.test.ts` (grepped + targeted reads) — D-02 scoping pattern, existing NODE-02/02b duplicate-handling tests
- `server/tests/workflow-mvp-e2e.test.ts` (targeted reads) — `DROP SCHEMA` locations confirmed
- `server/scripts/awcp.ts` (partial read) — existing Deno CLI conventions in `server/scripts/`
- `deno.json` — test runner config, `strict`/`frozen` settings
- `docs/investigations/ST-084-awcp-host-spike-findings.md` (structure scan + targeted reads of §12a, §13×2) — the §13 numbering collision finding
- `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` (grepped) — criterion 6 gate status
- `docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md` (§U2-U4 read) — original unit contracts, confirms no dedicated heartbeat/checkpoint endpoint was ever built
- `.planning/phases/03-node-client-reliable-delivery-regression-safety/03-CONTEXT.md` — all 18 locked decisions, canonical refs, code context, deferred/open questions

### Secondary (MEDIUM confidence)
- [Suppress "ExperimentalWarning" in Node.js 18 (gist)](https://gist.github.com/mteplyi/81c6f0a8307c605a5f9ab9e11318dcaa)
- [nodejs/node#45580 — `--no-experimental-fetch` does not disable fetch](https://github.com/nodejs/node/issues/45580)
- [Node.js v18.0.0 release notes](https://github.com/nodejs/node/releases/tag/v18.0.0)
- [How safe is your fsync? (Medium)](https://gauravsarma1992.medium.com/how-safe-is-your-fsync-792916545101)
- [crash-safe-write-file (GitHub reference implementation)](https://github.com/CharlieHess/crash-safe-write-file)

### Tertiary (LOW confidence)
- None used as load-bearing claims; all web-search findings above are corroborated by the Node.js project's own GitHub issue tracker/release notes rather than third-party blogs alone.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero dependencies, all Node built-ins, versions confirmed by direct SSH observation of z2 (recorded in STATE.md)
- Architecture: HIGH — hub contract read directly this session; no server-side ambiguity remains, only client-side implementation choices already bounded by CONTEXT.md's locked decisions
- Pitfalls: HIGH — every pitfall above traces to a specific file:line read this session or a decision already verified against the running stack in CONTEXT.md
- Durability/fsync patterns: MEDIUM — standard, well-documented Node.js pattern, corroborated by multiple independent sources, but not fetched from Node's own official docs via Context7 in this session

**Research date:** 2026-08-15
**Valid until:** 30 days (stable Node built-ins, fixed hub contract) — but re-verify the `FEATURE_WORKFLOW` compose state and z2 reachability immediately before execution if more than a few days have passed, per STATE.md's own reachability-expiry caveat
