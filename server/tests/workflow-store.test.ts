/**
 * ST-084 spike — criterion 1: operational independence.
 *
 * The complete vertical slice against a real database, driven ONLY through the
 * workflow module and a no-op memory adapter. Nothing here calls the memory
 * domain: no embeddings, no OpenRouter, no AGE, no consolidation, no promotion.
 * If these pass, the operational core does not need semantic memory to function.
 */

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

import * as store from "../src/workflow/store.ts";
import { attentionForPacket, resolveAndPromoteDecision } from "../src/workflow/service.ts";
import { NoopMemoryAdapter } from "../src/workflow/ports.ts";
import { CompletionBlockedError } from "../src/workflow/types.ts";

const T = { sanitizeResources: false, sanitizeOps: false };

async function newPacket(title = "ST-084 slice") {
  return await store.createPacket({
    title,
    objective: "Prove Workflow Operations runs without semantic memory",
    scope: "server/src/workflow",
    constraints: "no memory dependency",
    repository: "ai-memory",
    branch: "claude/st-084-awcp-host-spike",
    policyScope: "personal",
  });
}

Deno.test({
  ...T,
  name: "workflow: full vertical slice — packet, run, checkpoint, decision, gate, completion",
  fn: async () => {
    const packet = await newPacket();
    try {
      assertEquals(packet.status, "open");
      assertEquals(packet.policy_scope, "personal");

      // 2. Local run
      const run = await store.registerRun({
        packetId: packet.id,
        agentType: "claude-code",
        host: "local",
        workingDir: "/home/cpeddle/projects/ai-memory",
        repository: "ai-memory",
        branch: "claude/st-084-awcp-host-spike",
      });
      assertEquals(run.status, "running");
      assertEquals(run.packet_id, packet.id);

      // 4. Checkpoint
      const cp = await store.recordCheckpoint({
        runId: run.id,
        completedWork: "Schema and module scaffolded",
        currentState: "Writing boundary tests",
        nextAction: "Run the failure-isolation experiments",
        repoCommit: "deadbeef",
      });
      assertEquals(cp.run_id, run.id);
      assertEquals(cp.blockers, null);

      // 5. Operational decision that blocks execution
      const decision = await store.recordDecision({
        packetId: packet.id,
        runId: run.id,
        question: "Same schema or separate schema for workflow tables?",
        blocking: true,
      });
      assertEquals(decision.status, "open");
      assertEquals(decision.blocking, true);

      // ... and it deterministically produces a decision-required attention item
      const attention = await attentionForPacket(packet.id);
      const decisionRequired = attention.filter((a) => a.reason === "decision-required");
      assertEquals(decisionRequired.length, 1);
      assertEquals(decisionRequired[0].detail, decision.question);

      // 6. Completion gate — must REFUSE before evidence exists
      const criterion = await store.addCriterion(packet.id, "Boundary tests pass", true);
      const blocked = await assertRejects(
        () => store.completePacket(packet.id),
        CompletionBlockedError,
      );
      assertEquals((blocked as CompletionBlockedError).unmetCriteria, ["Boundary tests pass"]);

      const stillOpen = await store.getPacket(packet.id);
      assertEquals(stillOpen?.status, "open", "refused completion must not mutate status");
      assertEquals(stillOpen?.completed_at, null);

      // Attach manual evidence and repeat — must now SUCCEED
      await store.attachEvidence({
        criterionId: criterion.id,
        kind: "manual",
        detail: "deno test tests/workflow-store.test.ts — 0 failures",
        recordedCommit: "deadbeef",
      });
      const completed = await store.completePacket(packet.id);
      assertEquals(completed.status, "complete");
      assert(completed.completed_at !== null, "completed_at must be set");

      await store.endRun(run.id, "ended");
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "workflow: completion gate ignores non-required criteria",
  fn: async () => {
    const packet = await newPacket("gate: optional criteria");
    try {
      await store.addCriterion(packet.id, "nice to have", false);
      const completed = await store.completePacket(packet.id);
      assertEquals(completed.status, "complete");
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "workflow: completion gate requires evidence on EVERY required criterion",
  fn: async () => {
    const packet = await newPacket("gate: multiple criteria");
    try {
      const a = await store.addCriterion(packet.id, "criterion A", true);
      await store.addCriterion(packet.id, "criterion B", true);
      await store.attachEvidence({ criterionId: a.id, kind: "manual", detail: "done" });

      const err = await assertRejects(
        () => store.completePacket(packet.id),
        CompletionBlockedError,
      );
      assertEquals((err as CompletionBlockedError).unmetCriteria, ["criterion B"]);
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "workflow: policy_scope is a controlled vocabulary enforced by the database",
  fn: async () => {
    // Not a descriptive tag — an invalid value must be rejected at the DB layer,
    // not merely discouraged in TypeScript. (Stage 1 defines the column; retrieval
    // enforcement is Stage 2.)
    await assertRejects(() =>
      store.createPacket({
        title: "bad scope",
        objective: "should not insert",
        // deno-lint-ignore no-explicit-any
        policyScope: "top-secret" as any,
      })
    );
  },
});

Deno.test({
  ...T,
  name: "workflow: checkpoint refreshes run activity, clearing the stale signal",
  fn: async () => {
    const packet = await newPacket("stale clock");
    try {
      const run = await store.registerRun({
        packetId: packet.id,
        agentType: "claude-code",
        host: "local",
      });

      await store.backdateRunActivity(run.id, "2 hours");
      const before = await attentionForPacket(packet.id);
      assert(
        before.some((a) => a.reason === "stale"),
        "a run idle for 2h must be stale",
      );

      await store.recordCheckpoint({
        runId: run.id,
        completedWork: "resumed",
        currentState: "working",
      });
      const after = await attentionForPacket(packet.id);
      assertEquals(
        after.filter((a) => a.reason === "stale").length,
        0,
        "a checkpoint is a meaningful event and must clear staleness",
      );
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "workflow: complete slice runs end-to-end against a NO-OP memory adapter",
  fn: async () => {
    // The plan's explicit requirement: "A no-op memory adapter passes all core
    // workflow tests." This is the in-process equivalent of memory-disabled mode.
    const noop = new NoopMemoryAdapter();
    const packet = await newPacket("noop adapter flow");
    try {
      const run = await store.registerRun({
        packetId: packet.id,
        agentType: "claude-code",
        host: "local",
      });
      await store.recordCheckpoint({
        runId: run.id,
        completedWork: "w",
        currentState: "s",
      });
      const decision = await store.recordDecision({
        packetId: packet.id,
        runId: run.id,
        question: "proceed?",
      });

      const outcome = await resolveAndPromoteDecision(decision.id, "yes", noop);
      assertEquals(outcome.promoted, true);
      assertEquals(outcome.decision.status, "resolved");
      assertEquals(outcome.decision.resolution, "yes");
      assertEquals(noop.promotionCalls.length, 1);
      assertEquals(noop.promotionCalls[0].decisionId, decision.id);

      const criterion = await store.addCriterion(packet.id, "slice complete", true);
      await store.attachEvidence({
        criterionId: criterion.id,
        kind: "manual",
        detail: "verified",
      });
      const completed = await store.completePacket(packet.id);
      assertEquals(completed.status, "complete");
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});
