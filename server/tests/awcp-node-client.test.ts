/**
 * ST-088 03-03 — in-process spool proofs for `awcp-node-client.mjs`.
 *
 * No server, no database, no SQL — every test writes only under a
 * `Deno.makeTempDir()` root injected as `config.home`, per D-09/Pattern 3. This file
 * proves three ROADMAP success criteria as spool properties under failure, none of
 * which are observable on the happy path 03-02's tracer proved:
 *
 *   - EVENT-04 (Task 1): overflow bounds the spool, evicts oldest-first, and makes the
 *     drop count visible three ways (persisted state, structured stderr, `status`).
 *   - EVENT-02 / EVENT-03 (Task 2): a disconnected node retains a bounded, ordered
 *     spool and loses nothing; a reconnected one replays oldest-first; an entry
 *     disappears only when a 200 names its `client_seq`.
 *   - D-14 (Task 3): the `client_seq` counter is independent of the spool — this is
 *     the discriminator for ROADMAP criterion 1's vacuous-pass mode (see the D-14
 *     block below for why every other assertion in this phase can pass green while
 *     "exactly once" is silently false). Do NOT delete these as redundant with the
 *     EVENT-01 hub-interaction test — that test proves duplicate submission is safe;
 *     these tests prove the counter that decides what gets submitted in the first
 *     place never resets.
 *
 * Requires no permission flag beyond --allow-net --allow-env --allow-read
 * --allow-write=/tmp — the suite is required to pass without --allow-sys or a widened
 * --allow-write, so a test that escapes to the real $HOME fails on permissions rather
 * than succeeding quietly (T-03-03-05).
 */

import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import process from "node:process";

import {
  acquireLock,
  allocateSeq,
  appendEvent,
  defaultSleep,
  emitCheckpoint,
  emitHeartbeat,
  evictOldest,
  flush,
  flushOnce,
  FLUSH_MAX_EVENTS,
  main,
  MAX_FLUSH_ATTEMPTS,
  MAX_PAYLOAD_BYTES,
  readSpool,
  readState,
  releaseLock,
  registerNode,
  resolveConfig,
  runAgent,
  writeSpool,
  writeState,
} from "../scripts/awcp-node-client.mjs";

const T = { sanitizeResources: false, sanitizeOps: false };

/** A fixed, non-random node_id — these tests never talk to a real hub. */
const FAKE_NODE_ID = "00000000-0000-4000-8000-000000000000";

/** Fake registration: write the node_id file directly, no HTTP round trip needed. */
function withNodeId(config: Record<string, unknown>, nodeId = FAKE_NODE_ID) {
  Deno.mkdirSync(config.home as string, { recursive: true, mode: 0o700 });
  Deno.writeTextFileSync(config.nodeIdPath as string, nodeId);
  Deno.chmodSync(config.nodeIdPath as string, 0o600);
  return config;
}

/** Simulates a disconnected transport: fetchImpl throws before any response exists. */
function unreachableFetch() {
  return () => {
    throw new TypeError("fetch failed: network unreachable (test double)");
  };
}

/** Acks every event in the submitted batch, recording each request's events array. */
// deno-lint-ignore no-explicit-any
function ackingFetch(recorded: any[][]) {
  return (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    recorded.push(body.events);
    const acknowledged = body.events.map(
      (e: { client_seq: number }) => ({
        client_seq: e.client_seq,
        event_id: crypto.randomUUID(),
      }),
    );
    return Promise.resolve({
      status: 200,
      json: () => Promise.resolve({ acknowledged }),
    });
  };
}

/** Acks ONLY `targetSeq` from whatever batch is submitted — a partial read-back ack. */
// deno-lint-ignore no-explicit-any
function partialAckFetch(targetSeq: number, recorded?: any[][]) {
  return (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    recorded?.push(body.events);
    return Promise.resolve({
      status: 200,
      json: () =>
        Promise.resolve({
          acknowledged: [{
            client_seq: targetSeq,
            event_id: crypto.randomUUID(),
          }],
        }),
    });
  };
}

/** Records the outbound request, THEN throws — proving the batch really was sent. */
// deno-lint-ignore no-explicit-any
function throwsAfterRecordingFetch(recorded: any[][]) {
  return (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    recorded.push(body.events);
    throw new Error("connection reset after send (test double)");
  };
}

// ---------------------------------------------------------------------------
// 03-04 Task 1 fetch doubles — one per `flushOnce` outcome branch. Response shapes
// mirror the REAL hub as closely as a test double can: a 401 has no JSON body
// (`remoteNodeHub.ts:110` — plain text `Response("Unauthorized", {status:401})`), so
// its `.json()` rejects exactly as the real one would if the client mis-ordered its
// status-then-body check. A double whose `.json()` quietly resolved would let that
// exact regression pass.
// ---------------------------------------------------------------------------

/** A 400 naming specific `client_seq` values — the oversized-single-payload shape. */
// deno-lint-ignore no-explicit-any
function rejectingFetch(rejectedSeqs: number[], recorded?: any[][]) {
  return (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    recorded?.push(body.events);
    return Promise.resolve({
      status: 400,
      json: () =>
        Promise.resolve({
          error: "BadRequest",
          message: "event payload exceeds 16384 bytes",
          issues: rejectedSeqs.map((client_seq) => ({
            client_seq,
            bytes: 20_000,
          })),
        }),
    });
  };
}

/** A 400 in the OTHER shape: zod issues with no `client_seq` field (batch-size violation). */
function malformedFetch() {
  return (_url: string, _init: { body: string }) =>
    Promise.resolve({
      status: 400,
      json: () =>
        Promise.resolve({
          error: "BadRequest",
          message: "request body failed validation",
          issues: [{
            path: ["events"],
            message: "Array must contain at most 500 element(s)",
          }],
        }),
    });
}

/** Matches the REAL hub exactly: 401 has no JSON body at all (plain text). */
function unauthorizedFetch() {
  return (_url: string, _init: { body: string }) =>
    Promise.resolve({
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
      json: () =>
        Promise.reject(
          new SyntaxError("Unexpected token U in JSON at position 0"),
        ),
    });
}

/** Unknown node_id. */
function notFoundFetch() {
  return (_url: string, _init: { body: string }) =>
    Promise.resolve({
      status: 404,
      json: () =>
        Promise.resolve({
          error: "WorkflowNotFoundError",
          message: "unknown node",
          id: "x",
        }),
    });
}

/** Request body too large for the server to even parse into events (413, pre-parse). */
function tooLargeFetch() {
  return (_url: string, _init: { body: string }) =>
    Promise.resolve({
      status: 413,
      json: () =>
        Promise.resolve({
          error: "PayloadTooLarge",
          message: "request body exceeds N bytes",
        }),
    });
}

/** A transient server failure — retryable, distinct from a transport-level throw. */
function serverErrorFetch() {
  return (_url: string, _init: { body: string }) =>
    Promise.resolve({
      status: 503,
      json: () =>
        Promise.resolve({
          error: "InternalError",
          message: "database unavailable",
        }),
    });
}

// ---------------------------------------------------------------------------
// Task 1 (EVENT-04): bound the spool, evict oldest-first, visible drop counter
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    "EVENT-04: appending past spoolMaxEntries evicts the oldest entries and keeps the newest",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home, spoolMaxEntries: 3 });
    const seqs: number[] = [];
    for (let i = 0; i < 5; i++) {
      seqs.push(appendEvent(config, { event_type: "e", payload: { i } }));
    }

    const spool = readSpool(config);
    assertEquals(spool.length, 3, "the spool must stay at the configured cap");
    assertEquals(
      spool.map((e: { client_seq: number }) => e.client_seq),
      seqs.slice(-3),
      "only the 3 highest client_seq values must remain",
    );
  },
});

Deno.test({
  ...T,
  name:
    "EVENT-04: dropped_events persists to disk and is readable via a freshly built config",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home, spoolMaxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      appendEvent(config, { event_type: "e", payload: { i } });
    }

    // A NEW config object, not the one held above — proves the value came from disk.
    const freshConfig = resolveConfig({ home, spoolMaxEntries: 3 });
    const state = readState(freshConfig);
    assertEquals(
      state.dropped_events,
      2,
      "two of five appends must have been evicted",
    );
  },
});

Deno.test({
  ...T,
  name:
    "EVENT-04: each overflow drop emits exactly one structured stderr line with the running total",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const lines: string[] = [];
    const config = resolveConfig({
      home,
      spoolMaxEntries: 3,
      stderrWrite: (line: string) => lines.push(line),
    });
    for (let i = 0; i < 5; i++) {
      appendEvent(config, { event_type: "e", payload: { i } });
    }

    assertEquals(lines.length, 2, "exactly two drops must have been logged");
    assert(
      /awcp-node-client: dropped client_seq=1 reason=spool_overflow dropped_events_total=1/
        .test(lines[0]),
      `unexpected first drop line: ${lines[0]}`,
    );
    assert(
      /awcp-node-client: dropped client_seq=2 reason=spool_overflow dropped_events_total=2/
        .test(lines[1]),
      `unexpected second drop line: ${lines[1]}`,
    );
  },
});

Deno.test({
  ...T,
  name: "EVENT-04: `status` prints dropped_events and spooled_events to stdout",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home, spoolMaxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      appendEvent(config, { event_type: "e", payload: { i } });
    }

    const originalHome = Deno.env.get("AWCP_HOME");
    const originalMax = Deno.env.get("AWCP_SPOOL_MAX_ENTRIES");
    Deno.env.set("AWCP_HOME", home);
    Deno.env.set("AWCP_SPOOL_MAX_ENTRIES", "3");
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg?: unknown) => {
      logs.push(String(msg));
    };
    try {
      await main(["status"]);
    } finally {
      console.log = originalLog;
      if (originalHome === undefined) Deno.env.delete("AWCP_HOME");
      else Deno.env.set("AWCP_HOME", originalHome);
      if (originalMax === undefined) Deno.env.delete("AWCP_SPOOL_MAX_ENTRIES");
      else Deno.env.set("AWCP_SPOOL_MAX_ENTRIES", originalMax);
    }

    assert(
      logs.some((l) => /^dropped_events=2$/.test(l)),
      `logs: ${JSON.stringify(logs)}`,
    );
    assert(
      logs.some((l) => /^spooled_events=3$/.test(l)),
      `logs: ${JSON.stringify(logs)}`,
    );
  },
});

Deno.test({
  ...T,
  name: "EVENT-04: state.json is written at mode 0600",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home, spoolMaxEntries: 1 });
    appendEvent(config, { event_type: "e", payload: null });
    appendEvent(config, { event_type: "e", payload: null }); // triggers the first eviction

    const mode = (await Deno.stat(config.statePath)).mode! & 0o777;
    assertEquals(mode, 0o600, "state.json must be 0600");
  },
});

Deno.test({
  ...T,
  name:
    "writeSpool crash-safety: a failure injected between the temp-file write and the rename leaves the prior spool byte-identical",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    appendEvent(config, { event_type: "a", payload: { n: 1 } });
    appendEvent(config, { event_type: "b", payload: { n: 2 } });
    const before = await Deno.readTextFile(config.spoolPath);

    const failingConfig = {
      ...config,
      beforeRename: () => {
        throw new Error("simulated crash before rename (test double)");
      },
    };

    let threw = false;
    try {
      writeSpool(failingConfig, []);
    } catch {
      threw = true;
    }
    assert(
      threw,
      "writeSpool must propagate the injected failure, not swallow it",
    );

    const after = await Deno.readTextFile(config.spoolPath);
    assertEquals(
      after,
      before,
      "the original spool.jsonl must be unchanged byte-for-byte",
    );

    const lines = after.split("\n").filter((l) => l.trim() !== "");
    assertEquals(
      lines.length,
      2,
      "both original entries must still be present",
    );
    for (const line of lines) {
      JSON.parse(line); // must not throw — still parseable line-by-line JSON
    }
  },
});

// ---------------------------------------------------------------------------
// Task 2 (EVENT-02/EVENT-03): retention through disconnection, ack-gated removal
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    "EVENT-02: an unreachable flush leaves the spool byte-identical and ascending; a reconnected flush replays oldest-first over the wire",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    const seqs: number[] = [];
    for (let i = 0; i < 5; i++) {
      seqs.push(appendEvent(config, { event_type: "e", payload: { i } }));
    }

    const before = await Deno.readTextFile(config.spoolPath as string);
    // 03-04: an unreachable fetchImpl retries (bounded, D-17) rather than surfacing
    // "unreachable" as flush()'s own outcome — "unreachable" is still returned by
    // flushOnce PER ATTEMPT, but flush() exhausts MAX_FLUSH_ATTEMPTS and reports
    // "deferred" instead. sleepImpl is injected so this does not sleep in real time.
    const unreachableConfig = {
      ...config,
      fetchImpl: unreachableFetch(),
      sleepImpl: () => Promise.resolve(),
    };
    const result1 = await flush(unreachableConfig);
    assertEquals(result1.outcome, "deferred");

    const after = await Deno.readTextFile(config.spoolPath as string);
    assertEquals(
      after,
      before,
      "spool.jsonl must be byte-identical after an unreachable attempt",
    );
    assertEquals(
      readSpool(config).map((e: { client_seq: number }) => e.client_seq),
      seqs,
      "all 5 client_seq values must remain, in ascending order",
    );

    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    const ackingConfig = { ...config, fetchImpl: ackingFetch(recorded) };
    const result2 = await flush(ackingConfig);
    assertEquals(result2.outcome, "acked");
    assertEquals(
      recorded[0].map((e: { client_seq: number }) => e.client_seq),
      seqs,
      "the request body sent over the wire must be in ascending client_seq order",
    );
    assertEquals(
      readSpool(config).length,
      0,
      "the spool must be empty after the ack",
    );
  },
});

Deno.test({
  ...T,
  name:
    "EVENT-02: bounded retention during an outage keeps the newest N ascending and counts the drops",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home, spoolMaxEntries: 3 });
    const seqs: number[] = [];
    for (let i = 0; i < 5; i++) {
      seqs.push(appendEvent(config, { event_type: "e", payload: { i } }));
    }

    const spool = readSpool(config);
    assertEquals(spool.length, 3);
    const spoolSeqs = spool.map((e: { client_seq: number }) => e.client_seq);
    assertEquals(
      spoolSeqs,
      seqs.slice(-3),
      "the surviving entries must be the newest 3",
    );
    assertEquals(
      spoolSeqs,
      [...spoolSeqs].sort((a, b) => a - b),
      "the surviving entries must still be ascending",
    );
    assertEquals(readState(config).dropped_events, 2);
  },
});

Deno.test({
  ...T,
  name:
    "EVENT-03: a partial acknowledgement removes only the acknowledged entry; a post-send throw removes nothing",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    const s1 = appendEvent(config, { event_type: "a", payload: { n: 1 } });
    const s2 = appendEvent(config, { event_type: "b", payload: { n: 2 } });
    const s3 = appendEvent(config, { event_type: "c", payload: { n: 3 } });
    const beforeEntries = readSpool(config);

    // Driven at the flushOnce level, deliberately, rather than through flush(): a
    // double that ALWAYS acks only s2 regardless of what is actually in the batch
    // sent is not a hub any real flush() call would keep encountering — the real
    // hub's read-back ack always covers every event it just accepted (store.ts:
    // 807-857), so a genuine partial ack is a single-round-trip event, not a steady
    // state to converge against over repeated calls. flushOnce is the unit that
    // interprets one ack response; the removal semantics this proves ("only the
    // acknowledged middle seq must be removed") are exactly what flush() applies for
    // ONE batch, reproduced inline here.
    const partialConfig = { ...config, fetchImpl: partialAckFetch(s2) };
    const spooledBefore = readSpool(config);
    const batch = spooledBefore.map((e: { client_seq: number }) => ({
      client_seq: e.client_seq,
    }));
    const onceResult = await flushOnce(partialConfig, batch);
    assertEquals(onceResult.outcome, "acked");
    assertEquals(
      onceResult.acked,
      [s2],
      "only client_seq 2 must be acknowledged",
    );
    const ackedSeqs = new Set(onceResult.acked);
    writeSpool(
      config,
      spooledBefore.filter((e: { client_seq: number }) =>
        !ackedSeqs.has(e.client_seq)
      ),
    );

    const afterEntries = readSpool(config);
    assertEquals(
      afterEntries.map((e: { client_seq: number }) => e.client_seq),
      [s1, s3],
      "only the acknowledged middle seq must be removed",
    );
    for (const seq of [s1, s3]) {
      const beforeEntry = beforeEntries.find((e: { client_seq: number }) =>
        e.client_seq === seq
      );
      const afterEntry = afterEntries.find((e: { client_seq: number }) =>
        e.client_seq === seq
      );
      assertEquals(
        afterEntry.queued_at,
        beforeEntry.queued_at,
        "queued_at must be unchanged",
      );
      assertEquals(
        afterEntry.payload,
        beforeEntry.payload,
        "payload must be unchanged",
      );
    }

    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    // 03-04: a fetchImpl that always throws is retried up to MAX_FLUSH_ATTEMPTS times
    // (D-17's bounded backoff) before flush() gives up and reports "deferred" — no
    // real sleep, via the injected sleepImpl.
    const throwingConfig = {
      ...config,
      fetchImpl: throwsAfterRecordingFetch(recorded),
      sleepImpl: () => Promise.resolve(),
    };
    const result2 = await flush(throwingConfig);
    assertEquals(result2.outcome, "deferred");
    assertEquals(
      recorded.length,
      6,
      "the batch must be retried MAX_FLUSH_ATTEMPTS (6) times before deferring",
    );
    assertEquals(
      readSpool(config).map((e: { client_seq: number }) => e.client_seq),
      [s1, s3],
      "nothing may be removed when the response never arrived",
    );
  },
});

Deno.test({
  ...T,
  name:
    "EVENT-03: a 600-event spool flushes as a 500-event batch then a 100-event batch",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    for (let i = 0; i < 600; i++) {
      appendEvent(config, { event_type: "e", payload: { i } });
    }

    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    const ackingConfig = { ...config, fetchImpl: ackingFetch(recorded) };
    const result = await flush(ackingConfig);

    assertEquals(
      recorded.length,
      2,
      "600 events must be sent as exactly two requests",
    );
    assertEquals(
      recorded[0].length,
      500,
      "the first request must carry exactly 500 events",
    );
    assertEquals(
      recorded[1].length,
      100,
      "the second request must carry exactly 100 events",
    );
    assertEquals(result.outcome, "acked");
    assertEquals(
      readSpool(config).length,
      0,
      "the spool must be fully drained",
    );
  },
});

// ---------------------------------------------------------------------------
// Task 3 (D-14): the client_seq counter is independent of the spool.
//
// This is the discriminating test for the phase (03-03-PLAN.md Task 3): without it,
// ROADMAP criterion 1 ("replay produces no duplicate hub state and the client
// receives the same ack both times") can pass green while a client that derives
// client_seq from the spool's last line silently loses every event after its first
// full drain — the hub's ON CONFLICT (node_id, client_seq) DO NOTHING absorbs the
// collision, the read-back ack names the OLD row, and the client believes delivery
// succeeded. Do not delete these as redundant with the EVENT-01 hub-interaction test;
// EVENT-01 proves duplicate submission is safe, these prove the counter that decides
// what gets submitted never resets.
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    "D-14: after a full drain, a config rebuilt over the same home allocates strictly above the highest delivered seq",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config1 = withNodeId(resolveConfig({ home }));
    for (let i = 0; i < 5; i++) {
      appendEvent(config1, { event_type: "e", payload: { i } });
    }
    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    const ackingConfig = { ...config1, fetchImpl: ackingFetch(recorded) };
    const result = await flush(ackingConfig);
    assertEquals(result.outcome, "acked");
    assertEquals(
      readSpool(config1).length,
      0,
      "the spool must be fully drained",
    );

    // Simulate a restart honestly: a SECOND config object built the normal way, not
    // the first one reused in memory.
    const config2 = resolveConfig({ home });
    const next = allocateSeq(config2);
    assertEquals(
      next,
      6,
      "the next seq must exceed the highest delivered seq (5)",
    );
  },
});

Deno.test({
  ...T,
  name:
    "D-14: restart with the spool file deleted still allocates strictly above the highest delivered seq",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config1 = withNodeId(resolveConfig({ home }));
    for (let i = 0; i < 5; i++) {
      appendEvent(config1, { event_type: "e", payload: { i } });
    }
    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    const ackingConfig = { ...config1, fetchImpl: ackingFetch(recorded) };
    await flush(ackingConfig);

    await Deno.remove(config1.spoolPath as string);
    assertEquals(
      await Deno.stat(config1.spoolPath as string).then(() => true).catch(() =>
        false
      ),
      false,
      "the spool file must actually be gone",
    );

    const config2 = resolveConfig({ home });
    const next = allocateSeq(config2);
    assertEquals(
      next,
      6,
      "the counter must not consult the spool even when the spool is gone entirely",
    );
  },
});

Deno.test({
  ...T,
  name:
    "D-14: 50 allocations across 50 configs rebuilt over the same home are strictly increasing and all distinct",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const seen: number[] = [];
    for (let i = 0; i < 50; i++) {
      const config = resolveConfig({ home });
      seen.push(allocateSeq(config));
    }
    for (let i = 1; i < 50; i++) {
      assert(
        seen[i] > seen[i - 1],
        `allocation ${i} (${seen[i]}) did not exceed ${seen[i - 1]}`,
      );
    }
    assertEquals(
      new Set(seen).size,
      50,
      "all 50 allocated values must be distinct",
    );
  },
});

Deno.test({
  ...T,
  name:
    "D-14: the persisted client_seq counter file is mode 0600 and contains only digits",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    allocateSeq(config);

    const mode = (await Deno.stat(config.seqPath)).mode! & 0o777;
    assertEquals(mode, 0o600, "client_seq must be 0600");

    const contents = (await Deno.readTextFile(config.seqPath)).trim();
    assert(
      /^\d+$/.test(contents),
      `client_seq must contain only digits, got: ${contents}`,
    );
  },
});

// ---------------------------------------------------------------------------
// 03-04 Task 1 (D-15, D-17): flushOnce's outcome union and flush()'s terminal states
// and bounded backoff. Every non-200 the hub can return maps to a stated outcome, and
// none of them retry forever.
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    "D-15: a permanent rejection (400 naming client_seq) drops exactly those entries and the flush makes progress on the remainder",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    const seqs: number[] = [];
    for (let i = 0; i < 5; i++) {
      seqs.push(appendEvent(config, { event_type: "e", payload: { i } }));
    }
    const rejectedSeq = seqs[2]; // the middle (3rd) event

    const lines: string[] = [];
    let call = 0;
    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    const fetchImpl = (url: string, init: { body: string }) => {
      call += 1;
      if (call === 1) return rejectingFetch([rejectedSeq], recorded)(url, init);
      return ackingFetch(recorded)(url, init);
    };

    const result = await flush({
      ...config,
      fetchImpl,
      stderrWrite: (l: string) => lines.push(l),
    });

    assertEquals(readSpool(config).length, 0, "the spool must end empty");
    assertEquals(
      readState(config).dropped_events,
      1,
      "exactly one drop must be recorded",
    );
    assert(
      lines.some((l) =>
        new RegExp(`client_seq=${rejectedSeq} reason=permanent_rejection`).test(
          l,
        )
      ),
      `expected a permanent_rejection line naming client_seq=${rejectedSeq}, got: ${
        JSON.stringify(lines)
      }`,
    );
    assertEquals(
      result.outcome,
      "acked",
      "the flush must still complete after the drop",
    );
    assertEquals(
      call,
      2,
      "the reject then the successful retry of the remainder",
    );
  },
});

Deno.test({
  ...T,
  name:
    "D-15: a malformed 400 (zod-issue shape, no client_seq) drops nothing and returns a distinct outcome",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    appendEvent(config, { event_type: "e", payload: { i: 1 } });
    const before = await Deno.readTextFile(config.spoolPath as string);

    const result = await flush({ ...config, fetchImpl: malformedFetch() });

    assertEquals(result.outcome, "malformed");
    assertEquals(
      readState(config).dropped_events,
      0,
      "dropped_events must be unchanged",
    );
    const after = await Deno.readTextFile(config.spoolPath as string);
    assertEquals(after, before, "the spool must be byte-identical");
  },
});

Deno.test({
  ...T,
  name:
    "D-17: a 401 stops after exactly one request, leaves the spool byte-identical, and writes one terminal line",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    appendEvent(config, { event_type: "e", payload: { i: 1 } });
    const before = await Deno.readTextFile(config.spoolPath as string);

    let calls = 0;
    const countingUnauthorized = (url: string, init: { body: string }) => {
      calls += 1;
      return unauthorizedFetch()(url, init);
    };
    const lines: string[] = [];
    const result = await flush({
      ...config,
      fetchImpl: countingUnauthorized,
      stderrWrite: (l: string) => lines.push(l),
    });

    assertEquals(result.outcome, "terminal_auth");
    assertEquals(calls, 1, "no retry may follow a 401");
    const after = await Deno.readTextFile(config.spoolPath as string);
    assertEquals(
      after,
      before,
      "the spool must be byte-identical after a terminal auth failure",
    );
    assert(
      lines.some((l) => /terminal reason=auth_failed/.test(l)),
      `expected a terminal reason=auth_failed line, got: ${
        JSON.stringify(lines)
      }`,
    );
  },
});

Deno.test({
  ...T,
  name:
    "a 404 (unknown node) stops after exactly one request and leaves the spool intact",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    appendEvent(config, { event_type: "e", payload: { i: 1 } });

    let calls = 0;
    const countingNotFound = (url: string, init: { body: string }) => {
      calls += 1;
      return notFoundFetch()(url, init);
    };
    const result = await flush({ ...config, fetchImpl: countingNotFound });

    assertEquals(result.outcome, "unknown_node");
    assertEquals(calls, 1);
    assertEquals(readSpool(config).length, 1, "the spool must be untouched");
  },
});

Deno.test({
  ...T,
  name:
    "a 413 (payload too large) stops after exactly one request and leaves the spool intact",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    appendEvent(config, { event_type: "e", payload: { i: 1 } });

    let calls = 0;
    const countingTooLarge = (url: string, init: { body: string }) => {
      calls += 1;
      return tooLargeFetch()(url, init);
    };
    const result = await flush({ ...config, fetchImpl: countingTooLarge });

    assertEquals(result.outcome, "too_large");
    assertEquals(calls, 1);
    assertEquals(readSpool(config).length, 1, "the spool must be untouched");
  },
});

Deno.test({
  ...T,
  name:
    "D-17: a retryable/unreachable failure backs off with growing, non-decreasing, capped delays and defers after MAX_FLUSH_ATTEMPTS",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    appendEvent(config, { event_type: "e", payload: { i: 1 } });
    const before = await Deno.readTextFile(config.spoolPath as string);

    const delays: number[] = [];
    const sleepImpl = (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    };
    // A fixed midpoint jitter source: deterministic, and jitterFactor === 1 exactly,
    // so the recorded delays land precisely on BACKOFF_BASE_MS * 2**(attempt-1).
    const randomImpl = () => 0.5;

    const result = await flush({
      ...config,
      fetchImpl: unreachableFetch(),
      sleepImpl,
      randomImpl,
    });

    assertEquals(result.outcome, "deferred");
    assertEquals(
      delays.length,
      MAX_FLUSH_ATTEMPTS - 1,
      "six attempts means five waits between them",
    );
    assertEquals(delays, [1000, 2000, 4000, 8000, 16000]);
    for (let i = 1; i < delays.length; i++) {
      assert(
        delays[i] >= delays[i - 1],
        `delay sequence must be non-decreasing: ${delays}`,
      );
    }
    assert(
      delays[0] >= 800 && delays[0] <= 1200,
      `first delay must be within +/-20% of 1000, got ${delays[0]}`,
    );
    for (const d of delays) {
      assert(
        d <= 30_000,
        `no delay may exceed BACKOFF_CAP_MS (30000), got ${d}`,
      );
    }

    const after = await Deno.readTextFile(config.spoolPath as string);
    assertEquals(
      after,
      before,
      "the spool must be byte-identical after deferring",
    );
  },
});

Deno.test({
  ...T,
  name:
    "a retryable 5xx is distinct from a transport throw but follows the same backoff-then-defer policy",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    appendEvent(config, { event_type: "e", payload: { i: 1 } });

    const result = await flush({
      ...config,
      fetchImpl: serverErrorFetch(),
      sleepImpl: () => Promise.resolve(),
    });

    assertEquals(result.outcome, "deferred");
    assertEquals(
      readSpool(config).length,
      1,
      "the spool must be untouched after deferring",
    );
  },
});

Deno.test({
  ...T,
  name:
    'main(["flush"]) sets process.exitCode to 0 on success, 77 on terminal auth, 75 on exhausted retry',
  fn: async () => {
    const originalExitCode = process.exitCode;
    try {
      const successHome = await Deno.makeTempDir();
      appendEvent(withNodeId(resolveConfig({ home: successHome })), {
        event_type: "e",
        payload: null,
      });
      // deno-lint-ignore no-explicit-any
      const recorded: any[][] = [];
      await main(["flush"], {
        home: successHome,
        fetchImpl: ackingFetch(recorded),
      });
      assertEquals(process.exitCode, 0, "success must set exit code 0");

      const authHome = await Deno.makeTempDir();
      appendEvent(withNodeId(resolveConfig({ home: authHome })), {
        event_type: "e",
        payload: null,
      });
      await main(["flush"], { home: authHome, fetchImpl: unauthorizedFetch() });
      assertEquals(
        process.exitCode,
        77,
        "a terminal auth failure must set exit code 77",
      );

      const deferredHome = await Deno.makeTempDir();
      appendEvent(withNodeId(resolveConfig({ home: deferredHome })), {
        event_type: "e",
        payload: null,
      });
      await main(["flush"], {
        home: deferredHome,
        fetchImpl: unreachableFetch(),
        sleepImpl: () => Promise.resolve(),
      });
      assertEquals(
        process.exitCode,
        75,
        "exhausted retries must set exit code 75",
      );
    } finally {
      process.exitCode = originalExitCode;
    }
  },
});

// ---------------------------------------------------------------------------
// 03-04 Task 2: heartbeat and checkpoint reporting through the events endpoint,
// and the run loop that drives them. Not new endpoints — ordinary spooled events
// (event_type "heartbeat" / "checkpoint") riding the same durability and
// ack-gating guarantees as everything else.
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    'main(["emit", ...]) appends one spool line with the given event_type and payload',
  fn: async () => {
    const home = await Deno.makeTempDir();
    await main(["emit", "build.started", '{"ok":true}'], { home });
    const config = resolveConfig({ home });
    const spool = readSpool(config);
    assertEquals(spool.length, 1);
    assertEquals(spool[0].event_type, "build.started");
    assertEquals(spool[0].payload, { ok: true });
  },
});

Deno.test({
  ...T,
  name:
    'main(["checkpoint", ...]) appends one checkpoint event whose payload carries phase, node_id, hostname, spooled_events, dropped_events',
  fn: async () => {
    const home = await Deno.makeTempDir();
    withNodeId(resolveConfig({ home }));
    await main(["checkpoint", '{"phase":"manual"}'], { home });
    const config = resolveConfig({ home });
    const spool = readSpool(config);
    assertEquals(spool.length, 1);
    assertEquals(spool[0].event_type, "checkpoint");
    const payload = spool[0].payload as Record<string, unknown>;
    for (
      const key of [
        "phase",
        "node_id",
        "hostname",
        "spooled_events",
        "dropped_events",
      ]
    ) {
      assert(key in payload, `checkpoint payload missing key: ${key}`);
    }
    assertEquals(payload.phase, "manual");
  },
});

Deno.test({
  ...T,
  name:
    "heartbeat and checkpoint payload builders stay within event_type and payload size limits",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    emitHeartbeat(config, Date.now() - 5000);
    emitCheckpoint(config, { phase: "manual" });

    const spool = readSpool(config);
    assertEquals(spool.length, 2);
    for (const entry of spool as { event_type: string; payload: unknown }[]) {
      assert(
        entry.event_type.length <= 128,
        `event_type too long: ${entry.event_type}`,
      );
      const encodedBytes =
        new TextEncoder().encode(JSON.stringify(entry.payload)).length;
      assert(
        encodedBytes <= MAX_PAYLOAD_BYTES,
        `${entry.event_type} payload exceeds MAX_PAYLOAD_BYTES: ${encodedBytes}`,
      );
    }

    const heartbeatPayload = spool[0].payload as {
      spooled_events: number;
      dropped_events: number;
      uptime_ms: number;
    };
    assertEquals(typeof heartbeatPayload.spooled_events, "number");
    assertEquals(typeof heartbeatPayload.dropped_events, "number");
    assertEquals(typeof heartbeatPayload.uptime_ms, "number");
  },
});

Deno.test({
  ...T,
  name:
    "runAgent: three ticks emit one start checkpoint and three heartbeats; the stop signal appends one stop checkpoint, flushes once more, and drains the spool",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];

    // Boxed rather than a bare `let`: `sleepImpl` closes over `box.controller` before
    // `runAgent` (below) has assigned it, but only ever CALLS `.stop()` from inside a
    // later tick — by which point the assignment has long since happened.
    // deno-lint-ignore no-explicit-any
    const box: { controller?: { stop: () => void; done: Promise<any> } } = {};
    let calls = 0;
    // deno-lint-ignore no-explicit-any
    let snapshotAtThreeTicks: any[] = [];
    const sleepImpl = (_ms: number) => {
      calls += 1;
      if (calls === 4) {
        snapshotAtThreeTicks = recorded.flat();
        box.controller!.stop();
      }
      return Promise.resolve();
    };

    box.controller = runAgent({
      ...config,
      fetchImpl: ackingFetch(recorded),
      sleepImpl,
    });
    const result = await box.controller.done;

    const threeTickCheckpoints = snapshotAtThreeTicks.filter((e) =>
      e.event_type === "checkpoint"
    );
    const threeTickHeartbeats = snapshotAtThreeTicks.filter((e) =>
      e.event_type === "heartbeat"
    );
    assertEquals(
      threeTickCheckpoints.length,
      1,
      "exactly one checkpoint (the start checkpoint) after three ticks",
    );
    assertEquals(threeTickCheckpoints[0].payload.phase, "start");
    assertEquals(
      threeTickHeartbeats.length,
      3,
      "exactly three heartbeats after three ticks",
    );
    assertEquals(
      threeTickHeartbeats.map((e) => e.client_seq),
      [...threeTickHeartbeats.map((e) => e.client_seq)].sort((a, b) => a - b),
      "heartbeats must be in client_seq order",
    );

    const finalEvents = recorded.flat();
    const finalCheckpoints = finalEvents.filter((e) =>
      e.event_type === "checkpoint"
    );
    const finalHeartbeats = finalEvents.filter((e) =>
      e.event_type === "heartbeat"
    );
    assertEquals(
      finalCheckpoints.length,
      2,
      "start checkpoint plus stop checkpoint",
    );
    assertEquals(finalCheckpoints[1].payload.phase, "stop");
    assertEquals(
      finalHeartbeats.length,
      3,
      "the stop signal must not add a fourth heartbeat",
    );
    assertEquals(readSpool(config).length, 0, "the spool must end empty");
    assertEquals(result.exitCode, 0);
    assertEquals(result.terminal, false);
  },
});

Deno.test({
  ...T,
  name:
    "runAgent: a 401 on the first flush stops after exactly one request and appends no heartbeat",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    let fetchCalls = 0;
    const countingUnauthorized = (url: string, init: { body: string }) => {
      fetchCalls += 1;
      return unauthorizedFetch()(url, init);
    };
    const sleepImpl = (_ms: number) => {
      throw new Error(
        "must not be reached: runAgent must stop before waiting for a tick",
      );
    };

    const controller = runAgent({
      ...config,
      fetchImpl: countingUnauthorized,
      sleepImpl,
    });
    const result = await controller.done;

    assertEquals(
      fetchCalls,
      1,
      "no retry may follow the terminal-auth start flush",
    );
    assertEquals(result.exitCode, 77);
    assertEquals(result.terminal, true);
  },
});

Deno.test({
  ...T,
  name:
    "awcp-node-client.mjs contains no child_process import and no git invocation",
  fn: async () => {
    const source = await Deno.readTextFile(
      new URL("../scripts/awcp-node-client.mjs", import.meta.url),
    );
    // Match actual import/require SYNTAX, not any mention of "child_process" as a
    // word — the file's own docblock explains, in prose, why it does NOT import
    // child_process, and a bare substring match would flag that explanation itself.
    assert(
      !/(?:from\s+["'](?:node:)?child_process["']|require\(\s*["'](?:node:)?child_process["']\s*\))/
        .test(source),
      "must not import child_process",
    );
    assert(
      !/Deno\.Command\(/.test(source),
      "must not shell out via Deno.Command",
    );
  },
});

// ---------------------------------------------------------------------------
// 03-04 Task 3 (D-13): the credential-leak gate over a register -> flush -> retry
// cycle. Without this test, D-13 is the only decision in 03-CONTEXT.md that is
// asserted and unchecked (03-CONTEXT.md D-13) — this is what checks it.
// ---------------------------------------------------------------------------

/**
 * Patches ALL SIX output surfaces D-13 requires — console.log/error/warn/info AND
 * process.stdout.write/process.stderr.write — appending every argument's string form
 * to one collector, and restores every one of them in a `finally`. Watching only the
 * injectable `config.stderrWrite` sink would prove nothing about the UNINTENDED path
 * (a stray `console.error(err)`, a transport library's own error text) — the sink is
 * the client's intended output path, and the whole point of this gate is the path
 * nobody wrote deliberately.
 */
function capture(): { collected: string[]; restore: () => void } {
  const collected: string[] = [];
  // deno-lint-ignore no-explicit-any
  const stringify = (v: any) => typeof v === "string" ? v : Deno.inspect(v);
  const originals = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    stdoutWrite: process.stdout.write.bind(process.stdout),
    stderrWrite: process.stderr.write.bind(process.stderr),
  };
  // deno-lint-ignore no-explicit-any
  const record = (...args: any[]) => {
    collected.push(args.map(stringify).join(" "));
  };
  console.log = record;
  console.error = record;
  console.warn = record;
  console.info = record;
  // deno-lint-ignore no-explicit-any
  process.stdout.write = ((chunk: any) => {
    collected.push(stringify(chunk));
    return true;
    // deno-lint-ignore no-explicit-any
  }) as any;
  // deno-lint-ignore no-explicit-any
  process.stderr.write = ((chunk: any) => {
    collected.push(stringify(chunk));
    return true;
    // deno-lint-ignore no-explicit-any
  }) as any;

  return {
    collected,
    restore: () => {
      console.log = originals.log;
      console.error = originals.error;
      console.warn = originals.warn;
      console.info = originals.info;
      // deno-lint-ignore no-explicit-any
      process.stdout.write = originals.stdoutWrite as any;
      // deno-lint-ignore no-explicit-any
      process.stderr.write = originals.stderrWrite as any;
    },
  };
}

/** Recursively concatenate the contents of every file under `dir`. */
async function readAllFilesUnder(dir: string): Promise<string> {
  let out = "";
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      out += await readAllFilesUnder(path);
    } else {
      out += await Deno.readTextFile(path).catch(() => "");
    }
  }
  return out;
}

Deno.test({
  ...T,
  name:
    "D-13: neither the node bearer nor the enrolment secret appears in captured output or on-disk state across a register-flush-retry cycle",
  fn: async () => {
    const home = await Deno.makeTempDir();
    // A distinctive 64-lowercase-hex bearer (BEARER_FORMAT) and a distinctive,
    // nowhere-else-used enrolment secret, so a substring match is unambiguous.
    const bearer = "d13" + "e".repeat(61);
    const enrolmentSecret = "D13-ENROLMENT-SECRET-MUST-NEVER-LEAK-9f3q7z";
    const config = resolveConfig({ home, bearer, enrolmentSecret });

    const { collected, restore } = capture();
    try {
      // Step 1: registerNode — the ONE invocation that carries
      // X-Node-Enrolment-Secret, and therefore the single registration most worth
      // capturing and the most dangerous to quote.
      const registerFetch = () =>
        Promise.resolve({
          status: 201,
          json: () => Promise.resolve({ node_id: FAKE_NODE_ID }),
          text: () => Promise.resolve(""),
        });
      await registerNode({ ...config, fetchImpl: registerFetch });

      // Step 2: appendEvent + a flush that succeeds.
      appendEvent(config, { event_type: "e", payload: { n: 1 } });
      // deno-lint-ignore no-explicit-any
      const recorded: any[][] = [];
      await flush({ ...config, fetchImpl: ackingFetch(recorded) });

      // Step 3: a flush whose fetchImpl returns 401 — the terminal-auth path and its
      // structured line (the positive control: proves the collector is watching).
      appendEvent(config, { event_type: "e", payload: { n: 2 } });
      await flush({ ...config, fetchImpl: unauthorizedFetch() });

      // Step 4: a flush whose fetchImpl throws an error whose OWN MESSAGE embeds the
      // bearer — simulating a transport library that put the Authorization header
      // into its error text. This is the realistic leak (a stray `console.error(err)`
      // anyone would catch in review is not what this gate needs to prove).
      const leakyError = new Error(
        `connection reset: Authorization: Bearer ${bearer}`,
      );
      assert(
        leakyError.message.includes(bearer),
        "sanity: the injected error must actually carry the bearer",
      );
      appendEvent(config, { event_type: "e", payload: { n: 3 } });
      await flush({
        ...config,
        fetchImpl: () => {
          throw leakyError;
        },
        sleepImpl: () => Promise.resolve(),
      });
    } finally {
      restore();
    }

    const output = collected.join("\n");
    // Positive control FIRST: an absence assertion that could pass on an empty
    // collector is a check that cannot fail. This proves the collector was watching.
    assert(output.length > 0, "the collector must not be empty");
    assert(
      /terminal reason=auth_failed/.test(output),
      `expected the D-17 terminal line in captured output, got: ${
        JSON.stringify(output)
      }`,
    );
    assert(
      !output.includes(bearer),
      "the bearer must never appear in captured output",
    );
    assert(
      !output.includes(enrolmentSecret),
      "the enrolment secret must never appear in captured output",
    );

    // D-12 requires the enrolment secret to exist for one process and nowhere
    // afterward — a ~/.awcp/ file holding either credential would make the hub-side
    // closure (D-11) one-sided.
    const diskContents = await readAllFilesUnder(home);
    assert(
      !diskContents.includes(bearer),
      "no on-disk file may contain the bearer",
    );
    assert(
      !diskContents.includes(enrolmentSecret),
      "no on-disk file may contain the enrolment secret",
    );
  },
});

// ---------------------------------------------------------------------------
// ST-092 U1 (R2): the rename itself is made durable, not just the file contents.
//
// An fsync leaves nothing on disk to assert against — the bytes look identical
// whether or not it happened — so a test cannot observe durability directly. What it
// can observe is whether the call was made, which is why `fsyncDirImpl` is a config
// seam. The pair of tests below is deliberate: the first counts calls through the
// seam, and the second proves the seam's PRODUCTION DEFAULT is a real fsync rather
// than a no-op, since a counting test alone would pass just as happily against a
// default of `() => {}`.
// ---------------------------------------------------------------------------

/** Collects the directories handed to the fsync seam, in call order. */
function fsyncDirSpy(calls: string[]) {
  return (dirPath: string) => {
    calls.push(dirPath);
  };
}

Deno.test({
  ...T,
  name:
    "ST-092 R2: writeSpool fsyncs the spool's containing directory exactly once per call, after the rename",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const calls: string[] = [];
    const config = resolveConfig({ home, fsyncDirImpl: fsyncDirSpy(calls) });

    writeSpool(config, [{ client_seq: 1, event_type: "e", payload: null }]);

    assertEquals(calls, [home], "one directory fsync, on the spool's own directory");

    // Ordering matters as much as the count: fsyncing before the rename would sync a
    // directory state that does not yet contain the replacement. Prove the ordering
    // by observing, from inside the seam, that the target already holds the new
    // content when the fsync runs.
    const observed: string[] = [];
    const orderConfig = resolveConfig({
      home,
      fsyncDirImpl: () => {
        observed.push(Deno.readTextFileSync(`${home}/spool.jsonl`));
      },
    });
    writeSpool(orderConfig, [{ client_seq: 2, event_type: "after", payload: null }]);
    assertEquals(observed.length, 1);
    assert(
      observed[0].includes('"event_type":"after"'),
      "the directory fsync must run AFTER the rename, not before it — the target " +
        `still held the old content when the fsync fired: ${observed[0]}`,
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R2: writeState fsyncs the state file's containing directory exactly once per call",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const calls: string[] = [];
    const config = resolveConfig({ home, fsyncDirImpl: fsyncDirSpy(calls) });

    writeState(config, {
      dropped_events: 3,
      last_drop_at: null,
      last_dropped_client_seq: null,
      last_drop_reason: null,
    });

    assertEquals(calls, [home]);
    assertEquals(readState(config).dropped_events, 3, "the write still lands");
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R2 control: the production fsync default really syncs a directory and throws when it cannot",
  fn: async () => {
    const home = await Deno.makeTempDir();
    // Built WITHOUT an override, so this is the value production runs with. If this
    // were ever defaulted to a no-op the counting tests above would still be green.
    const config = resolveConfig({ home });
    assertEquals(typeof config.fsyncDirImpl, "function");

    // Green: a real directory syncs without complaint.
    config.fsyncDirImpl(home);

    // Red: a directory that does not exist must surface the error. A durability
    // helper that swallows its own failure leaves every caller believing the rename
    // was made durable — strictly worse than not having one.
    assertThrows(
      () => config.fsyncDirImpl(`${home}/definitely-not-a-directory`),
      Error,
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R2: a failing directory fsync propagates out of writeSpool and writeState rather than being swallowed",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const boom = () => {
      throw new Error("fsyncDir refused (test double)");
    };
    const config = resolveConfig({ home, fsyncDirImpl: boom });

    assertThrows(
      () => writeSpool(config, []),
      Error,
      "fsyncDir refused",
    );
    assertThrows(
      () =>
        writeState(config, {
          dropped_events: 0,
          last_drop_at: null,
          last_dropped_client_seq: null,
          last_drop_reason: null,
        }),
      Error,
      "fsyncDir refused",
    );
  },
});

// ---------------------------------------------------------------------------
// ST-092 U1b (R2b): the client_seq counter can never be observed as empty.
//
// This is the D-14 reset by a route `allocateSeq`'s own docblock did not cover, and
// neither cross-AI review lane found it. Before this story the counter was written
// with an `openSync(path, "w")` that truncates before writing, so the crash window
// was a ZERO-LENGTH FILE rather than a stale value — and the recovery path read an
// unparseable counter as 0, which made the next allocation return 1. The hub's
// `ON CONFLICT (node_id, client_seq) DO NOTHING` then silently discards everything
// that follows, which is precisely the failure the docblock claims to prevent.
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    "ST-092 R2b: a crash in the counter's write window leaves the previous sequence readable, and the next allocation continues from it",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });

    assertEquals(allocateSeq(config), 1);
    assertEquals(allocateSeq(config), 2);
    assertEquals(allocateSeq(config), 3);
    const before = await Deno.readTextFile(config.seqPath);
    assertEquals(before, "3");

    // Crash in the exact window the old truncate-in-place write could not survive:
    // the replacement is written and fsync'd, and the process dies before it lands.
    const crashing = {
      ...config,
      beforeSeqRename: () => {
        throw new Error("simulated crash before the counter rename (test double)");
      },
    };
    assertThrows(
      () => allocateSeq(crashing),
      Error,
      "simulated crash before the counter rename",
    );

    const after = await Deno.readTextFile(config.seqPath);
    assertEquals(
      after,
      before,
      "the counter must still read its previous value byte-for-byte — an empty " +
        "file here is the D-14 reset",
    );
    assertEquals(
      allocateSeq(config),
      4,
      "the next allocation must continue the sequence, not restart it at 1",
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R2b control: the truncate-in-place write this replaced does produce an empty counter, and an empty counter is now refused rather than read as 1",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    for (let i = 0; i < 3; i++) allocateSeq(config);
    assertEquals(await Deno.readTextFile(config.seqPath), "3");

    // Reproduce the OLD primitive's crash window directly rather than asserting
    // against deleted code: open for write with truncation, then die before writing.
    // This is what `writeFileFsync` did, and it is why the window was real.
    const fd = Deno.openSync(config.seqPath, { write: true, truncate: true });
    fd.close();
    assertEquals(
      (await Deno.readTextFile(config.seqPath)).length,
      0,
      "sanity: truncate-in-place really does leave a zero-length counter",
    );

    // The old recovery path read that as `current = 0` and returned 1 — a silent
    // sequence reset. It must now refuse, loudly, naming the consequence.
    const err = assertThrows(
      () => allocateSeq(config),
      Error,
      "refusing to allocate a client_seq",
    );
    assert(
      /D-14/.test((err as Error).message),
      `the refusal must name the failure it prevents: ${(err as Error).message}`,
    );
    assertEquals(
      await Deno.readTextFile(config.seqPath),
      "",
      "a refused allocation must not write anything",
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R2b: a garbage counter is refused, while a MISSING counter still starts at 1",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });

    // Missing is the ordinary first-run case and is deliberately NOT corruption.
    assertEquals(allocateSeq(config), 1);

    for (const garbage of ["not-a-number", "-4", "   "]) {
      Deno.writeTextFileSync(config.seqPath, garbage);
      assertThrows(
        () => allocateSeq(config),
        Error,
        "refusing to allocate a client_seq",
        `"${garbage}" must be refused, not silently read as zero`,
      );
    }
  },
});

Deno.test({
  ...T,
  name: "ST-092 R2b: the counter file is still mode 0600 after the rename",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    allocateSeq(config);
    allocateSeq(config);
    const mode = Deno.statSync(config.seqPath).mode! & 0o777;
    assertEquals(
      mode,
      0o600,
      "rewrite-and-rename must not widen the counter's mode (D-16)",
    );
  },
});

// ---------------------------------------------------------------------------
// ST-092 U2 (R3): eviction records the drop BEFORE it shrinks the spool.
//
// The two steps cannot be made atomic without a journal and a recovery path, so the
// requirement is met by choosing which way the crash window fails. Shrink-then-record
// loses events without incrementing the counter — silent, and exactly what EVENT-04
// forbids. Record-then-shrink over-counts for events still in the spool — visible in
// the counter, costs an inflated total, and nothing is lost. Over-reporting a drop is
// a strictly better failure than losing an event invisibly.
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    "ST-092 R3: a crash between recording a drop and shrinking the spool over-counts, and loses nothing",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home, spoolMaxEntries: 10 });
    const seqs: number[] = [];
    for (let i = 0; i < 3; i++) {
      seqs.push(appendEvent(config, { event_type: "e", payload: { i } }));
    }
    assertEquals(readState(config).dropped_events, 0);

    // Crash in the window between the two steps. `beforeRename` fires inside
    // writeSpool, which under the corrected ordering runs SECOND — so the drop has
    // already been recorded when this throws.
    const crashing = {
      ...config,
      beforeRename: () => {
        throw new Error("simulated crash mid-eviction (test double)");
      },
    };
    assertThrows(() => evictOldest(crashing, 1), Error, "simulated crash mid-eviction");

    assertEquals(
      readState(config).dropped_events,
      1,
      "the drop must already be counted — an event that leaves the spool without " +
        "the counter having moved first is the silent loss EVENT-04 forbids",
    );
    assertEquals(
      readSpool(config).map((e: { client_seq: number }) => e.client_seq),
      seqs,
      "the spool is untouched: this is the over-count, not a loss",
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R3: ordinary overflow still evicts oldest-first and increments the counter exactly once per entry",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const lines: string[] = [];
    const config = resolveConfig({
      home,
      spoolMaxEntries: 10,
      stderrWrite: (line: string) => lines.push(line),
    });
    const seqs: number[] = [];
    for (let i = 0; i < 4; i++) {
      seqs.push(appendEvent(config, { event_type: "e", payload: { i } }));
    }

    const dropped = evictOldest(config, 2);
    assertEquals(dropped, seqs.slice(0, 2), "oldest-first");
    assertEquals(
      readSpool(config).map((e: { client_seq: number }) => e.client_seq),
      seqs.slice(2),
      "the newest entries are retained",
    );
    assertEquals(readState(config).dropped_events, 2);
    assertEquals(lines.length, 2, "one structured stderr line per dropped entry");
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R3: evictOldest(0) and an empty spool remain no-ops that write nothing",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const lines: string[] = [];
    const config = resolveConfig({
      home,
      spoolMaxEntries: 10,
      stderrWrite: (line: string) => lines.push(line),
    });
    appendEvent(config, { event_type: "e", payload: null });
    const before = await Deno.readTextFile(config.spoolPath);

    assertEquals(evictOldest(config, 0), []);
    assertEquals(evictOldest(config, -1), []);
    assertEquals(await Deno.readTextFile(config.spoolPath), before);
    assertEquals(readState(config).dropped_events, 0);
    assertEquals(lines.length, 0);

    const emptyHome = await Deno.makeTempDir();
    const emptyConfig = resolveConfig({ home: emptyHome });
    assertEquals(evictOldest(emptyConfig, 5), []);
    assertEquals(readState(emptyConfig).dropped_events, 0);
  },
});

// ---------------------------------------------------------------------------
// ST-092 U4 (R4): flushOnce is total — no response shape escapes as an exception.
//
// `flushOnce`'s docblock promises that every status the hub can return maps to an
// outcome the caller branches on explicitly. Two `await res.json()` calls could
// reject, and a rejection there came out of `flush()` as a thrown exception instead —
// so the promise held for every response the tests happened to model and for no
// other. The last case below is the dangerous one: an unvalidated 200 would have had
// its `acknowledged` array trusted, and `flush()` removes exactly the entries that
// array names.
// ---------------------------------------------------------------------------

/** A response whose body is not JSON at all — a proxy error page, say. */
function unparseableBodyFetch(status: number) {
  return (_url: string, _init: { body: string }) =>
    Promise.resolve({
      status,
      text: () => Promise.resolve("<html>502 Bad Gateway</html>"),
      json: () =>
        Promise.reject(new SyntaxError("Unexpected token < in JSON at position 0")),
    });
}

/** A 200 whose body parses but is not a valid acknowledgement. */
// deno-lint-ignore no-explicit-any
function badAckBodyFetch(body: any) {
  return (_url: string, _init: { body: string }) =>
    Promise.resolve({ status: 200, json: () => Promise.resolve(body) });
}

Deno.test({
  ...T,
  name:
    "ST-092 R4: a 400 and a 200 whose bodies are not JSON both return `malformed` with the spool untouched",
  fn: async () => {
    for (const status of [400, 200]) {
      const home = await Deno.makeTempDir();
      const config = withNodeId(resolveConfig({ home })) as ReturnType<
        typeof resolveConfig
      >;
      appendEvent(config, { event_type: "e", payload: { n: 1 } });
      const before = await Deno.readTextFile(config.spoolPath);

      const result = await flushOnce({
        ...config,
        fetchImpl: unparseableBodyFetch(status),
      }, [{ client_seq: 1, event_type: "e", payload: { n: 1 } }]);

      assertEquals(
        result.outcome,
        "malformed",
        `a ${status} with an unparseable body must be malformed, not an exception`,
      );
      assertEquals(
        await Deno.readTextFile(config.spoolPath),
        before,
        "the spool must be untouched",
      );
    }
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R4: a 200 that is not a valid acknowledgement is `malformed`, and flush removes nothing",
  fn: async () => {
    const shapes: Array<[string, unknown]> = [
      ["no acknowledged key", { ok: true }],
      ["acknowledged is not an array", { acknowledged: { client_seq: 1 } }],
      ["entries lack a numeric client_seq", { acknowledged: [{ event_id: "x" }] }],
      ["client_seq is a string", { acknowledged: [{ client_seq: "1" }] }],
      ["body is null", null],
    ];

    for (const [label, body] of shapes) {
      const home = await Deno.makeTempDir();
      const config = withNodeId(resolveConfig({ home })) as ReturnType<
        typeof resolveConfig
      >;
      appendEvent(config, { event_type: "e", payload: { n: 1 } });
      const before = await Deno.readTextFile(config.spoolPath);

      const result = await flushOnce(
        { ...config, fetchImpl: badAckBodyFetch(body) },
        [{ client_seq: 1, event_type: "e", payload: { n: 1 } }],
      );
      assertEquals(result.outcome, "malformed", `${label}: must not be acked`);

      // The whole point: `flush()` deletes exactly what `acknowledged` names, so a
      // 200 the client could not verify must not remove anything.
      const flushed = await flush({
        ...config,
        fetchImpl: badAckBodyFetch(body),
        stderrWrite: () => {},
      });
      assertEquals(flushed.outcome, "malformed", `${label}: flush stops`);
      assertEquals(flushed.delivered, [], `${label}: nothing reported delivered`);
      assertEquals(
        await Deno.readTextFile(config.spoolPath),
        before,
        `${label}: the spool must be byte-identical — this is the case that would ` +
          `otherwise delete undelivered events`,
      );
    }
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R4: an empty `acknowledged` array is still a VALID body — zero progress, not corruption",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home })) as ReturnType<
      typeof resolveConfig
    >;
    appendEvent(config, { event_type: "e", payload: { n: 1 } });

    const result = await flushOnce(
      { ...config, fetchImpl: badAckBodyFetch({ acknowledged: [] }) },
      [{ client_seq: 1, event_type: "e", payload: { n: 1 } }],
    );
    assertEquals(result.outcome, "acked");
    assertEquals(result.acked, []);
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R4: a 200 acknowledging seqs outside the batch removes nothing and does not spin forever",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home })) as ReturnType<
      typeof resolveConfig
    >;
    appendEvent(config, { event_type: "e", payload: { n: 1 } });
    const before = await Deno.readTextFile(config.spoolPath);

    const result = await flush({
      ...config,
      fetchImpl: badAckBodyFetch({ acknowledged: [{ client_seq: 9999 }] }),
      sleepImpl: () => Promise.resolve(),
      randomImpl: () => 0.5,
    });

    assertEquals(result.outcome, "deferred", "bounded, not an infinite loop");
    assertEquals(await Deno.readTextFile(config.spoolPath), before);
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R4 control: the pre-existing valid 200 and valid 400-rejection paths are unchanged",
  fn: async () => {
    // Valid 200 — still acks and still shrinks the spool.
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home })) as ReturnType<
      typeof resolveConfig
    >;
    appendEvent(config, { event_type: "e", payload: { n: 1 } });
    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    const acked = await flush({ ...config, fetchImpl: ackingFetch(recorded) });
    assertEquals(acked.outcome, "acked");
    assertEquals(acked.delivered, [1]);
    assertEquals(readSpool(config).length, 0);

    // Valid 400 naming client_seq values — still the D-15 per-event rejection.
    const home2 = await Deno.makeTempDir();
    const config2 = withNodeId(resolveConfig({ home: home2 })) as ReturnType<
      typeof resolveConfig
    >;
    appendEvent(config2, { event_type: "e", payload: { n: 1 } });
    const rejected = await flushOnce(
      { ...config2, fetchImpl: rejectingFetch([1]) },
      [{ client_seq: 1, event_type: "e", payload: { n: 1 } }],
    );
    assertEquals(rejected.outcome, "rejected");
    assertEquals(rejected.rejected, [1]);

    // A 400 in the zod-issue shape is still malformed, as before.
    const other = await flushOnce(
      { ...config2, fetchImpl: malformedFetch() },
      [{ client_seq: 1, event_type: "e", payload: { n: 1 } }],
    );
    assertEquals(other.outcome, "malformed");
  },
});

// ---------------------------------------------------------------------------
// ST-092 U5 (R5): shutdown is bounded by the signal, and the exit code is honest.
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    "ST-092 R5: stop() during the heartbeat wait wakes the loop immediately instead of waiting the interval out",
  fn: async () => {
    const home = await Deno.makeTempDir();
    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    // A sleep that NEVER resolves. Under the old unconditional `await sleepImpl(...)`
    // this test could not finish at all; under the race it finishes as soon as stop()
    // fires. A "never" sleep is a stronger proof than a long one — it cannot pass by
    // the interval merely elapsing.
    const config = withNodeId(resolveConfig({
      home,
      heartbeatIntervalMs: 60_000,
      sleepImpl: () => new Promise<void>(() => {}),
      fetchImpl: ackingFetch(recorded),
    })) as ReturnType<typeof resolveConfig>;

    const controller = runAgent(config);
    // Let the start checkpoint and first flush complete, so the loop is genuinely
    // parked in the heartbeat wait when the signal arrives.
    await new Promise((r) => setTimeout(r, 20));
    controller.stop();

    const result = await Promise.race([
      controller.done,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("runAgent did not wake on stop()")), 5_000)
      ),
    ]) as { exitCode: number };

    assertEquals(result.exitCode, 0);
    const types = readSpool(config).map((e: { event_type: string }) => e.event_type);
    assertEquals(types, [], "everything was delivered, so the spool is empty");
    const sent = recorded.flat().map((e: { payload: { phase?: string } }) =>
      e.payload?.phase
    );
    assert(
      sent.includes("start") && sent.includes("stop"),
      `both checkpoints must have been sent: ${JSON.stringify(sent)}`,
    );
    assertEquals(
      sent.filter((p: string | undefined) => p === undefined).length,
      0,
      "no heartbeat can have been emitted — the interval never elapsed, so any " +
        "heartbeat here would mean the loop ticked rather than being woken",
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R5: a stop whose final flush is deferred exits 75, not 0",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({
      home,
      heartbeatIntervalMs: 60_000,
      // The loop's tick source resolves immediately here so `stop()` is observed
      // without waiting; `flush()`'s backoff shares this seam, which is what keeps
      // the retry exhaustion below instantaneous.
      sleepImpl: () => Promise.resolve(),
      randomImpl: () => 0.5,
      fetchImpl: unreachableFetch(),
      stderrWrite: () => {},
    })) as ReturnType<typeof resolveConfig>;

    const controller = runAgent(config);
    controller.stop();
    const result = await controller.done as { exitCode: number; terminal: boolean };

    assertEquals(
      result.exitCode,
      75,
      "the hub was never reached, so the stop checkpoint is still spooled — " +
        "reporting 0 would tell an operator this node reported its own shutdown",
    );
    assertEquals(result.terminal, false, "deferred is not terminal; a later run retries");
    assert(
      readSpool(config).length > 0,
      "the undelivered events are still spooled, which is what 75 describes",
    );
  },
});

Deno.test({
  ...T,
  name: "ST-092 R5: a stop whose final flush drains the spool exits 0",
  fn: async () => {
    const home = await Deno.makeTempDir();
    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    const config = withNodeId(resolveConfig({
      home,
      heartbeatIntervalMs: 60_000,
      sleepImpl: () => Promise.resolve(),
      fetchImpl: ackingFetch(recorded),
    })) as ReturnType<typeof resolveConfig>;

    const controller = runAgent(config);
    controller.stop();
    const result = await controller.done as { exitCode: number };

    assertEquals(result.exitCode, 0);
    assertEquals(readSpool(config).length, 0);
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R5: a terminal-auth outcome still exits 77 and is still reported terminal",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({
      home,
      heartbeatIntervalMs: 60_000,
      sleepImpl: () => Promise.resolve(),
      fetchImpl: unauthorizedFetch(),
      stderrWrite: () => {},
    })) as ReturnType<typeof resolveConfig>;

    const controller = runAgent(config);
    const result = await controller.done as { exitCode: number; terminal: boolean };

    assertEquals(result.exitCode, 77);
    assertEquals(result.terminal, true);
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R5: the stop checkpoint is emitted exactly once even when stop() is called twice",
  fn: async () => {
    const home = await Deno.makeTempDir();
    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    const config = withNodeId(resolveConfig({
      home,
      heartbeatIntervalMs: 60_000,
      sleepImpl: () => new Promise<void>(() => {}),
      fetchImpl: ackingFetch(recorded),
    })) as ReturnType<typeof resolveConfig>;

    const controller = runAgent(config);
    await new Promise((r) => setTimeout(r, 20));
    controller.stop();
    controller.stop();
    controller.stop();
    await controller.done;

    const phases = recorded.flat()
      .map((e: { payload: { phase?: string } }) => e.payload?.phase)
      .filter((p: string | undefined) => p === "stop");
    assertEquals(phases.length, 1, "exactly one stop checkpoint");
  },
});

// ---------------------------------------------------------------------------
// ST-092 U3 (R1): single-writer enforcement.
//
// The tests here cover the lock's own mechanics — reclaim, refusal, release on every
// exit path — from inside one process. They CANNOT prove the property that matters:
// an in-process test cannot distinguish this lock from no lock at all, because a
// single process never contends with itself. That proof lives in
// `awcp-node-client-lock.test.ts`, which spawns two real children, and the split is
// deliberate rather than incidental — the Phase 3 test that appeared to prove
// repeated allocation had exactly this weakness.
// ---------------------------------------------------------------------------

/** A pid above Linux's default pid_max — cannot name a running process. */
const DEAD_PID = 4_194_305;

Deno.test({
  ...T,
  name: "ST-092 R1: a lock naming the live current process is refused",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    const held = acquireLock(config);
    try {
      // The liveness verdict is injected so this exercises the LIVE-holder branch on
      // every runtime. Left to the real probe it would depend on whether the runner
      // granted --allow-run: this suite deliberately does not, so the real probe
      // answers "cannot tell" and the refusal would arrive by the other route.
      const err = assertThrows(
        () => acquireLock({ ...config, isPidAliveImpl: () => true }),
        Error,
      );
      assertEquals((err as Error).name, "AwcpLockError");
      assert(
        (err as Error).message.includes(String(Deno.pid)),
        `the refusal must name the holding pid: ${(err as Error).message}`,
      );
      assert(
        /already running as pid/.test((err as Error).message),
        `a live holder must be reported as such: ${(err as Error).message}`,
      );
    } finally {
      releaseLock(held);
    }
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R1: a lock naming a dead pid is reclaimed — one SIGKILL must not brick the node",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    Deno.mkdirSync(home, { recursive: true });
    Deno.writeTextFileSync(config.lockPath, String(DEAD_PID));

    // The liveness probe is injected here, and that is a real limitation worth
    // naming: this file runs without --allow-run, under which the production probe
    // cannot answer at all (see `isPidAlive`). So this test proves the RECLAIM LOGIC
    // given a dead holder — not that the client can tell a dead holder from a live
    // one. The spawned-process test in awcp-node-client-lock.test.ts proves that.
    const handle = acquireLock({
      ...config,
      isPidAliveImpl: (pid: number) => {
        assertEquals(pid, DEAD_PID, "the probe must be asked about the recorded pid");
        return false;
      },
    });
    try {
      // The lock records `<pid>:<token>` — the token is random per acquisition, so
      // assert the holder rather than the literal bytes.
      assertEquals(
        Deno.readTextFileSync(config.lockPath).trim().split(":")[0],
        String(Deno.pid),
        "the reclaimed lock must now name this process",
      );
    } finally {
      releaseLock(handle);
    }
  },
});

Deno.test({
  ...T,
  name: "ST-092 R1: an unreadable lock is refused rather than reclaimed",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    Deno.mkdirSync(home, { recursive: true });
    Deno.writeTextFileSync(config.lockPath, "not-a-pid");

    const err = assertThrows(() => acquireLock(config), Error);
    assertEquals((err as Error).name, "AwcpLockError");
    assert(
      (err as Error).message.includes(config.lockPath),
      "the refusal must name the file to remove",
    );
  },
});

Deno.test({
  ...T,
  name: "ST-092 R1: releaseLock removes the file, so a second sequential run succeeds",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    releaseLock(acquireLock(config));
    assertEquals(existsSyncViaStat(config.lockPath), false);
    releaseLock(acquireLock(config));
    assertEquals(existsSyncViaStat(config.lockPath), false);
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R1: releaseLock leaves a lock that no longer names this process alone",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    const handle = acquireLock(config);
    // Someone else reclaimed it as stale and took it. Deleting it now would hand a
    // third process a lock two others believe they hold.
    Deno.writeTextFileSync(config.lockPath, String(DEAD_PID));
    releaseLock(handle);
    assertEquals(Deno.readTextFileSync(config.lockPath), String(DEAD_PID));
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R1: main() releases the lock on the normal path, on the terminal-auth path, and on a thrown error",
  fn: async () => {
    // Normal path.
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home })) as ReturnType<
      typeof resolveConfig
    >;
    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    await main(["emit", "e", '{"n":1}'], { home });
    assertEquals(existsSyncViaStat(config.lockPath), false, "emit released");

    await main(["flush"], { home, fetchImpl: ackingFetch(recorded) });
    assertEquals(existsSyncViaStat(config.lockPath), false, "flush released");

    // Terminal-auth path (exit 77) — a permanently-failing node must not stay locked.
    await main(["emit", "e", '{"n":2}'], { home });
    await main(["flush"], {
      home,
      fetchImpl: unauthorizedFetch(),
      stderrWrite: () => {},
    });
    assertEquals(process.exitCode, 77, "precondition: this really is the 77 path");
    assertEquals(
      existsSyncViaStat(config.lockPath),
      false,
      "the lock must be released on the terminal-auth path",
    );
    process.exitCode = 0;

    // Thrown error inside the command body.
    await assertRejects(
      () => main(["emit"], { home }),
      Error,
      "emit requires an event_type",
    );
    assertEquals(
      existsSyncViaStat(config.lockPath),
      false,
      "a thrown command must not leave the lock behind",
    );
  },
});

Deno.test({
  ...T,
  name: "ST-092 R1: `status` runs while the lock is held",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    appendEvent(config, { event_type: "e", payload: null });
    const handle = acquireLock(config);
    try {
      const { collected, restore } = capture();
      try {
        await main(["status"], { home });
      } finally {
        restore();
      }
      const out = collected.join("\n");
      assert(
        /spooled_events=1/.test(out),
        `status must still answer while the lock is held: ${out}`,
      );
    } finally {
      releaseLock(handle);
    }
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R1: a refused command leaves the counter, spool, and state byte-identical",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home, spoolMaxEntries: 2 });
    // Produce all three files, including a non-zero drop counter.
    for (let i = 0; i < 3; i++) {
      appendEvent(config, { event_type: "e", payload: { i } });
    }
    const before = {
      seq: Deno.readTextFileSync(config.seqPath),
      spool: Deno.readTextFileSync(config.spoolPath),
      state: Deno.readTextFileSync(config.statePath),
    };

    const handle = acquireLock(config);
    try {
      for (const argv of [["emit", "e"], ["flush"], ["checkpoint", "{}"], ["run"]]) {
        await assertRejects(
          () => main(argv, { home }),
          Error,
          "already running",
        );
      }
    } finally {
      releaseLock(handle);
    }

    assertEquals(Deno.readTextFileSync(config.seqPath), before.seq);
    assertEquals(Deno.readTextFileSync(config.spoolPath), before.spool);
    assertEquals(Deno.readTextFileSync(config.statePath), before.state);
  },
});

/** `existsSync` for the test's own assertions, via Deno rather than node:fs. */
function existsSyncViaStat(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

Deno.test({
  ...T,
  name:
    "ST-092 R1: a holder whose liveness cannot be determined is refused, not reclaimed",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    Deno.mkdirSync(home, { recursive: true });
    Deno.writeTextFileSync(config.lockPath, String(DEAD_PID));

    // `null` is the production probe's answer when the runtime refuses the call. An
    // unanswered question must not become a yes: reclaiming here would let a second
    // client steal a lock whose holder may well be alive.
    const err = assertThrows(
      () => acquireLock({ ...config, isPidAliveImpl: () => null }),
      Error,
    );
    assertEquals((err as Error).name, "AwcpLockError");
    assert(
      /would not let the client check/.test((err as Error).message),
      `the refusal must say WHY it could not tell: ${(err as Error).message}`,
    );
    assertEquals(
      Deno.readTextFileSync(config.lockPath),
      String(DEAD_PID),
      "an undetermined holder must leave the lock exactly as it was",
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R1 control: the production liveness probe reports this very process alive",
  fn: async () => {
    const config = resolveConfig({ home: await Deno.makeTempDir() });
    // Non-vacuity guard on the default. Every refusal test above injects its verdict,
    // so something has to show the shipped probe is a real function with real
    // behaviour rather than a constant.
    //
    // What it asserts is the CONTRACT, not one runtime's answer, because the answer
    // legitimately differs: under `--allow-run` (Node always; Deno when granted) the
    // probe returns `true` for a live pid, and under this suite's deliberately narrow
    // grants Deno refuses the call and the probe returns `null`. The safety-relevant
    // property is the same either way — a live process must NEVER be reported dead,
    // because `false` is the only verdict that licenses stealing a lock.
    const selfVerdict = config.isPidAliveImpl(Deno.pid);
    assert(
      selfVerdict === true || selfVerdict === null,
      `a live process must never be reported dead, got ${JSON.stringify(selfVerdict)}`,
    );
    // These need no syscall, so they discriminate on every runtime.
    assertEquals(config.isPidAliveImpl(0), false, "a nonsense pid is definitely dead");
    assertEquals(config.isPidAliveImpl(-1), false);
    assertEquals(config.isPidAliveImpl(1.5), false);
    // The `true` branch is exercised for real by awcp-node-client-lock.test.ts, whose
    // spawned children are granted --allow-run precisely so it can be.
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R5: the heartbeat wait is handed an abort signal, and stop() aborts it",
  fn: async () => {
    // Waking the loop is not enough on its own. The production sleep is a
    // `setTimeout`, and a pending timer keeps Node's event loop alive — so racing past
    // it finishes the WORK immediately while the PROCESS lingers for the rest of the
    // interval. Measured A/B against a hub that acks immediately, 45s heartbeat: 42.2s
    // to exit without the signal, 82ms with it. This asserts the wiring that closes
    // that gap, which no in-process assertion about `done` resolving would catch.
    const home = await Deno.makeTempDir();
    const signals: Array<AbortSignal | undefined> = [];
    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    const config = withNodeId(resolveConfig({
      home,
      heartbeatIntervalMs: 60_000,
      sleepImpl: (_ms: number, signal?: AbortSignal) => {
        signals.push(signal);
        return new Promise<void>(() => {});
      },
      fetchImpl: ackingFetch(recorded),
    })) as ReturnType<typeof resolveConfig>;

    const controller = runAgent(config);
    await new Promise((r) => setTimeout(r, 20));

    assertEquals(signals.length, 1, "the loop must have parked in exactly one wait");
    const signal = signals[0];
    assert(signal instanceof AbortSignal, "the wait must be handed an abort signal");
    assertEquals(signal.aborted, false, "and it must not be pre-aborted");

    controller.stop();
    assertEquals(
      signal.aborted,
      true,
      "stop() must abort the signal, or the production timer is never cleared",
    );
    await controller.done;
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R5 control: the production sleep really resolves early on abort, and really waits without one",
  fn: async () => {
    // Non-vacuity for the test above: it proves the signal is wired, not that anything
    // honours it. `resolveConfig` does not expose the default sleep, so drive it
    // through the one caller that does — a runAgent whose interval is long enough that
    // resolving early is unambiguous.
    const home = await Deno.makeTempDir();
    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    const config = withNodeId(resolveConfig({
      home,
      heartbeatIntervalMs: 30_000,
      fetchImpl: ackingFetch(recorded),
    })) as ReturnType<typeof resolveConfig>;
    // No sleepImpl override: this is the shipped `defaultSleep`.
    assertEquals(typeof config.sleepImpl, "function");

    const started = Date.now();
    const controller = runAgent(config);
    await new Promise((r) => setTimeout(r, 30));
    controller.stop();
    await controller.done;
    const elapsed = Date.now() - started;
    assert(
      elapsed < 5_000,
      `a stopped agent must not wait out its 30s interval (took ${elapsed}ms)`,
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R5: defaultSleep removes its abort listener when the timer fires, not only when it aborts",
  fn: async () => {
    let added = 0;
    let removed = 0;
    const signal = {
      aborted: false,
      addEventListener: () => {
        added++;
      },
      removeEventListener: () => {
        removed++;
      },
    };

    // Ten ORDINARY completions — the path where abort never fires, which is every
    // heartbeat tick of a run that is not stopping. `{ once: true }` self-removes only
    // when the event actually fires, so before the fix `removed` stayed 0 here while
    // the listeners piled up on runAgent's single long-lived AbortController. Asserting
    // the pair is what makes this a leak test rather than a "it still sleeps" test.
    for (let i = 0; i < 10; i++) {
      await defaultSleep(1, signal as unknown as AbortSignal);
    }

    assertEquals(added, 10, "each sleep must register exactly one abort listener");
    assertEquals(
      removed,
      10,
      "and each must remove it again when its timer completes normally",
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R2b: the corrupt-counter refusal names the home actually in use, not a hard-coded ~/.awcp",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    Deno.mkdirSync(home, { recursive: true });
    Deno.writeTextFileSync(config.seqPath, "garbage");

    const err = assertThrows(() => allocateSeq(config), Error);
    const message = (err as Error).message;

    // Asserting the message CONTAINS the home would pass either way — it already
    // interpolates seqPath, which sits under it. The discriminating assertion is the
    // absence of the hard-coded path: an operator told to delete ~/.awcp while running
    // with AWCP_HOME pointed elsewhere either deletes an unrelated directory or finds
    // nothing there and concludes the advice is wrong.
    assertStringIncludes(message, home);
    assert(
      !message.includes("~/.awcp"),
      "the refusal must not name a home the client may not be using",
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R1: the refusal for a live holder says what to do when the recorded pid was reused",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    const held = acquireLock(config);
    try {
      const err = assertThrows(
        () => acquireLock({ ...config, isPidAliveImpl: () => true }),
        Error,
      );
      const message = (err as Error).message;

      // Naming the lock path is not the discriminating part — the old message already
      // did. What an operator could not previously act on is the case where the pid is
      // live but is NOT a client: a reboot or pid wrap can reassign a recorded pid, and
      // the probe cannot tell that apart from the real holder.
      assertStringIncludes(message, config.lockPath);
      assertStringIncludes(message, "remove that lock file");
    } finally {
      releaseLock(held);
    }
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R1: two clients that find the same stale lock must not both come away holding it",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    Deno.mkdirSync(home, { recursive: true });
    Deno.writeTextFileSync(config.lockPath, String(DEAD_PID));

    let firstHeld = false;
    let secondHeld = false;

    // The second client runs its ENTIRE acquisition inside the first one's stale
    // takeover window — the interleaving two real processes hit when both find the
    // same dead holder at the same moment.
    const secondClient = () => {
      try {
        acquireLock({ ...config, isPidAliveImpl: () => false });
        secondHeld = true;
      } catch {
        // Refused. That is one of the two acceptable outcomes.
      }
    };

    try {
      acquireLock({
        ...config,
        isPidAliveImpl: () => false,
        beforeLockReclaim: secondClient,
      });
      firstHeld = true;
    } catch {
      // Refused. That is the other acceptable outcome.
    }

    // Deliberately no opinion about WHICH one wins — a takeover race has no
    // preferred winner, and asserting one would pin an implementation detail. The
    // invariant is that exactly one does. Both holding is precisely the duplicate
    // client_seq allocation this lock exists to prevent, and the hub's
    // ON CONFLICT (node_id, client_seq) DO NOTHING would then discard one silently.
    assert(
      firstHeld !== secondHeld,
      `exactly one of two concurrent reclaimers may hold the lock ` +
        `(first=${firstHeld}, second=${secondHeld})`,
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R1: a claim left behind by a crashed reclaimer must not brick the lock forever",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    Deno.mkdirSync(home, { recursive: true });

    // A reclaimer that crashed between fsyncing its appended claim and collapsing the
    // claim log leaves exactly this on disk: the stale holder it was taking over from,
    // and its own claim behind it. Both processes are gone.
    const ABANDONED_PID = DEAD_PID + 1;
    Deno.writeTextFileSync(
      config.lockPath,
      `${DEAD_PID}\n${ABANDONED_PID}:abandonedtoken`,
    );

    const handle = acquireLock({
      ...config,
      isPidAliveImpl: () => false,
    });
    try {
      assertEquals(
        Deno.readTextFileSync(config.lockPath).trim().split(":")[0],
        String(Deno.pid),
        "a claim whose process is definitely gone is abandoned, not an owner",
      );
    } finally {
      releaseLock(handle);
    }
  },
});

Deno.test({
  ...T,
  name:
    "ST-092 R1: a claim whose process is still alive still wins, and we refuse behind it",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    Deno.mkdirSync(home, { recursive: true });

    // The discrimination control for the test above. Abandoning a dead claim must not
    // become "ignore every earlier claim" — an earlier claimant that is still running
    // is the legitimate winner, and we must queue behind it rather than take the lock.
    // This one passes both before and after the abandonment fix by construction; it is
    // here to catch that fix being made too permissive, not to prove it was needed.
    Deno.writeTextFileSync(
      config.lockPath,
      `${DEAD_PID}\n${Deno.pid}:livetoken`,
    );

    const err = assertThrows(
      () =>
        acquireLock({
          ...config,
          isPidAliveImpl: (pid: number) => pid !== DEAD_PID,
        }),
      Error,
    );
    assertEquals((err as Error).name, "AwcpLockError");
  },
});

// ---------------------------------------------------------------------------
// PR #52 review round 4 — two findings Codex raised against head 7c23444, both
// about a terminal outcome that the code recognises and then fails to act on.
//
// Neither is observable from the outcome-level tests above: `flush()` already
// returns the right outcome in every case here. What is wrong is what the two
// CALLERS do with it — the CLI turns it into exit 0, and the daemon turns it
// into another lap of the loop. So these tests are deliberately pinned to
// caller-visible effects (process.exitCode, whether the loop terminates,
// whether the stop checkpoint reaches the spool) rather than to a returned
// `outcome` string, which was never the broken part.
// ---------------------------------------------------------------------------

/** Returns true once a `phase: "stop"` checkpoint is durable in the spool file. */
function spoolHasStopCheckpoint(config: Record<string, unknown>): boolean {
  // deno-lint-ignore no-explicit-any
  return readSpool(config).some((entry: any) =>
    entry.event_type === "checkpoint" && entry.payload?.phase === "stop"
  );
}

Deno.test({
  ...T,
  name:
    'PR52-F1a: main(["flush"]) must not report success when a terminal outcome left the spool undelivered',
  fn: async () => {
    const originalExitCode = process.exitCode;
    try {
      // The three terminal outcomes that are NOT terminal_auth. `flush()` routes all
      // of them through `stopTerminal`, which returns `remaining: <n>` and prints
      // `terminal reason=... spooled_events=<n>` — so the client both knows and SAYS
      // the events are still queued, then exits 0 anyway. That contradiction is the
      // bug; asserting the exit code is what makes it visible.
      const cases: Array<[string, () => unknown]> = [
        ["malformed", () => unparseableBodyFetch(200)],
        ["unknown_node", () => notFoundFetch()],
        ["too_large", () => tooLargeFetch()],
      ];

      for (const [label, makeFetch] of cases) {
        const home = await Deno.makeTempDir();
        const config = withNodeId(resolveConfig({ home }));
        appendEvent(config, { event_type: "e", payload: { n: 1 } });

        process.exitCode = 0;
        await main(["flush"], {
          home,
          fetchImpl: makeFetch(),
          sleepImpl: () => Promise.resolve(),
        });

        // Non-vacuity: without this the assertion below could pass on a run where the
        // event was actually delivered, which would make a nonzero exit code WRONG.
        assertEquals(
          readSpool(config).length,
          1,
          `precondition (${label}): the event must still be spooled`,
        );
        assert(
          process.exitCode !== 0,
          `${label}: reported exit 0 with 1 event still spooled`,
        );
      }
    } finally {
      process.exitCode = originalExitCode;
    }
  },
});

Deno.test({
  ...T,
  name:
    "PR52-F1b: runAgent must stop on a terminal non-auth outcome instead of retrying it forever",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    appendEvent(config, { event_type: "e", payload: { n: 1 } });

    // deno-lint-ignore no-explicit-any
    const box: { controller?: { stop: () => void; done: Promise<any> } } = {};
    let ticks = 0;
    let safetyTripped = false;

    // A safety valve, not part of the property under test. Without it this test
    // cannot fail — it hangs, because the unfixed loop never terminates against a
    // 404. `safetyTripped` converts that hang into a readable assertion.
    const sleepImpl = () => {
      ticks += 1;
      if (ticks > 20) {
        safetyTripped = true;
        box.controller!.stop();
      }
      return Promise.resolve();
    };

    box.controller = runAgent({
      ...config,
      heartbeatIntervalMs: 1,
      fetchImpl: notFoundFetch(),
      sleepImpl,
    });
    const result = await box.controller.done as { exitCode: number };

    assert(
      !safetyTripped,
      `runAgent kept looping after a terminal unknown_node — it took ${ticks} ticks ` +
        `and only stopped because the test's safety valve stopped it`,
    );
    assert(
      result.exitCode !== 0,
      "a run that ended on a terminal hub rejection must not exit 0",
    );
  },
});

Deno.test({
  ...T,
  name:
    "PR52-F2a: stop() must interrupt an in-progress flush rather than waiting out its retry budget",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    appendEvent(config, { event_type: "e", payload: { n: 1 } });

    // deno-lint-ignore no-explicit-any
    const box: { controller?: { stop: () => void; done: Promise<any> } } = {};
    let sleeps = 0;
    let sleepsBeforeStopCheckpoint = 0;

    // Deliberately SIGNAL-IGNORING. A fix that only threads `stopController.signal`
    // into the sleep would go green against a signal-honouring fake while changing
    // nothing for an injected sleep — and every other test in this file injects one.
    // This test can therefore only pass if `backoffOrDefer` itself checks `aborted`
    // and gives up, which is the actual requirement.
    const sleepImpl = () => {
      sleeps += 1;
      if (sleeps === 2) box.controller!.stop();
      if (!spoolHasStopCheckpoint(config)) sleepsBeforeStopCheckpoint += 1;
      return Promise.resolve();
    };

    box.controller = runAgent({
      ...config,
      heartbeatIntervalMs: 60_000,
      fetchImpl: unreachableFetch(),
      sleepImpl,
    });
    await box.controller.done;

    // The property that matters is the checkpoint's DURABILITY, not its delivery:
    // `emitCheckpoint({phase:"stop"})` appends to the spool before the final flush
    // runs, so interrupting the first flush is what gets the stop recorded at all.
    // Unfixed, the first flush burns its whole budget (MAX_FLUSH_ATTEMPTS - 1 = 5
    // sleeps) before the checkpoint is written; stop() at sleep 2 must end it there.
    assert(
      sleepsBeforeStopCheckpoint <= 2,
      `the stop checkpoint took ${sleepsBeforeStopCheckpoint} backoff sleeps to reach ` +
        `the spool; stop() was signalled at sleep 2, so it must take no more than 2`,
    );
    assert(
      spoolHasStopCheckpoint(config),
      "non-vacuity: the stop checkpoint must actually be in the spool",
    );
  },
});

Deno.test({
  ...T,
  name:
    "PR52-F2b: stop() must abort an in-flight request, not only the backoff between requests",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));
    appendEvent(config, { event_type: "e", payload: { n: 1 } });

    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    let calls = 0;
    // Models a hub that accepts the connection and never answers — the case an
    // `unreachableFetch()` (which throws at once) cannot reach. Honours `init.signal`
    // exactly as the real `fetch` does, so it hangs forever when no signal is passed.
    // Only the FIRST call hangs: the final flush must still get its delivery attempt,
    // otherwise this test would hang on the fix rather than on the defect.
    // deno-lint-ignore no-explicit-any
    const hangOnceFetch = (url: string, init: any) => {
      calls += 1;
      if (calls > 1) return ackingFetch(recorded)(url, init);
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The signal has been aborted", "AbortError")),
        );
      });
    };

    const controller = runAgent({
      ...config,
      heartbeatIntervalMs: 60_000,
      fetchImpl: hangOnceFetch,
      sleepImpl: () => Promise.resolve(),
    });
    setTimeout(() => controller.stop(), 20);

    await Promise.race([
      controller.done,
      new Promise((_resolve, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "stop() did not abort the in-flight request — flushOnce passes no " +
                  "signal to fetchImpl, so a hub that never answers hangs shutdown",
              ),
            ),
          5_000,
        )
      ),
    ]);
  },
});

// ---------------------------------------------------------------------------
// PR #52 round 2 — three findings an automated reviewer (Codex) raised against
// head `e2109a1`, each verified by execution before a line of the fix was written.
//
// All three share a shape worth naming, because it is the shape that survives a
// green suite: each one is a guard that reads as strict and is not. `isValidAckBody`
// validates the ack's TYPE but never its MEMBERSHIP; `allocateSeq`'s corruption
// refusal validates the counter's PREFIX but never its WHOLE; the lock's exclusive
// create is atomic about EXISTENCE but not about CONTENT. In each case the existing
// tests assert the guard rejects what it was written to reject — which is exactly
// the assertion an incomplete guard also passes.
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    "PR52-F3: flush() must never remove a spool entry it did not transmit (ack outside the batch)",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = withNodeId(resolveConfig({ home }));

    // One more than the batch cap, so entry 501 is provably outside the first batch.
    // Built with `writeSpool` rather than 501 `appendEvent` calls: this test is about
    // what `flush` REMOVES, and routing 501 allocations through the counter would add
    // 501 fsync round trips to prove nothing this test asserts.
    const entries = Array.from({ length: FLUSH_MAX_EVENTS + 1 }, (_, i) => ({
      client_seq: i + 1,
      event_type: "heartbeat",
      payload: null,
      queued_at: "2026-01-01T00:00:00.000Z",
    }));
    writeSpool(config, entries);
    const outOfBatchSeq = FLUSH_MAX_EVENTS + 1;

    const batches: number[][] = [];
    let call = 0;
    const fetchImpl = (_url: string, init: { body: string }) => {
      call += 1;
      const body = JSON.parse(init.body);
      batches.push(
        body.events.map((e: { client_seq: number }) => e.client_seq),
      );
      if (call === 1) {
        // The hub answers a well-formed 200 that acknowledges one seq it WAS sent and
        // one it was NOT. `isValidAckBody` passes it: every entry is an object with a
        // numeric `client_seq`, which is all that check has ever looked at.
        return Promise.resolve({
          status: 200,
          json: () =>
            Promise.resolve({
              acknowledged: [
                { client_seq: 1, event_id: crypto.randomUUID() },
                { client_seq: outOfBatchSeq, event_id: crypto.randomUUID() },
              ],
            }),
        });
      }
      // Stop the loop on the next call, so exactly one response in this test ever
      // acknowledges anything and the assertion below can name the batch it came from.
      return Promise.resolve({
        status: 401,
        json: () => Promise.reject(new Error("401 has no JSON body")),
      });
    };

    const before = readSpool(config).map((e: { client_seq: number }) =>
      e.client_seq
    );
    await flush({ ...config, fetchImpl, sleepImpl: () => Promise.resolve() });
    const after = new Set(
      readSpool(config).map((e: { client_seq: number }) => e.client_seq),
    );
    const removed = before.filter((seq) => !after.has(seq));

    // Non-vacuity, three ways. Without these the subset assertion below passes for a
    // `flush` that transmitted everything, for one that removed nothing, and for one
    // that never ran at all.
    assertEquals(
      batches[0]?.length,
      FLUSH_MAX_EVENTS,
      "precondition: the first batch must be capped at FLUSH_MAX_EVENTS",
    );
    assert(
      !batches[0].includes(outOfBatchSeq),
      `precondition: ${outOfBatchSeq} must be outside the first batch`,
    );
    assert(
      removed.length > 0,
      "precondition: the flush must have removed something, or the subset assertion is trivial",
    );

    // The invariant, stated as the property rather than as a count: only the first
    // response acknowledged anything, so every entry this flush removed must have
    // been in the batch that response answered. EVENT-03 is ack-before-drop, and an
    // ack for an event the hub was never sent is not an ack for it.
    const phantom = removed.filter((seq) => !batches[0].includes(seq));
    assertEquals(
      phantom,
      [],
      `flush removed ${JSON.stringify(phantom)} from the spool, and never sent it`,
    );
  },
});

Deno.test({
  ...T,
  name:
    "PR52-F4: a partially numeric counter is refused, not silently read as its numeric prefix",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });

    // Every one of these is accepted by `Number.parseInt(raw, 10)` and reads as a
    // small number, which is the D-14 reset `allocateSeq`'s refusal exists to prevent
    // — the counter goes backwards and the hub's ON CONFLICT DO NOTHING then discards
    // every event that follows. The last entry is the other half of the same hole:
    // digits all the way through, but past Number.MAX_SAFE_INTEGER, where `+ 1` stops
    // producing a distinct value.
    const corrupt: Record<string, string> = {
      "1garbage": "1",
      "1e3": "1",
      "12 x": "12",
      "0x10": "0",
      "1.9": "1",
      "+5": "5",
      "99999999999999999999": "1e20, which cannot be incremented distinctly",
    };

    for (const [raw, readsAs] of Object.entries(corrupt)) {
      Deno.writeTextFileSync(config.seqPath, raw);
      assertThrows(
        () => allocateSeq(config),
        Error,
        "refusing to allocate a client_seq",
        `${JSON.stringify(raw)} must be refused, not read as ${readsAs}`,
      );
    }
  },
});

Deno.test({
  ...T,
  name:
    "PR52-F5: a crash between the exclusive lock create and its holder record must not brick the node",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });

    // `beforeLockPublish` is this path's crash seam, the same shape as writeSpool's
    // `beforeRename` and allocateSeq's `beforeSeqRename`. It fires in the window
    // between "this process has exclusively claimed the lock" and "the holder record
    // is durably readable" — the window a SIGKILL or a power loss lands in, and the
    // one the acquire path's docblock claimed could not exist.
    assertThrows(
      () =>
        acquireLock({
          ...config,
          beforeLockPublish: () => {
            throw new Error("power loss mid-acquire (test double)");
          },
        }),
      Error,
      "power loss mid-acquire",
    );

    // The node must still be usable. A crash in that window used to leave a lock file
    // with no readable holder, and `acquireLock` refuses an unreadable lock outright
    // rather than reclaiming it — so every later command exited 69 until an operator
    // deleted the file by hand, on precisely the `kill -9` the spool exists to survive.
    const handle = acquireLock(config);
    assert(handle, "a fresh client must be able to take the lock after that crash");
    releaseLock(handle);
  },
});
