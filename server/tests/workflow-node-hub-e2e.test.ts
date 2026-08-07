/**
 * ST-088 U2 — process-boundary proof that /workflow/nodes is actually MOUNTED.
 *
 * WHY THIS FILE EXISTS, given workflow-remote-node-hub.test.ts already covers every
 * NODE-01/02/03 behaviour. That file drives `createRemoteNodeHubRoutes()` in-process via
 * `app.fetch`, so it proves the ROUTE FACTORY is correct and proves nothing whatsoever
 * about `index.ts`. Delete the mount entirely and all fifteen of those tests stay green.
 *
 * That is not a hypothetical gap. The composition root does two things the in-process
 * tests never exercise:
 *
 *   1. mounts the routes under a PATH PREFIX (`/workflow/nodes`), deliberately outside
 *      `/api/workflow/*` so the operator/agent middleware cannot authenticate a node.
 *      A wrong prefix is invisible to a test that mounts its own app.
 *   2. installs `validateNodeBearer` as middleware ahead of the route.
 *
 * (1) is exactly what the plan's mount instruction got wrong before execution — it named
 * `if (workflowBootstrap.enabled)` at index.ts:74, a block that runs a thousand lines
 * before `const app = new Hono()` exists. A compile check would not have caught a prefix
 * error, and neither would any other suite in this repo. Verified by probe: with
 * `app.route("/workflow/nodes", ...)` removed, the registration step below fails.
 *
 * BE HONEST ABOUT (2): this file does NOT independently prove the middleware, and the
 * same probe showed why. Both route handlers call `validateNodeBearer` themselves, so
 * deleting the middleware changes no observable behaviour and the 401 steps below keep
 * passing. The middleware is therefore defence in depth, not the load-bearing check —
 * its value is that a FUTURE route added under `/workflow/nodes/*` is guarded even if
 * its author forgets, and no test here can demonstrate that until such a route exists.
 * Do not read the passing 401 steps as evidence the middleware is wired.
 *
 * Deliberately thin: this asserts the mount, not the semantics. Semantics belong in the
 * in-process suite where they run in milliseconds.
 *
 * Requires --allow-run=deno. Uses its own port (3145), distinct from
 * workflow-mvp-e2e.test.ts's 3142/3143 and workflow-agent-key-e2e.test.ts's 3144.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { type ServerProcess, startServerProcess } from "./_helpers/serverProcess.ts";
import { sql } from "../src/db.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL")!;

/**
 * 64 lowercase hex characters, and that shape is load-bearing rather than incidental.
 *
 * The node surface's format gate runs BEFORE the platform-key isolation check, so an
 * operator key of any other shape is refused as malformed and `bearerIsPlatformKey` is
 * never reached — the isolation step below would then pass with the isolation check
 * deleted entirely. (This file previously used a readable non-hex string and did
 * exactly that; the in-process suite avoided the trap and this one walked into it.)
 * Deterministic rather than random so a failure here is reproducible.
 */
const OPERATOR_KEY = "0f".repeat(32);

/** Operator-chosen, no format rule — deliberately not bearer-shaped. */
const ENROLMENT_SECRET = "enrolment-secret-for-node-hub-mount-test";
const PORT = 3145;

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
  sanitizeResources: false,
  sanitizeOps: false,
  name: "ST-088: /workflow/nodes is mounted and bearer-guarded by the composition root",
  fn: async (t) => {
    const server: ServerProcess = await startServerProcess(NODE_HUB_ENV, PORT);
    const bearer = mintBearer();

    try {
      await t.step("an unauthenticated request is refused by the mounted middleware", async () => {
        // No Authorization at all. If this 404s instead of 401ing, the routes are not
        // mounted at this prefix and every other assertion here is meaningless — so
        // assert the status precisely rather than "not 2xx".
        const res = await fetch(`${server.baseUrl}/workflow/nodes/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        await res.body?.cancel();
        assertEquals(res.status, 401, "expected the node middleware to refuse an absent bearer");
      });

      await t.step("the platform operator key cannot authenticate the node surface", async () => {
        // Cross-surface isolation, proven over the real HTTP boundary rather than
        // in-process: MEMORY_API_KEY opens /api/workflow and must not open this.
        const res = await fetch(`${server.baseUrl}/workflow/nodes/register`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPERATOR_KEY}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        await res.body?.cancel();
        assertEquals(res.status, 401, "MEMORY_API_KEY authenticated the node surface");
      });

      await t.step("a well-formed node bearer registers over real HTTP", async () => {
        const res = await fetch(`${server.baseUrl}/workflow/nodes/register`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${bearer}`,
            "X-Node-Enrolment-Secret": ENROLMENT_SECRET,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ hostname: "z2", platform: "ubuntu-24.04" }),
        });
        const body = await res.json();
        assertEquals(res.status, 201, JSON.stringify(body));
        assert(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.node_id),
          `node_id is not a uuid: ${JSON.stringify(body)}`,
        );

        // The event route is mounted too — a prefix that served /register but not
        // /:node_id/events would otherwise pass this file.
        const events = await fetch(`${server.baseUrl}/workflow/nodes/${body.node_id}/events`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${bearer}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ events: [{ client_seq: 1, event_type: "mounted" }] }),
        });
        const ack = await events.json();
        assertEquals(events.status, 200, JSON.stringify(ack));
        // No Number() coercion: the wire type is part of the delivery contract, and a
        // node comparing its spool with === would never match a string.
        assertEquals(ack.acknowledged.map((a: { client_seq: number }) => a.client_seq), [1]);
      });

      await t.step("the platform surface is unaffected by the node mount", async () => {
        // The other direction of isolation: adding /workflow/nodes must not disturb the
        // operator key's access to /api/workflow.
        const res = await fetch(`${server.baseUrl}/api/workflow/overview`, {
          headers: { "Authorization": `Bearer ${OPERATOR_KEY}` },
        });
        await res.body?.cancel();
        assertEquals(res.status, 200, "the operator key lost access to /api/workflow");
      });
    } finally {
      await server.stop();
      // The child process wrote this row against the shared database; clean it up here
      // rather than leaving it for the next run to trip over.
      await sql`
        DELETE FROM workflow.execution_nodes WHERE bearer_token_hash = ${await sha256Hex(bearer)}
      `;
    }
  },
});
