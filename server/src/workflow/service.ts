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
  /**
   * True when the projection SUCCEEDED but recording its reference did not.
   *
   * This is deliberately distinct from `promoted: false`. Collapsing the two
   * (the original shape here) told a caller "promotion failed" when the memory
   * projection had in fact already happened — and a caller that retries on that
   * signal creates a duplicate projection, because `KnowledgePromotionPort`
   * carries no dedup contract. Retry on `promoted: false`; reconcile, do not
   * re-promote, on `refLost: true`.
   */
  refLost: boolean;
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

  // The packet is the only authority for policy scope: OperationalDecision carries
  // none of its own. Reading it here (rather than defaulting) prevents a
  // corporate/mixed/public decision being projected into memory labelled
  // `personal` — a silent widening of the very boundary the scope field exists
  // to enforce.
  const packet = await store.getPacket(decision.packet_id);
  if (packet === null) {
    throw new Error(
      `Work packet ${decision.packet_id} not found for decision ${decision.id}; ` +
        "refusing to promote without an authoritative policy scope",
    );
  }

  // 2. Optional projection. Deliberately outside any operational transaction.
  //    ONLY the port call is inside this try — see step 3.
  let ref: string;
  try {
    ref = await promotionPort.promoteDecision({
      packetId: decision.packet_id,
      decisionId: decision.id,
      question: decision.question,
      resolution,
      policyScope: packet.policy_scope,
    });
  } catch (err) {
    // The projection genuinely did not happen. Safe to retry.
    return {
      promoted: false,
      ref: null,
      error: (err as Error).message,
      refLost: false,
      decision,
    };
  }

  // 3. The projection HAS happened. Recording its reference is a separate
  //    operational write whose failure must not be reported as "promotion
  //    failed" — that would invite a retry and duplicate the projection.
  try {
    await store.attachPromotionRef(decision.id, ref);
    const after = await store.getDecision(decision.id);
    return { promoted: true, ref, error: null, refLost: false, decision: after ?? decision };
  } catch (err) {
    return {
      promoted: true,
      ref,
      error: `projection succeeded but its reference was not recorded: ${(err as Error).message}`,
      refLost: true,
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
