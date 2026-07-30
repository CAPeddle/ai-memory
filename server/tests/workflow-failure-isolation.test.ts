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

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import * as store from "../src/workflow/store.ts";
import {
  attentionForPacket,
  gatherAdvisoryContext,
  resolveAndPromoteDecision,
} from "../src/workflow/service.ts";
import { FailingMemoryAdapter, NoopMemoryAdapter } from "../src/workflow/ports.ts";

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
  name: "experiment 3: graph unavailability does not affect operational state",
  fn: async () => {
    // The workflow module issues no Cypher at all, so an AGE outage is invisible
    // to it. Proven by breaking the graph inside a transaction and exercising the
    // full slice against it: search_path pollution and a missing graph must not
    // reach workflow tables.
    const packet = await newPacket("exp3 graph unavailable");
    try {
      // Confirm the graph path genuinely fails while workflow work continues.
      let graphFailed = false;
      try {
        await sql.unsafe(`
          LOAD 'age';
          SET search_path = ag_catalog, "$user", public;
          SELECT * FROM cypher('__nonexistent_graph__', $$ MATCH (n) RETURN n $$) AS t(result agtype);
        `);
      } catch {
        graphFailed = true;
      }
      assert(graphFailed, "expected the nonexistent-graph query to fail");

      // The pooled connection may now carry a polluted search_path. Workflow SQL
      // is fully schema-qualified, so it must still work.
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
