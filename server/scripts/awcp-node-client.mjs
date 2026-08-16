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
 * (bounding, eviction, visible drop counter, multi-batch flush, D-14 restart proof).
 * The client now spools durably, bounds the spool at a configured entry count
 * (`config.spoolMaxEntries`, default `DEFAULT_SPOOL_MAX_ENTRIES`), evicts oldest-first
 * on overflow with a persisted+stderr-logged drop counter, and flushes in batches of
 * at most `FLUSH_MAX_EVENTS`, removing an entry only after a 200 names its
 * `client_seq` — never on send, never on retry attempt. Still deliberately incomplete:
 * no backoff, no dedicated 400/401 branches beyond a typed throw, no heartbeat loop.
 * Those seams are filled by 03-04 (backoff, 400/401 handling, heartbeat/checkpoint)
 * without an architectural change to what is here.
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
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
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
  const message = typeof warning === "string" ? warning : warning?.message ?? "";
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
 * Every persisted path and every dependency is a parameter with a production default
 * applied only when an override is absent (RESEARCH.md Pattern 3) — so a test can
 * point this at `/tmp` and stay inside CLAUDE.md's existing `--allow-write=/tmp`
 * grant, and 03-03/03-04 can inject `fetchImpl` to exercise failure branches with no
 * server at all.
 */
export function resolveConfig(overrides = {}) {
  const home = overrides.home ?? process.env.AWCP_HOME ?? join(homedir(), ".awcp");
  const hubUrl = (
    overrides.hubUrl ?? process.env.AWCP_HUB_URL ?? "http://127.0.0.1:3000"
  ).replace(/\/+$/, "");
  const rawSpoolMax = process.env.AWCP_SPOOL_MAX_ENTRIES;
  const parsedSpoolMax = rawSpoolMax ? Number.parseInt(rawSpoolMax, 10) : NaN;
  const envSpoolMax = Number.isFinite(parsedSpoolMax) && parsedSpoolMax > 0
    ? parsedSpoolMax
    : DEFAULT_SPOOL_MAX_ENTRIES;
  return {
    home,
    spoolPath: overrides.spoolPath ?? join(home, "spool.jsonl"),
    seqPath: overrides.seqPath ?? join(home, "client_seq"),
    nodeIdPath: overrides.nodeIdPath ?? join(home, "node_id"),
    statePath: overrides.statePath ?? join(home, "state.json"),
    hubUrl,
    bearer: overrides.bearer ?? process.env.AWCP_NODE_BEARER ?? "",
    enrolmentSecret: overrides.enrolmentSecret ?? process.env.AWCP_NODE_ENROLMENT_SECRET ?? "",
    fetchImpl: overrides.fetchImpl ?? globalThis.fetch,
    // Criterion 4 (EVENT-04, 03-03): bound expressed as an entry count, injectable so
    // tests can exercise eviction with a small cap without waiting on 1000 appends.
    spoolMaxEntries: overrides.spoolMaxEntries ?? envSpoolMax,
    // Every structured "visible drop" line (recordDrops) is routed through this one
    // seam rather than a bare `process.stderr.write` call, so a test can inject a
    // collector instead of eyeballing captured output. Defaulted, never widened by a
    // test that forgets to override it — production behavior is unchanged.
    stderrWrite: overrides.stderrWrite ?? ((line) => process.stderr.write(line)),
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
 * Read-increment-write `config.seqPath`, fsync before returning. NEVER reads
 * `spoolPath` (D-14) — deriving the next seq from the spool's last line resets to 0
 * every time the spool drains, which is the steady state after every successful
 * flush, not an edge case; the hub's `ON CONFLICT (node_id, client_seq) DO NOTHING`
 * would then silently discard the next event's new content. A missing counter file
 * starts at 1.
 */
export function allocateSeq(config) {
  ensureStateDir(config);
  let current = 0;
  if (existsSync(config.seqPath)) {
    const raw = readFileSync(config.seqPath, "utf8").trim();
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) current = parsed;
  }
  const next = current + 1;
  writeFileFsync(config.seqPath, String(next), 0o600);
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
  const currentLength = readSpool(config).length;
  if (currentLength > cap) {
    evictOldest(config, currentLength - cap);
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
 * file in the same directory, `fsyncSync` it, then `renameSync` over the target.
 * `rename()` is atomic on the same POSIX filesystem, so a crash mid-write leaves
 * either the old complete spool or the new one — never a truncated one. A plain
 * `writeSync` without `fsyncSync` is not sufficient: a synchronous Node write blocks
 * the event loop but does not force the OS page cache to disk.
 */
export function writeSpool(config, entries) {
  ensureStateDir(config);
  const tmpPath = join(
    dirname(config.spoolPath),
    `.spool.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
  );
  const content = entries.length === 0
    ? ""
    : entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  const fd = openSync(tmpPath, "w", 0o600);
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  // Test-only seam (03-03): a config carrying `beforeRename` can simulate a crash
  // between the durable temp-file write above and the atomic rename below — the temp
  // file already exists and is fsync'd, so throwing here proves the ORIGINAL
  // spool.jsonl survives byte-identical. Never set in production; resolveConfig does
  // not default this field, so a config built the normal way never carries it.
  if (typeof config.beforeRename === "function") {
    config.beforeRename(tmpPath);
  }
  renameSync(tmpPath, config.spoolPath);
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
 * replace, never an append.
 */
export function writeState(config, state) {
  ensureStateDir(config);
  const tmpPath = join(
    dirname(config.statePath),
    `.state.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
  );
  const fd = openSync(tmpPath, "w", 0o600);
  try {
    writeSync(fd, JSON.stringify(state));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, config.statePath);
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
 */
export function evictOldest(config, count) {
  if (!count || count <= 0) return [];
  const entries = readSpool(config);
  const toEvict = entries.slice(0, count);
  if (toEvict.length === 0) return [];
  const remaining = entries.slice(toEvict.length);
  writeSpool(config, remaining);
  const seqs = toEvict.map((entry) => entry.client_seq);
  recordDrops(config, seqs, "spool_overflow");
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

  const res = await config.fetchImpl(`${config.hubUrl}/workflow/nodes/register`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      hostname: detectHostname(),
      platform: process.platform,
    }),
  });

  if (res.status !== 201) {
    const text = await res.text().catch(() => "");
    throw new AwcpHttpError(res.status, `registerNode failed: ${res.status} ${text}`);
  }

  const body = await res.json();
  writeFileFsync(config.nodeIdPath, body.node_id, 0o600);
  return body.node_id;
}

/**
 * POST one batch to `<hubUrl>/workflow/nodes/<node_id>/events` and return the read-
 * back acknowledgement.
 *
 * `acked` is `body.acknowledged.map((a) => a.client_seq)`, read as whatever JS type
 * `JSON.parse` produced for the wire value — no `Number()` coercion is applied here.
 * The hub's `store.acknowledgeSeqs` already coerces `client_seq` to a JS number
 * server-side (`store.ts:840-857`); comparing spool entries (also JS numbers, from
 * `JSON.parse`d spool JSONL) against an uncoerced ack value is what makes a hub-side
 * regression on that coercion visible here instead of silently retrying forever.
 *
 * For any non-200, throws a typed `AwcpHttpError` carrying the status — 03-04 adds
 * the real 400/401 branches on top of this seam.
 */
export async function flushOnce(config, batch) {
  const nodeId = readFileSync(config.nodeIdPath, "utf8").trim();
  const res = await config.fetchImpl(
    `${config.hubUrl}/workflow/nodes/${nodeId}/events`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events: batch }),
    },
  );

  const body = await res.json();
  if (res.status !== 200) {
    throw new AwcpHttpError(
      res.status,
      `flushOnce failed: ${res.status} ${JSON.stringify(body)}`,
    );
  }

  const acknowledged = body.acknowledged;
  const acked = acknowledged.map((entry) => entry.client_seq);
  return { outcome: "acked", acked, acknowledged };
}

/**
 * Read the spool oldest-first, take at most `FLUSH_MAX_EVENTS`, flush once, and — on
 * an `acked` outcome — rewrite the spool to exactly the entries whose `client_seq` is
 * NOT in `acked`. Removal happens ONLY here, ONLY after a 200 that named the seq;
 * nothing removes an entry on send or on retry attempt (EVENT-03).
 */
export async function flush(config) {
  const entries = readSpool(config);
  if (entries.length === 0) return { outcome: "acked", acked: [], acknowledged: [] };

  const batch = entries.slice(0, FLUSH_MAX_EVENTS).map((entry) => ({
    client_seq: entry.client_seq,
    event_type: entry.event_type,
    payload: entry.payload,
  }));

  const result = await flushOnce(config, batch);
  if (result.outcome === "acked") {
    const ackedSeqs = new Set(result.acked);
    const remaining = entries.filter((entry) => !ackedSeqs.has(entry.client_seq));
    writeSpool(config, remaining);
  }
  return result;
}

/** Minimal CLI surface for the tracer: `register` and `flush`. Grows in 03-04. */
export async function main(argv) {
  const config = resolveConfig();
  const command = argv[0];
  if (command === "register") {
    const nodeId = await registerNode(config);
    console.log(JSON.stringify({ node_id: nodeId }));
    return;
  }
  if (command === "flush") {
    const result = await flush(config);
    console.log(JSON.stringify(result));
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
  throw new Error(
    `unknown command: ${command ?? "(none)"} — expected "register", "flush", or "status"`,
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
  await main(process.argv.slice(2));
}
