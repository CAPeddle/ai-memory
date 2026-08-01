/**
 * ST-084 spike — criterion 1: operational independence.
 *
 * The complete vertical slice against a real database, driven ONLY through the
 * workflow module and a no-op memory adapter. Nothing here calls the memory
 * domain: no embeddings, no OpenRouter, no AGE, no consolidation, no promotion.
 * If these pass, the operational core does not need semantic memory to function.
 */

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import * as store from "../src/workflow/store.ts";
import { attentionForPacket, resolveAndPromoteDecision } from "../src/workflow/service.ts";
import { NoopMemoryAdapter } from "../src/workflow/ports.ts";
import {
  CompletionBlockedError,
  CriteriaFrozenError,
  DecisionConflictError,
  WorkflowNotFoundError,
} from "../src/workflow/types.ts";
import { ensureWorkflowSchema } from "../src/workflow/schema.ts";

const T = { sanitizeResources: false, sanitizeOps: false };

Deno.test({
  ...T,
  name: "setup: workflow schema applied by the module itself, not the boot chain",
  fn: async () => {
    // The workflow product owns applying its own schema now. Idempotent.
    await ensureWorkflowSchema();
  },
});


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

      // 5. Operational decision flagged `blocking`.
      //
      // The plan's step 5 calls this "a decision that blocks execution". Stage 1
      // MODELS that intent; it does not enforce it. The one implemented consequence
      // is the deterministic attention item asserted below. Note what this test
      // then goes on to prove at the end: the packet COMPLETES with this decision
      // still open, because the completion gate is evidence-based (plan §6) and
      // never reads operational_decisions. That is the specified Stage 1 behaviour,
      // not an oversight — see 001_workflow_schema.sql's `blocking` note.
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

      // Make the Stage 1 semantics EXPLICIT rather than incidental: the packet
      // completed while the blocking decision above is still unresolved. Anyone
      // who later makes `blocking` gate completion must change this line, which
      // is the point — it turns a plan amendment into a visible edit instead of a
      // quiet behaviour change.
      const decisionAfter = await store.getDecision(decision.id);
      assertEquals(
        decisionAfter?.status,
        "open",
        "the blocking decision is still unresolved at completion time",
      );

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
  name: "workflow: a completed packet's verification contract is FROZEN",
  fn: async () => {
    // The non-race half of the completion-gate invariant. A criterion added after
    // completion is not a race at all — it simply arrives late — and a lock alone
    // would not stop it. Without this refusal a complete packet could permanently
    // hold an unmet required criterion.
    const packet = await newPacket("gate: frozen contract");
    try {
      const c = await store.addCriterion(packet.id, "met", true);
      await store.attachEvidence({ criterionId: c.id, kind: "manual", detail: "e" });
      const completed = await store.completePacket(packet.id);
      assertEquals(completed.status, "complete");

      await assertRejects(
        () => store.addCriterion(packet.id, "too late", true),
        CriteriaFrozenError,
      );
      // Non-required criteria are refused too: the contract is closed, not filtered.
      await assertRejects(
        () => store.addCriterion(packet.id, "also too late", false),
        CriteriaFrozenError,
      );
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "workflow: addCriterion raises a typed not-found for an unknown packet",
  fn: async () => {
    // Previously a bare INSERT, so this surfaced as a raw FK violation. Now that the
    // packet is read first, the caller gets the module's own error type.
    await assertRejects(
      () => store.addCriterion("00000000-0000-0000-0000-000000000000", "x", true),
      WorkflowNotFoundError,
    );
  },
});

Deno.test({
  ...T,
  name: "workflow: re-resolving with the SAME answer is idempotent and preserves resolved_at",
  fn: async () => {
    const packet = await newPacket("decision: idempotent retry");
    try {
      const decision = await store.recordDecision({
        packetId: packet.id,
        question: "separate schema?",
      });
      const first = await store.resolveDecision(decision.id, "separate schema");
      assertEquals(first.status, "resolved");
      assert(first.resolved_at !== null, "resolved_at must be stamped");

      const retry = await store.resolveDecision(decision.id, "separate schema");
      assertEquals(retry.status, "resolved");
      assertEquals(retry.resolution, "separate schema");
      // The point of the test. A blind re-UPDATE would move this forward and the
      // record would claim the decision was made later than it was — invisible
      // unless asserted, because every other field looks identical.
      assertEquals(
        retry.resolved_at?.getTime(),
        first.resolved_at?.getTime(),
        "an idempotent retry must not restamp resolved_at",
      );
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "workflow: re-resolving with a DIFFERENT answer raises a typed conflict",
  fn: async () => {
    const packet = await newPacket("decision: conflicting resolution");
    try {
      const decision = await store.recordDecision({
        packetId: packet.id,
        question: "separate schema?",
      });
      await store.resolveDecision(decision.id, "separate schema");

      const err = await assertRejects(
        () => store.resolveDecision(decision.id, "same schema"),
        DecisionConflictError,
      );
      assertEquals((err as DecisionConflictError).existingResolution, "separate schema");
      assertEquals((err as DecisionConflictError).attemptedResolution, "same schema");

      // The refusal must not have partially applied.
      const after = await store.getDecision(decision.id);
      assertEquals(after?.resolution, "separate schema");
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "workflow: resolveDecision raises a typed not-found for an unknown decision",
  fn: async () => {
    await assertRejects(
      () => store.resolveDecision("00000000-0000-0000-0000-000000000000", "x"),
      WorkflowNotFoundError,
    );
  },
});

Deno.test({
  ...T,
  name: "integrity: a decision cannot point at a run belonging to a DIFFERENT packet",
  fn: async () => {
    // Migration 002. Before it, packet_id and run_id were independent single-column
    // references, so this insert succeeded and produced a decision that claimed one
    // packet while pointing at another packet's run. Nothing rejected it, and every
    // consumer walking decision → run → packet was trusting callers to be careful.
    const a = await newPacket("integrity: owning packet");
    const b = await newPacket("integrity: foreign packet");
    try {
      const foreignRun = await store.registerRun({
        packetId: b.id,
        agentType: "claude-code",
        host: "local",
      });

      await assertRejects(
        () =>
          store.recordDecision({
            packetId: a.id,
            runId: foreignRun.id,
            question: "should not insert",
          }),
        Error,
        "operational_decisions_run_packet_fkey",
      );

      // Green control #1: the same shape with the run's OWN packet is accepted, so
      // the rejection above is about the mismatch and not about the constraint
      // refusing everything.
      const ownRun = await store.registerRun({
        packetId: a.id,
        agentType: "claude-code",
        host: "local",
      });
      const ok = await store.recordDecision({
        packetId: a.id,
        runId: ownRun.id,
        question: "matched run and packet",
      });
      assertEquals(ok.run_id, ownRun.id);

      // Green control #2 — MATCH SIMPLE. A decision with no run attached is
      // legitimate and common. MATCH FULL would have rejected every one of these,
      // i.e. the composite FK would have broken the majority case.
      const detached = await store.recordDecision({
        packetId: a.id,
        question: "no run attached",
      });
      assertEquals(detached.run_id, null);
    } finally {
      await store.deletePacket(a.id);
      await store.deletePacket(b.id);
    }
  },
});

Deno.test({
  ...T,
  name: "integrity: deleting a run nulls only run_id, leaving the decision intact",
  fn: async () => {
    // The reason 002 needs PostgreSQL 15's COLUMN-LIST `ON DELETE SET NULL (run_id)`.
    // A plain `ON DELETE SET NULL` on a composite FK nulls EVERY referencing column,
    // and packet_id is NOT NULL — so this delete would fail outright, and with it
    // deletePacket's cascade. The distinction is invisible until exercised.
    const packet = await newPacket("integrity: run delete");
    try {
      const run = await store.registerRun({
        packetId: packet.id,
        agentType: "claude-code",
        host: "local",
      });
      const decision = await store.recordDecision({
        packetId: packet.id,
        runId: run.id,
        question: "survives its run",
      });
      assertEquals(decision.run_id, run.id);

      await sql`DELETE FROM workflow.agent_runs WHERE id = ${run.id}`;

      const after = await store.getDecision(decision.id);
      assert(after !== null, "the decision must survive its run's deletion");
      assertEquals(after?.run_id, null, "run_id is nulled");
      assertEquals(after?.packet_id, packet.id, "packet_id is untouched");
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
      assertEquals(outcome.status, "promoted");
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

Deno.test({
  ...T,
  name: "workflow: endRun reports a missing run instead of silently succeeding",
  fn: async () => {
    // The store owns this contract, so the control for it belongs here rather than
    // only in the e2e test's 404 mapping — that proves the HTTP layer translates the
    // error, not that the store raises one.
    //
    // endRun used to return `void` from a bare UPDATE, so a run id that matched no row
    // resolved successfully and was indistinguishable from a real close. Nothing
    // anywhere recorded the disagreement between what the caller believed and what the
    // database held.
    await assertRejects(
      () => store.endRun(crypto.randomUUID(), "ended"),
      WorkflowNotFoundError,
    );

    // Discrimination: the same call against a REAL run must still succeed and return
    // the updated row, or the rejection above would only prove endRun is broken.
    const packet = await newPacket("endRun: discrimination control");
    try {
      const run = await store.registerRun({
        packetId: packet.id,
        agentType: "test",
        host: "local",
      });
      const ended = await store.endRun(run.id, "ended");
      assertEquals(ended.id, run.id);
      assertEquals(ended.status, "ended");
      assert(ended.ended_at !== null, "ended_at must be stamped");
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});
