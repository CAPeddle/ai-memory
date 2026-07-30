/**
 * ST-084 spike — the memory adapter boundary.
 *
 * This file is the ONLY sanctioned route from Workflow Operations to the memory
 * domain. The dependency rule (enforced by `workflow-dependency.test.ts`, not just
 * documented) is that no other workflow file may import the memory subsystem.
 *
 * Two ports, both optional by construction:
 *   - KnowledgeSearchPort    — read-side; advisory context only
 *   - KnowledgePromotionPort — write-side; projects a decision OUT to memory
 *
 * The critical invariant for criterion 3: BOTH ports may fail, and neither failure
 * may roll back or corrupt operational state. Callers therefore never await these
 * inside an operational transaction. See service.ts.
 *
 * SPIKE / DISPOSABLE.
 */

export interface KnowledgeSearchResult {
  id: string;
  excerpt: string;
}

export interface KnowledgeSearchPort {
  /** Advisory retrieval. May throw or return []. Never gates operational writes. */
  search(query: string, limit: number): Promise<KnowledgeSearchResult[]>;
}

export interface KnowledgePromotionPort {
  /**
   * Project an operational decision into the memory domain.
   * Returns an opaque reference stored on the decision row, or throws.
   *
   * MUST reference the operational identifiers so the projection points back at
   * the authoritative record, never the reverse (plan: "Knowledge projections
   * reference operational records, not the reverse").
   */
  promoteDecision(input: PromotionInput): Promise<string>;
}

export interface PromotionInput {
  packetId: string;
  decisionId: string;
  question: string;
  resolution: string;
  policyScope: string;
}

/**
 * The no-op adapter. The plan requires that "a no-op memory adapter passes all
 * core workflow tests" — i.e. that the entire operational flow completes with the
 * memory domain absent, not merely degraded. This is the memory-disabled mode's
 * in-process equivalent and the default in tests.
 */
export class NoopMemoryAdapter implements KnowledgeSearchPort, KnowledgePromotionPort {
  readonly promotionCalls: PromotionInput[] = [];

  search(_query: string, _limit: number): Promise<KnowledgeSearchResult[]> {
    return Promise.resolve([]);
  }

  promoteDecision(input: PromotionInput): Promise<string> {
    this.promotionCalls.push(input);
    return Promise.resolve(`noop:${input.decisionId}`);
  }
}

/**
 * An adapter that always fails, for the failure-isolation experiments.
 * Used to prove that search and promotion faults leave operational state intact.
 */
export class FailingMemoryAdapter implements KnowledgeSearchPort, KnowledgePromotionPort {
  constructor(private readonly message = "simulated memory subsystem failure") {}

  search(_query: string, _limit: number): Promise<KnowledgeSearchResult[]> {
    return Promise.reject(new Error(this.message));
  }

  promoteDecision(_input: PromotionInput): Promise<string> {
    return Promise.reject(new Error(this.message));
  }
}
