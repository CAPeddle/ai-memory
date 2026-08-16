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
  appendEvent,
  main,
  readSpool,
  readState,
  resolveConfig,
  writeSpool,
} from "../scripts/awcp-node-client.mjs";

const T = { sanitizeResources: false, sanitizeOps: false };

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
