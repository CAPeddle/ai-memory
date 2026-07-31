/**
 * ST-084 spike — deterministic attention rules.
 *
 * "No LLM-based attention inference is permitted in this spike" (plan §Attention
 * logic). This is a pure function over already-fetched state: no I/O, no model
 * call, no clock access beyond the `now` passed in. That makes it unit-testable
 * without a database and makes the "deterministic" claim checkable by reading it.
 *
 * Attention is DERIVED, not stored. The provisional model had a
 * `workflow.attention_items` table; a stored table can drift from the state it
 * describes, a pure projection cannot. Recorded as a deliberate reduction in the
 * plan's Implementation Addendum §B.
 *
 * SPIKE / DISPOSABLE.
 */

import type {
  AgentRun,
  AttentionItem,
  Checkpoint,
  OperationalDecision,
  VerificationCriterion,
  WorkPacket,
} from "./types.ts";

export const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

export interface AttentionInput {
  packet: WorkPacket;
  runs: readonly AgentRun[];
  checkpoints: readonly Checkpoint[];
  decisions: readonly OperationalDecision[];
  criteria: readonly VerificationCriterion[];
  /** criterion id -> evidence count */
  evidenceCountByCriterion: ReadonlyMap<string, number>;
  now: Date;
  staleAfterMs?: number;
}

/**
 * Evaluate the five deterministic rules. Order is stable and reasons are additive
 * — a packet can legitimately be both `blocked` and `stale`.
 */
export function evaluateAttention(input: AttentionInput): AttentionItem[] {
  const { packet, runs, checkpoints, decisions, criteria, evidenceCountByCriterion, now } = input;
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const items: AttentionItem[] = [];

  // Rule 1: decision-required — an unresolved blocking decision exists.
  for (const decision of decisions) {
    if (decision.status === "open" && decision.blocking) {
      items.push({
        packet_id: packet.id,
        run_id: decision.run_id,
        reason: "decision-required",
        detail: decision.question,
      });
    }
  }

  // Rule 2: blocked — an explicit blocker recorded on the latest checkpoint of a run.
  for (const run of runs) {
    const latest = latestCheckpointFor(run.id, checkpoints);
    if (latest?.blockers && latest.blockers.trim() !== "") {
      items.push({
        packet_id: packet.id,
        run_id: run.id,
        reason: "blocked",
        detail: latest.blockers,
      });
    }
  }

  // Rule 3: stale — a still-running run with no meaningful event inside the threshold.
  for (const run of runs) {
    if (run.status !== "running") continue;
    const elapsed = now.getTime() - run.last_event_at.getTime();
    if (elapsed > staleAfterMs) {
      items.push({
        packet_id: packet.id,
        run_id: run.id,
        reason: "stale",
        detail: `No event for ${Math.floor(elapsed / 60000)} minute(s)`,
      });
    }
  }

  // Rule 4: ended-without-checkpoint — the run ended after its last checkpoint
  // (or never checkpointed at all), so its final state was never narrated.
  for (const run of runs) {
    if (run.status === "running" || run.ended_at === null) continue;
    const latest = latestCheckpointFor(run.id, checkpoints);
    if (latest === null || latest.created_at.getTime() < run.ended_at.getTime()) {
      items.push({
        packet_id: packet.id,
        run_id: run.id,
        reason: "ended-without-checkpoint",
        detail: latest === null
          ? "Run ended with no checkpoint recorded"
          : "Run ended after its last checkpoint",
      });
    }
  }

  // Rule 5: ready-for-review — every required criterion has evidence and the
  // packet is not yet complete. This is the positive signal, not a fault.
  //
  // Zero required criteria counts as SATISFIED, deliberately. The original
  // `required.length > 0 &&` guard made a packet with no criteria completable by
  // `completePacket` (nothing is unmet) while never surfacing as ready-for-review —
  // the gate and the attention queue disagreed about the same packet. Of the two
  // available rules ("zero required means immediately verification-ready" vs "every
  // packet must carry at least one required criterion") this takes the first, so
  // nothing silently becomes completable-but-invisible.
  const required = criteria.filter((c) => c.required);
  const allSatisfied = required.every((c) => (evidenceCountByCriterion.get(c.id) ?? 0) > 0);
  if (allSatisfied && packet.status !== "complete") {
    items.push({
      packet_id: packet.id,
      run_id: null,
      reason: "ready-for-review",
      detail: required.length === 0
        ? "No required criteria — verification-ready by default"
        : `${required.length} required criterion/criteria satisfied`,
    });
  }

  return items;
}

function latestCheckpointFor(
  runId: string,
  checkpoints: readonly Checkpoint[],
): Checkpoint | null {
  let latest: Checkpoint | null = null;
  for (const cp of checkpoints) {
    if (cp.run_id !== runId) continue;
    if (latest === null || cp.created_at.getTime() > latest.created_at.getTime()) {
      latest = cp;
    }
  }
  return latest;
}
