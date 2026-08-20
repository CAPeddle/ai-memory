---
phase: 03-node-client-reliable-delivery-regression-safety
reviewed: 2026-08-18T00:00:00Z
depth: deep
files_reviewed: 4
files_reviewed_list:
  - server/scripts/awcp-node-client.mjs
  - server/tests/awcp-node-client.test.ts
  - server/tests/workflow-node-client-hub-e2e.test.ts
  - docker-compose.yml
findings:
  critical: 5
  warning: 8
  info: 3
  total: 16
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-08-18
**Depth:** deep (cross-file: client ↔ `server/src/workflow/remoteNodeHub.ts` ↔ `server/index.ts`)
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the phase's three named deliverables plus the one other source file in the
phase diff (`docker-compose.yml`; the remaining changes since `47284cc` are
documentation, `.gitignore`, and planning artifacts). No tests were executed — every
finding below is provable by reading the code, and the dev-database hazard named in the
review brief made a confirmation run not worth buying.

The client is carefully written and unusually well documented; the defects are not
sloppiness but gaps between what the docblocks *claim* and what the code *enforces*.
Three themes recur:

1. **The durability claim is stronger than the implementation.** `writeSync`'s return
   value is discarded in all three write helpers, and `readSpool` has zero tolerance for
   a malformed line — so one short write makes the entire spool permanently unreadable
   and takes every CLI command down with it.
2. **Defence against a buggy hub is applied inconsistently.** `flush()` explicitly
   guards against a non-intersecting *ack* (line 679, with a comment saying the client
   "must not trust" the hub), yet both the ack and reject branches then delete spool
   entries **outside the batch that was sent** — and the reject branch does not even
   count those deletions against the drop counter.
3. **"Never retries forever" was achieved by converting infinite retry into an infinite
   stall.** `too_large` and `malformed` stop with the spool untouched and no drop path,
   so the offending head-of-line entry is re-sent on every subsequent flush forever,
   while `main` reports that outcome as **exit code 0 (success)**.

**Credential handling — checked and clean.** The review brief asked specifically whether
the bearer can reach `~/.awcp/`. It cannot, and the claim in the module docblock
(lines 28–43) holds under tracing: `AWCP_NODE_BEARER` and `AWCP_NODE_ENROLMENT_SECRET`
live only on the in-memory config object; nothing serialises that object; the only
persisted values are `node_id`, the seq counter, the spool lines, and `state.json`;
`registerNode`'s `AwcpHttpError` message carries only the HTTP status and response text;
`main` prints only `{outcome, acked, delivered, remaining}` / `{node_id}` /
`{client_seq}` / the two `status` lines; and `flushOnce`'s `unreachable` outcome carries
an `error` object that neither `flush` nor `main` ever logs. Modes are correct (0700 dir,
0600 files, `chmod` applied unconditionally rather than relying on `open`'s creation-only
mode). No finding below concerns credential leakage.

---

## Critical Issues

### CR-01: An ignored `writeSync` return value plus an intolerant `readSpool` can brick the client and make every unacknowledged event unreadable

**File:** `server/scripts/awcp-node-client.mjs:154-176`, `:292-299`, `:283`, `:318-324`

**Issue:**
All three write helpers discard the return value of `writeSync`:

```js
// :157 writeFileFsync, :170 appendLineFsync, :320 writeSpool
writeSync(fd, content);   // returns bytes written — never checked
fsyncSync(fd);
```

`fs.writeSync` is documented to return the number of bytes written and is **not**
guaranteed to write the whole string in one call. A short write — the realistic trigger
is ENOSPC on a node whose disk fills, which is exactly the failure mode a durable spool
exists to survive — lands a **truncated JSON line** in `spool.jsonl` and throws nothing.
`fsyncSync` then dutifully makes the truncation durable.

`readSpool` has no tolerance for that line:

```js
// :295-298
return raw.split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line));
```

One bad line makes `JSON.parse` throw, and `readSpool` is on the path of *every* command:
`flush` (:655), `status` (:894), `emitHeartbeat` (:754), `emitCheckpoint` (:783), and —
critically — `appendEvent`'s own eviction check (:283). So after a single short write the
client cannot emit, cannot report status, and **cannot flush**: every event still spooled
and unacknowledged is unrecoverable without manual file surgery. This is the deepest
violation of the phase's crash-safety claim, and it is silent.

The same hazard applies to `writeFileFsync` on `node_id` and `client_seq`: a short write
to `client_seq` yields a truncated integer, which `allocateSeq` (:256) happily parses as a
smaller number — resetting the sequence and causing the hub's
`ON CONFLICT (node_id, client_seq) DO NOTHING` to silently discard subsequent events.

**Fix:** Verify the write completed, and make the reader survive one bad trailing line.

```js
function writeAllSync(fd, content) {
  const buf = Buffer.from(content, "utf8");
  let off = 0;
  while (off < buf.length) {
    const n = writeSync(fd, buf, off, buf.length - off);
    if (n <= 0) throw new Error("short write to spool: disk full or device error");
    off += n;
  }
}

export function readSpool(config) {
  if (!existsSync(config.spoolPath)) return [];
  const lines = readFileSync(config.spoolPath, "utf8").split("\n")
    .filter((l) => l.trim() !== "");
  const entries = [];
  const corrupt = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { corrupt.push(line); }
  }
  if (corrupt.length > 0) {
    // Quarantine rather than throw: an unreadable line must cost one event, never
    // the whole spool. Rewrite the file without it and count it as a visible drop.
    writeSpool(config, entries);
    recordDrops(config, corrupt.map(() => null), "corrupt_spool_line");
  }
  return entries;
}
```

---

### CR-02: The `rejected` branch deletes spool entries outside the sent batch and does not count them as drops — silent, uncounted event loss

**File:** `server/scripts/awcp-node-client.mjs:690-710` (primary), `:666-687` (same class)

**Issue:**
In the `rejected` branch, `matched` is computed against **`batchEntries`** (the first
`FLUSH_MAX_EVENTS` entries), but the deletion set is computed against **`entries`** (the
*entire* spool), and only `matched` is passed to `recordDrops`:

```js
const rejectedSeqs = new Set(result.rejected);
const matched = batchEntries.filter((e) => rejectedSeqs.has(e.client_seq));   // :692
if (matched.length === 0) return stopTerminal("malformed");
const remaining = entries.filter((e) => !rejectedSeqs.has(e.client_seq));     // :701  ← whole spool
writeSpool(config, remaining);                                                // :704
recordDrops(config, matched.map((e) => e.client_seq), "permanent_rejection"); // :705  ← batch only
```

If a hub response names any `client_seq` sitting at spool position 501 or later (a hub
bug, a response replayed from a prior batch, or a hostile/compromised hub — and only one
seq needs to be in the batch to get past the `matched.length === 0` guard), that entry is
**deleted from disk and never reaches the drop counter**. It is not delivered, not
retried, and not visible in `state.json`, `status`, or the structured stderr line. That
directly defeats criterion 4 / EVENT-04, whose whole point is that no drop is silent.

The `acked` branch has the same over-broad filter — `entries.filter(...)` at :668 rather
than intersecting with `batchEntries` — so a 200 whose `acknowledged` array names unsent
seqs clears entries the hub never received. That branch alone would be a WARNING (it needs
a hostile hub and produces no counter inconsistency), but it is the same one-line fix and
the same trust boundary. The code already argues at :671-678 that the client "must not
trust" the hub's response as a liveness guarantee; it should not trust it as a deletion
authority either.

**Fix:** Constrain both removal sets to the batch actually sent.

```js
const batchSeqs = new Set(batchEntries.map((e) => e.client_seq));

// acked branch
const ackedSeqs = new Set(result.acked.filter((s) => batchSeqs.has(s)));
const remaining = entries.filter((e) => !ackedSeqs.has(e.client_seq));

// rejected branch
const rejectedSeqs = new Set(result.rejected.filter((s) => batchSeqs.has(s)));
const matched = batchEntries.filter((e) => rejectedSeqs.has(e.client_seq));
if (matched.length === 0) return stopTerminal("malformed");
const remaining = entries.filter((e) => !rejectedSeqs.has(e.client_seq));
// now `remaining` and `matched` are provably complementary — the counter cannot
// under-report what was deleted.
```

---

### CR-03: No mutual exclusion between processes — a concurrent `emit` loses unacknowledged events and duplicates `client_seq`

**File:** `server/scripts/awcp-node-client.mjs:250-261` (`allocateSeq`), `:268-289`
(`appendEvent`), `:309-334` (`writeSpool`), `:601-731` (`flush`)

**Issue:**
There is no lockfile, no `flock`, no `O_EXCL` sentinel, and no documented single-writer
constraint anywhere in the client or in the phase's plans (grep for
`flock|lockfile|single-writer|mutual exclusion` across `server/scripts/`, the phase
directory, and `docs/` returns nothing relevant). Yet the CLI's own shape presumes
concurrency: `run` is a long-lived daemon that heartbeats and flushes, while `emit` and
`checkpoint` are one-shot invocations meant to be called by the node's agent/hooks. Two
windows are unguarded:

1. **Lost append (unacknowledged event loss).** `flush` reads the spool at :655, does a
   network round trip, then calls `writeSpool(config, remaining)` at :685/:704, which
   *replaces the whole file* via rewrite-and-rename. Any line appended by another process
   between the read and the `renameSync` is destroyed — never sent, never acked, never
   counted as a drop. This is precisely the "spool write path that can lose an
   unacknowledged event" the review brief asked about, and rewrite-and-rename is what
   creates it: an atomic replace is only safe under a single writer.

2. **Duplicate `client_seq`.** `allocateSeq` is a read-increment-write with no atomicity
   (:253-259). Two concurrent `emit` calls both read `N` and both write `N+1`, producing
   two different events sharing one seq. The hub's `normalizeBatch` docblock states the
   consequence explicitly: *"never reuse a client_seq for different content. Doing so
   silently discards the later payload."* The duplicate is dropped server-side with a
   200 ack, so the client removes it from the spool and reports success.

**Fix:** Take an exclusive lock over `config.home` around every read-modify-write of the
spool and seq counter (allocate+append, and the read→flush→writeSpool cycle), or reject
concurrent invocation outright.

```js
// Minimal, dependency-free: O_EXCL lockfile with a stale-PID check.
function withHomeLock(config, fn) {
  ensureStateDir(config);
  const lockPath = join(config.home, ".lock");
  let fd;
  for (let i = 0; i < 50; i++) {
    try { fd = openSync(lockPath, "wx", 0o600); break; }
    catch (e) { if (e.code !== "EEXIST") throw e; sleepSyncMs(100); }
  }
  if (fd === undefined) throw new Error(`another awcp-node-client holds ${lockPath}`);
  try { writeSync(fd, String(process.pid)); return fn(); }
  finally { closeSync(fd); unlinkSync(lockPath); }
}
```

If out-of-scope for now, this must at minimum be stated as a hard operational constraint
in the module docblock and in the z2 runbook — the current documentation implies the
opposite by shipping a daemon and a one-shot emitter in the same binary.

---

### CR-04: The exit-code contract reports terminal, unrecoverable failures as success (exit 0)

**File:** `server/scripts/awcp-node-client.mjs:872-888`, `:867-871`

**Issue:**
`flush()` can return six outcomes: `acked`, `deferred`, `terminal_auth`, `unknown_node`,
`too_large`, `malformed`. `main`'s switch handles three and lumps the rest into the
success branch:

```js
if (result.outcome === "terminal_auth")      process.exitCode = 77;
else if (result.outcome === "deferred")      process.exitCode = 75;
else                                         process.exitCode = 0;   // ← :885
```

So `unknown_node` (404 — this node was de-enrolled hub-side), `too_large` (413), and
`malformed` (an unrecognised 400, or a hub naming seqs the client never sent) all exit
**0**. The stated purpose of the exit codes is that "a shell transcript records the
outcome without parsing stdout" (:875-877) — but under all three of these outcomes the
spool is permanently stuck and the harness is told everything is fine. The de-enrolment
hazard is not hypothetical; the phase's own `STATE.md` records it as a standing concern,
and it is the outcome most likely to be hit in production.

Second half of the same gap: `register` (:867-871) has no exit-code mapping at all. A 401
from `registerNode` throws an `AwcpHttpError` out of `main`, out of the top-level `await`
at :957, and exits **1** with a stack trace — not 77. The "77 = terminal auth" contract
therefore only holds for `flush`, and the one command an operator runs first during
enrolment is the one that does not honour it.

`awcp-node-client.test.ts:998-1046` asserts only the 0/77/75 triple; no test covers the
three outcomes that fall through to 0.

**Fix:**

```js
const EXIT_CODE_BY_OUTCOME = {
  acked: 0,
  deferred: 75,          // retryable exhaustion — spool intact, try again later
  terminal_auth: 77,     // credential is wrong/revoked — human action required
  unknown_node: 78,      // hub does not know this node — re-register required
  too_large: 78,
  malformed: 78,
};
process.exitCode = EXIT_CODE_BY_OUTCOME[result.outcome] ?? 1;

// and for register:
try {
  const nodeId = await registerNode(config);
  console.log(JSON.stringify({ node_id: nodeId }));
} catch (err) {
  if (err instanceof AwcpHttpError && err.status === 401) {
    process.stderr.write(`awcp-node-client: terminal reason=auth_failed\n`);
    process.exitCode = 77;
    return;
  }
  throw err;
}
```

---

### CR-05: `too_large` and `malformed` wedge the spool permanently with no drop path — and the run loop keeps ticking into oldest-first eviction

**File:** `server/scripts/awcp-node-client.mjs:713-723`, `:77`, `:826-846`;
`server/tests/awcp-node-client.test.ts:893-913`

**Issue:**
`stopTerminal` returns with **the spool untouched** for `too_large` and `malformed`. Both
are head-of-line conditions caused by a *specific spooled entry*, so the next flush
rebuilds the identical batch, gets the identical response, and stops again — forever.
There is no drop path, unlike D-15's `rejected` case. Both are reachable from the public
CLI with no client-side validation:

- **`malformed`:** the hub's `eventsBody` schema caps `event_type` at 128 characters
  (`remoteNodeHub.ts:234`). `main`'s `emit` (:899-909) validates only that an event type
  is non-empty. `awcp-node-client emit <129-char-string>` spools an entry that trips zod,
  returning a 400 whose issues carry no numeric `client_seq` → `malformed` → permanent
  wedge.
- **`too_large`:** `MAX_PAYLOAD_BYTES` is **exported at :77 and never referenced anywhere
  in the client** — its own docblock says client-side enforcement "arrives in 03-04", and
  it did not. A payload above the hub's 9 MiB `MAX_REQUEST_BYTES` (`api.ts:229`) — e.g.
  captured command output, the exact payload the hub's NUL-stripping docblock anticipates
  — returns 413 → `too_large` → permanent wedge.

Compose this with `runAgent` (:826-846), which exits **only** on `terminal_auth`. Under a
wedge the loop keeps ticking: `emitHeartbeat` appends every 60 s, `flush` returns
`too_large`/`malformed` and delivers nothing, the spool grows to `spoolMaxEntries`, and
then `appendEvent`'s eviction (:284-286) starts deleting the **oldest** entries — i.e. the
real execution events — to make room for more heartbeats. A permanent stall becomes
ongoing data loss, and `main("run")` still exits 0 when eventually stopped.

`awcp-node-client.test.ts:893-913` (`"a 413 (payload too large) stops after exactly one
request and leaves the spool intact"`) **asserts the wedge as the expected behaviour** —
the test encodes the bug, so the suite cannot catch it.

**Fix:** Enforce the ceilings client-side at append time (fail fast on the caller, who can
still act), and give the terminal head-of-line outcomes a bounded drop path.

```js
export const MAX_EVENT_TYPE_LENGTH = 128;   // matches remoteNodeHub.ts eventsBody

export function appendEvent(config, event) {
  if (typeof event.event_type !== "string" || event.event_type.length < 1 ||
      event.event_type.length > MAX_EVENT_TYPE_LENGTH) {
    throw new Error(`event_type must be 1..${MAX_EVENT_TYPE_LENGTH} characters`);
  }
  const encoded = event.payload === undefined ? "null" : JSON.stringify(event.payload);
  if (Buffer.byteLength(encoded, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new Error(`payload exceeds ${MAX_PAYLOAD_BYTES} bytes — not spooled`);
  }
  ...
}
```

and, in `flush`, on `too_large`/`malformed` when the batch is a single entry, drop that
entry via `recordDrops(config, [seq], result.outcome)` before stopping, so the head of
line can never block the queue forever. `runAgent` should also exit non-zero on a
repeated non-auth terminal outcome rather than ticking indefinitely.

---

## Warnings

### WR-01: `flushOnce` throws on a 200 with a missing `acknowledged` array, contradicting its own no-throw contract

**File:** `server/scripts/awcp-node-client.mjs:556-558`

**Issue:** The docblock promises `flushOnce` "NEVER throws on a non-2xx response … every
status the hub can return maps to an outcome the caller branches on explicitly." But the
200 path is unguarded:

```js
const body = await res.json();
const acknowledged = body.acknowledged;
const acked = acknowledged.map((entry) => entry.client_seq);   // TypeError if absent
```

A 200 whose body is not JSON, or is JSON without `acknowledged`, throws a `TypeError`/
`SyntaxError` out of `flushOnce` → out of `flush` → out of `main` → unhandled rejection at
the top-level `await` (:957), exiting 1 with a stack trace instead of the 0/75/77
contract. The spool is not lost, but the failure is unclassified and the run loop dies.

**Fix:**

```js
let body;
try { body = await res.json(); } catch (error) { return { outcome: "malformed", detail: String(error) }; }
const acknowledged = body?.acknowledged;
if (!Array.isArray(acknowledged)) return { outcome: "malformed", detail: body };
return { outcome: "acked", acked: acknowledged.map((e) => e?.client_seq), acknowledged };
```

### WR-02: `flushOnce` throws on a non-JSON 400 — the realistic shape from an intercepting proxy

**File:** `server/scripts/awcp-node-client.mjs:533-534`

**Issue:** `if (res.status === 400) { const body = await res.json(); ... }` assumes every
400 carries JSON. This repo's own `CLAUDE.md` documents a corporate Fortinet-style
SSL-intercepting proxy in the environment — the classic source of an HTML `400 Bad
Request` page. `res.json()` rejects, and that `SyntaxError` escapes the function that
promises never to throw. Note the code went to real trouble to get this right for 401
(the STATUS-BEFORE-BODY comment at :497-502 describes fixing exactly this bug class for
401) but left the same hole on 400.

**Fix:** Wrap the parse as in WR-01 and return `{outcome: "malformed", detail}` on a parse
failure.

### WR-03: `flushOnce` reads `node_id` outside its try block — an unregistered node crashes instead of failing cleanly

**File:** `server/scripts/awcp-node-client.mjs:512`

**Issue:** `const nodeId = readFileSync(config.nodeIdPath, "utf8").trim();` sits above the
`try`. Running `awcp-node-client flush` (or `run`) before `register` throws `ENOENT` out
of `main` — exit 1 with a stack trace, no actionable message — even though the module has
a `readNodeIdOrNull` helper (:738-745) for exactly this. In `run`, this happens *after*
the start checkpoint has already been appended, so the loop dies mid-cycle.

**Fix:**

```js
if (!existsSync(config.nodeIdPath)) {
  return { outcome: "malformed", detail: "not registered — run `awcp-node-client register` first" };
}
```

### WR-04: `registerNode` truncates the persisted `node_id` before validating the hub's response

**File:** `server/scripts/awcp-node-client.mjs:474-476`, `:154-165`

**Issue:** `writeFileFsync(config.nodeIdPath, body.node_id, 0o600)` opens the target with
`openSync(path, "w", mode)` — which **truncates immediately** — and only then attempts to
write `body.node_id`. If the 201 body lacks `node_id` (or carries a non-string), the
`writeSync` throws *after* the existing, good `node_id` has already been destroyed, leaving
a zero-byte file. A subsequent `flush` then reads `""` and POSTs to
`/workflow/nodes//events`, which cannot resolve, producing a `malformed`/`unknown_node`
wedge (see CR-05). This is the one persisted path that skips the rewrite-and-rename
discipline the module applies (correctly, with a good rationale) to `spool.jsonl` and
`state.json`.

Secondarily: `body.node_id` is never validated against the UUID shape the docblock claims
for it (:42), and it is interpolated into a request URL unencoded at :516
(`${config.hubUrl}/workflow/nodes/${nodeId}/events`). The hub returns a database UUID, so
this is defence-in-depth rather than a live exploit — but validating it is one line and
removes the truncation hazard at the same time.

**Fix:**

```js
const body = await res.json();
const nodeId = typeof body?.node_id === "string" ? body.node_id.trim() : "";
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nodeId)) {
  throw new AwcpHttpError(res.status, `registerNode: hub returned a malformed node_id`);
}
writeFileFsync(config.nodeIdPath, nodeId, 0o600);   // only after validation
return nodeId;
```
Better still, use the same temp-file + `renameSync` primitive `writeState` uses.

### WR-05: `run` ignores SIGINT/SIGTERM for up to a full heartbeat interval

**File:** `server/scripts/awcp-node-client.mjs:830-832`, `:917-930`

**Issue:** `stop()` only sets a flag; the loop is parked in `await sleepImpl(interval)`
with no cancellation, and the default interval is 60 s. So after Ctrl-C or a systemd
`SIGTERM` the process appears hung for up to a minute. Under systemd's default
`TimeoutStopSec=90` it will usually survive, but under a shorter timeout or a container
stop grace period of 10 s it is SIGKILLed — losing the stop checkpoint and the final
flush that `runAgent` is written to perform (:840-841).

**Fix:** Make the tick interruptible — resolve the sleep early on stop.

```js
let wake = () => {};
const tick = (ms) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  wake = () => { clearTimeout(t); resolve(); };
});
// stop: () => { stopped = true; wake(); }
```
(Keep `config.sleepImpl` as the injectable seam so the existing deterministic tests are
unaffected.)

### WR-06: Heartbeats evict real execution events during a long outage

**File:** `server/scripts/awcp-node-client.mjs:753-764`, `:279-286`

**Issue:** Heartbeats are ordinary spooled events subject to the same 1000-entry cap. If
the hub is unreachable, `runAgent` appends one heartbeat per minute while nothing drains,
so within ~16 hours pure liveness noise fills the spool and oldest-first eviction begins
deleting the execution events the spool exists to protect. The bound is honoured and the
drops are counted, so this is not silent — but the retention policy inverts the value
ordering: the least valuable events survive.

**Fix:** Either exclude `heartbeat` from the spool cap accounting, or prefer evicting the
oldest *heartbeat* before any non-heartbeat entry, or coalesce heartbeats (replace the
previous unsent heartbeat rather than appending a new one — its payload is a snapshot, so
only the latest has value).

### WR-07: `runAgent`'s rejected `done` promise leaks signal handlers and can surface as an unhandled rejection

**File:** `server/scripts/awcp-node-client.mjs:848-853`, `:917-930`

**Issue:** `done: loop()` starts the promise at call time. `loop` can reject —
`emitCheckpoint` on a full disk, `flush` via WR-01/WR-02/WR-03. In `main`, `await
controller.done` then throws, so the two `process.off(...)` calls at :926-927 never run
(minor in `main`, real for any embedder), and any caller that does not attach a handler in
the same tick gets an unhandled-rejection crash. Nothing inside `loop` is wrapped, so a
transient I/O error terminates a daemon that is otherwise designed to keep running.

**Fix:** Wrap the loop body's per-tick work in try/catch (log, continue, count), and move
the handler removal into a `finally`.

### WR-08: `FEATURE_WORKFLOW` hardcoded `"true"` publishes the unauthenticated `/workflow` dashboard with no expiry

**File:** `docker-compose.yml:46-56`; corroborating: `server/index.ts:1262`

**Issue:** *(Outside the three named deliverables, but inside this phase's source diff.)*
The new line pins `FEATURE_WORKFLOW: "true"` on the base `mcp` service. `server/index.ts`
guards `/api/workflow/*` (:1212) and `/workflow/nodes/*` (:1252) with auth middleware, but
mounts the dashboard shell unguarded:

```ts
app.get("/workflow", (c) => c.html(DASHBOARD_HTML));   // :1262 — no app.use guard above it
```

The phase's own threat model (`03-01-PLAN.md`, T-03-01-02) rates this medium and accepts
it **"for the duration of Phase 3"**, explicitly marked *"escalated, not closed — do not
resolve this by silently leaving the flag on."* The merged state is a hardcoded `"true"`
with a comment saying it should be on "for the remainder of ST-088" and no mechanism that
forces the decision when ST-088 ends. That is precisely the silent-leave-it-on outcome the
plan forbade.

**Fix:** Revert to `FEATURE_WORKFLOW: ${FEATURE_WORKFLOW:-}` so the flag is a deliberate
deployment choice, or keep it on and put the dashboard route behind the same operator auth
the API routes use. Either way, record the maintainer decision — do not let the phase close
with the escalation unresolved.

---

## Info

### IN-01: Module-scope monkeypatch of `process.emitWarning` mutates global state on import

**File:** `server/scripts/awcp-node-client.mjs:134-143`

**Issue:** Importing the module — which the two Deno test files do, one of them twice via a
cache-busting query string — permanently replaces `process.emitWarning` in the host
process, and each fresh evaluation wraps the previous wrapper. The filter is narrow and
well reasoned, but it is a global side effect of an import in a module whose docblock
otherwise stresses that importing must be inert.

**Fix:** Apply the filter inside `main()` (or behind `isMainModule()`), so importing the
module for its exported functions leaves the host process untouched.

### IN-02: Temp files leak on a crash between write and rename

**File:** `server/scripts/awcp-node-client.mjs:311-333`, `:365-376`

**Issue:** `.spool.<pid>.<rand>.tmp` and `.state.<pid>.<rand>.tmp` are created in
`config.home` and only removed by the `renameSync`. A crash or a `renameSync` failure
leaves them behind forever; nothing sweeps `~/.awcp/`. Harmless individually, unbounded
over time. (The phase's own crash-injection test at
`awcp-node-client.test.ts:352-403` deliberately produces one.)

**Fix:** `try/catch` around the rename with an `unlinkSync(tmpPath)` on failure, and sweep
stale `.spool.*.tmp` / `.state.*.tmp` in `ensureStateDir`.

### IN-03: `main` gives no friendly error for malformed CLI JSON

**File:** `server/scripts/awcp-node-client.mjs:906`, `:912`

**Issue:** `JSON.parse(argv[2])` / `JSON.parse(argv[1])` throw a raw `SyntaxError` with a
stack trace on a shell-quoting mistake — the single most likely operator error for these
two commands.

**Fix:** Catch and re-throw with the offending argument named and the expected form shown.

---

_Reviewed: 2026-08-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
