#!/usr/bin/env node
/**
 * ST-088 — `awcp-node-client`, the remote execution node's local event producer.
 *
 * One job: spool execution events durably on disk on the node (z2), then deliver them
 * to the already-shipped hub (`server/src/workflow/remoteNodeHub.ts`) exactly once,
 * surviving disconnection and process restarts. It deliberately does NOT open a
 * control channel, hold a database credential, or expose an MCP surface — everything
 * this client can do, the hub's two HTTP endpoints (`/workflow/nodes/register`,
 * `/workflow/nodes/:node_id/events`) can do, so there is no privileged back channel
 * with its own rules.
 *
 * **Tracer scope** (ST-088 Phase 3, `03-02-PLAN.md` Task 1) plus **03-03's expansion**
 * (bounding, eviction, visible drop counter, multi-batch flush, D-14 restart proof)
 * plus **03-04's terminal states** (D-15 permanent-rejection dropping, D-17 auth
 * termination, bounded backoff, heartbeat/checkpoint reporting, the run loop).
 * The client now spools durably, bounds the spool at a configured entry count
 * (`config.spoolMaxEntries`, default `DEFAULT_SPOOL_MAX_ENTRIES`), evicts oldest-first
 * on overflow with a persisted+stderr-logged drop counter, and flushes in batches of
 * at most `FLUSH_MAX_EVENTS`, removing an entry only after a 200 names its
 * `client_seq` — never on send, never on retry attempt. Every non-200 the hub can
 * return now maps to a stated outcome (`flushOnce`'s outcome union); `flush()` retries
 * only the retryable ones, with bounded backoff, and reaches a terminal state on every
 * other failure — never retrying forever. Heartbeat and checkpoint are ordinary spooled
 * events (`event_type: "heartbeat"` / `"checkpoint"`) riding the same durability and
 * ack-gating guarantees as everything else — there is no second delivery mechanism.
 *
 * **Credentials — what is read, how long it lives, what a leak costs.**
 *   - `AWCP_NODE_BEARER` — this node's own 64-lowercase-hex credential
 *     (`openssl rand -hex 32`, matching `remoteNodeHub.ts`'s `BEARER_FORMAT`). Read
 *     once per process from the environment, held only in memory, sent on every
 *     request as `Authorization: Bearer <...>`. A leak lets an attacker impersonate
 *     this node — write forged events attributed to it — until the operator rotates
 *     the credential hub-side (there is no per-node revocation today; see
 *     `03-CONTEXT.md`).
 *   - `AWCP_NODE_ENROLMENT_SECRET` — the operator's one-time enrolment secret. Read
 *     once from the environment, sent ONLY on the first registration of a node whose
 *     `node_id` this client has not yet persisted (`X-Node-Enrolment-Secret`), and
 *     never written to disk. A leak lets an attacker enrol an arbitrary bearer as a
 *     trusted node for as long as the hub's enrolment window stays open.
 *   - Neither value is ever persisted under `~/.awcp/` or printed. Only the returned
 *     `node_id` — an unguessable v4 uuid with no standalone authority — is written to
 *     disk, at mode 0600 inside a 0700 directory (D-16).
 *
 * Env vars read: `AWCP_HOME`, `AWCP_HUB_URL`, `AWCP_NODE_BEARER`,
 * `AWCP_NODE_ENROLMENT_SECRET`.
 */

import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir, hostname as osHostname } from "node:os";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

/**
 * Client-side per-flush cap. Matches the hub's `eventsBody.max(500)`
 * (`remoteNodeHub.ts`), so a self-imposed cap here makes that bound unreachable by
 * construction — the client never needs to parse the `.max(500)` 400 shape at all.
 */
export const FLUSH_MAX_EVENTS = 500;

/**
 * Matches `remoteNodeHub.ts`'s `MAX_PAYLOAD_BYTES`. Fast-fail-only in this tracer —
 * the hub remains the authority; client-side enforcement of this bound arrives in
 * 03-04 alongside the 400 `issues[].client_seq` drop-and-count handling (D-15).
 */
export const MAX_PAYLOAD_BYTES = 16_384;

/** Matches `remoteNodeHub.ts`'s `BEARER_FORMAT`: 32 random bytes as 64 lowercase hex. */
export const BEARER_FORMAT = /^[0-9a-f]{64}$/;

/**
 * Entry-count bound for the spool (criterion 4, EVENT-04, 03-03). An entry count
 * rather than a byte count: at 1000 entries of at most MAX_PAYLOAD_BYTES (16384) each,
 * the worst case is ~16 MiB — bounded, small, and trivially assertable without a
 * second byte-accounting pass. Overridable via `AWCP_SPOOL_MAX_ENTRIES`.
 */
export const DEFAULT_SPOOL_MAX_ENTRIES = 1000;

/**
 * Retry ceiling for `flush()`'s `retryable`/`unreachable` outcomes (D-17). Six attempts
 * — the initial try plus five retries — bounded so a hub that is down does not retry
 * forever against a host published on all interfaces (T-03-04-02).
 */
export const MAX_FLUSH_ATTEMPTS = 6;

/** Base delay, milliseconds, for `flush()`'s exponential backoff (Claude's Discretion). */
export const BACKOFF_BASE_MS = 1000;

/** Ceiling, milliseconds, on any single backoff delay — applied AFTER jitter, so the
 * ceiling is a true ceiling on the value actually waited, not on the pre-jitter base. */
export const BACKOFF_CAP_MS = 30_000;

/**
 * Liveness cadence for `runAgent`'s heartbeat tick (Claude's Discretion — inclusion is
 * settled by the Phase Boundary, only cadence is open). One minute is frequent enough
 * to be a useful liveness signal and cheap enough that a day of continuous running is
 * under 1500 events against a 1000-entry spool that drains continuously. Overridable
 * via `AWCP_HEARTBEAT_INTERVAL_MS`.
 */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Default tick source for `flush()`'s backoff and `runAgent`'s heartbeat interval.
 *
 * The optional `signal` is what makes a stop actually stop (ST-092 R5). Racing a bare
 * `setTimeout` promise against a stop signal wakes the LOOP immediately but leaves the
 * timer pending, and a pending timer keeps Node's event loop alive — so the work (stop
 * checkpoint, final flush) completed at once while the PROCESS lingered for the rest of
 * the interval. Measured A/B against a hub that acks immediately, 45s heartbeat,
 * SIGTERM once the loop had parked: **42.2s to exit without this argument, 82ms with
 * it.** Waking the loop was never the hard part; clearing the timer is.
 *
 * Callers that do not pass a signal are unaffected — `flush()`'s backoff is one, and
 * deliberately so: shutting down against an UNREACHABLE hub still spends the full
 * bounded backoff (~31s) trying to deliver the stop checkpoint before giving up with
 * exit 75. That is delivery effort, not a stuck timer, and shortening it would be a
 * decision about how hard a departing client should try — not a bug fix.
 */
export function defaultSleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    // The listener is removed on BOTH exits, not just on abort. `{ once: true }`
    // only self-removes when the event actually fires, and abort fires at most once
    // per run — so on the ordinary timer path the listener stayed attached forever.
    // `runAgent` deliberately reuses ONE AbortController for the whole loop, which
    // turned that into an unbounded leak: one dead listener per heartbeat tick, plus
    // a MaxListenersExceededWarning once the signal passed ten of them. Found in the
    // PR #52 review of this story.
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * A second client process is already operating this `AWCP_HOME` (ST-092 R1).
 *
 * Carries the holding PID so the refusal names something an operator can act on
 * rather than merely asserting contention. Thrown BEFORE the spool, counter, or state
 * file is touched, which is the property that makes a refused run safe to retry.
 */
export class AwcpLockError extends Error {
  constructor(holderPid, lockPath, holderAlive = true) {
    let detail;
    if (holderPid === null) {
      detail = `the lock at ${lockPath} exists but does not name a readable pid. ` +
        `Remove it if no client is running.`;
    } else if (holderAlive === null) {
      // Refusing because the answer is unknown is a different fact from refusing
      // because the holder is alive, and an operator needs to be able to tell them
      // apart — the second is normal, the first means the probe could not run.
      detail = `the lock at ${lockPath} names pid ${holderPid}, and this runtime ` +
        `would not let the client check whether that process is still alive, so it ` +
        `is treated as live. Remove the lock if pid ${holderPid} is gone.`;
    } else {
      detail = `it is already running as pid ${holderPid} (lock: ${lockPath}). If ` +
        `pid ${holderPid} is NOT an awcp-node-client, remove that lock file: a ` +
        `reboot or a pid wrap can reassign a recorded pid to an unrelated live ` +
        `process, and this check cannot tell that apart from the real holder.`;
    }
    super(
      `another awcp-node-client is already running: ${detail} Only one client may ` +
        `operate one AWCP_HOME — a second would allocate duplicate client_seq ` +
        `values, which the hub's ON CONFLICT (node_id, client_seq) DO NOTHING would ` +
        `silently discard.`,
    );
    this.name = "AwcpLockError";
    this.holderPid = holderPid;
    this.holderAlive = holderAlive;
    this.lockPath = lockPath;
  }
}

/** A non-2xx response from the hub, carrying the status for the caller to branch on. */
export class AwcpHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AwcpHttpError";
    this.status = status;
  }
}

/**
 * Suppress only the Node 18 `ExperimentalWarning: The Fetch API is an experimental
 * feature` notice (D-06). Every other warning — including other experimental ones —
 * passes through unchanged, because captured stderr is evidence in this phase and a
 * blanket `--no-warnings` would silence genuine runtime warnings inside that same
 * evidence.
 */
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => {
  const nameArg = rest[0];
  const name = typeof nameArg === "string" ? nameArg : nameArg?.type;
  const message = typeof warning === "string"
    ? warning
    : warning?.message ?? "";
  if (name === "ExperimentalWarning" && /Fetch API/i.test(message)) return;
  return originalEmitWarning(warning, ...rest);
};

/** `hostname()` under Deno's `node:os` shim may be permission-gated; degrade quietly. */
function detectHostname() {
  try {
    return osHostname();
  } catch {
    return undefined;
  }
}

function writeFileFsync(path, content, mode) {
  const fd = openSync(path, "w", mode);
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  // openSync's mode argument only applies at creation; chmod unconditionally so an
  // existing file with a stale mode still ends up at the mode this client requires.
  chmodSync(path, mode);
}

function appendLineFsync(path, line, mode) {
  const fd = openSync(path, "a", mode);
  try {
    writeSync(fd, line);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(path, mode);
}

/**
 * fsync a DIRECTORY, so a `renameSync` into it survives power loss (ST-092 R2).
 *
 * `fsyncSync` on the renamed file's own descriptor is not enough and never was:
 * it forces the file's CONTENTS to disk, while the rename is a change to the
 * containing directory's entries, which lives in a different set of blocks and
 * in the directory's own page cache. POSIX requires fsync on the directory
 * itself to make a rename durable, so without this every rewrite-and-rename
 * writer below could lose the replacement — not to a torn file, which rename
 * genuinely prevents, but to the whole rename evaporating.
 *
 * Node exposes no fsync-a-directory API by name: `opendirSync` returns a `Dir`
 * with no file descriptor to sync. Opening the directory O_RDONLY and syncing
 * that descriptor is the portable POSIX idiom, and it works under both Node and
 * Deno's `node:fs` shim (verified on both before this was written).
 *
 * Deliberately NOT wrapped in a try/catch. A durability helper that swallows its
 * own failure is worse than none: every caller would still believe the rename
 * was made durable, which is the exact false assurance `writeSpool`'s docblock
 * used to carry.
 */
function fsyncDir(dirPath) {
  const fd = openSync(dirPath, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Rewrite-and-rename one whole file, durably (RESEARCH.md Pattern 1 + ST-092 R2):
 * write the full content to a temp file in the SAME directory, fsync it, rename over
 * the target, then fsync the directory.
 *
 * The same-directory requirement is not incidental — `rename()` is only atomic within
 * one filesystem, so a temp file in `/tmp` renamed onto a target elsewhere is an
 * ordinary copy that can tear.
 *
 * `hooks.beforeRename` is the test-only crash seam: the temp file exists and is
 * already fsync'd by the time it runs, so throwing there simulates exactly the
 * window this primitive exists to make survivable, and proves the ORIGINAL target
 * survives byte-identical. Production callers never pass one.
 *
 * Every full-content writer in this file goes through here (spool, state, sequence
 * counter) rather than each rebuilding the sequence, so the durability property lives
 * in one place and the next rewrite-based writer inherits it instead of re-deriving
 * it — and, as ST-092 found, instead of quietly not having it.
 */
function writeFileAtomic(path, content, mode, hooks = {}) {
  const dir = dirname(path);
  const tmpPath = join(
    dir,
    `.${basename(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
  );
  const fd = openSync(tmpPath, "w", mode);
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  // openSync's mode argument only applies at creation; chmod for the same reason
  // writeFileFsync does, and BEFORE the rename so the target is never briefly
  // readable at a wider mode than the one this client requires (D-16).
  chmodSync(tmpPath, mode);
  if (typeof hooks.beforeRename === "function") {
    hooks.beforeRename(tmpPath);
  }
  renameSync(tmpPath, path);
  (hooks.fsyncDirImpl ?? fsyncDir)(dir);
}

/**
 * Every persisted path and every dependency is a parameter with a production default
 * applied only when an override is absent (RESEARCH.md Pattern 3) — so a test can
 * point this at `/tmp` and stay inside CLAUDE.md's existing `--allow-write=/tmp`
 * grant, and 03-03/03-04 can inject `fetchImpl` to exercise failure branches with no
 * server at all.
 */
export function resolveConfig(overrides = {}) {
  const home = overrides.home ?? process.env.AWCP_HOME ??
    join(homedir(), ".awcp");
  const hubUrl = (
    overrides.hubUrl ?? process.env.AWCP_HUB_URL ?? "http://127.0.0.1:3000"
  ).replace(/\/+$/, "");
  const rawSpoolMax = process.env.AWCP_SPOOL_MAX_ENTRIES;
  const parsedSpoolMax = rawSpoolMax ? Number.parseInt(rawSpoolMax, 10) : NaN;
  const envSpoolMax = Number.isFinite(parsedSpoolMax) && parsedSpoolMax > 0
    ? parsedSpoolMax
    : DEFAULT_SPOOL_MAX_ENTRIES;
  const rawHeartbeatMs = process.env.AWCP_HEARTBEAT_INTERVAL_MS;
  const parsedHeartbeatMs = rawHeartbeatMs
    ? Number.parseInt(rawHeartbeatMs, 10)
    : NaN;
  const envHeartbeatMs =
    Number.isFinite(parsedHeartbeatMs) && parsedHeartbeatMs > 0
      ? parsedHeartbeatMs
      : DEFAULT_HEARTBEAT_INTERVAL_MS;
  return {
    home,
    spoolPath: overrides.spoolPath ?? join(home, "spool.jsonl"),
    seqPath: overrides.seqPath ?? join(home, "client_seq"),
    nodeIdPath: overrides.nodeIdPath ?? join(home, "node_id"),
    statePath: overrides.statePath ?? join(home, "state.json"),
    // ST-092 R1: every persisted path is a parameter, this one included, so the
    // two-process contention test can point a pair of real children at a temp home.
    lockPath: overrides.lockPath ?? join(home, "lock"),
    hubUrl,
    bearer: overrides.bearer ?? process.env.AWCP_NODE_BEARER ?? "",
    enrolmentSecret: overrides.enrolmentSecret ??
      process.env.AWCP_NODE_ENROLMENT_SECRET ?? "",
    fetchImpl: overrides.fetchImpl ?? globalThis.fetch,
    // Criterion 4 (EVENT-04, 03-03): bound expressed as an entry count, injectable so
    // tests can exercise eviction with a small cap without waiting on 1000 appends.
    spoolMaxEntries: overrides.spoolMaxEntries ?? envSpoolMax,
    // Every structured "visible drop" line (recordDrops) is routed through this one
    // seam rather than a bare `process.stderr.write` call, so a test can inject a
    // collector instead of eyeballing captured output. Defaulted, never widened by a
    // test that forgets to override it — production behavior is unchanged.
    stderrWrite: overrides.stderrWrite ??
      ((line) => process.stderr.write(line)),
    // 03-04: heartbeat cadence, and the two seams that let `flush()`'s backoff and
    // `runAgent`'s heartbeat tick be driven by a test without ever sleeping in real
    // time (D-13's gate and every retry/backoff test rely on these being injectable).
    heartbeatIntervalMs: overrides.heartbeatIntervalMs ?? envHeartbeatMs,
    sleepImpl: overrides.sleepImpl ?? defaultSleep,
    randomImpl: overrides.randomImpl ?? Math.random,
    // ST-092 R2: the directory-fsync seam. Present for the same reason `stderrWrite`
    // is — an fsync leaves no observable trace on disk, so the only way a test can
    // prove the rename was made durable rather than merely performed is to count the
    // calls. Defaulted here so production behaviour never depends on a test setting it.
    fsyncDirImpl: overrides.fsyncDirImpl ?? fsyncDir,
    // ST-092 R1: the pid-liveness probe behind the lock's stale-reclaim decision.
    // Injectable because the in-process suite deliberately runs without --allow-run,
    // under which the real probe cannot answer (see `isPidAlive`).
    isPidAliveImpl: overrides.isPidAliveImpl ?? isPidAlive,
  };
}

/** Create `config.home` at mode 0700. Idempotent — safe to call before every write. */
export function ensureStateDir(config) {
  mkdirSync(config.home, { recursive: true, mode: 0o700 });
  // mkdirSync's mode only applies at creation; chmod unconditionally for the same
  // reason writeFileFsync does — an existing dir must still end up at 0700.
  chmodSync(config.home, 0o700);
  return config;
}

/**
 * Does this error carry POSIX errno `name`? (ST-092)
 *
 * **The message is checked as well as `.code`, and that is not belt-and-braces.**
 * Deno 2.0.0 — the version pinned in `server/Dockerfile`, and therefore the one CI
 * runs — raises `node:fs` errors as a plain `Error` with `code === undefined` and the
 * errno only in the message text (`EEXIST: file already exists, open '...'`). Node
 * sets `.code`, and so does a newer Deno, which is exactly what makes this worth
 * writing down: a `.code`-only check passes on a developer's host and fails in the
 * container, and the failure mode is the lock silently rethrowing instead of refusing.
 */
function isErrno(error, name) {
  if (error?.code === name) return true;
  const message = typeof error?.message === "string" ? error.message : "";
  return message.startsWith(`${name}:`) || message.endsWith(` ${name}`);
}

/**
 * Does `pid` name a process that currently exists? (ST-092 R1)
 *
 * **Three-valued on purpose: `true`, `false`, or `null` for "could not tell".** Only
 * a definite `false` licenses reclaiming a lock, so an unanswerable question produces
 * a refusal rather than a reclaim. Getting this backwards would let a second client
 * steal a live lock, which is the exact corruption the lock exists to prevent — and a
 * two-valued version would have to guess, silently, in the one case where guessing is
 * unsafe.
 *
 * Signal 0 is the probe because it is the only one that works on both runtimes this
 * module runs under. Production is Node, where it needs no capability at all. Under
 * Deno it maps to `Deno.kill` and needs `--allow-run`, and **`/proc` is not an escape
 * hatch from that**: Deno gates every path under `/proc` behind `--allow-all`, not
 * behind `--allow-read`, so `existsSync("/proc/<pid>")` is MORE restricted than the
 * signal, not less. (Verified under deno 2.9 while writing this — `--allow-read` and
 * even `--allow-read=/proc` both raise `NotCapable`.) Without the run grant this
 * returns `null` and the caller refuses, which is why the in-process suite injects
 * `isPidAliveImpl` rather than widening its own grants.
 */
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isErrno(error, "ESRCH")) return false;
    // EPERM: the process exists and belongs to someone else — alive.
    if (isErrno(error, "EPERM")) return true;
    // Anything else (a sandbox refusing the call, an unexpected errno) is unknown.
    return null;
  }
}

/**
 * Parse one lock line into `{pid, token}`, or `null` when it names no usable pid.
 *
 * `token` is `null` for a bare-pid line. No current code path writes one, but a test
 * fixture or a hand-written lock can, and a null token never equals a live handle's
 * token — so such a lock can be reclaimed or refused, never mistaken for ours.
 */
function parseLockRecord(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return null;
  const [pidPart, tokenPart] = text.split(":");
  const pid = Number.parseInt(pidPart, 10);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return { pid, token: tokenPart === undefined || tokenPart === "" ? null : tokenPart };
}

/** The lock's current holder record, or `null` if it is missing or unreadable. */
function readLockRecord(config) {
  try {
    return parseLockRecord(readFileSync(config.lockPath, "utf8").split("\n")[0]);
  } catch {
    return null;
  }
}

/**
 * Take over a lock whose recorded holder is definitely dead — WITHOUT unlinking it.
 *
 * **Unlinking is what made takeover racy** (found by review on PR #52, and proved by
 * the test named "two clients that find the same stale lock must not both come away
 * holding it"). Two clients that read the same dead pid both unlinked; the second
 * removed the first's *already created* replacement lock, and both walked away
 * believing they held it — the duplicate `client_seq` allocation this lock exists to
 * prevent. The old `catch` around that unlink only covered the unlink FAILING. The
 * damaging case was it succeeding, on a file the caller no longer owned.
 *
 * The arbiter here is an append, not a write. `O_APPEND` writes are atomic, so every
 * contending reclaimer's claim lands whole and in some definite order, and the FIRST
 * claim after the stale record wins. That is decided by what is already durably in
 * the file rather than by who writes last, which is what makes it a decision instead
 * of a race: a loser reads the same bytes the winner does and reaches the opposite
 * conclusion about itself.
 *
 * Deliberately no auxiliary lock file. A separate `.takeover` file would serialize
 * this just as well, but a client killed while holding it leaves a file that blocks
 * every future reclaim — trading a rare race for a rare brick, on precisely the
 * `kill -9` this reclaim path exists to survive.
 */
function claimStaleLock(config, expected, record, token) {
  let fd;
  try {
    // No O_CREAT: if the holder released between the EEXIST and here, the lock is
    // simply free, and the caller retries the exclusive create rather than
    // resurrecting a file nobody owns.
    fd = openSync(config.lockPath, fsConstants.O_WRONLY | fsConstants.O_APPEND);
  } catch {
    return "retry";
  }
  try {
    writeSync(fd, `\n${record}`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  const lines = readFileSync(config.lockPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const head = parseLockRecord(lines[0] ?? "");
  if (head === null || head.pid !== expected.pid || head.token !== expected.token) {
    // The record we judged stale is gone — someone else already completed a takeover.
    return "refuse";
  }
  // Walk the claims in the order they landed; the first one whose process is not
  // definitely gone owns the takeover.
  //
  // Skipping a definitely-dead claimant is not a refinement, it is what stops this
  // design reintroducing the failure it was chosen to avoid. A reclaimer killed
  // between fsyncing its claim and collapsing the log leaves that claim in the file
  // permanently; without this, every later client appends behind a dead claimant and
  // refuses forever, and the node needs an operator even though nothing is running —
  // exactly the brick that ruled out a separate `.takeover` file, arrived at by
  // another route. Found by review on PR #52, after the first fix shipped.
  const probe = config.isPidAliveImpl ?? isPidAlive;
  let won = false;
  for (const line of lines.slice(1)) {
    const claim = parseLockRecord(line);
    if (claim === null) continue;
    if (claim.token === token) {
      won = true;
      break;
    }
    // Only a definite `false` abandons a claim, the same rule the holder probe uses.
    // `null` means the runtime would not answer, and an unanswered question must not
    // become permission to step over someone else's claim.
    if (probe(claim.pid) !== false) return "refuse";
  }
  if (!won) return "refuse";

  // Won. Collapse the claim log back to a single record so the next reader sees an
  // ordinary lock. Rewrite-and-rename replaces the path atomically, so it is never
  // momentarily absent and no O_EXCL create can slip into a gap.
  writeFileAtomic(config.lockPath, record, 0o600, {
    fsyncDirImpl: config.fsyncDirImpl,
  });
  return "held";
}

/**
 * Take the single-writer lock for this `AWCP_HOME`, or refuse (ST-092 R1).
 *
 * **This enforces the single-writer model; it does not lift it.** `allocateSeq` is an
 * unlocked read-increment-write, and making it genuinely concurrent-safe would mean
 * adopting a concurrency model the hub's `(node_id, client_seq)` uniqueness was never
 * designed around. A lock that fails loudly converts an invisible corruption — two
 * processes allocating the same seq, the hub's ON CONFLICT DO NOTHING silently
 * discarding one of them — into an operator-visible error, and unlike an atomicity
 * claim it is falsifiable by two real processes.
 *
 * A lock whose recorded pid is no longer alive is STALE and is reclaimed: a client
 * killed by `SIGKILL` never runs its release path, and a node that could be bricked
 * by one `kill -9` would need manual intervention on the very failure the spool
 * exists to survive.
 *
 * A lock whose contents are unreadable is refused rather than reclaimed. It cannot be
 * produced by any ordinary path — the pid is written and fsync'd immediately after an
 * exclusive create — so it means something unexpected, and the message names the file
 * to delete. That is one command for an operator, against the alternative of
 * reclaiming a lock whose owner might still be live.
 *
 * Returns a handle to pass to `releaseLock`.
 */
export function acquireLock(config) {
  ensureStateDir(config);
  // The token is what lets a reclaimer recognise its OWN claim among several. Pids
  // cannot do that job: two contending clients have different pids but so does every
  // unrelated process, and a pid says nothing about which claim landed first.
  const token = randomBytes(8).toString("hex");
  const record = `${process.pid}:${token}`;
  // Three passes at most: an exclusive create, and up to two retries for the case
  // where a dead holder's lock disappears underneath the takeover.
  for (let attempt = 0; attempt < 3; attempt++) {
    let fd;
    try {
      // "wx" is O_CREAT|O_EXCL: the kernel makes this atomic against every other
      // process attempting the same thing, which is what the whole mechanism rests on.
      fd = openSync(config.lockPath, "wx", 0o600);
    } catch (error) {
      if (!isErrno(error, "EEXIST")) throw error;
      const holder = readLockRecord(config);
      const alive = (config.isPidAliveImpl ?? isPidAlive)(holder?.pid ?? null);
      // Reclaim ONLY on a definite `false`. `true` is a live holder; `null` means the
      // runtime would not answer, and an unanswered question must not become a yes.
      if (holder === null || alive !== false) {
        throw new AwcpLockError(holder?.pid ?? null, config.lockPath, alive);
      }
      // `beforeLockReclaim` is this path's test-only seam, the same shape as
      // writeSpool's `beforeRename`. It fires inside the stale-takeover window so a
      // test can run a second, contending client at exactly the point where two real
      // processes interleave. Never set in production.
      if (typeof config.beforeLockReclaim === "function") config.beforeLockReclaim();
      const outcome = claimStaleLock(config, holder, record, token);
      if (outcome === "held") {
        chmodSync(config.lockPath, 0o600);
        return { path: config.lockPath, pid: process.pid, token };
      }
      if (outcome === "refuse") {
        throw new AwcpLockError(
          readLockRecord(config)?.pid ?? null,
          config.lockPath,
          null,
        );
      }
      continue;
    }
    try {
      writeSync(fd, record);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(config.lockPath, 0o600);
    return { path: config.lockPath, pid: process.pid, token };
  }
  throw new AwcpLockError(readLockRecord(config)?.pid ?? null, config.lockPath, null);
}

/**
 * Release a lock taken by `acquireLock`. Idempotent, never throws, and removes the
 * file ONLY when it still names this process — a lock reclaimed as stale by someone
 * else belongs to them now, and deleting it would hand a third process a lock two
 * others believe they hold.
 */
export function releaseLock(handle) {
  if (!handle) return;
  try {
    const current = parseLockRecord(readFileSync(handle.path, "utf8").split("\n")[0]);
    // Both halves must match. The token is what makes this exact: after a takeover the
    // lock can legitimately name the same pid again on a recycled id, and only the
    // token distinguishes "still the lock I took" from "a lock that merely looks like
    // mine".
    if (current === null) return;
    if (current.pid !== handle.pid || current.token !== handle.token) return;
    unlinkSync(handle.path);
  } catch { /* already gone, or never ours */ }
}

/**
 * Read-increment-write `config.seqPath` through the durable rewrite-and-rename
 * primitive. NEVER reads `spoolPath` (D-14) — deriving the next seq from the spool's
 * last line resets to 0 every time the spool drains, which is the steady state after
 * every successful flush, not an edge case; the hub's `ON CONFLICT (node_id,
 * client_seq) DO NOTHING` would then silently discard the next event's new content.
 * A missing counter file starts at 1.
 *
 * **ST-092 R2b — the second route to that same D-14 reset, which the paragraph above
 * did not cover.** Until this story the counter was written with `writeFileFsync`,
 * whose `openSync(path, "w")` TRUNCATES the target before writing it. The crash
 * window was therefore not "a stale value" but "a zero-length file", and the recovery
 * path below used to read an unparseable counter as `current = 0` — so the very next
 * allocation returned 1 and the hub silently discarded everything that followed. The
 * docblock closed the derive-from-spool route and left this one wide open. Writing
 * through `writeFileAtomic` removes the window: the target is never truncated, only
 * replaced, so a crash leaves the previous complete value.
 *
 * **An unparseable counter is now refused, not read as zero.** With truncate-in-place
 * gone, an empty or garbage counter file is no longer something an ordinary crash can
 * produce, so treating it as 0 would only convert genuine corruption into the silent
 * reset this function exists to prevent — the same reasoning as ST-092's single-writer
 * lock, where an operator-visible error beats invisible duplicate allocation. A
 * MISSING file is still the ordinary first-run case and still starts at 1; missing and
 * corrupt are deliberately not the same condition.
 */
export function allocateSeq(config) {
  ensureStateDir(config);
  let current = 0;
  if (existsSync(config.seqPath)) {
    const raw = readFileSync(config.seqPath, "utf8").trim();
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(
        `awcp-node-client: refusing to allocate a client_seq — the counter at ` +
          `${config.seqPath} is present but unreadable (${JSON.stringify(raw)}). ` +
          `Continuing would restart the sequence at 1, and the hub's ON CONFLICT ` +
          `(node_id, client_seq) DO NOTHING would then silently discard every event ` +
          `that followed (D-14). Restore the counter to the highest client_seq this ` +
          `node has already sent, or delete ${config.home} to enrol as a new node.`,
      );
    }
    current = parsed;
  }
  const next = current + 1;
  // `beforeSeqRename` is this function's own crash seam, kept separate from
  // writeSpool's `beforeRename` so a test injecting one does not fire the other —
  // appendEvent calls both, and a shared hook could not tell the two windows apart.
  writeFileAtomic(config.seqPath, String(next), 0o600, {
    beforeRename: config.beforeSeqRename,
    fsyncDirImpl: config.fsyncDirImpl,
  });
  return next;
}

/**
 * Allocate a seq and append one JSON line to the spool, fsync'd before returning.
 * A plain append does not need the rewrite-and-rename dance — only shrinking the
 * spool (post-ack removal, future overflow eviction) does.
 */
export function appendEvent(config, event) {
  ensureStateDir(config);
  const seq = allocateSeq(config);
  const line = JSON.stringify({
    client_seq: seq,
    event_type: event.event_type,
    payload: event.payload === undefined ? null : event.payload,
    queued_at: new Date().toISOString(),
  }) + "\n";
  appendLineFsync(config.spoolPath, line, 0o600);

  // Criterion 4 (EVENT-04): evict AFTER appending, never before, so the newest event
  // is never the one dropped — "drop the oldest" is the stated contract, and evicting
  // pre-append would risk dropping an event that never even entered the spool.
  const cap = config.spoolMaxEntries ?? DEFAULT_SPOOL_MAX_ENTRIES;
  const spooled = readSpool(config);
  if (spooled.length > cap) {
    // Hand the entries over rather than letting `evictOldest` read them again: this is
    // the overflow path, so it runs on every append once the spool is at its cap.
    evictOldest(config, spooled.length - cap, spooled);
  }

  return seq;
}

/** Read the spool oldest-first. Missing file reads as an empty spool. */
export function readSpool(config) {
  if (!existsSync(config.spoolPath)) return [];
  const raw = readFileSync(config.spoolPath, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

/**
 * Rewrite-and-rename (RESEARCH.md Pattern 1): write the full new line set to a temp
 * file in the same directory, `fsyncSync` it, `renameSync` over the target, then
 * `fsyncDir` the containing directory. `rename()` is atomic on the same POSIX
 * filesystem, so a crash mid-write leaves either the old complete spool or the new
 * one — never a truncated one. A plain `writeSync` without `fsyncSync` is not
 * sufficient: a synchronous Node write blocks the event loop but does not force the
 * OS page cache to disk.
 *
 * ST-092 R2 — the directory fsync is the third of those three steps, and until this
 * story it was missing. This docblock previously stopped after the rename and claimed
 * the crash guarantee outright, which was true of the file's CONTENTS and not of the
 * rename: `renameSync` is atomic with respect to a concurrent reader, but a rename
 * that lives only in the directory's page cache does not survive power loss, so the
 * guarantee the comment offered was strictly stronger than the one the code provided.
 * The comment was part of the defect, not merely documentation of it.
 */
export function writeSpool(config, entries) {
  ensureStateDir(config);
  const content = entries.length === 0
    ? ""
    : entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  // `beforeRename` is the 03-03 test-only crash seam, passed through to
  // `writeFileAtomic`. Never set in production; resolveConfig does not default this
  // field, so a config built the normal way never carries it.
  writeFileAtomic(config.spoolPath, content, 0o600, {
    beforeRename: config.beforeRename,
    fsyncDirImpl: config.fsyncDirImpl,
  });
}

/**
 * Read `<home>/state.json`. A missing file reads as the zeroed default — the drop
 * counter has never fired yet, which is exactly what "no file" should mean.
 */
const DEFAULT_DROP_STATE = Object.freeze({
  dropped_events: 0,
  last_drop_at: null,
  last_dropped_client_seq: null,
  last_drop_reason: null,
});

export function readState(config) {
  if (!existsSync(config.statePath)) return { ...DEFAULT_DROP_STATE };
  const raw = readFileSync(config.statePath, "utf8");
  try {
    return { ...DEFAULT_DROP_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DROP_STATE };
  }
}

/**
 * Rewrite-and-rename `<home>/state.json`, mode 0600 — a torn counter file is as bad as
 * a torn spool (T-03-03-02): the same primitive `writeSpool` uses for its two
 * shrink operations, applied here because this file's write is also a full-content
 * replace, never an append. Carries `writeSpool`'s ST-092 directory fsync for the
 * same reason: the drop counter this file holds is the ONLY visible record that an
 * event was dropped (EVENT-04), so a rename that does not survive power loss makes
 * the drop silent, which is precisely what the counter exists to prevent.
 */
export function writeState(config, state) {
  ensureStateDir(config);
  writeFileAtomic(config.statePath, JSON.stringify(state), 0o600, {
    fsyncDirImpl: config.fsyncDirImpl,
  });
}

/**
 * The third leg of "visible" (criterion 4): increments `dropped_events` by
 * `seqs.length`, updates the `last_*` fields, persists to `state.json`, and writes one
 * structured line per dropped seq to STDERR — never stdout, because captured stderr is
 * evidence in this phase and a drop that never appears in the transcript is exactly
 * the silent failure criterion 4 forbids. Shared by overflow eviction (03-03) and
 * D-15's permanent-rejection drops (03-04) — one counter, two causes, distinguished by
 * `reason`.
 */
export function recordDrops(config, seqs, reason) {
  if (!seqs || seqs.length === 0) return readState(config);
  let state = readState(config);
  const write = config.stderrWrite ?? ((line) => process.stderr.write(line));
  for (const seq of seqs) {
    state = {
      dropped_events: state.dropped_events + 1,
      last_drop_at: new Date().toISOString(),
      last_dropped_client_seq: seq,
      last_drop_reason: reason,
    };
    write(
      `awcp-node-client: dropped client_seq=${seq} reason=${reason} ` +
        `dropped_events_total=${state.dropped_events}\n`,
    );
  }
  writeState(config, state);
  return state;
}

/**
 * Removes the `count` lowest-`client_seq` entries from the spool via `writeSpool`
 * (the same rewrite-and-rename primitive that shrinks it on ack) and records the drop.
 * Returns the dropped seqs.
 *
 * **ST-092 R3 — record first, shrink second, and the order is the whole point.** The
 * two steps are separate on-disk writes and cannot be made atomic without a journal
 * and a recovery path to read it, so what this function actually chooses is WHICH WAY
 * the crash window between them fails:
 *
 *   - shrink-then-record (what this did until ST-092): a crash between the two leaves
 *     events gone from the spool with the counter never incremented. Silent loss —
 *     exactly what EVENT-04's visible counter exists to make impossible.
 *   - record-then-shrink (now): a crash between the two counts drops for entries that
 *     are still in the spool. The total is inflated and the stderr lines name seqs
 *     that were not really lost — visible, wrong in a direction an operator can see,
 *     and nothing is missing.
 *
 * Over-reporting a drop is a strictly better failure than losing an event invisibly.
 * Note the over-count is NOT self-correcting: nothing later reconciles the counter
 * against the spool, so the inflated total persists until the state file is reset.
 * That is accepted as the cheaper of the two errors, not overlooked.
 */
export function evictOldest(config, count, knownEntries) {
  if (!count || count <= 0) return [];
  // A caller that has already read the spool passes it in; the no-op guard above stays
  // ahead of the read, so `evictOldest(config, 0)` still touches no disk at all.
  const entries = knownEntries ?? readSpool(config);
  const toEvict = entries.slice(0, count);
  if (toEvict.length === 0) return [];
  const remaining = entries.slice(toEvict.length);
  const seqs = toEvict.map((entry) => entry.client_seq);
  recordDrops(config, seqs, "spool_overflow");
  writeSpool(config, remaining);
  return seqs;
}

/**
 * Register this node with the hub. On a bearer the hub has never seen, this is the
 * one-time enrolment handshake (D-11/D-12); on a bearer the hub already knows, it is
 * an ordinary re-register-on-boot. Persists ONLY the returned `node_id` — never the
 * bearer, never the enrolment secret (D-12, D-13).
 *
 * Fails fast on a malformed bearer before spending a round trip; the hub remains the
 * authority on whether the bearer is actually enrolled.
 */
export async function registerNode(config) {
  ensureStateDir(config);
  if (!BEARER_FORMAT.test(config.bearer ?? "")) {
    throw new Error(
      "AWCP_NODE_BEARER is not a well-formed 64-lowercase-hex bearer (^[0-9a-f]{64}$)",
    );
  }

  const hasPersistedNodeId = existsSync(config.nodeIdPath);
  const headers = {
    "Authorization": `Bearer ${config.bearer}`,
    "Content-Type": "application/json",
  };
  // Only on a node this client has never registered before, and only when the
  // enrolment secret is actually present — every later registration authenticates
  // with nothing but its own bearer (D-11's ssh-copy-id model).
  if (!hasPersistedNodeId && config.enrolmentSecret) {
    headers["X-Node-Enrolment-Secret"] = config.enrolmentSecret;
  }

  const res = await config.fetchImpl(
    `${config.hubUrl}/workflow/nodes/register`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        hostname: detectHostname(),
        platform: process.platform,
      }),
    },
  );

  if (res.status !== 201) {
    const text = await res.text().catch(() => "");
    throw new AwcpHttpError(
      res.status,
      `registerNode failed: ${res.status} ${text}`,
    );
  }

  const body = await res.json();
  writeFileFsync(config.nodeIdPath, body.node_id, 0o600);
  return body.node_id;
}

/**
 * POST one batch to `<hubUrl>/workflow/nodes/<node_id>/events` and classify the
 * response into a stated outcome. NEVER throws on a non-2xx response (03-04) — every
 * status the hub can return maps to an outcome the caller branches on explicitly,
 * which is what makes "no failure retries forever" checkable rather than argued.
 *
 * Outcomes: `{outcome:"acked", acked, acknowledged}` · `{outcome:"rejected", rejected}`
 * (a 400 whose `issues` elements carry a numeric `client_seq` — D-15's oversized-single-
 * -payload path) · `{outcome:"malformed", detail}` (a 400 with any other body shape —
 * unreachable in normal operation because `FLUSH_MAX_EVENTS` already caps every batch
 * at the hub's `.max(500)`, so a zod-issue-shaped 400 means something is actually
 * wrong and must be loud rather than silently absorbed as a mystery drop) ·
 * `{outcome:"terminal_auth"}` (401 — D-17) · `{outcome:"unknown_node"}` (404) ·
 * `{outcome:"too_large"}` (413) · `{outcome:"retryable", status}` (5xx, or any other
 * unrecognised non-2xx — treated as retryable rather than silently dropped, since an
 * unrecognised status is not evidence the batch was ever processed) ·
 * `{outcome:"unreachable", error}` (`fetchImpl` itself threw — no response exists).
 *
 * STATUS BEFORE BODY, always. A real 401 is `new Response("Unauthorized", {status:401})`
 * — plain text, not JSON (`remoteNodeHub.ts:110`). Calling `res.json()` before checking
 * `res.status` throws a `SyntaxError` on that response, which the old (03-02/03-03)
 * unconditional `await res.json()` did — misclassifying a real 401 as `"unreachable"`,
 * the exact failure D-17 exists to prevent. Only the statuses that actually return a
 * JSON body (400) are parsed here.
 *
 * **ST-092 R4 — every response is now TOTAL, including the ones a broken hub could
 * produce.** Two `await res.json()` calls used to be able to reject: the 400 branch
 * and the 200 branch. A rejection there escaped `flushOnce` entirely and came out of
 * `flush()` as a thrown exception rather than one of the outcomes the docblock above
 * promises, defeating the whole point of an outcome union. Both are now parsed
 * through `parseJsonBody`, and a parse failure is `malformed` — a terminal outcome
 * that leaves the spool untouched.
 *
 * The 200 branch additionally VALIDATES its body before trusting it. A 200 whose
 * `acknowledged` is missing, is not an array, or holds entries without a numeric
 * `client_seq` is `malformed`, never `acked`. This is the case that mattered most:
 * treating an unvalidated 200 as an ack would remove spool entries the hub never
 * confirmed, which is the ack-before-drop rule (EVENT-03) broken from the client side.
 *
 * `acked` is `body.acknowledged.map((a) => a.client_seq)`, read as whatever JS type
 * `JSON.parse` produced for the wire value — no `Number()` coercion is applied here.
 * The hub's `store.acknowledgeSeqs` already coerces `client_seq` to a JS number
 * server-side (`store.ts:840-857`); comparing spool entries (also JS numbers, from
 * `JSON.parse`d spool JSONL) against an uncoerced ack value is what makes a hub-side
 * regression on that coercion visible here instead of silently retrying forever.
 */
/**
 * `await res.json()` that cannot reject (ST-092 R4). Returns `{ok:true, body}` or
 * `{ok:false, detail}`. A hub that answers with truncated, empty, or non-JSON bytes
 * is a real possibility — a proxy error page, a half-written response, a crash
 * mid-serialisation — and none of those should reach the caller as an exception when
 * `flushOnce`'s contract is that every response maps to a stated outcome.
 */
async function parseJsonBody(res) {
  try {
    return { ok: true, body: await res.json() };
  } catch (error) {
    return {
      ok: false,
      detail: {
        error: "UnparseableResponseBody",
        status: res.status,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Is this a 200 body the client may act on? (ST-092 R4)
 *
 * Deliberately strict, and deliberately checked BEFORE anything is removed from the
 * spool: `acknowledged` must be an array and every entry must carry a numeric
 * `client_seq`. An empty array is valid — it is a hub that accepted nothing, which
 * `flush()` already handles as zero progress — but a malformed one is not, because
 * `flush()` removes exactly the entries this array names and a wrong answer here
 * deletes undelivered events.
 */
function isValidAckBody(body) {
  if (body === null || typeof body !== "object") return false;
  const acknowledged = body.acknowledged;
  if (!Array.isArray(acknowledged)) return false;
  return acknowledged.every((entry) =>
    entry !== null && typeof entry === "object" &&
    typeof entry.client_seq === "number"
  );
}

/**
 * The outcomes `flush()` can return that mean "do not try again": the same batch will
 * fail the same way next time. Every one of them leaves the spool intact.
 */
const TERMINAL_FLUSH_OUTCOMES = new Set([
  "terminal_auth",
  "unknown_node",
  "too_large",
  "malformed",
]);

/**
 * The single place an outcome becomes an exit code, because the two callers had drifted
 * apart: `runAgent`'s final flush already said `acked ? 0 : 75`, while the standalone
 * `flush` command matched three outcomes and let the other three fall through to 0 —
 * so `awcp-node-client flush` reported success against a hub that had rejected the
 * batch outright, with the events still spooled and `stopTerminal` having just printed
 * `terminal reason=... spooled_events=N` to stderr.
 *
 * 77 (EX_NOPERM) stays reserved for auth so a credential problem is distinguishable
 * from a hub-side rejection without parsing stdout. Every other non-`acked` outcome
 * shares 75, because what the exit code needs to convey is the thing they have in
 * common: events are still spooled and undelivered.
 *
 * 75 is EX_TEMPFAIL, which is a slight abuse for `too_large` and `unknown_node` —
 * retrying those will not help. It is still the right code here, for two reasons that
 * should be re-checked if either stops holding: nothing in this repo restarts on an
 * exit code (no unit file, no wrapper script, no `Restart=`), so 75 cannot become a
 * poison-pill retry loop; and `stopTerminal`'s stderr line already names the precise
 * reason, so a fourth code would buy discrimination the transcript already provides.
 */
function flushExitCode(outcome) {
  if (outcome === "acked") return 0;
  return outcome === "terminal_auth" ? 77 : 75;
}

export async function flushOnce(config, batch) {
  const nodeId = readFileSync(config.nodeIdPath, "utf8").trim();
  let res;
  try {
    res = await config.fetchImpl(
      `${config.hubUrl}/workflow/nodes/${nodeId}/events`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.bearer}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ events: batch }),
        // ST-092 R5b: without this a hub that accepts the connection and never answers
        // hangs shutdown indefinitely — the backoff fix below bounds the waits BETWEEN
        // requests, not a request that never returns. Undefined when no caller is
        // stopping, which is every non-`run` path.
        signal: config.abortSignal,
      },
    );
  } catch (error) {
    return { outcome: "unreachable", error };
  }

  if (res.status === 401) return { outcome: "terminal_auth" };
  if (res.status === 404) return { outcome: "unknown_node" };
  if (res.status === 413) return { outcome: "too_large" };
  if (res.status === 400) {
    const parsed = await parseJsonBody(res);
    if (!parsed.ok) return { outcome: "malformed", detail: parsed.detail };
    const body = parsed.body;
    const issues = body?.issues;
    // D-15/RESEARCH.md Pitfall 2: the two 400 shapes differ by whether each issue
    // carries a numeric client_seq — detect BY THAT, not by the mere presence of
    // `issues`, which both shapes have.
    const isPerEventRejection = Array.isArray(issues) && issues.length > 0 &&
      issues.every((issue) => typeof issue?.client_seq === "number");
    if (isPerEventRejection) {
      return {
        outcome: "rejected",
        rejected: issues.map((issue) => issue.client_seq),
      };
    }
    return { outcome: "malformed", detail: body };
  }
  if (res.status !== 200) {
    // 5xx, and any other non-2xx the hub is not documented to return: retryable.
    // Unrecognised is not evidence the batch was processed, so it must not be
    // silently dropped — only D-15's named-client_seq rejection may drop anything.
    return { outcome: "retryable", status: res.status };
  }

  const parsed = await parseJsonBody(res);
  if (!parsed.ok) return { outcome: "malformed", detail: parsed.detail };
  const body = parsed.body;
  if (!isValidAckBody(body)) {
    // NOT "acked". `flush()` removes exactly the entries this array names, so
    // trusting a body it could not verify would delete events the hub never
    // confirmed — ack-before-drop (EVENT-03) broken from the client's own side.
    return {
      outcome: "malformed",
      detail: {
        error: "InvalidAcknowledgementBody",
        status: res.status,
        message:
          "a 200 must carry `acknowledged` as an array of entries with a numeric " +
          "client_seq; refusing to treat this response as an acknowledgement",
        body,
      },
    };
  }
  const acknowledged = body.acknowledged;
  const acked = acknowledged.map((entry) => entry.client_seq);
  return { outcome: "acked", acked, acknowledged };
}

/**
 * Read the spool oldest-first and flush it, removing ONLY the entries a 200 actually
 * acknowledged — never on send, never on retry attempt (EVENT-03) — and mapping every
 * outcome `flushOnce` can return onto a terminal state or a bounded retry (D-15/D-17):
 *
 *   - `acked`      → remove the acknowledged entries, loop again (more batches may
 *                    remain — this is what lets a single `flush()` call both drop a
 *                    D-15 rejection AND then deliver the remainder in the same call).
 *   - `rejected`    → remove exactly the named `client_seq` values via `writeSpool`,
 *                    `recordDrops(..., "permanent_rejection")`, loop again. Retrying a
 *                    permanent rejection is the livelock D-15 exists to prevent: the
 *                    hub rejected the whole batch before storing or acking anything,
 *                    ack-before-drop forbids removal, and every entry queued behind the
 *                    offender would be blocked with it. Guarded: if the rejected seqs
 *                    do not intersect the batch actually sent, dropping would remove
 *                    nothing and loop forever — that condition is treated as
 *                    `malformed` and stops instead of spinning.
 *   - `terminal_auth`, `unknown_node`, `too_large`, `malformed` → stop immediately,
 *                    spool untouched, one structured stderr line naming the reason.
 *                    None of these improve by being repeated (D-17).
 *   - `retryable`, `unreachable` → back off (`config.sleepImpl`, jitter from
 *                    `config.randomImpl`) and retry the SAME batch, up to
 *                    `MAX_FLUSH_ATTEMPTS` attempts total. On exhaustion, return
 *                    `"deferred"` with the spool intact — the caller's next scheduled
 *                    call retries from scratch. `flushOnce`'s `"unreachable"` outcome
 *                    is real and still returned per-attempt; at this function's return
 *                    value it is superseded by `"deferred"` once attempts are exhausted,
 *                    which is why `flush()` never itself returns `"unreachable"`.
 *
 * The attempt counter resets to zero on any batch that makes progress (`acked` or
 * `rejected`) — `MAX_FLUSH_ATTEMPTS` bounds CONSECUTIVE non-progress attempts, not the
 * total number of HTTP calls in a long flush.
 *
 * Returns `{outcome, acked, delivered, remaining}`. `acked` and `delivered` are the
 * same array (the cumulative client_seqs removed across every batch this call
 * completed) — `acked` is kept for 03-02 tracer-test compatibility, `delivered` is the
 * name this plan's action text specifies. `remaining` is the spool's length after this
 * call returns.
 */
export async function flush(config) {
  const sleepImpl = config.sleepImpl ?? defaultSleep;
  // Set only by `runAgent`, for the flushes it may need to interrupt; `undefined`
  // everywhere else, which leaves every other caller's behaviour unchanged.
  const abortSignal = config.abortSignal;
  const randomImpl = config.randomImpl ?? Math.random;
  const write = config.stderrWrite ?? ((line) => process.stderr.write(line));
  const delivered = [];
  let attempt = 0;

  // `outcome` is the value callers branch on (main()'s exit-code switch, every
  // acceptance test) — the enum member flushOnce returned. `lineReason` is ONLY the
  // word in the stderr line and may differ (terminal_auth's line says
  // "reason=auth_failed", matching the plan's literal wording, while its outcome
  // stays "terminal_auth"). Conflating the two previously made `result.outcome` read
  // "auth_failed", which nothing branching on `"terminal_auth"` recognised.
  const stopTerminal = (outcome, lineReason = outcome) => {
    const spooled = readSpool(config).length;
    write(
      `awcp-node-client: terminal reason=${lineReason} spooled_events=${spooled}\n`,
    );
    return { outcome, acked: delivered, delivered, remaining: spooled };
  };

  // Shared by the retryable/unreachable branch AND the zero-progress-"acked" guard
  // below: increments the attempt counter, backs off (or returns null once
  // MAX_FLUSH_ATTEMPTS is exhausted, telling the caller to stop and defer). One place
  // for "how many times, how long between" so the two callers cannot drift apart.
  const backoffOrDefer = async () => {
    attempt += 1;
    if (attempt >= MAX_FLUSH_ATTEMPTS) {
      return null;
    }
    // ST-092 R5b. The signal is checked on BOTH sides of the sleep, and the check
    // after it is the load-bearing one: passing `abortSignal` into `sleepImpl` only
    // shortens a wait that honours it, and every test in this suite injects a sleep
    // that does not. Deferring on `aborted` is what actually ends the retry loop, so
    // it ends for an injected sleep and the production one alike.
    if (abortSignal?.aborted) return null;
    const raw = BACKOFF_BASE_MS * 2 ** (attempt - 1);
    const jitterFactor = 1 + (randomImpl() * 0.4 - 0.2); // +/-20%
    const delay = Math.min(BACKOFF_CAP_MS, Math.round(raw * jitterFactor));
    await sleepImpl(delay, abortSignal);
    if (abortSignal?.aborted) return null;
    return delay;
  };
  const deferred = () => {
    const spooled = readSpool(config).length;
    return {
      outcome: "deferred",
      acked: delivered,
      delivered,
      remaining: spooled,
    };
  };

  // The only way out of this loop besides an early `return` (terminal state or
  // exhausted retries) is the spool draining to empty — so "acked" is the only
  // outcome the final return below can ever report. Progress made ONLY via drops
  // (every spooled entry rejected, none ever ack'd) still ends here and is still
  // reported as "acked": the flush ran to completion with nothing left to do, which is
  // the accurate top-level summary even though `delivered` may be shorter than what
  // was originally spooled.
  // Read the spool once, then track it in memory. Every path below that shrinks it
  // writes `remaining` and carries that same array forward, because re-reading would
  // only ever return what was just written: `flushOnce` never touches the spool, and
  // `flush` runs under the single-writer lock (`main` holds it for the whole command),
  // so no other process can append between the write and the next iteration. Within
  // this process nothing can either — `runAgent` emits its heartbeat in the loop body
  // rather than from a timer, so no append interleaves with a `flushOnce` await.
  let entries = readSpool(config);
  while (true) {
    if (entries.length === 0) break;
    const batchEntries = entries.slice(0, FLUSH_MAX_EVENTS);
    const batch = batchEntries.map((entry) => ({
      client_seq: entry.client_seq,
      event_type: entry.event_type,
      payload: entry.payload,
    }));

    const result = await flushOnce(config, batch);

    if (result.outcome === "acked") {
      const ackedSeqs = new Set(result.acked);
      const remaining = entries.filter((entry) =>
        !ackedSeqs.has(entry.client_seq)
      );
      // Rule 1 fix (found during Task 1 testing): a 200 whose `acknowledged` array
      // does not actually intersect the batch just sent removes nothing, and
      // resetting the attempt counter on it — as every genuine ack does — spins
      // forever, since the exact same non-matching response keeps arriving for the
      // exact same unchanged spool. This cannot happen against the real hub (its
      // read-back ack always covers every event it just accepted, store.ts:807-857),
      // but the client must not trust that as a liveness guarantee from an
      // adversarial or buggy response. Bounded the same way as retryable/unreachable.
      if (remaining.length === entries.length) {
        const delay = await backoffOrDefer();
        if (delay === null) return deferred();
        continue;
      }
      attempt = 0;
      writeSpool(config, remaining);
      entries = remaining;
      delivered.push(...result.acked);
      continue;
    }

    if (result.outcome === "rejected") {
      const rejectedSeqs = new Set(result.rejected);
      const matched = batchEntries.filter((entry) =>
        rejectedSeqs.has(entry.client_seq)
      );
      if (matched.length === 0) {
        // The hub named seqs that are not in the batch we sent — dropping would
        // remove nothing, which would spin forever. Not the D-15 case; loud instead.
        return stopTerminal("malformed");
      }
      attempt = 0;
      const remaining = entries.filter((entry) =>
        !rejectedSeqs.has(entry.client_seq)
      );
      writeSpool(config, remaining);
      entries = remaining;
      recordDrops(
        config,
        matched.map((entry) => entry.client_seq),
        "permanent_rejection",
      );
      continue;
    }

    if (
      result.outcome === "terminal_auth" ||
      result.outcome === "unknown_node" ||
      result.outcome === "too_large" ||
      result.outcome === "malformed"
    ) {
      const lineReason = result.outcome === "terminal_auth"
        ? "auth_failed"
        : result.outcome;
      return stopTerminal(result.outcome, lineReason);
    }

    // retryable | unreachable
    const delay = await backoffOrDefer();
    if (delay === null) return deferred();
  }

  return { outcome: "acked", acked: delivered, delivered, remaining: 0 };
}

/**
 * Read `config.nodeIdPath` if it exists, else `null` (never `undefined` —
 * `JSON.stringify` drops `undefined`-valued keys, and the checkpoint payload's
 * `node_id` key must always be present per the plan's acceptance criteria).
 */
function readNodeIdOrNull(config) {
  try {
    if (!existsSync(config.nodeIdPath)) return null;
    return readFileSync(config.nodeIdPath, "utf8").trim();
  } catch {
    return null;
  }
}

/**
 * Append one `event_type: "heartbeat"` event with `{spooled_events, dropped_events,
 * uptime_ms}`. Not a new endpoint — an ordinary spooled event riding the same
 * durability and ack-gating guarantees as everything else (there is no heartbeat
 * route on the hub; `remoteNodeHub.ts:8-12`). Returns the allocated `client_seq`.
 */
export function emitHeartbeat(config, startedAtMs) {
  const spooled = readSpool(config).length;
  const state = readState(config);
  return appendEvent(config, {
    event_type: "heartbeat",
    payload: {
      spooled_events: spooled,
      dropped_events: state.dropped_events,
      uptime_ms: Date.now() - startedAtMs,
    },
  });
}

/**
 * Append one `event_type: "checkpoint"` event whose payload merges the caller's JSON
 * with `{node_id, hostname, spooled_events, dropped_events}` — the fixed fields last,
 * so they are never shadowed by a caller-supplied key of the same name. Same
 * ordinary-event mechanism as `emitHeartbeat`; no control channel, no new hub route.
 * Returns the allocated `client_seq`.
 *
 * Payloads are deliberately synthetic: counters, a timestamp, hostname, node_id —
 * nothing derived from the machine's working directory or repository contents.
 * `03-CONTEXT.md` flags payload content as an unresolved FYI given D-03's permanent
 * retention; this keeps the answer trivially safe until that is decided. Unlike
 * `server/scripts/awcp.ts`'s checkpoint (which shells out to `git` for repo/branch/
 * commit), this client does not import `node:child_process` or invoke `git` at all —
 * doing so would both widen that content question and force a new `--allow-run`
 * grant onto the in-process test file (D-09).
 */
export function emitCheckpoint(config, payload = {}) {
  const spooled = readSpool(config).length;
  const state = readState(config);
  return appendEvent(config, {
    event_type: "checkpoint",
    payload: {
      ...payload,
      node_id: readNodeIdOrNull(config),
      hostname: detectHostname() ?? "unknown",
      spooled_events: spooled,
      dropped_events: state.dropped_events,
    },
  });
}

/**
 * The long-running loop: emit a start checkpoint, flush; then on every tick emit a
 * heartbeat and flush again; on a stop signal, emit a stop checkpoint, flush once
 * more, and finish. Exits immediately — no further tick, no stop checkpoint — if any
 * flush returns `"terminal_auth"`, propagating exit code 77 (D-17: the client must
 * not keep ticking against a hub that has already refused it).
 *
 * Returns `{stop, done}`. `stop()` is a synchronous, idempotent signal — set a flag
 * checked between ticks — NOT a real `SIGINT`/`SIGTERM` handler: registering a live
 * signal handler here would hijack the host process's Ctrl-C and accumulate listeners
 * across repeated calls (every call to `runAgent`, e.g. once per test, would add
 * another). `main`'s `"run"` command is the one real (non-test) caller that wires an
 * OS signal to `stop()` — see its definition below. `done` resolves to
 * `{exitCode, terminal}` once the loop (or the terminal exit) completes.
 *
 * The tick source is `config.sleepImpl` (D-13/D-17's existing seam, reused rather
 * than inventing a second one) — production ticks on a real timer via `defaultSleep`;
 * a test drives ticks deterministically by controlling when each `sleepImpl` call
 * resolves, with no real waiting.
 *
 * **ST-092 R5 — the stop signal now INTERRUPTS the wait rather than being noticed
 * after it.** The loop used to `await sleepImpl(interval)` unconditionally and check
 * the flag only once that resolved, so a `SIGTERM` arriving one second into a
 * sixty-second heartbeat interval left the process alive for the remaining
 * fifty-nine — under an init system's default kill timeout that is not a slow
 * shutdown, it is a `SIGKILL`, and a `SIGKILL` here means the stop checkpoint is
 * never emitted at all. The wait is now raced against a promise `stop()` resolves,
 * so shutdown latency is bounded by the signal.
 *
 * **ST-092 R5b — the signal now reaches the FLUSH too, not just the tick.** Bounding
 * the heartbeat wait alone left `flush()`'s own retry backoff (~31s across five
 * sleeps) and its in-flight request unaware that a stop had been signalled, so a
 * SIGTERM against an unreachable hub still burned the full budget before the stop
 * checkpoint was so much as appended. The in-loop flushes now carry
 * `stopController.signal`; the final flush deliberately does not, so it still gets a
 * bounded delivery attempt. A hub that accepts the connection and never answers can
 * still hang that final flush — bounding it needs a request timeout, which is a
 * separate decision and is not made here.
 *
 * **ST-092 R5 — a stop whose final flush did not deliver no longer reports success.**
 * The final flush's outcome was inspected only for `terminal_auth`; a `deferred`
 * result — the hub unreachable, retries exhausted, the stop checkpoint and everything
 * behind it still spooled — returned exit code 0. An operator reading exit 0 would
 * take it as "this node finished cleanly and reported so". It now returns 75, the
 * exit code `main`'s `flush` command already uses for exactly this condition, so the
 * two surfaces agree rather than disagreeing about what a deferred flush means.
 *
 * **What "clean shutdown" means here, stated because the code used to answer it only
 * implicitly.** A stop checkpoint left in the spool is NOT a failure of the client —
 * the event is durable, ordered, and will be delivered on the next run. It IS a
 * failure to *report* the shutdown to the hub within this process's lifetime, which
 * is what the exit code describes. So: exit 0 means the hub has acknowledged the stop
 * checkpoint; exit 75 means it is spooled and undelivered — whether because the
 * retries were exhausted or because the hub terminally rejected the batch, which
 * `stopTerminal`'s stderr line distinguishes; exit 77 means the hub
 * refused this node's credential and no further attempt will help.
 */
export function runAgent(config) {
  const sleepImpl = config.sleepImpl ?? defaultSleep;
  const interval = config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const startedAtMs = Date.now();
  let stopped = false;
  // Two halves of the same signal, and both are needed.
  //
  // `stopSignal` is what the race below settles on, and it works for ANY sleep
  // implementation — including a test's injected one, which knows nothing about
  // abort signals.
  //
  // `stopController` is passed INTO the sleep so the production timer is actually
  // cleared. Without it the loop wakes at once but the pending `setTimeout` keeps
  // Node's event loop alive, and the process outlives its own shutdown by the rest of
  // the interval. Both created once, not per tick, so repeated `stop()` calls stay
  // idempotent.
  let wake;
  const stopSignal = new Promise((resolve) => {
    wake = resolve;
  });
  const stopController = new AbortController();

  async function loop() {
    emitCheckpoint(config, { phase: "start" });
    // The in-loop flushes carry the stop signal so a shutdown interrupts them; the
    // FINAL flush below deliberately does not, so it still gets its bounded delivery
    // attempt rather than deferring instantly on an already-aborted signal.
    const interruptibleConfig = { ...config, abortSignal: stopController.signal };
    let flushResult = await flush(interruptibleConfig);
    if (TERMINAL_FLUSH_OUTCOMES.has(flushResult.outcome)) {
      return { exitCode: flushExitCode(flushResult.outcome), terminal: true };
    }

    while (!stopped) {
      // `Promise.race` rather than a bare await: whichever settles first wins, and
      // `stop()` settling first is the whole point. The signal is passed through so a
      // sleep that understands it (the production one) cancels its timer rather than
      // being merely outrun; an injected test sleep ignores the extra argument and the
      // race covers it.
      await Promise.race([
        sleepImpl(interval, stopController.signal),
        stopSignal,
      ]);
      if (stopped) break;
      emitHeartbeat(config, startedAtMs);
      flushResult = await flush(interruptibleConfig);
      if (TERMINAL_FLUSH_OUTCOMES.has(flushResult.outcome)) {
        return { exitCode: flushExitCode(flushResult.outcome), terminal: true };
      }
    }

    emitCheckpoint(config, { phase: "stop" });
    flushResult = await flush(config);
    if (TERMINAL_FLUSH_OUTCOMES.has(flushResult.outcome)) {
      return { exitCode: flushExitCode(flushResult.outcome), terminal: true };
    }
    // Anything that did not fully deliver is reported as deferred (75), not success.
    // `flush()` returns "acked" only when the spool drained; every other non-terminal
    // outcome leaves events behind.
    return {
      exitCode: flushExitCode(flushResult.outcome),
      terminal: false,
    };
  }

  return {
    stop: () => {
      stopped = true;
      wake();
      stopController.abort();
    },
    done: loop(),
  };
}

/**
 * Commands that mutate `AWCP_HOME` and therefore run under the single-writer lock
 * (ST-092 R1).
 *
 * `status` is absent because it only reads, and an operator must be able to inspect a
 * node while it is running — a `status` that refused while `run` held the lock would
 * make the drop counter unreadable exactly when someone is trying to find out why
 * events are being dropped.
 *
 * `register` is absent deliberately, not by oversight. It neither allocates a
 * `client_seq` nor rewrites the spool, and it is the operator's recovery action when
 * a node's registration needs re-establishing — locking it would mean a running
 * client blocks the one command most likely to be needed while it runs.
 */
const LOCKED_COMMANDS = new Set(["emit", "flush", "checkpoint", "run"]);

/**
 * CLI surface: `register`, `flush`, `status`, `emit`, `checkpoint`, `run`.
 *
 * `overrides` is passed straight to `resolveConfig` — additive over the 03-02/03-03
 * signature (`main(argv)` still works; the real entry point below never passes a
 * second argument), and it is what lets a test drive `main`'s exit-code behavior
 * (`process.exitCode`) against an injected `fetchImpl`/`home` without a real hub.
 *
 * Exit codes: 0 success · 69 refused, another client holds the lock (ST-092 R1) ·
 * 75 anything that left the spool undelivered — retryable exhaustion AND the terminal
 * non-auth rejections (`unknown_node`, `too_large`, `malformed`) · 77 terminal auth
 * failure. See `flushExitCode`.
 * The lock is taken before the command body and released in a `finally`, so every
 * path out — including the 77 terminal-auth path and a thrown error — gives it up.
 */
export async function main(argv, overrides = {}) {
  const config = resolveConfig(overrides);
  const command = argv[0];
  const lock = LOCKED_COMMANDS.has(command) ? acquireLock(config) : null;
  try {
    return await runCommand(config, argv, command);
  } finally {
    releaseLock(lock);
  }
}

async function runCommand(config, argv, command) {
  if (command === "register") {
    const nodeId = await registerNode(config);
    console.log(JSON.stringify({ node_id: nodeId }));
    return;
  }
  if (command === "flush") {
    const result = await flush(config);
    console.log(JSON.stringify(result));
    // Exit codes so a shell transcript records the outcome without parsing stdout —
    // see `flushExitCode` for the mapping and why only `acked` earns 0. This used to
    // enumerate the three outcomes it knew about and let the rest fall through to 0,
    // which is how a hub-rejected batch came to report success.
    //
    // `process.exitCode`, never `process.exit()`, so pending stream writes flush
    // before the process ends (T-03-04-06) — an exit code that arrives with a
    // truncated transcript defeats the point of capturing one.
    process.exitCode = flushExitCode(result.outcome);
    return;
  }
  if (command === "status") {
    // The third leg of "visible" (criterion 4): a counter no operator can read is not
    // visible. One key=value per line to stdout — this is the surface the z2
    // transcript in 03-06 will quote.
    const state = readState(config);
    const spooledEvents = readSpool(config).length;
    console.log(`dropped_events=${state.dropped_events}`);
    console.log(`spooled_events=${spooledEvents}`);
    return;
  }
  if (command === "emit") {
    const eventType = argv[1];
    if (!eventType) {
      throw new Error(
        'emit requires an event_type argument: "emit <event_type> [json]"',
      );
    }
    const payload = argv[2] !== undefined ? JSON.parse(argv[2]) : null;
    const seq = appendEvent(config, { event_type: eventType, payload });
    console.log(JSON.stringify({ client_seq: seq }));
    return;
  }
  if (command === "checkpoint") {
    const payload = argv[1] !== undefined ? JSON.parse(argv[1]) : {};
    const seq = emitCheckpoint(config, payload);
    console.log(JSON.stringify({ client_seq: seq }));
    return;
  }
  if (command === "run") {
    const controller = runAgent(config);
    // The only real (non-test) registration of a live signal handler — runAgent
    // itself never does this (see its docblock: a live SIGINT handler inside a test
    // process is a runtime hazard, not merely a testability seam).
    const onSignal = () => controller.stop();
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    const result = await controller.done;
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.exitCode = result.exitCode;
    return;
  }
  throw new Error(
    `unknown command: ${
      command ?? "(none)"
    } — expected "register", "flush", "status", ` +
      `"emit", "checkpoint", or "run"`,
  );
}

/**
 * Entry-point guard (D-09, RESEARCH.md Pattern 2): importing this module — including
 * from a Deno test via `node:` specifier compatibility — must never start a real
 * network flush. `pathToFileURL` is used rather than string-concatenating a `file://`
 * prefix, which mis-encodes paths containing spaces or non-ASCII characters. Guarded
 * against an empty `argv` so an import with no invoking script cannot throw here.
 */
function isMainModule() {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  try {
    return import.meta.url === pathToFileURL(invokedPath).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof AwcpLockError) {
      // Refusal, not a crash: one line an operator can act on, and no stack trace
      // implying the client is broken when it is doing exactly what R1 asks of it.
      // 69 is sysexits' EX_UNAVAILABLE — distinct from 75 (deferred) and 77
      // (terminal auth) so a shell transcript records WHICH refusal this was.
      process.stderr.write(`awcp-node-client: ${error.message}\n`);
      process.exitCode = 69;
    } else {
      throw error;
    }
  }
}
