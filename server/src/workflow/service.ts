/**
 * ST-084 spike — Workflow Operations orchestration.
 *
 * The service owns the two behaviours where the memory boundary actually matters:
 *
 *   1. `promoteDecisionToMemory` — an OPTIONAL projection. It runs strictly after
 *      the operational write has committed, catches every error, and reports the
 *      failure as data rather than propagating it. A promotion failure leaves the
 *      decision authoritative and untouched (criterion 3).
 *
 *   2. `gatherAdvisoryContext` — advisory retrieval that degrades to empty. It is
 *      never on the path of an operational write.
 *
 * Everything else (packets, runs, checkpoints, decisions, evidence, completion)
 * is deliberately memory-free and lives in store.ts.
 *
 * SPIKE / DISPOSABLE.
 */

import type {
  KnowledgePromotionPort,
  KnowledgeSearchPort,
  KnowledgeSearchResult,
} from "./ports.ts";
import * as store from "./store.ts";
import { evaluateAttention } from "./attention.ts";
import type { AttentionItem, OperationalDecision } from "./types.ts";

export interface PromotionOutcome {
  /** Whether the optional memory projection succeeded. */
  promoted: boolean;
  /** The projection reference, when promotion succeeded. */
  ref: string | null;
  /** The failure message, when it did not. Surfaced so the failure is visible and retryable. */
  error: string | null;
  /** The decision AFTER the attempt — authoritative either way. */
  decision: OperationalDecision;
}

/**
 * Resolve a decision, then attempt to project it into memory.
 *
 * Ordering is the whole point: the resolve commits first and independently. The
 * promotion is a second, separate operation whose failure is captured and
 * returned, never thrown. The plan requires that "failure of promotion must not
 * roll back or corrupt packet completion".
 */
export async function resolveAndPromoteDecision(
  decisionId: string,
  resolution: string,
  promotionPort: KnowledgePromotionPort,
): Promise<PromotionOutcome> {
  // 1. Authoritative operational write — committed before memory is touched at all.
  const decision = await store.resolveDecision(decisionId, resolution);

  // 2. Optional projection. Deliberately outside any operational transaction.
  try {
    const ref = await promotionPort.promoteDecision({
      packetId: decision.packet_id,
      decisionId: decision.id,
      question: decision.question,
      resolution,
      policyScope: "personal",
    });
    await store.attachPromotionRef(decision.id, ref);
    const after = await store.getDecision(decision.id);
    return { promoted: true, ref, error: null, decision: after ?? decision };
  } catch (err) {
    // Visible and retryable, not silent. The decision remains authoritative.
    return {
      promoted: false,
      ref: null,
      error: (err as Error).message,
      decision,
    };
  }
}

/**
 * Advisory context for an operator or agent. Degrades to an empty list when the
 * memory subsystem is unavailable — it must never block operational work.
 */
export async function gatherAdvisoryContext(
  query: string,
  searchPort: KnowledgeSearchPort,
  limit = 5,
): Promise<{ results: KnowledgeSearchResult[]; degraded: boolean; error: string | null }> {
  try {
    const results = await searchPort.search(query, limit);
    return { results, degraded: false, error: null };
  } catch (err) {
    return { results: [], degraded: true, error: (err as Error).message };
  }
}

/**
 * Compute the attention queue for a packet from current persisted state.
 * Pure rules, no model call — see attention.ts.
 */
export async function attentionForPacket(
  packetId: string,
  now = new Date(),
  staleAfterMs?: number,
): Promise<AttentionItem[]> {
  const packet = await store.getPacket(packetId);
  if (packet === null) return [];

  const [runs, checkpoints, decisions, criteria, evidenceCountByCriterion] = await Promise.all([
    store.listRuns(packetId),
    store.listCheckpoints(packetId),
    store.listDecisions(packetId),
    store.listCriteria(packetId),
    store.evidenceCountsForPacket(packetId),
  ]);

  return evaluateAttention({
    packet,
    runs,
    checkpoints,
    decisions,
    criteria,
    evidenceCountByCriterion,
    now,
    staleAfterMs,
  });
}
