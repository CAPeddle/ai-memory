/**
 * Process-boundary proof for the operator/agent credential split on /api/workflow.
 *
 * Route-function tests (workflow-policy.test.ts) prove `requiresOperator` classifies
 * routes correctly in isolation. They cannot prove the composition root actually WIRES
 * that classification into a real 401/403 decision over HTTP, with a real bearer
 * header, against a real running server — which is exactly the property this defect
 * was about: `server/scripts/awcp.ts` and `docs/workflow-mvp.md` used to claim an
 * enforcement that didn't exist at the HTTP boundary at all. So this test boots a real
 * server process (same helper as workflow-mvp-e2e.test.ts) with BOTH an operator and
 * an agent key configured, and drives it with real `fetch` calls.
 *
 * Requires `--allow-run=deno` — see CLAUDE.md's test commands.
 *
 * Uses its own fixed port (distinct from workflow-mvp-e2e.test.ts's 3142/3143) so the
 * two files can never collide even though `deno test` runs files sequentially by
 * default.
 */

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  apiCall,
  type ServerProcess,
  startServerProcess,
} from "./_helpers/serverProcess.ts";
import { sql } from "../src/db.ts";
import * as store from "../src/workflow/store.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL")!;
const OPERATOR_KEY = "operator-key-for-agent-boundary-test";
const AGENT_KEY = "agent-key-for-agent-boundary-test";

const AGENT_SPLIT_ENV: Record<string, string> = {
  DATABASE_URL,
  MEMORY_API_KEY: OPERATOR_KEY,
  AWCP_AGENT_API_KEY: AGENT_KEY,
  FEATURE_WORKFLOW: "true",
  FEATURE_ENTITY_WORKER: "false",
  FEATURE_CONSOLIDATION_WORKER: "false",
  FEATURE_EMBEDDING_BACKFILL: "false",
  MODEL_PROVIDER_ENABLED: "false",
};

/** SHA-256 hex, by the same rule remoteNodeHub.ts uses. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Observe a session into existence for the claim leg below, in THIS process.
 *
 * The spawned server shares `DATABASE_URL` with the test process, so a row written
 * here is a row that server reads. It goes in through `store.ingestRunEvents` rather
 * than a hand-written INSERT because a session that never travelled the node lane is
 * not the thing the claim route claims — and the node-lane HTTP route needs an
 * enrolment secret this test deliberately does not configure.
 *
 * The bearer is returned so the node — and, by cascade, its session and any claim on
 * it — can be dropped afterwards; `db-test` accumulates across runs.
 */
async function observeSession(): Promise<{ nodeId: string; sessionId: string; bearer: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const bearer = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

  const node = await store.upsertExecutionNode({
    bearerTokenHash: await sha256Hex(bearer),
    hostname: "agent-key-claim.test",
    platform: "deno-test",
    allowEnrolment: true,
  });
  assert(node !== null, "enrolment must succeed for a fresh bearer");

  const sessionId = `agent-key-claim-${crypto.randomUUID()}`;
  await store.ingestRunEvents(node.node_id, [{
    client_seq: 1,
    event_type: "session_start",
    payload: {
      session_id: sessionId,
      node_id: node.node_id,
      at: new Date().toISOString(),
    },
  }]);
  return { nodeId: node.node_id, sessionId, bearer };
}

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name: "ST-086 follow-up: the agent key may report and read but is refused on operator-only routes",
  fn: async () => {
    const server: ServerProcess = await startServerProcess(AGENT_SPLIT_ENV);
    try {
      // ---------------------------------------------------------------
      // No key at all -> 401, unchanged.
      // ---------------------------------------------------------------
      {
        const res = await fetch(`${server.baseUrl}/api/workflow/overview`);
        const body = await res.text();
        assertEquals(res.status, 401, body);
      }
      {
        const res = await fetch(`${server.baseUrl}/api/workflow/packets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "x", objective: "x", policyScope: "personal" }),
        });
        const body = await res.text();
        assertEquals(res.status, 401, body);
      }
      // An unrecognised key (neither operator nor agent) is likewise 401, not 403 —
      // it never gets far enough to be "authenticated but unauthorised".
      {
        const res = await apiCall(server.baseUrl, "not-a-real-key", "/api/workflow/overview");
        assertEquals(res.status, 401);
      }

      // ---------------------------------------------------------------
      // Agent key CAN: create a packet, register a run, record a checkpoint, record a
      // decision, end a run, and GET the overview / the packet view.
      // ---------------------------------------------------------------
      const packet = await apiCall(server.baseUrl, AGENT_KEY, "/api/workflow/packets", {
        method: "POST",
        body: JSON.stringify({
          title: "agent-key boundary probe",
          objective: "prove the agent key can report but not supervise",
          policyScope: "personal",
        }),
      });
      assertEquals(packet.status, 201, JSON.stringify(packet.body));
      const packetId = packet.body.id;

      const run = await apiCall(
        server.baseUrl,
        AGENT_KEY,
        `/api/workflow/packets/${packetId}/runs`,
        {
          method: "POST",
          body: JSON.stringify({ agentType: "local-cli", host: "test-host" }),
        },
      );
      assertEquals(run.status, 201, JSON.stringify(run.body));
      const runId = run.body.id;

      const checkpoint = await apiCall(
        server.baseUrl,
        AGENT_KEY,
        `/api/workflow/runs/${runId}/checkpoints`,
        {
          method: "POST",
          body: JSON.stringify({
            completedWork: "reported by the agent key",
            currentState: "probing the operator-only boundary",
          }),
        },
      );
      assertEquals(checkpoint.status, 201, JSON.stringify(checkpoint.body));

      const decision = await apiCall(
        server.baseUrl,
        AGENT_KEY,
        `/api/workflow/packets/${packetId}/decisions`,
        {
          method: "POST",
          body: JSON.stringify({ question: "may the agent key resolve this itself?", blocking: true }),
        },
      );
      assertEquals(decision.status, 201, JSON.stringify(decision.body));
      const decisionId = decision.body.id;

      const ended = await apiCall(server.baseUrl, AGENT_KEY, `/api/workflow/runs/${runId}/end`, {
        method: "POST",
      });
      assertEquals(ended.status, 200, JSON.stringify(ended.body));

      const overview = await apiCall(server.baseUrl, AGENT_KEY, "/api/workflow/overview");
      assertEquals(overview.status, 200, JSON.stringify(overview.body));

      const packetView = await apiCall(server.baseUrl, AGENT_KEY, `/api/workflow/packets/${packetId}`);
      assertEquals(packetView.status, 200, JSON.stringify(packetView.body));
      // The gap a reviewer flagged separately: a resuming agent can see whether the
      // decision it raised is still open.
      assertEquals(packetView.body.openDecisions.length, 1);

      // ---------------------------------------------------------------
      // Agent key CANNOT: resolve a decision, author a criterion, attach evidence, or
      // complete a packet. Each is a 403 — authenticated, not authorised.
      // ---------------------------------------------------------------
      const resolveDenied = await apiCall(
        server.baseUrl,
        AGENT_KEY,
        `/api/workflow/decisions/${decisionId}/resolve`,
        { method: "POST", body: JSON.stringify({ resolution: "self-approved" }) },
      );
      assertEquals(resolveDenied.status, 403, JSON.stringify(resolveDenied.body));

      const criterionDenied = await apiCall(
        server.baseUrl,
        AGENT_KEY,
        `/api/workflow/packets/${packetId}/criteria`,
        { method: "POST", body: JSON.stringify({ description: "self-authored", required: true }) },
      );
      assertEquals(criterionDenied.status, 403, JSON.stringify(criterionDenied.body));

      // The evidence and complete routes need a real criterion to target. The agent
      // key cannot create one (just proved above), so the OPERATOR key creates it
      // here purely as fixture setup for the next two denial checks.
      const criterion = await apiCall(
        server.baseUrl,
        OPERATOR_KEY,
        `/api/workflow/packets/${packetId}/criteria`,
        { method: "POST", body: JSON.stringify({ description: "fixture criterion", required: true }) },
      );
      assertEquals(criterion.status, 201, JSON.stringify(criterion.body));
      const criterionId = criterion.body.id;

      const evidenceDenied = await apiCall(
        server.baseUrl,
        AGENT_KEY,
        `/api/workflow/criteria/${criterionId}/evidence`,
        { method: "POST", body: JSON.stringify({ kind: "manual", detail: "self-certified" }) },
      );
      assertEquals(evidenceDenied.status, 403, JSON.stringify(evidenceDenied.body));

      const completeDenied = await apiCall(
        server.baseUrl,
        AGENT_KEY,
        `/api/workflow/packets/${packetId}/complete`,
        { method: "POST" },
      );
      assertEquals(completeDenied.status, 403, JSON.stringify(completeDenied.body));

      // The packet must genuinely be untouched by every refused call above — a 403
      // that had quietly written anyway would satisfy a status-only assertion while
      // breaking the invariant this whole split exists for.
      const stillOpen = await apiCall(server.baseUrl, OPERATOR_KEY, `/api/workflow/packets/${packetId}`);
      assertEquals(stillOpen.body.packet.status, "open");
      assertEquals(stillOpen.body.openDecisions.length, 1, "the decision must still be unresolved");

      // ---------------------------------------------------------------
      // ST-097 B2a: the two WorkItem write routes. An agent must never create a
      // WorkItem, and must never bind a packet to one — so both are operator-only,
      // and each gets the full triple: no key -> 401, agent key -> 403, operator key
      // -> success. The 401/403 pair is the load-bearing distinction: 403 means the
      // credential authenticated and the ROUTE refused it, which is a different fact
      // from "we did not recognise you" and must not be collapsed into it.
      //
      // These run on their own fresh packet rather than the one above, which is
      // completed a few lines further down. Binding to a completed packet is
      // undefined territory and nothing here should depend on it.
      // ---------------------------------------------------------------
      {
        const noKeyCreate = await fetch(`${server.baseUrl}/api/workflow/work-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceSystem: "awcp-native" }),
        });
        assertEquals(noKeyCreate.status, 401, await noKeyCreate.text());
      }

      const createItemDenied = await apiCall(
        server.baseUrl,
        AGENT_KEY,
        "/api/workflow/work-items",
        { method: "POST", body: JSON.stringify({ sourceSystem: "awcp-native" }) },
      );
      assertEquals(createItemDenied.status, 403, JSON.stringify(createItemDenied.body));

      const createItemOk = await apiCall(
        server.baseUrl,
        OPERATOR_KEY,
        "/api/workflow/work-items",
        { method: "POST", body: JSON.stringify({ sourceSystem: "awcp-native" }) },
      );
      assertEquals(createItemOk.status, 201, JSON.stringify(createItemOk.body));
      const workItemId = createItemOk.body.id;

      const bindTarget = await apiCall(server.baseUrl, AGENT_KEY, "/api/workflow/packets", {
        method: "POST",
        body: JSON.stringify({
          title: "binding target",
          objective: "an agent may still create a packet; it may not parent one",
          policyScope: "personal",
        }),
      });
      assertEquals(bindTarget.status, 201, JSON.stringify(bindTarget.body));
      const bindTargetId = bindTarget.body.id;

      // KTD-D4: `work_item_id` is never settable through POST /packets. The agent key
      // creating a packet is legal; the packet arriving parented would not be.
      const smuggled = await apiCall(server.baseUrl, AGENT_KEY, "/api/workflow/packets", {
        method: "POST",
        body: JSON.stringify({
          title: "smuggled binding",
          objective: "prove work_item_id cannot ride in on packet creation",
          policyScope: "personal",
          workItemId,
        }),
      });
      assertEquals(smuggled.status, 201, JSON.stringify(smuggled.body));
      assertEquals(
        smuggled.body.work_item_id,
        null,
        "an agent-created packet must never arrive already parented",
      );

      {
        const noKeyBind = await fetch(
          `${server.baseUrl}/api/workflow/packets/${bindTargetId}/work-item`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workItemId }),
          },
        );
        assertEquals(noKeyBind.status, 401, await noKeyBind.text());
      }

      const bindDenied = await apiCall(
        server.baseUrl,
        AGENT_KEY,
        `/api/workflow/packets/${bindTargetId}/work-item`,
        { method: "PATCH", body: JSON.stringify({ workItemId }) },
      );
      assertEquals(bindDenied.status, 403, JSON.stringify(bindDenied.body));

      // The refused bind must not have written. Read it back with the operator key.
      const stillUnparented = await apiCall(
        server.baseUrl,
        OPERATOR_KEY,
        `/api/workflow/packets/${bindTargetId}`,
      );
      assertEquals(stillUnparented.body.packet.work_item_id, null);

      const bindOk = await apiCall(
        server.baseUrl,
        OPERATOR_KEY,
        `/api/workflow/packets/${bindTargetId}/work-item`,
        { method: "PATCH", body: JSON.stringify({ workItemId }) },
      );
      assertEquals(bindOk.status, 200, JSON.stringify(bindOk.body));
      assertEquals(bindOk.body.work_item_id, workItemId);

      // ---------------------------------------------------------------
      // ST-097 B4: the claim route. Same full triple as the two above — no key -> 401,
      // agent key -> 403, operator key -> success — because the same silent failure
      // mode applies: `requiresOperator` returns false by default, so a claim route
      // merely omitted from OPERATOR_ONLY_ROUTES would be agent-reachable and nothing
      // would report it.
      //
      // The 401 and 403 legs need no session fixture: the middleware refuses before
      // any handler runs, and a fixture would let a 404 masquerade as a pass. The
      // operator leg needs a real observed session, so this one is observed through
      // the node lane in-process.
      // ---------------------------------------------------------------
      const observed = await observeSession();
      try {
        {
          const noKeyClaim = await fetch(
            `${server.baseUrl}/api/workflow/work-items/${workItemId}/sessions`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nodeId: observed.nodeId,
                sessionId: observed.sessionId,
              }),
            },
          );
          assertEquals(noKeyClaim.status, 401, await noKeyClaim.text());
        }

        const claimDenied = await apiCall(
          server.baseUrl,
          AGENT_KEY,
          `/api/workflow/work-items/${workItemId}/sessions`,
          {
            method: "POST",
            body: JSON.stringify({
              nodeId: observed.nodeId,
              sessionId: observed.sessionId,
            }),
          },
        );
        assertEquals(claimDenied.status, 403, JSON.stringify(claimDenied.body));

        // The refused claim must not have written. A 403 that had associated anyway
        // would satisfy a status-only assertion while breaking the invariant.
        const afterDenial = await sql<{ n: string }[]>`
          SELECT count(*)::text AS n FROM workflow.work_item_sessions
          WHERE node_id = ${observed.nodeId} AND session_id = ${observed.sessionId}
        `;
        assertEquals(Number(afterDenial[0].n), 0, "a refused claim must write nothing");

        const claimOk = await apiCall(
          server.baseUrl,
          OPERATOR_KEY,
          `/api/workflow/work-items/${workItemId}/sessions`,
          {
            method: "POST",
            body: JSON.stringify({
              nodeId: observed.nodeId,
              sessionId: observed.sessionId,
            }),
          },
        );
        assertEquals(claimOk.status, 201, JSON.stringify(claimOk.body));
        assertEquals(claimOk.body.work_item_id, workItemId);
        assertEquals(claimOk.body.session_id, observed.sessionId);
      } finally {
        const hash = await sha256Hex(observed.bearer);
        await sql`DELETE FROM workflow.execution_nodes WHERE bearer_token_hash = ${hash}`;
      }

      // ---------------------------------------------------------------
      // Discrimination control: the OPERATOR key CAN do every one of the four denied
      // actions above. This is what proves the 403s are the authorisation rule
      // firing — not the routes themselves being broken, misrouted, or 404ing under
      // both credentials alike.
      // ---------------------------------------------------------------
      const resolveOk = await apiCall(
        server.baseUrl,
        OPERATOR_KEY,
        `/api/workflow/decisions/${decisionId}/resolve`,
        { method: "POST", body: JSON.stringify({ resolution: "operator-approved" }) },
      );
      assertEquals(resolveOk.status, 200, JSON.stringify(resolveOk.body));

      const evidenceOk = await apiCall(
        server.baseUrl,
        OPERATOR_KEY,
        `/api/workflow/criteria/${criterionId}/evidence`,
        { method: "POST", body: JSON.stringify({ kind: "manual", detail: "operator-certified" }) },
      );
      assertEquals(evidenceOk.status, 201, JSON.stringify(evidenceOk.body));

      const completeOk = await apiCall(
        server.baseUrl,
        OPERATOR_KEY,
        `/api/workflow/packets/${packetId}/complete`,
        { method: "POST" },
      );
      assertEquals(completeOk.status, 200, JSON.stringify(completeOk.body));
      assertEquals(completeOk.body.status, "complete");

      // criterionDenied above proved the agent key cannot author a criterion; the
      // operator key doing the exact same call is the same style of discrimination
      // control, and doubles as fixture reuse (the packet is complete now, so this
      // must be refused for a DIFFERENT reason — criteria are frozen after
      // completion — not because the operator key is somehow also denied).
      const criterionAfterComplete = await apiCall(
        server.baseUrl,
        OPERATOR_KEY,
        `/api/workflow/packets/${packetId}/criteria`,
        { method: "POST", body: JSON.stringify({ description: "too late", required: true }) },
      );
      assertEquals(criterionAfterComplete.status, 409, JSON.stringify(criterionAfterComplete.body));
    } finally {
      await server.stop();
    }
  },
});
