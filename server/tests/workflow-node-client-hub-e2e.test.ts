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
const PORT = 3146;

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
    const server: ServerProcess = await startServerProcess(NODE_HUB_ENV, PORT);
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
