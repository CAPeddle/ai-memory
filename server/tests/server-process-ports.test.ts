/**
 * ST-092 U7 (R7) — `startServerProcess` binds an ephemeral port, and the handle it
 * returns really points at the child this call spawned.
 *
 * The helper used to be handed a fixed well-known port by each caller, and the ports
 * were allocated by hand across six files. Two of them — `awcp-cli.test.ts` and
 * `workflow-agent-key-e2e.test.ts` — had each been given 3144, so whichever ran second
 * could bind nothing and, in the worst ordering, be handed a "healthy" handle pointing
 * at the other suite's server. `PORT=0` removes the collision class rather than
 * catching the next instance of it.
 *
 * The property that had to survive the change is the one the helper's own docblock
 * calls load-bearing: `/health` answers 200 unconditionally, so a health poll proves
 * only that *something* is listening. The helper therefore waits for the child's own
 * `Listening on http://host:port/` line, which nothing but that child can write. Under
 * ephemeral ports that line is now the source of the port as well, so the proof is
 * strictly stronger — there is no other way to learn where the child is listening.
 *
 * Requires `--allow-run=deno`, like every other spawning suite here.
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  type ServerProcess,
  startServerProcess,
} from "./_helpers/serverProcess.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL")!;
const API_KEY = Deno.env.get("MEMORY_API_KEY") ?? "test-key";

function baseEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    DATABASE_URL,
    MEMORY_API_KEY: API_KEY,
    FEATURE_WORKFLOW: "true",
    FEATURE_ENTITY_WORKER: "false",
    FEATURE_CONSOLIDATION_WORKER: "false",
    FEATURE_EMBEDDING_BACKFILL: "false",
    MODEL_PROVIDER_ENABLED: "false",
    ...extra,
  };
}

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name:
    "ST-092 R7: two servers started in one test get different ports, and each handle addresses its own child",
  fn: async () => {
    const started: ServerProcess[] = [];
    try {
      // The two children differ in ONE observable way, and it is a fact about each
      // child's own environment rather than about the port: `/workflow` is mounted
      // only inside `if (workflowFeatureEnabled())`. A bare `/health` 200 would prove
      // nothing here — both children answer it, which is the whole reason the helper
      // does not trust it.
      const withDashboard = await startServerProcess(baseEnv());
      started.push(withDashboard);
      const withoutDashboard = await startServerProcess(
        baseEnv({ FEATURE_WORKFLOW: "false" }),
      );
      started.push(withoutDashboard);

      assert(
        withDashboard.port !== withoutDashboard.port,
        `two concurrent children must not share a port (both got ${withDashboard.port})`,
      );
      for (const proc of started) {
        assert(proc.port > 0, "each child must report a real port");
        assertStringIncludes(proc.baseUrl, String(proc.port));
      }

      const a = await fetch(`${withDashboard.baseUrl}/workflow`);
      await a.body?.cancel();
      assertEquals(
        a.status,
        200,
        "the first handle must reach the child spawned WITH the dashboard",
      );

      const b = await fetch(`${withoutDashboard.baseUrl}/workflow`);
      await b.body?.cancel();
      assertEquals(
        b.status,
        404,
        "the second handle must reach the child spawned WITHOUT it — if both " +
          "answered 200, the two handles would be addressing the same process",
      );
    } finally {
      for (const proc of started) await proc.stop();
    }
  },
});

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name:
    "ST-092 R7: a child that cannot boot fails the call with its own output, rather than hanging",
  fn: async () => {
    // A bind failure is no longer reachable — the kernel picks the port — so the
    // reachable boot failure is used instead: the server refuses to start when the
    // agent key collides with the operator key (startupValidation.ts). What this
    // proves is what the scenario is actually about: the wait loop still terminates
    // and still surfaces the child's own diagnostic.
    let threw: Error | null = null;
    try {
      const proc = await startServerProcess(
        baseEnv({ AWCP_AGENT_API_KEY: API_KEY }),
      );
      await proc.stop();
    } catch (error) {
      threw = error as Error;
    }

    assert(threw !== null, "a server that cannot boot must not return a handle");
    assertStringIncludes(threw.message, "exited before it reported binding a port");
    assertStringIncludes(
      threw.message,
      "FATAL",
      "the child's own diagnostic must be carried out, not replaced by a bare timeout",
    );
  },
});

Deno.test({
  name: "ST-092 R7: no test file declares a hardcoded spawned-server port",
  fn: async () => {
    // The shape this scans for is a module-level constant whose name ends in PORT
    // bound to a literal number — six of those were hand-allocated across this suite
    // before ST-092, and two of them collided. The helper's signature no longer
    // accepts a port, so the compiler already rejects passing one; what a leftover
    // constant would do is quietly reintroduce the hand-allocation habit in the next
    // spawning test somebody writes.
    const pattern = /const\s+[A-Za-z_]*PORT[A-Za-z_]*\s*=\s*\d+/;

    // Red/green control on the pattern itself, before it is trusted: a scan whose
    // regex silently stopped matching would report a clean tree either way.
    //
    // The sample is assembled from two pieces rather than written as one literal so
    // that this file does not match its own scan. Excluding the file by name would
    // work too, but then a real offender introduced here would be invisible — and
    // this is the file most likely to grow one.
    const sample = "const " + "SAMPLE_PORT = 3144;";
    assert(
      pattern.test(sample),
      "the pattern must match the declarations this scan exists to forbid",
    );
    assert(
      !pattern.test("const " + "SAMPLE_PORT = server.port;"),
      "and must not flag a port derived from a running child",
    );

    const offenders: string[] = [];
    let scanned = 0;
    const dir = new URL(".", import.meta.url).pathname;
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith(".test.ts")) continue;
      scanned += 1;
      const source = await Deno.readTextFile(`${dir}${entry.name}`);
      if (pattern.test(source)) offenders.push(entry.name);
    }

    // Non-vacuity guard: a scan over an empty file set satisfies every claim about
    // its contents.
    assert(scanned > 5, `the scan must have read the suite, not nothing (${scanned})`);
    assertEquals(offenders, [], "these files still hardcode a spawned-server port");
  },
});
