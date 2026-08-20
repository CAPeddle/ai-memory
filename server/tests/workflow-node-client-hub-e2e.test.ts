/**
 * ST-088 03-02 — the node client proven end to end against a REAL hub process.
 *
 * WHY THIS FILE EXISTS, given `workflow-node-hub-e2e.test.ts` already proves the hub
 * mount over real HTTP. That file drives its own raw `fetch` calls; this one drives
 * `server/scripts/awcp-node-client.mjs` — the actual client that will run on z2 — and
 * is the tracer proof for three assumptions the rest of Phase 3 builds on:
 *
 *   1. Deno's `node:` compatibility layer can import a Node `.mjs` under this repo's
 *      `frozen`+`strict` settings (D-09) — every import below is that proof, live.
 *   2. The client's entry-point guard is inert under Deno's import mechanics, not
 *      merely under real `node` (RESEARCH.md Pitfall 5) — the second `Deno.test`
 *      below is dedicated to exactly this.
 *   3. The client's ack-shape handling (`flushOnce`'s `acked`/`acknowledged`) matches
 *      the hub's real wire types with no coercion smoothing over a mismatch
 *      (`store.ts:840-857`'s already-fixed bug class, client-side half).
 *
 * A tracer that fails here costs one commit; the same failure discovered in 03-04
 * would cost four.
 *
 * Port 3146: distinct from workflow-mvp-e2e.test.ts's 3142/3143,
 * workflow-agent-key-e2e.test.ts's/awcp-cli.test.ts's 3144,
 * workflow-node-hub-e2e.test.ts's 3145, and provider-egress.test.ts's 3160.
 *
 * Requires --allow-run=deno (the guard test dynamically imports this module's own
 * subject module) and --allow-write=/tmp (the client's injected `home` for every
 * test below is a `Deno.makeTempDir()` directory).
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { type ServerProcess, startServerProcess } from "./_helpers/serverProcess.ts";
import { sql } from "../src/db.ts";
import {
  appendEvent,
  flush,
  flushOnce,
  readSpool,
  registerNode,
  resolveConfig,
} from "../scripts/awcp-node-client.mjs";

const DATABASE_URL = Deno.env.get("DATABASE_URL")!;

/**
 * 64 lowercase hex characters, deterministic rather than random, matching the same
 * reasoning `workflow-node-hub-e2e.test.ts` documents: the node surface's format gate
 * runs BEFORE the platform-key isolation check, so an operator key of any other shape
 * would be refused as malformed without ever exercising that isolation.
 */
const OPERATOR_KEY = "0f".repeat(32);
const ENROLMENT_SECRET = "enrolment-secret-for-node-client-hub-e2e-test";

const NODE_HUB_ENV: Record<string, string> = {
  DATABASE_URL,
  MEMORY_API_KEY: OPERATOR_KEY,
  AWCP_NODE_ENROLMENT_SECRET: ENROLMENT_SECRET,
  FEATURE_WORKFLOW: "true",
  FEATURE_ENTITY_WORKER: "false",
  FEATURE_CONSOLIDATION_WORKER: "false",
  FEATURE_EMBEDDING_BACKFILL: "false",
  MODEL_PROVIDER_ENABLED: "false",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const T = { sanitizeResources: false, sanitizeOps: false };

function mintBearer(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input).slice().buffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.test({
  ...T,
  name: "ST-088 tracer: one event travels client -> real hub -> ack -> spool removal",
  fn: async () => {
    const server: ServerProcess = await startServerProcess(NODE_HUB_ENV);
    const bearer = mintBearer();
    const home = await Deno.makeTempDir({ prefix: "awcp-node-client-tracer-" });
    const config = resolveConfig({
      home,
      hubUrl: server.baseUrl,
      bearer,
      enrolmentSecret: ENROLMENT_SECRET,
    });

    try {
      const nodeId = await registerNode(config);
      assert(UUID_RE.test(nodeId), `node_id is not a uuid: ${nodeId}`);

      const homeMode = (await Deno.stat(home)).mode! & 0o777;
      assertEquals(homeMode, 0o700, "the state dir must be 0700");
      const nodeIdMode = (await Deno.stat(config.nodeIdPath)).mode! & 0o777;
      assertEquals(nodeIdMode, 0o600, "node_id must be 0600");

      appendEvent(config, { event_type: "run_started", payload: { repo: "ai-memory" } });
      const spooledBefore = readSpool(config);
      assertEquals(spooledBefore.length, 1, "exactly one event must be spooled");

      const seqMode = (await Deno.stat(config.seqPath)).mode! & 0o777;
      assertEquals(seqMode, 0o600, "client_seq must be 0600");

      const result = await flush(config);
      assertEquals(result.outcome, "acked");
      assertEquals(result.acked, [1], "the flush must acknowledge client_seq 1 as a NUMBER");

      const spooledAfter = readSpool(config);
      assertEquals(spooledAfter.length, 0, "the spool must be empty after the ack");
      assertEquals(
        await Deno.readTextFile(config.spoolPath),
        "",
        "spool.jsonl must contain zero lines",
      );

      // Scoped per D-02: an unscoped count(*) over workflow.run_events is
      // nondeterministic the moment another node shares the same database.
      const rows = await sql<{ n: string }[]>`
        SELECT count(*) AS n FROM workflow.run_events WHERE node_id = ${nodeId}
      `;
      assertEquals(Number(rows[0].n), 1, "exactly one scoped run_events row must exist");
    } finally {
      await server.stop();
      await sql`
        DELETE FROM workflow.execution_nodes WHERE bearer_token_hash = ${await sha256Hex(bearer)}
      `;
      await Deno.remove(home, { recursive: true }).catch(() => {});
    }
  },
});

Deno.test({
  ...T,
  name:
    "ST-088 guard: importing awcp-node-client.mjs performs zero network requests and creates nothing under the real HOME",
  fn: async () => {
    // Make the network claim checkable rather than asserted: nothing watching for the
    // thing it denies is a check that cannot fail (RESEARCH.md Pitfall 5).
    const realHome = Deno.env.get("HOME") ?? "";
    const awcpDirPath = `${realHome}/.awcp`;
    const existedBefore = await Deno.stat(awcpDirPath).then(() => true).catch(() => false);

    const originalFetch = globalThis.fetch;
    let hits = 0;
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
      hits++;
      return originalFetch(...args);
    }) as typeof fetch;

    try {
      // Cache-busting query string forces a fresh module evaluation rather than
      // reusing the already-imported instance above, so this import's top-level side
      // effects (including the entry-point guard) run again under observation.
      await import(`../scripts/awcp-node-client.mjs?guard-check=${crypto.randomUUID()}`);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assertEquals(hits, 0, "importing the module must perform zero fetch calls");

    const existedAfter = await Deno.stat(awcpDirPath).then(() => true).catch(() => false);
    assertEquals(
      existedAfter,
      existedBefore,
      "importing the module must not create ~/.awcp under the real HOME",
    );
  },
});

// ---------------------------------------------------------------------------
// EVENT-01 — replaying the same (node_id, client_seq) over real HTTP
// ---------------------------------------------------------------------------
//
// Added on RESEARCH.md's recommendation (03-CONTEXT.md's Open Question #2, ce-
// doc-review scope-guardian P1 finding), not on an explicit user decision: hub-side
// duplicate suppression is a server property, and workflow-node-client-hub-e2e.test.ts's
// own tracer test above drives the client's spool logic in-process only up to the
// network boundary — it cannot observe whether the HUB's `ON CONFLICT (node_id,
// client_seq) DO NOTHING` + read-back ack actually suppresses a duplicate. This test
// closes that structural gap the same way workflow-node-hub-e2e.test.ts closes the
// mount-vs-route-factory gap: over a real process boundary.
//
// Drives flushOnce(config, batch) directly with the IDENTICAL batch twice, rather than
// appendEvent twice (which would allocate client_seq 1 then 2) — the property under
// test is what happens when the SAME client_seq is submitted twice, and only
// flushOnce's batch argument lets the test hold that seq fixed.

Deno.test({
  ...T,
  name:
    "ST-088 EVENT-01: replaying the same (node_id, client_seq) over real HTTP creates no duplicate hub state",
  fn: async () => {
    const server: ServerProcess = await startServerProcess(NODE_HUB_ENV);
    const bearer = mintBearer();
    const home = await Deno.makeTempDir({ prefix: "awcp-node-client-event01-" });
    const config = resolveConfig({
      home,
      hubUrl: server.baseUrl,
      bearer,
      enrolmentSecret: ENROLMENT_SECRET,
    });

    try {
      const nodeId = await registerNode(config);
      const originalPayload = { step: "build" };
      const batch = [{ client_seq: 1, event_type: "checkpoint", payload: originalPayload }];

      const first = await flushOnce(config, batch);
      const second = await flushOnce(config, batch);

      assertEquals(first.outcome, "acked");
      assertEquals(second.outcome, "acked");

      // event_id included: the read-back ack means the SECOND call must report the
      // exact row the FIRST call created, which is what "the client receives the same
      // ack both times" actually means — not merely "both acks name client_seq 1".
      assertEquals(
        first.acknowledged,
        second.acknowledged,
        "both flushOnce responses' acknowledged arrays must be identical, event_id included",
      );

      // No Number() coercion at the assertion site, deliberately (same discipline as
      // workflow-remote-node-hub.test.ts:353-364) — an ack whose client_seq arrived as
      // a string would fail this assertion instead of silently passing.
      assertEquals(
        first.acknowledged.map((entry: { client_seq: number }) => entry.client_seq),
        [1],
        "client_seq must be acknowledged as [1]",
      );
      assertEquals(
        typeof first.acknowledged[0].client_seq,
        "number",
        "client_seq must arrive as a JS number, not a string",
      );

      // Scoped per D-02: unscoped counting is nondeterministic here the moment a live
      // node streams into the same database (which by 03-06 one will be).
      const rows = await sql<{ n: string }[]>`
        SELECT count(*) AS n FROM workflow.run_events WHERE node_id = ${nodeId}
      `;
      assertEquals(
        Number(rows[0].n),
        1,
        "the replay must not insert a second row",
      );

      // The payload half of normalizeBatch's docblock contract: never reuse a
      // client_seq for different content — a third submission with DIFFERENT payload
      // content must leave the ORIGINAL payload stored, not overwrite it.
      const third = await flushOnce(config, [
        { client_seq: 1, event_type: "checkpoint", payload: { step: "different-content" } },
      ]);
      assertEquals(third.outcome, "acked");

      const stored = await sql<{ payload: unknown }[]>`
        SELECT payload FROM workflow.run_events WHERE node_id = ${nodeId} AND client_seq = 1
      `;
      assertEquals(
        stored[0].payload,
        originalPayload,
        "the stored payload must remain the FIRST submission's payload",
      );
    } finally {
      await server.stop();
      await sql`
        DELETE FROM workflow.execution_nodes WHERE bearer_token_hash = ${await sha256Hex(bearer)}
      `;
      await Deno.remove(home, { recursive: true }).catch(() => {});
    }
  },
});
