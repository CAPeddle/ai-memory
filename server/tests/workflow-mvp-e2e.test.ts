/**
 * ST-086 — one local WorkPacket operated end to end, across a real process boundary.
 *
 * **Why this test spawns a server instead of calling route functions.** Four of the
 * story's acceptance criteria are properties of a *process*, and none of them can be
 * observed from inside the test's own runtime:
 *
 *   - "workflow migrations are invoked by the deployed composition root" — calling
 *     `ensureWorkflowSchema()` from a test proves the function works, not that
 *     anything at boot calls it;
 *   - "starts without OpenRouter credentials" — the test runner *has* those
 *     credentials, so only a child with a controlled environment can show this;
 *   - "operational state survives an actual server restart" — needs an actual restart;
 *   - "zero model-provider requests" — needs something outside the process watching.
 *
 * The existing workflow suites (migrations, failure isolation, concurrency, boundary,
 * store, attention) are retained unchanged and are NOT duplicated here in weaker form.
 * This file only asserts what a process boundary is required to show.
 *
 * Requires `--allow-run`. See CLAUDE.md's test commands.
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import {
  apiCall,
  type ProviderSentinel,
  type ServerProcess,
  startProviderSentinel,
  startServerProcess,
} from "./_helpers/serverProcess.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL")!;
const API_KEY = Deno.env.get("MEMORY_API_KEY") ?? "test-key";

/** High, uncommon ports: the container's own server already holds 3000. */
const WORKFLOW_PORT = 3142;
const CONTROL_PORT = 3143;

/**
 * The workflow-only environment, exactly as the story specifies it.
 *
 * `OPENROUTER_API_KEY` is ABSENT rather than empty. Combined with `clearEnv: true` in
 * the spawn helper, that makes its absence a fact about the child process rather than
 * a hope about the parent's.
 */
function workflowOnlyEnv(sentinel: ProviderSentinel): Record<string, string> {
  return {
    DATABASE_URL,
    MEMORY_API_KEY: API_KEY,
    FEATURE_WORKFLOW: "true",
    FEATURE_ENTITY_WORKER: "false",
    FEATURE_CONSOLIDATION_WORKER: "false",
    FEATURE_EMBEDDING_BACKFILL: "false",
    MODEL_PROVIDER_ENABLED: "false",
    // Any provider call the server makes lands on the sentinel and is counted.
    OPENROUTER_BASE_URL: sentinel.baseUrl,
  };
}

async function workflowSchemaExists(): Promise<boolean> {
  const rows = await sql<{ n: string }[]>`
    SELECT count(*) AS n FROM information_schema.schemata WHERE schema_name = 'workflow'
  `;
  return Number(rows[0].n) > 0;
}

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name: "ST-086: a local WorkPacket is operated end to end and survives a restart",
  fn: async (t) => {
    const sentinel = await startProviderSentinel();
    // Every process this test starts, so the cleanup below stops all of them even if
    // a step fails between the first boot and the restart.
    const started: ServerProcess[] = [];
    const boot = async (port: number): Promise<ServerProcess> => {
      const proc = await startServerProcess(workflowOnlyEnv(sentinel), port);
      started.push(proc);
      return proc;
    };
    let server: ServerProcess | null = null;
    let packetId = "";

    try {
      // ------------------------------------------------------------------
      await t.step("a clean database has no workflow schema at all", async () => {
        await sql.unsafe("DROP SCHEMA IF EXISTS workflow CASCADE");
        assertEquals(
          await workflowSchemaExists(),
          false,
          "precondition: the workflow schema must be absent before the server boots, " +
            "or 'startup applied the migrations' proves nothing",
        );
      });

      // ------------------------------------------------------------------
      await t.step("the composition root applies workflow migrations at startup", async () => {
        server = await boot(WORKFLOW_PORT);

        assert(
          await workflowSchemaExists(),
          "the workflow schema does not exist after boot — startup did not apply the migrations",
        );

        // The ledger is the module's own record of what it applied. Both migrations,
        // in order, from nothing.
        const ledger = await sql<{ version: number; filename: string }[]>`
          SELECT version, filename FROM workflow.schema_migrations ORDER BY version
        `;
        assertEquals(ledger.map((r) => r.version), [1, 2]);
        assertEquals(ledger.map((r) => r.filename), [
          "001_workflow_schema.sql",
          "002_decision_run_packet_integrity.sql",
        ]);

        // ...and the composition root said so, from inside the process.
        assertStringIncludes(server.output(), "Workflow Operations: enabled");
        assertStringIncludes(server.output(), "001_workflow_schema.sql");

        // /ready surfaces workflow readiness for an external orchestrator.
        const ready = await apiCall(server.baseUrl, API_KEY, "/ready");
        assertEquals(ready.status, 200);
        assertEquals(ready.body.checks.workflow.status, "ok");
        assertEquals(ready.body.checks.workflow.applied, [
          "001_workflow_schema.sql",
          "002_decision_run_packet_integrity.sql",
        ]);
      });

      // ------------------------------------------------------------------
      await t.step("the API requires authentication", async () => {
        const res = await fetch(`${server!.baseUrl}/api/workflow/overview`);
        const body = await res.text();
        assertEquals(res.status, 401, `expected 401, got ${res.status}: ${body}`);
      });

      // ------------------------------------------------------------------
      await t.step("policy scope fails closed", async () => {
        const missing = await apiCall(server!.baseUrl, API_KEY, "/api/workflow/packets", {
          method: "POST",
          body: JSON.stringify({ title: "no scope", objective: "should be refused" }),
        });
        assertEquals(missing.status, 400, "a packet with no policy scope must be refused");

        const invalid = await apiCall(server!.baseUrl, API_KEY, "/api/workflow/packets", {
          method: "POST",
          body: JSON.stringify({
            title: "bad scope",
            objective: "should be refused",
            policyScope: "everyone",
          }),
        });
        assertEquals(invalid.status, 400, "a scope outside the closed vocabulary must be refused");

        // Discrimination: the same request with a real scope succeeds, so the two
        // 400s above are the scope rule firing and not the endpoint being broken.
        const ok = await apiCall(server!.baseUrl, API_KEY, "/api/workflow/packets", {
          method: "POST",
          body: JSON.stringify({
            title: "scope control",
            objective: "proves the refusals above are the scope rule",
            policyScope: "personal",
          }),
        });
        assertEquals(ok.status, 201);
        await apiCall(server!.baseUrl, API_KEY, `/api/workflow/packets/${ok.body.id}`);
      });

      // ------------------------------------------------------------------
      await t.step("a policy-scoped packet, a local run and checkpoints", async () => {
        const packet = await apiCall(server!.baseUrl, API_KEY, "/api/workflow/packets", {
          method: "POST",
          body: JSON.stringify({
            title: "ST-086 local slice",
            objective: "operate one WorkPacket end to end without model-provider access",
            scope: "server/src/workflow, server/scripts",
            constraints: "no remote collector, no offline spool",
            repository: "/home/dev/ai-memory",
            branch: "feat/st-086-awcp-local-mvp",
            policyScope: "personal",
          }),
        });
        assertEquals(packet.status, 201);
        packetId = packet.body.id;
        assertEquals(packet.body.policy_scope, "personal");
        assertEquals(packet.body.status, "open");

        const run = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/packets/${packetId}/runs`,
          {
            method: "POST",
            body: JSON.stringify({
              agentType: "local-cli",
              host: "test-host",
              workingDir: "/home/dev/ai-memory",
              branch: "feat/st-086-awcp-local-mvp",
            }),
          },
        );
        assertEquals(run.status, 201);
        const runId = run.body.id;

        const first = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/runs/${runId}/checkpoints`,
          {
            method: "POST",
            body: JSON.stringify({
              completedWork: "composition-root seam and typed API",
              currentState: "routes mounted behind bearer auth",
              nextAction: "wire the dashboard",
              repoCommit: "0123456789abcdef0123456789abcdef01234567",
            }),
          },
        );
        assertEquals(first.status, 201);
        assertEquals(first.body.repo_commit, "0123456789abcdef0123456789abcdef01234567");

        const second = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/runs/${runId}/checkpoints`,
          {
            method: "POST",
            body: JSON.stringify({
              completedWork: "dashboard rendered",
              currentState: "awaiting verification evidence",
              blockers: "needs a decision on the restart proof",
            }),
          },
        );
        assertEquals(second.status, 201);

        // A checkpoint against a run that does not exist is the caller's mistake, not
        // an internal failure. Without the foreign-key branch in toHttpError this is a
        // 500, which invites a retry of a request that can never succeed.
        const orphan = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/runs/${crypto.randomUUID()}/checkpoints`,
          {
            method: "POST",
            body: JSON.stringify({ completedWork: "x", currentState: "y" }),
          },
        );
        assertEquals(orphan.status, 404);
      });

      // ------------------------------------------------------------------
      await t.step("a blocking decision raises deterministic attention, then resolves", async () => {
        const decision = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/packets/${packetId}/decisions`,
          {
            method: "POST",
            body: JSON.stringify({
              question: "Prove the restart with SIGTERM or a container restart?",
              rationale: "SIGTERM is what the supervisor sends",
              blocking: true,
            }),
          },
        );
        assertEquals(decision.status, 201);
        const decisionId = decision.body.id;

        const before = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/packets/${packetId}`,
        );
        assertEquals(before.status, 200);
        const reasons = before.body.attention.map((a: { reason: string }) => a.reason);
        assert(
          reasons.includes("decision-required"),
          `expected decision-required attention, got ${JSON.stringify(reasons)}`,
        );
        assert(
          reasons.includes("blocked"),
          `expected the checkpoint blocker to raise 'blocked', got ${JSON.stringify(reasons)}`,
        );
        assertEquals(before.body.openDecisions.length, 1);
        // Policy scope is inherited from the packet and reported once.
        assertEquals(before.body.policyScope, "personal");
        assertEquals(before.body.branch, "feat/st-086-awcp-local-mvp");

        const resolved = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/decisions/${decisionId}/resolve`,
          { method: "POST", body: JSON.stringify({ resolution: "SIGTERM" }) },
        );
        assertEquals(resolved.status, 200);
        assertEquals(resolved.body.status, "resolved");

        // Once-and-final, across the HTTP boundary: same answer is idempotent...
        const retry = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/decisions/${decisionId}/resolve`,
          { method: "POST", body: JSON.stringify({ resolution: "SIGTERM" }) },
        );
        assertEquals(retry.status, 200);
        assertEquals(retry.body.resolved_at, resolved.body.resolved_at);

        // ...a different answer is a conflict, not an overwrite.
        const conflict = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/decisions/${decisionId}/resolve`,
          { method: "POST", body: JSON.stringify({ resolution: "container restart" }) },
        );
        assertEquals(conflict.status, 409);

        const after = await apiCall(server!.baseUrl, API_KEY, `/api/workflow/packets/${packetId}`);
        const afterReasons = after.body.attention.map((a: { reason: string }) => a.reason);
        assert(
          !afterReasons.includes("decision-required"),
          "resolving the decision must clear its attention item",
        );
      });

      // ------------------------------------------------------------------
      await t.step("completion is refused before evidence and granted after", async () => {
        const criterion = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/packets/${packetId}/criteria`,
          {
            method: "POST",
            body: JSON.stringify({
              description: "the slice starts with no provider credential",
              required: true,
            }),
          },
        );
        assertEquals(criterion.status, 201);
        const criterionId = criterion.body.id;

        // The gate refuses, names the unmet criterion, and — the part worth asserting
        // separately — leaves the packet unchanged. A 409 that had already written
        // `complete` would satisfy a status-only assertion while breaking the invariant.
        const refused = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/packets/${packetId}/complete`,
          { method: "POST" },
        );
        assertEquals(refused.status, 409);
        assertEquals(refused.body.unmetCriteria, [
          "the slice starts with no provider credential",
        ]);

        const [stillOpen] = await sql<{ status: string }[]>`
          SELECT status FROM workflow.work_packets WHERE id = ${packetId}
        `;
        assert(
          stillOpen.status !== "complete",
          "the refused completion must not have marked the packet complete",
        );

        const evidence = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/criteria/${criterionId}/evidence`,
          {
            method: "POST",
            body: JSON.stringify({
              kind: "manual",
              detail: "child process spawned with clearEnv and no OPENROUTER_API_KEY",
            }),
          },
        );
        assertEquals(evidence.status, 201);

        const ready = await apiCall(server!.baseUrl, API_KEY, `/api/workflow/packets/${packetId}`);
        const readyReasons = ready.body.attention.map((a: { reason: string }) => a.reason);
        assert(
          readyReasons.includes("ready-for-review"),
          `expected ready-for-review once evidence is attached, got ${JSON.stringify(readyReasons)}`,
        );

        const completed = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/packets/${packetId}/complete`,
          { method: "POST" },
        );
        assertEquals(completed.status, 200);
        assertEquals(completed.body.status, "complete");

        // The contract is frozen afterwards — proven through the API, not just the store.
        const frozen = await apiCall(
          server!.baseUrl,
          API_KEY,
          `/api/workflow/packets/${packetId}/criteria`,
          { method: "POST", body: JSON.stringify({ description: "too late", required: true }) },
        );
        assertEquals(frozen.status, 409);
      });

      // ------------------------------------------------------------------
      await t.step("the dashboard is served from the same deployment", async () => {
        const res = await fetch(`${server!.baseUrl}/workflow`);
        assertEquals(res.status, 200);
        assertStringIncludes(res.headers.get("content-type") ?? "", "text/html");
        const html = await res.text();
        assertStringIncludes(html, "Workflow Operations");

        // The page must carry every section the story requires and the three
        // interactions, and no more. This is a CONTRACT check on the served asset,
        // not a rendering test: there is no browser in the test container, so what is
        // proven here is that the affordances exist in the page and that each one
        // targets the authenticated endpoint the e2e steps above already exercised.
        // Actual DOM rendering is unproven by automation — recorded, not implied.
        for (const section of [
          "Attention",
          "Runs",
          "Unresolved decisions",
          "Recent checkpoints",
          "Verification criteria",
        ]) {
          assertStringIncludes(html, section);
        }
        for (const action of ["/resolve", "/evidence", "/complete"]) {
          assertStringIncludes(html, action);
        }
        assertStringIncludes(html, "sessionStorage");

        // No status-editing affordance: completion goes through the gate, and there is
        // no route behind which a packet status could be set directly.
        assert(
          !/setPacketStatus|\/status\b/.test(html),
          "the dashboard must not offer a direct packet-status control",
        );

        // The shell carries no operational content — it fetches everything.
        assert(
          !html.includes(packetId),
          "the dashboard shell must not embed operational data",
        );
      });

      // ------------------------------------------------------------------
      await t.step("operational state survives an actual server restart", async () => {
        await server!.stop();
        // The port must actually be free, or the "restart" would be the old process.
        let stillUp = true;
        try {
          const probe = await fetch(`${server!.baseUrl}/health`);
          await probe.body?.cancel();
        } catch {
          stillUp = false;
        }
        assertEquals(stillUp, false, "the first server process did not actually stop");

        server = await boot(WORKFLOW_PORT);

        // Composition-root idempotency: the second boot applies nothing and skips
        // everything. Distinct from the unit-level idempotency workflow-migrations
        // already proves — this is the deployed path running twice.
        const ready = await apiCall(server.baseUrl, API_KEY, "/ready");
        assertEquals(ready.body.checks.workflow.applied, []);
        assertEquals(ready.body.checks.workflow.skipped, [
          "001_workflow_schema.sql",
          "002_decision_run_packet_integrity.sql",
        ]);

        const view = await apiCall(server.baseUrl, API_KEY, `/api/workflow/packets/${packetId}`);
        assertEquals(view.status, 200);
        assertEquals(view.body.packet.status, "complete");
        assertEquals(view.body.policyScope, "personal");
        assertEquals(view.body.runs.length, 1);
        assertEquals(view.body.recentCheckpoints.length, 2);
        assertEquals(view.body.recentlyResolvedDecisions.length, 1);
        assertEquals(view.body.recentlyResolvedDecisions[0].resolution, "SIGTERM");
        assertEquals(view.body.criteria.length, 1);
        assertEquals(view.body.criteria[0].evidence.length, 1);
        assertEquals(view.body.criteria[0].satisfied, true);

        // A complete packet leaves the active overview, which is what the operator
        // dashboard is filtered on.
        const overview = await apiCall(server.baseUrl, API_KEY, "/api/workflow/overview");
        const ids = overview.body.packets.map((p: { packet: { id: string } }) => p.packet.id);
        assert(!ids.includes(packetId), "a complete packet must leave the active overview");
      });

      // ------------------------------------------------------------------
      await t.step("the whole slice made zero model-provider requests", () => {
        assertEquals(
          sentinel.hits,
          [],
          `the provider sentinel recorded ${sentinel.hits.length} request(s): ` +
            JSON.stringify(sentinel.hits),
        );
      });
    } finally {
      for (const proc of started) await proc.stop();
      await sentinel.close();
      // Restore the schema for whatever runs next. Without this, a failure above
      // leaves the shared test database without `workflow` and every later workflow
      // suite fails for a reason that has nothing to do with its own subject.
      const { ensureWorkflowSchema } = await import("../src/workflow/schema.ts");
      await ensureWorkflowSchema();
    }
  },
});

/**
 * Red/green control for the sentinel and for the provider gate it measures.
 *
 * The test above proves the sentinel counted zero. On its own that is a non-vacuity
 * gap: a sentinel that records nothing, a base URL that never reached the server, or a
 * `/ready` route that silently stopped probing would all produce the same green.
 *
 * So: boot the SAME server with the provider ENABLED, hit the same `/ready`, and
 * require the sentinel to record the call. Same sentinel, same route, same code path —
 * only `MODEL_PROVIDER_ENABLED` differs. That makes the zero above a discriminating
 * result rather than a quiet one, and it is the direct demonstration that the new gate
 * in `probeEmbeddingApi` is what suppressed the request.
 */
Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name: "ST-086 control: with the provider ENABLED, the same /ready does call it",
  fn: async () => {
    const sentinel = await startProviderSentinel();
    const started: ServerProcess[] = [];
    try {
      const server = await startServerProcess({
        DATABASE_URL,
        MEMORY_API_KEY: API_KEY,
        FEATURE_WORKFLOW: "true",
        FEATURE_ENTITY_WORKER: "false",
        FEATURE_CONSOLIDATION_WORKER: "false",
        FEATURE_EMBEDDING_BACKFILL: "false",
        // The single difference from workflowOnlyEnv.
        MODEL_PROVIDER_ENABLED: "true",
        OPENROUTER_API_KEY: "sentinel-key",
        OPENROUTER_BASE_URL: sentinel.baseUrl,
      }, CONTROL_PORT);
      started.push(server);

      const ready = await apiCall(server.baseUrl, API_KEY, "/ready");
      assertEquals(ready.status, 200);

      assert(
        sentinel.hits.length > 0,
        "the sentinel recorded nothing even with the provider ENABLED — it cannot " +
          "detect a provider request, so the zero-request assertion proves nothing",
      );
      const models = sentinel.hits.find((h) => h.path.endsWith("/models"));
      assert(
        models !== undefined,
        `expected a /models probe, got ${JSON.stringify(sentinel.hits)}`,
      );
      assertEquals(models.authorization, "Bearer sentinel-key");
    } finally {
      for (const proc of started) await proc.stop();
      await sentinel.close();
    }
  },
});
