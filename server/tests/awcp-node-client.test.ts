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

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  allocateSeq,
  appendEvent,
  flush,
  main,
  readSpool,
  readState,
  resolveConfig,
  writeSpool,
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
      (e: { client_seq: number }) => ({ client_seq: e.client_seq, event_id: crypto.randomUUID() }),
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
          acknowledged: [{ client_seq: targetSeq, event_id: crypto.randomUUID() }],
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
    assertEquals(state.dropped_events, 2, "two of five appends must have been evicted");
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
  name: 'EVENT-04: `status` prints dropped_events and spooled_events to stdout',
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

    assert(logs.some((l) => /^dropped_events=2$/.test(l)), `logs: ${JSON.stringify(logs)}`);
    assert(logs.some((l) => /^spooled_events=3$/.test(l)), `logs: ${JSON.stringify(logs)}`);
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
    assert(threw, "writeSpool must propagate the injected failure, not swallow it");

    const after = await Deno.readTextFile(config.spoolPath);
    assertEquals(after, before, "the original spool.jsonl must be unchanged byte-for-byte");

    const lines = after.split("\n").filter((l) => l.trim() !== "");
    assertEquals(lines.length, 2, "both original entries must still be present");
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
    const unreachableConfig = { ...config, fetchImpl: unreachableFetch() };
    const result1 = await flush(unreachableConfig);
    assertEquals(result1.outcome, "unreachable");

    const after = await Deno.readTextFile(config.spoolPath as string);
    assertEquals(after, before, "spool.jsonl must be byte-identical after an unreachable attempt");
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
    assertEquals(readSpool(config).length, 0, "the spool must be empty after the ack");
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
    assertEquals(spoolSeqs, seqs.slice(-3), "the surviving entries must be the newest 3");
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

    const partialConfig = { ...config, fetchImpl: partialAckFetch(s2) };
    const result = await flush(partialConfig);
    assertEquals(result.outcome, "acked");

    const afterEntries = readSpool(config);
    assertEquals(
      afterEntries.map((e: { client_seq: number }) => e.client_seq),
      [s1, s3],
      "only the acknowledged middle seq must be removed",
    );
    for (const seq of [s1, s3]) {
      const beforeEntry = beforeEntries.find((e: { client_seq: number }) => e.client_seq === seq);
      const afterEntry = afterEntries.find((e: { client_seq: number }) => e.client_seq === seq);
      assertEquals(afterEntry.queued_at, beforeEntry.queued_at, "queued_at must be unchanged");
      assertEquals(afterEntry.payload, beforeEntry.payload, "payload must be unchanged");
    }

    // deno-lint-ignore no-explicit-any
    const recorded: any[][] = [];
    const throwingConfig = { ...config, fetchImpl: throwsAfterRecordingFetch(recorded) };
    const result2 = await flush(throwingConfig);
    assertEquals(result2.outcome, "unreachable");
    assertEquals(recorded.length, 1, "the batch must actually have been sent");
    assertEquals(
      readSpool(config).map((e: { client_seq: number }) => e.client_seq),
      [s1, s3],
      "nothing may be removed when the response never arrived",
    );
  },
});

Deno.test({
  ...T,
  name: "EVENT-03: a 600-event spool flushes as a 500-event batch then a 100-event batch",
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

    assertEquals(recorded.length, 2, "600 events must be sent as exactly two requests");
    assertEquals(recorded[0].length, 500, "the first request must carry exactly 500 events");
    assertEquals(recorded[1].length, 100, "the second request must carry exactly 100 events");
    assertEquals(result.outcome, "acked");
    assertEquals(readSpool(config).length, 0, "the spool must be fully drained");
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
    assertEquals(readSpool(config1).length, 0, "the spool must be fully drained");

    // Simulate a restart honestly: a SECOND config object built the normal way, not
    // the first one reused in memory.
    const config2 = resolveConfig({ home });
    const next = allocateSeq(config2);
    assertEquals(next, 6, "the next seq must exceed the highest delivered seq (5)");
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
      await Deno.stat(config1.spoolPath as string).then(() => true).catch(() => false),
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
      assert(seen[i] > seen[i - 1], `allocation ${i} (${seen[i]}) did not exceed ${seen[i - 1]}`);
    }
    assertEquals(new Set(seen).size, 50, "all 50 allocated values must be distinct");
  },
});

Deno.test({
  ...T,
  name: "D-14: the persisted client_seq counter file is mode 0600 and contains only digits",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const config = resolveConfig({ home });
    allocateSeq(config);

    const mode = (await Deno.stat(config.seqPath)).mode! & 0o777;
    assertEquals(mode, 0o600, "client_seq must be 0600");

    const contents = (await Deno.readTextFile(config.seqPath)).trim();
    assert(/^\d+$/.test(contents), `client_seq must contain only digits, got: ${contents}`);
  },
});
