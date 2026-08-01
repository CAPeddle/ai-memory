/**
 * ST-084 spike — Workflow Operations orchestration.
 *
 * The service owns the two behaviours where the memory boundary actually matters:
 *
 *   1. `resolveAndPromoteDecision` — an OPTIONAL projection. It runs strictly after
 *      the operational write has committed, catches every error, and reports the
 *      outcome as data rather than propagating it. No projection outcome — success,
 *      failure, or unknown — can leave the decision anything but authoritative
 *      (criterion 3).
 *
 *      The outcome is a four-valued {@link PromotionStatus}, not a boolean. Which
 *      one a caller receives determines whether re-attempting is safe, and the
 *      distinction is not cosmetic: see the timeout handling below.
 *
 *   2. `gatherAdvisoryContext` — advisory retrieval that degrades to empty. It is
 *      never on the path of an operational write.
 *
 * Everything else (packets, runs, checkpoints, decisions, evidence, completion)
 * is deliberately memory-free and lives in store.ts.
 *
 * SPIKE / DISPOSABLE.
 */

import {
  type KnowledgePromotionPort,
  type KnowledgeSearchPort,
  type KnowledgeSearchResult,
  PortTimeoutError,
  PromotionNotAttemptedError,
  withPortTimeout,
} from "./ports.ts";
import * as store from "./store.ts";
import { evaluateAttention } from "./attention.ts";
import type { AttentionItem, OperationalDecision } from "./types.ts";

/**
 * What is known about the optional memory projection after an attempt.
 *
 * FOUR states, not a boolean, because the caller's correct next action differs in
 * each and two of them are NOT "retry":
 *
 * - `promoted`      — the projection exists and the decision row records its ref.
 *                     Nothing to do.
 * - `ref-lost`      — the projection exists, but recording its reference failed.
 *                     RECONCILE using the `ref` field; do not project again.
 * - `failed`        — the adapter DECLARED that nothing was committed, by rejecting
 *                     with `PromotionNotAttemptedError`. Only then can re-projecting
 *                     be said not to duplicate anything.
 * - `indeterminate` — the bound elapsed with the request still in flight and
 *                     UNCANCELLED. Whether a projection exists is unknown, and it
 *                     may come into existence after this value is returned.
 *
 * `indeterminate` is also the DEFAULT for any undeclared rejection, not just for a
 * timeout. Both were previously collapsed into "definitely did not happen" — the
 * timeout first, and then, one branch over, every other rejection. A remote adapter
 * can commit the projection and reject afterwards because the response was lost or
 * the connection reset, and `promoteDecision(): Promise<string>` cannot express the
 * difference. So silence means unknown, and an adapter must opt in to `failed`.
 */
export type PromotionStatus = "promoted" | "ref-lost" | "failed" | "indeterminate";

export interface PromotionOutcome {
  /**
   * The discriminant. Branch on this, never on the text of `error` — a caller that
   * has to string-match a message to tell "definitely didn't happen" from "unknown"
   * is one message edit away from doing the wrong thing.
   */
  status: PromotionStatus;
  /**
   * The projection reference. Present for `promoted`, and for `ref-lost` where it is
   * the only handle on an existing projection the decision row does not know about.
   * Always null for `failed` and `indeterminate` — in the latter case a reference may
   * well exist on the memory side, but this process never received it.
   */
  ref: string | null;
  /** Diagnostic detail for every non-`promoted` status. Never a control signal. */
  error: string | null;
  /** The decision AFTER the attempt — authoritative regardless of status. */
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
  timeoutMs?: number,
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
    // Bounded: a hung memory implementation must not block an operational command
    // indefinitely.
    ref = await withPortTimeout(
      "KnowledgePromotionPort.promoteDecision",
      promotionPort.promoteDecision({
        packetId: decision.packet_id,
        decisionId: decision.id,
        question: decision.question,
        resolution,
        policyScope: packet.policy_scope,
      }),
      timeoutMs,
    );
  } catch (err) {
    // A TIMEOUT IS NOT A FAILURE. `withPortTimeout` uses Promise.race, which abandons
    // the losing promise without cancelling it — the adapter's request is still in
    // flight and may still succeed after this returns. The honest classification is
    // "unknown", and `LateSuccessMemoryAdapter` demonstrates the case: the projection
    // lands afterwards, and because this function has already returned, nothing ever
    // calls attachPromotionRef. The result is an ORPHANED projection that requires
    // reconciliation — strictly worse than `ref-lost`, where at least the ref is
    // known.
    //
    // This used to be reported as `promoted: false, safe to retry`, which asserted
    // the projection had not happened on the one path where that is exactly what
    // nobody knows.
    if (err instanceof PortTimeoutError) {
      return {
        status: "indeterminate",
        ref: null,
        error: `${(err as Error).message}; the request was not cancelled and may still ` +
          "succeed — whether a projection exists is unknown",
        decision,
      };
    }

    // Any OTHER rejection defaults to indeterminate too. `throws` does not mean
    // "nothing happened": an adapter can commit the projection and then fail to learn
    // that it did — response lost, connection reset, payload undecodable — and the
    // signature cannot distinguish that from never having started. Requiring "reject
    // only before any side effect" in the port docs would be an invariant neither the
    // type system nor the network can enforce, which is the kind of prose-only claim
    // this PR keeps having to retract. Fail safe instead: silence costs precision,
    // never correctness.
    if (!(err instanceof PromotionNotAttemptedError)) {
      return {
        status: "indeterminate",
        ref: null,
        error: `${(err as Error).message}; the adapter did not declare whether a ` +
          "projection was committed, so whether one exists is unknown",
        decision,
      };
    }

    // ...unless the adapter DECLARED it never projected, which is the only basis on
    // which this can be called a definite non-event.
    return { status: "failed", ref: null, error: (err as Error).message, decision };
  }

  // 3. The projection HAS happened. Recording its reference is a separate
  //    operational write whose failure must not be reported as "promotion
  //    failed" — that would invite a retry and duplicate the projection.
  try {
    await store.attachPromotionRef(decision.id, ref);
    const after = await store.getDecision(decision.id);
    return { status: "promoted", ref, error: null, decision: after ?? decision };
  } catch (err) {
    return {
      status: "ref-lost",
      ref,
      error: `projection succeeded but its reference was not recorded: ${(err as Error).message}`,
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
  timeoutMs?: number,
): Promise<{ results: KnowledgeSearchResult[]; degraded: boolean; error: string | null }> {
  try {
    const results = await withPortTimeout(
      "KnowledgeSearchPort.search",
      searchPort.search(query, limit),
      timeoutMs,
    );
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
