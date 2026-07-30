/**
 * ST-084 spike — criterion 3: failure isolation.
 *
 * The plan's failure experiments, restricted to the four in Stage 1 scope
 * (1 knowledge search, 2 knowledge promotion, 3 graph unavailability,
 * 7 central-service restart after acknowledgement). Experiments 4–6 concern the
 * remote execution node and are Stage 2.
 *
 * Expected outcome in every case: authoritative operational state survives
 * unchanged, and the failed optional operation is visible and retryable.
 */

import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import * as store from "../src/workflow/store.ts";
import {
  attentionForPacket,
  gatherAdvisoryContext,
  resolveAndPromoteDecision,
} from "../src/workflow/service.ts";
import { FailingMemoryAdapter, NoopMemoryAdapter } from "../src/workflow/ports.ts";
import { WorkflowNotFoundError } from "../src/workflow/types.ts";

const T = { sanitizeResources: false, sanitizeOps: false };

async function newPacket(title: string) {
  return await store.createPacket({
    title,
    objective: "failure isolation experiment",
    policyScope: "personal",
  });
}

Deno.test({
  ...T,
  name: "experiment 1: knowledge SEARCH failure degrades to empty, never blocks operations",
  fn: async () => {
    const packet = await newPacket("exp1 search failure");
    try {
      const failing = new FailingMemoryAdapter("knowledge search is down");

      const ctx = await gatherAdvisoryContext("prior decisions", failing);
      assertEquals(ctx.results, []);
      assertEquals(ctx.degraded, true);
      assert(ctx.error?.includes("knowledge search is down"));

      // Operational work proceeds regardless.
      const run = await store.registerRun({
        packetId: packet.id,
        agentType: "claude-code",
        host: "local",
      });
      await store.recordCheckpoint({
        runId: run.id,
        completedWork: "worked with no advisory context",
        currentState: "fine",
      });
      const criterion = await store.addCriterion(packet.id, "c", true);
      await store.attachEvidence({ criterionId: criterion.id, kind: "manual", detail: "e" });
      const completed = await store.completePacket(packet.id);
      assertEquals(completed.status, "complete");
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "experiment 2: knowledge PROMOTION failure leaves the decision authoritative",
  fn: async () => {
    const packet = await newPacket("exp2 promotion failure");
    try {
      const decision = await store.recordDecision({
        packetId: packet.id,
        question: "adopt the workflow schema?",
      });

      const outcome = await resolveAndPromoteDecision(
        decision.id,
        "yes — separate schema",
        new FailingMemoryAdapter("promotion backend unavailable"),
      );

      // The optional projection failed...
      assertEquals(outcome.promoted, false);
      assert(outcome.error?.includes("promotion backend unavailable"));

      // ...and the authoritative operational write survived it, committed.
      const persisted = await store.getDecision(decision.id);
      assertEquals(persisted?.status, "resolved");
      assertEquals(persisted?.resolution, "yes — separate schema");
      assertEquals(
        persisted?.promoted_memory_ref,
        null,
        "a failed projection must leave no dangling reference",
      );
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "experiment 2b: promotion failure does not block packet completion",
  fn: async () => {
    const packet = await newPacket("exp2b completion despite promotion failure");
    try {
      const decision = await store.recordDecision({
        packetId: packet.id,
        question: "ship it?",
      });
      await resolveAndPromoteDecision(decision.id, "ship", new FailingMemoryAdapter());

      const criterion = await store.addCriterion(packet.id, "reviewed", true);
      await store.attachEvidence({
        criterionId: criterion.id,
        kind: "manual",
        detail: "reviewed by operator",
      });

      const completed = await store.completePacket(packet.id);
      assertEquals(completed.status, "complete");
      assert(completed.completed_at !== null);
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "experiment 2c: deleting the memory projection leaves the decision intact",
  fn: async () => {
    // "Deleting an optional promoted memory item cannot damage operational history."
    const packet = await newPacket("exp2c projection deletion");
    try {
      const decision = await store.recordDecision({
        packetId: packet.id,
        question: "record this?",
      });
      const outcome = await resolveAndPromoteDecision(
        decision.id,
        "recorded",
        new NoopMemoryAdapter(),
      );
      assertEquals(outcome.promoted, true);
      assert(outcome.decision.promoted_memory_ref !== null);

      // Simulate the memory-side row being deleted out from under us.
      await store.clearPromotionRef(decision.id);

      const after = await store.getDecision(decision.id);
      assertEquals(after?.status, "resolved", "decision must survive projection loss");
      assertEquals(after?.resolution, "recorded");
      assertEquals(after?.promoted_memory_ref, null);
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "experiment 3a: a FAILED graph query does not pollute search_path (it rolls back)",
  fn: async () => {
    // Corrects a real error in this file's first version. That version ran a
    // FAILING AGE query and asserted the connection "may now carry a polluted
    // search_path" — but a failed statement aborts the implicit transaction and
    // rolls the SET back with it, so pollution cannot occur on this path. The old
    // test therefore exercised the one branch where the hazard is impossible while
    // claiming to prove the opposite. Verified against the real PG15+AGE container.
    const reserved = await sql.reserve();
    try {
      let graphFailed = false;
      try {
        await reserved.unsafe(`
          LOAD 'age';
          SET search_path = ag_catalog, "$user", public;
          SELECT * FROM cypher('__nonexistent_graph__', $$ MATCH (n) RETURN n $$) AS t(result agtype);
        `);
      } catch {
        graphFailed = true;
      }
      assert(graphFailed, "expected the nonexistent-graph query to fail");

      const [{ search_path }] = await reserved<{ search_path: string }[]>`SHOW search_path`;
      assert(
        !search_path.includes("ag_catalog"),
        `a failed statement must roll its SET back, but search_path is "${search_path}"`,
      );
    } finally {
      await reserved.release();
    }
  },
});

Deno.test({
  ...T,
  name: "experiment 3b: schema-qualified workflow SQL resolves on a GENUINELY polluted connection",
  fn: async () => {
    // The real hazard: a SUCCEEDING search_path change persists for the life of a
    // pooled connection. This is the test that actually proves qualification is
    // what defeats it. A reserved connection is required — on the shared pool there
    // is no guarantee the polluted connection is the one the next query lands on.
    const reserved = await sql.reserve();
    try {
      await reserved.unsafe(`
        LOAD 'age';
        SET search_path = ag_catalog, "$user", public;
        SELECT 1;
      `);

      const [{ search_path }] = await reserved<{ search_path: string }[]>`SHOW search_path`;
      assert(
        search_path.includes("ag_catalog"),
        `expected a persisted polluted search_path, got "${search_path}"`,
      );

      // `workflow` is NOT on that path. A qualified reference must still resolve...
      const rows = await reserved<{ n: string }[]>`
        SELECT count(*) AS n FROM workflow.work_packets
      `;
      assert(Number(rows[0].n) >= 0, "qualified workflow query must resolve when polluted");

      // ...and an UNQUALIFIED one must fail, proving the qualification is doing the
      // work rather than the path happening to contain `workflow` anyway.
      let unqualifiedFailed = false;
      try {
        await reserved.unsafe(`SELECT count(*) FROM work_packets`);
      } catch {
        unqualifiedFailed = true;
      }
      assert(
        unqualifiedFailed,
        "unqualified work_packets resolved unexpectedly — the test proves nothing",
      );
    } finally {
      await reserved.release();
    }
  },
});

Deno.test({
  ...T,
  name: "experiment 3c: the full slice completes after a graph failure",
  fn: async () => {
    // The surviving half of the original experiment 3, stated honestly: the
    // workflow module issues no Cypher, so an AGE outage is invisible to it. This
    // is an isolation test, NOT a search_path test (see 3a/3b for that).
    const packet = await newPacket("exp3c graph unavailable");
    try {
      let graphFailed = false;
      try {
        await sql.unsafe(
          `SELECT * FROM cypher('__nonexistent_graph__', $$ MATCH (n) RETURN n $$) AS t(result agtype);`,
        );
      } catch {
        graphFailed = true;
      }
      assert(graphFailed, "expected the nonexistent-graph query to fail");

      const run = await store.registerRun({
        packetId: packet.id,
        agentType: "claude-code",
        host: "local",
      });
      await store.recordCheckpoint({
        runId: run.id,
        completedWork: "after graph failure",
        currentState: "unaffected",
      });
      const criterion = await store.addCriterion(packet.id, "unaffected by graph", true);
      await store.attachEvidence({ criterionId: criterion.id, kind: "manual", detail: "ok" });

      const completed = await store.completePacket(packet.id);
      assertEquals(completed.status, "complete");
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "experiment 7: state survives a simulated central-service restart",
  fn: async () => {
    // A restart is modelled as: everything in-process is discarded, and state is
    // re-read from the database alone. Nothing operational may live only in memory.
    const packet = await newPacket("exp7 restart");
    try {
      const run = await store.registerRun({
        packetId: packet.id,
        agentType: "claude-code",
        host: "local",
      });
      await store.recordCheckpoint({
        runId: run.id,
        completedWork: "before restart",
        currentState: "mid-flight",
        blockers: "waiting on operator",
      });
      const decision = await store.recordDecision({
        packetId: packet.id,
        runId: run.id,
        question: "resume after restart?",
      });
      const criterion = await store.addCriterion(packet.id, "survives restart", true);

      // --- simulated restart boundary: drop every in-process handle ---

      const rehydratedPacket = await store.getPacket(packet.id);
      const rehydratedRuns = await store.listRuns(packet.id);
      const rehydratedCheckpoints = await store.listCheckpoints(packet.id);
      const rehydratedDecisions = await store.listDecisions(packet.id);
      const rehydratedCriteria = await store.listCriteria(packet.id);

      assertEquals(rehydratedPacket?.id, packet.id);
      assertEquals(rehydratedRuns.length, 1);
      assertEquals(rehydratedRuns[0].id, run.id);
      assertEquals(rehydratedCheckpoints.length, 1);
      assertEquals(rehydratedCheckpoints[0].blockers, "waiting on operator");
      assertEquals(rehydratedDecisions.length, 1);
      assertEquals(rehydratedDecisions[0].id, decision.id);
      assertEquals(rehydratedCriteria.length, 1);
      assertEquals(rehydratedCriteria[0].id, criterion.id);

      // Attention is recomputed deterministically from rehydrated state alone.
      const attention = await attentionForPacket(packet.id);
      const reasons = attention.map((a) => a.reason).sort();
      assertEquals(reasons, ["blocked", "decision-required"]);

      // And the completion gate still refuses — the gate is state, not memory.
      let refused = false;
      try {
        await store.completePacket(packet.id);
      } catch {
        refused = true;
      }
      assert(refused, "completion gate must still refuse after a restart");
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "promotion carries the packet's REAL policy scope, not a hardcoded default",
  fn: async () => {
    // Closes the gap that hid a live defect: promotion hardcoded `personal` for
    // every packet, so corporate/mixed/public decisions were silently mislabelled
    // on the way into the memory domain. Every test previously used personal-scoped
    // packets, so nothing caught it. Assert the value the port actually receives.
    for (const scope of ["corporate", "mixed", "public", "personal"] as const) {
      const packet = await store.createPacket({
        title: `scope fidelity ${scope}`,
        objective: "promotion must carry this scope verbatim",
        policyScope: scope,
      });
      try {
        const decision = await store.recordDecision({
          packetId: packet.id,
          question: `decided under ${scope}`,
        });
        const noop = new NoopMemoryAdapter();
        const outcome = await resolveAndPromoteDecision(decision.id, "done", noop);

        assertEquals(outcome.promoted, true);
        assertEquals(noop.promotionCalls.length, 1);
        assertEquals(
          noop.promotionCalls[0].policyScope,
          scope,
          `promotion must forward the packet's ${scope} scope, never a default`,
        );
      } finally {
        await store.deletePacket(packet.id);
      }
    }
  },
});

Deno.test({
  ...T,
  name: "promotion distinguishes 'never happened' from 'happened but ref lost'",
  fn: async () => {
    // The two must not collapse into promoted:false. A caller retrying on
    // "projection failed" when the projection actually succeeded creates a
    // duplicate, because the port carries no dedup contract.
    const packet = await newPacket("refLost distinction");
    try {
      // Case 1: the port itself fails -> genuinely not promoted, safe to retry.
      const d1 = await store.recordDecision({ packetId: packet.id, question: "q1" });
      const failed = await resolveAndPromoteDecision(d1.id, "r1", new FailingMemoryAdapter());
      assertEquals(failed.promoted, false);
      assertEquals(failed.refLost, false, "a port failure is not a lost ref");
      assertEquals(failed.ref, null);

      // Case 2: the port succeeds -> promoted, ref recorded, nothing lost.
      const d2 = await store.recordDecision({ packetId: packet.id, question: "q2" });
      const ok = await resolveAndPromoteDecision(d2.id, "r2", new NoopMemoryAdapter());
      assertEquals(ok.promoted, true);
      assertEquals(ok.refLost, false);
      assert(ok.ref !== null);

      // Both decisions remain authoritative regardless of projection outcome.
      assertEquals((await store.getDecision(d1.id))?.status, "resolved");
      assertEquals((await store.getDecision(d2.id))?.status, "resolved");
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "resolving an unknown decision id raises a typed not-found error",
  fn: async () => {
    // Previously returned `undefined` typed as OperationalDecision, surfacing
    // downstream as an opaque TypeError misattributed to promotion failure.
    await assertRejects(
      () =>
        resolveAndPromoteDecision(
          "00000000-0000-4000-8000-000000000000",
          "nope",
          new NoopMemoryAdapter(),
        ),
      WorkflowNotFoundError,
    );
  },
});

Deno.test({
  ...T,
  name: "isolation: a failing memory adapter cannot roll back a workflow transaction",
  fn: async () => {
    // The structural guarantee behind experiments 1-2: promotion runs strictly
    // after the operational commit, never inside its transaction.
    const packet = await newPacket("no cross-domain transaction");
    try {
      const decision = await store.recordDecision({
        packetId: packet.id,
        question: "atomicity check",
      });

      const before = await sql<{ n: string }[]>`
        SELECT count(*) AS n FROM workflow.operational_decisions WHERE packet_id = ${packet.id}
      `;
      await resolveAndPromoteDecision(decision.id, "resolved anyway", new FailingMemoryAdapter());
      const after = await sql<{ n: string }[]>`
        SELECT count(*) AS n FROM workflow.operational_decisions WHERE packet_id = ${packet.id}
      `;

      assertEquals(Number(before[0].n), Number(after[0].n), "row count must be unchanged");
      const persisted = await store.getDecision(decision.id);
      assertEquals(persisted?.status, "resolved");
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});
