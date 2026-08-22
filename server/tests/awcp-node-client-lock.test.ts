/**
 * ST-092 U3 — the single-writer lock, proven with two REAL processes.
 *
 * **Why this file exists separately from `awcp-node-client.test.ts`.** An in-process
 * test cannot distinguish this lock from no lock at all: one process never contends
 * with itself, so every assertion it can make is about the lock's bookkeeping rather
 * than about mutual exclusion. That weakness is not hypothetical — the ST-088 Phase 3
 * test that appeared to prove repeated `client_seq` allocation looped sequentially
 * inside one process, which is exactly the gap the cross-AI review flagged and this
 * story exists to close. The mechanics live next door; the property lives here.
 *
 * Requires `--allow-run=deno` (this file spawns only `Deno.execPath()`) and
 * `--allow-write=/tmp` (every child's `AWCP_HOME` is a `Deno.makeTempDir()`, never the
 * runner's real `~/.awcp/`). Both grants are already in CLAUDE.md's inventory for the
 * suite; this file is a new user of them and is listed there.
 *
 * **The children are granted `--allow-run` and that is deliberate.** The lock's
 * stale-holder decision rests on a pid-liveness probe, and the only probe that works
 * on both runtimes this module runs under is signal 0 — free under Node, which is
 * where the client actually ships, but gated behind `--allow-run` under Deno. `/proc`
 * is not a way around it: Deno gates every path under `/proc` behind `--allow-all`,
 * so it is strictly more restricted than the signal. Without the grant the probe
 * returns "cannot tell", the client refuses rather than reclaims, and the reclaim leg
 * below would pass for the wrong reason.
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const CLIENT = new URL("../scripts/awcp-node-client.mjs", import.meta.url).pathname;

/** A well-formed bearer (BEARER_FORMAT). No hub is ever reached, so it is never used. */
const BEARER = "a".repeat(64);
const FAKE_NODE_ID = "00000000-0000-4000-8000-000000000000";

/**
 * Port 1 is privileged and nothing listens there, so every `fetch` fails at the
 * transport level. That is what keeps a spawned `run` parked in `flush()`'s bounded
 * backoff — holding the lock — for the whole of this test without a hub existing.
 */
const UNREACHABLE_HUB = "http://127.0.0.1:1";

function childEnv(home: string, extra: Record<string, string> = {}) {
  return {
    AWCP_HOME: home,
    AWCP_HUB_URL: UNREACHABLE_HUB,
    AWCP_NODE_BEARER: BEARER,
    // Long enough that the holder parks rather than ticking during the test.
    AWCP_HEARTBEAT_INTERVAL_MS: "600000",
    PATH: Deno.env.get("PATH") ?? "",
    HOME: home,
    ...extra,
  };
}

function spawnClient(home: string, args: string[]) {
  return new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read",
      `--allow-write=${home}`,
      "--allow-net",
      "--allow-env",
      // See the file header: signal-0 liveness is the lock's staleness probe.
      "--allow-run",
      CLIENT,
      ...args,
    ],
    env: childEnv(home),
    clearEnv: true,
    stdout: "piped",
    stderr: "piped",
  }).spawn();
}

async function runClient(home: string, args: string[]) {
  const child = spawnClient(home, args);
  const out = await child.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
  };
}

/** A home with a node_id already persisted — `flushOnce` reads it before any request. */
async function preparedHome(): Promise<string> {
  const home = await Deno.makeTempDir();
  Deno.mkdirSync(home, { recursive: true, mode: 0o700 });
  Deno.writeTextFileSync(`${home}/node_id`, FAKE_NODE_ID);
  Deno.chmodSync(`${home}/node_id`, 0o600);
  return home;
}

function readOrNull(path: string): string | null {
  try {
    return Deno.readTextFileSync(path);
  } catch {
    return null;
  }
}

/**
 * The pid recorded in a lockfile, or `null` if there is no lock.
 *
 * The lock records `<pid>:<token>`, where the token is a fresh random value per
 * acquisition — so these assertions compare the holder, which is the fact under test,
 * rather than the file's exact bytes, which no longer have a predictable value.
 */
function lockHolderPid(path: string): string | null {
  const raw = readOrNull(path);
  return raw === null ? null : raw.trim().split("\n")[0].split(":")[0];
}

/** Wait until `predicate` holds, or fail with `label` after `timeoutMs`. */
async function waitFor(
  label: string,
  predicate: () => boolean,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name:
    "ST-092 R1: a second client process against one AWCP_HOME is refused, changes nothing, and the home becomes usable again once the holder is gone",
  fn: async (t) => {
    const home = await preparedHome();
    const lockPath = `${home}/lock`;
    const holder = spawnClient(home, ["run"]);
    // Both pipes are drained at the end via `holder.output()`; nothing is read before
    // then, and the volume here is a few lines, so the pipes cannot fill and block.

    try {
      await t.step("the first process takes the lock and records its own pid", async () => {
        await waitFor("the holder to write its lockfile", () => readOrNull(lockPath) !== null);
        assertEquals(
          lockHolderPid(lockPath),
          String(holder.pid),
          "the lockfile must name the process that took it",
        );
      });

      // Snapshot AFTER the holder has produced its start checkpoint, so the
      // byte-identical assertion below is about the refused run and nothing else.
      await waitFor(
        "the holder to spool its start checkpoint",
        () => readOrNull(`${home}/spool.jsonl`) !== null,
      );
      const before = {
        seq: readOrNull(`${home}/client_seq`),
        spool: readOrNull(`${home}/spool.jsonl`),
        state: readOrNull(`${home}/state.json`),
      };
      assert(before.seq !== null && before.spool !== null, "precondition: state exists");

      await t.step("a second process refuses, names the holder, and exits 69", async () => {
        const second = await runClient(home, ["emit", "contended"]);
        assertEquals(
          second.code,
          69,
          `the second client must refuse. stdout=${second.stdout} stderr=${second.stderr}`,
        );
        assertStringIncludes(second.stderr, "already running");
        assertStringIncludes(
          second.stderr,
          String(holder.pid),
          "the refusal must name the pid actually holding the lock",
        );
      });

      await t.step("the refused run left the counter, spool, and state untouched", () => {
        assertEquals(readOrNull(`${home}/client_seq`), before.seq);
        assertEquals(readOrNull(`${home}/spool.jsonl`), before.spool);
        assertEquals(readOrNull(`${home}/state.json`), before.state);
      });

      await t.step(
        "after the holder is SIGKILLed, a third process reclaims the stale lock and succeeds",
        async () => {
          // SIGKILL, not SIGTERM: the release path never runs, so the lockfile is
          // left behind naming a pid that no longer exists. A node that one `kill -9`
          // could brick would need manual intervention on exactly the failure the
          // spool exists to survive.
          holder.kill("SIGKILL");
          await holder.status;
          assertEquals(
            lockHolderPid(lockPath),
            String(holder.pid),
            "precondition: the stale lock is still there, still naming the dead pid",
          );

          const third = await runClient(home, ["emit", "after-reclaim"]);
          assertEquals(
            third.code,
            0,
            `the third client must reclaim and proceed. stderr=${third.stderr}`,
          );
          assertEquals(
            lockHolderPid(lockPath),
            null,
            "and must release the lock it reclaimed",
          );

          // This step is the discrimination check for the refusal above: same
          // command, same home, same binary — only the lock's state differs, and the
          // outcome differs with it. Without it, a second client that exited 69 for
          // some unrelated reason would look like a working lock.
          const spool = readOrNull(`${home}/spool.jsonl`) ?? "";
          assertStringIncludes(
            spool,
            "after-reclaim",
            "the reclaiming client's event must actually be in the spool",
          );
          assert(
            !spool.includes("contended"),
            "the refused client's event must never have been written",
          );
        },
      );
    } finally {
      try {
        holder.kill("SIGKILL");
      } catch { /* already dead */ }
      await holder.output().catch(() => {});
    }
  },
});

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name:
    "ST-092 R1: two sequential client processes both succeed — the lock does not leak between runs",
  fn: async () => {
    const home = await preparedHome();
    for (const label of ["first", "second", "third"]) {
      const result = await runClient(home, ["emit", label]);
      assertEquals(result.code, 0, `${label}: stderr=${result.stderr}`);
      assertEquals(
        readOrNull(`${home}/lock`),
        null,
        `${label}: the lock must be released before the process exits`,
      );
    }
    assertEquals(readOrNull(`${home}/client_seq`), "3", "three allocations, no reset");
  },
});

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name: "ST-092 R1: `status` answers while another process holds the lock",
  fn: async () => {
    const home = await preparedHome();
    const holder = spawnClient(home, ["run"]);
    try {
      await waitFor(
        "the holder to write its lockfile",
        () => readOrNull(`${home}/lock`) !== null,
      );
      const status = await runClient(home, ["status"]);
      assertEquals(status.code, 0, `stderr=${status.stderr}`);
      assertStringIncludes(status.stdout, "dropped_events=");
      assertStringIncludes(status.stdout, "spooled_events=");
    } finally {
      try {
        holder.kill("SIGKILL");
      } catch { /* already dead */ }
      await holder.output().catch(() => {});
    }
  },
});
