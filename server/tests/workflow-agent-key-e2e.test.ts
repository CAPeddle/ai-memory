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

const DATABASE_URL = Deno.env.get("DATABASE_URL")!;
const OPERATOR_KEY = "operator-key-for-agent-boundary-test";
const AGENT_KEY = "agent-key-for-agent-boundary-test";
const PORT = 3144;

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

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name: "ST-086 follow-up: the agent key may report and read but is refused on operator-only routes",
  fn: async () => {
    const server: ServerProcess = await startServerProcess(AGENT_SPLIT_ENV, PORT);
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
