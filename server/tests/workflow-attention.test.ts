/**
 * ST-084 spike — deterministic attention rules.
 *
 * Pure unit tests: no database, no network, no model. That these run at all
 * without infrastructure is itself part of the evidence for criterion 1 —
 * attention is computed from state, not inferred by an LLM.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { type AttentionInput, evaluateAttention } from "../src/workflow/attention.ts";
import type {
  AgentRun,
  AttentionReason,
  Checkpoint,
  OperationalDecision,
  VerificationCriterion,
  WorkPacket,
} from "../src/workflow/types.ts";

const NOW = new Date("2026-07-30T12:00:00Z");

function packet(overrides: Partial<WorkPacket> = {}): WorkPacket {
  return {
    id: "p1",
    title: "t",
    objective: "o",
    scope: "",
    constraints: "",
    repository: null,
    branch: null,
    policy_scope: "personal",
    status: "in_progress",
    // Unparented, as every packet is until the operator binds it. Attention is a
    // packet-level concept and gains nothing from the WorkItem layer (ADR-017 §3);
    // this field is here only because a `WorkPacket` literal must be complete.
    work_item_id: null,
    created_at: NOW,
    updated_at: NOW,
    completed_at: null,
    ...overrides,
  };
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "r1",
    packet_id: "p1",
    agent_type: "claude-code",
    host: "local",
    node_id: null,
    working_dir: null,
    repository: null,
    branch: null,
    status: "running",
    started_at: NOW,
    ended_at: null,
    last_event_at: NOW,
    ...overrides,
  };
}

function checkpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: "c1",
    run_id: "r1",
    completed_work: "w",
    current_state: "s",
    blockers: null,
    next_action: null,
    repo_commit: null,
    created_at: NOW,
    ...overrides,
  };
}

function decision(overrides: Partial<OperationalDecision> = {}): OperationalDecision {
  return {
    id: "d1",
    packet_id: "p1",
    run_id: "r1",
    question: "Which storage layout?",
    rationale: null,
    resolution: null,
    blocking: true,
    status: "open",
    promoted_memory_ref: null,
    created_at: NOW,
    resolved_at: null,
    ...overrides,
  };
}

function criterion(overrides: Partial<VerificationCriterion> = {}): VerificationCriterion {
  return {
    id: "v1",
    packet_id: "p1",
    description: "tests pass",
    required: true,
    created_at: NOW,
    ...overrides,
  };
}

function baseInput(overrides: Partial<AttentionInput> = {}): AttentionInput {
  return {
    packet: packet(),
    runs: [],
    checkpoints: [],
    decisions: [],
    // One UNSATISFIED required criterion by default, so the baseline packet is not
    // verification-ready and each test observes only the rule it is exercising.
    // (Zero required criteria now means ready-for-review — see the dedicated test.)
    criteria: [criterion()],
    evidenceCountByCriterion: new Map(),
    now: NOW,
    ...overrides,
  };
}

function reasons(input: AttentionInput): AttentionReason[] {
  return evaluateAttention(input).map((i) => i.reason).sort();
}

Deno.test("attention: quiet state produces no items", () => {
  assertEquals(evaluateAttention(baseInput()), []);
});

Deno.test("attention: unresolved blocking decision raises decision-required", () => {
  assertEquals(reasons(baseInput({ decisions: [decision()] })), ["decision-required"]);
});

Deno.test("attention: resolved decision does not raise decision-required", () => {
  const resolved = decision({ status: "resolved", resolution: "chose schema" });
  assertEquals(reasons(baseInput({ decisions: [resolved] })), []);
});

Deno.test("attention: non-blocking open decision does not raise decision-required", () => {
  assertEquals(reasons(baseInput({ decisions: [decision({ blocking: false })] })), []);
});

Deno.test("attention: explicit blocker on latest checkpoint raises blocked", () => {
  assertEquals(
    reasons(baseInput({
      runs: [run()],
      checkpoints: [checkpoint({ blockers: "waiting on credentials" })],
    })),
    ["blocked"],
  );
});

Deno.test("attention: blank blocker string does not raise blocked", () => {
  assertEquals(
    reasons(baseInput({ runs: [run()], checkpoints: [checkpoint({ blockers: "   " })] })),
    [],
  );
});

Deno.test("attention: running run past the threshold raises stale", () => {
  const stale = run({ last_event_at: new Date(NOW.getTime() - 60 * 60 * 1000) });
  assertEquals(reasons(baseInput({ runs: [stale] })), ["stale"]);
});

Deno.test("attention: an ended run is never stale", () => {
  const ended = run({
    status: "ended",
    ended_at: new Date(NOW.getTime() - 90 * 60 * 1000),
    last_event_at: new Date(NOW.getTime() - 90 * 60 * 1000),
  });
  // ended-without-checkpoint is expected here; stale must not be.
  assertEquals(reasons(baseInput({ runs: [ended] })), ["ended-without-checkpoint"]);
});

Deno.test("attention: staleness threshold is configurable", () => {
  const run20m = run({ last_event_at: new Date(NOW.getTime() - 20 * 60 * 1000) });
  assertEquals(reasons(baseInput({ runs: [run20m] })), [], "default 30m: not yet stale");
  assertEquals(
    reasons(baseInput({ runs: [run20m], staleAfterMs: 10 * 60 * 1000 })),
    ["stale"],
    "10m threshold: stale",
  );
});

Deno.test("attention: run ending after its last checkpoint raises ended-without-checkpoint", () => {
  const endedAt = new Date(NOW.getTime() - 10 * 60 * 1000);
  const cpAt = new Date(NOW.getTime() - 40 * 60 * 1000);
  assertEquals(
    reasons(baseInput({
      runs: [run({ status: "ended", ended_at: endedAt, last_event_at: endedAt })],
      checkpoints: [checkpoint({ created_at: cpAt })],
    })),
    ["ended-without-checkpoint"],
  );
});

Deno.test("attention: run checkpointed at the end is clean", () => {
  const endedAt = new Date(NOW.getTime() - 40 * 60 * 1000);
  const cpAt = new Date(NOW.getTime() - 10 * 60 * 1000);
  assertEquals(
    reasons(baseInput({
      runs: [run({ status: "ended", ended_at: endedAt, last_event_at: endedAt })],
      checkpoints: [checkpoint({ created_at: cpAt })],
    })),
    [],
  );
});

Deno.test("attention: all required criteria evidenced raises ready-for-review", () => {
  assertEquals(
    reasons(baseInput({
      criteria: [criterion()],
      evidenceCountByCriterion: new Map([["v1", 1]]),
    })),
    ["ready-for-review"],
  );
});

Deno.test("attention: unevidenced criterion does not raise ready-for-review", () => {
  assertEquals(
    reasons(baseInput({
      criteria: [criterion()],
      evidenceCountByCriterion: new Map([["v1", 0]]),
    })),
    [],
  );
});

Deno.test("attention: a completed packet is never ready-for-review", () => {
  assertEquals(
    reasons(baseInput({
      packet: packet({ status: "complete" }),
      criteria: [criterion()],
      evidenceCountByCriterion: new Map([["v1", 1]]),
    })),
    [],
  );
});

Deno.test("attention: reasons are additive — blocked and stale can co-occur", () => {
  const staleRun = run({ last_event_at: new Date(NOW.getTime() - 60 * 60 * 1000) });
  assertEquals(
    reasons(baseInput({
      runs: [staleRun],
      checkpoints: [checkpoint({ blockers: "waiting" })],
      decisions: [decision()],
    })),
    ["blocked", "decision-required", "stale"],
  );
});

Deno.test("attention: evaluation is deterministic across repeated calls", () => {
  const input = baseInput({
    runs: [run({ last_event_at: new Date(NOW.getTime() - 60 * 60 * 1000) })],
    decisions: [decision()],
    criteria: [criterion()],
    evidenceCountByCriterion: new Map([["v1", 2]]),
  });
  const first = JSON.stringify(evaluateAttention(input));
  for (let i = 0; i < 20; i++) {
    assertEquals(JSON.stringify(evaluateAttention(input)), first);
  }
});

Deno.test("attention: a packet with NO required criteria is verification-ready", () => {
  // Reconciles the gate and the attention queue. Previously `required.length > 0`
  // meant such a packet could be completed by completePacket (nothing is unmet) yet
  // never surfaced as ready-for-review — the two disagreed about the same packet.
  assertEquals(reasons(baseInput({ criteria: [], evidenceCountByCriterion: new Map() })), [
    "ready-for-review",
  ]);
});

Deno.test("attention: non-required criteria alone still leave a packet ready", () => {
  assertEquals(
    reasons(baseInput({
      criteria: [criterion({ required: false })],
      evidenceCountByCriterion: new Map(),
    })),
    ["ready-for-review"],
  );
});
