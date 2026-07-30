/**
 * ST-084 spike — the memory adapter boundary.
 *
 * This file is the ONLY sanctioned route from Workflow Operations to the memory
 * domain. The dependency rule (enforced by `workflow-boundary.test.ts`, not just
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

import type { PolicyScope } from "./types.ts";

/**
 * Default bound on any call across the memory boundary.
 *
 * Both ports are OPTIONAL integrations. Without a bound, a hung memory
 * implementation blocks an operational command indefinitely — which would make
 * "memory cannot affect operational availability" false by omission, even though
 * no transaction is shared. The spike's own adapters are synchronous, so this
 * exists for the real adapter that replaces them.
 */
export const PORT_TIMEOUT_MS = 5_000;

/** Raised when a memory-port call exceeds its bound. */
export class PortTimeoutError extends Error {
  readonly port: string;
  readonly timeoutMs: number;
  constructor(port: string, timeoutMs: number) {
    super(`${port} exceeded its ${timeoutMs}ms bound`);
    this.name = "PortTimeoutError";
    this.port = port;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Bound a port call. Rejects with {@link PortTimeoutError} past the deadline.
 *
 * Note the honest limitation: this bounds how long the *caller* waits, it does not
 * cancel the underlying work. A real adapter holding a socket should also accept an
 * AbortSignal. Recorded rather than implied.
 */
export function withPortTimeout<T>(
  port: string,
  op: Promise<T>,
  timeoutMs: number = PORT_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new PortTimeoutError(port, timeoutMs)), timeoutMs);
  });
  return Promise.race([op, bound]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

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
  /**
   * Typed to the closed `PolicyScope` union, not `string`. A bare `string` here
   * let a caller pass any value — and did: the original implementation hardcoded
   * `"personal"` for every packet, silently mislabelling corporate/mixed/public
   * decisions. The narrow type makes that class of widening a compile error.
   */
  policyScope: PolicyScope;
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

/**
 * An adapter that never settles, for proving the timeout bound actually fires.
 * Without this, "we added timeouts" is an untested claim.
 */
export class HangingMemoryAdapter implements KnowledgeSearchPort, KnowledgePromotionPort {
  search(_query: string, _limit: number): Promise<KnowledgeSearchResult[]> {
    return new Promise(() => {});
  }
  promoteDecision(_input: PromotionInput): Promise<string> {
    return new Promise(() => {});
  }
}
