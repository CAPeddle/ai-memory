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
 * **This bounds how long the CALLER waits. It does not cancel the underlying work.**
 * `Promise.race` abandons the losing promise; it does not stop it. The adapter's
 * request is still in flight and may still succeed after this rejects.
 *
 * That is why a timeout is classified as INDETERMINATE rather than as a failure —
 * see `PromotionOutcome` in service.ts. An earlier version of this comment described
 * the limitation and then the calling code ignored it, treating the timeout as a
 * definite non-event.
 *
 * An `AbortSignal` would let a real adapter actually cancel, and should be added when
 * one exists. It is NOT a substitute for the indeterminate outcome: cancellation is
 * itself racy — a request can commit on the server between the client's decision to
 * abort and the abort arriving — so the caller still has to be able to say "unknown".
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
   *
   * **`input.decisionId` is the idempotency key of this operation.** An
   * implementation MUST treat two calls carrying the same `decisionId` as the same
   * projection: at most one is created, and both calls return the SAME reference.
   *
   * This is a contract requirement, not an optimisation, because the caller cannot
   * avoid repeat calls. A promotion can return `indeterminate` (the bound elapsed
   * while the request was still in flight and uncancelled), and the only recovery
   * available to a caller holding "unknown" is to ask again. Without the key, that
   * second call mints a second projection and the first is orphaned. The same applies
   * to an ordinary retry after `resolveDecision` returns its idempotent
   * already-resolved row.
   *
   * NOTHING IN THIS SPIKE PROVES AN ADAPTER HONOURS THIS. Stage 1 ships the contract
   * and the outcome vocabulary; the adapters here are in-process fakes. Until a real
   * adapter demonstrates it — a test that calls twice with one `decisionId` and
   * asserts one projection and one identical reference — no retry in this system may
   * be described as safe.
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

/**
 * An adapter that SUCCEEDS, but slowly — after the caller's bound has already
 * elapsed.
 *
 * This is the case {@link HangingMemoryAdapter} cannot express and the one that
 * actually costs something. A hang that never completes leaves nothing behind; a call
 * that times out and *then* succeeds leaves a real projection in the memory domain
 * with nothing in the operational record pointing at it. `withPortTimeout` abandons
 * the promise, it does not cancel the work, so the projection lands after the caller
 * has already returned and moved on.
 *
 * `settled` resolves when the underlying work finishes, so a test can wait for the
 * late success deterministically instead of sleeping and hoping.
 */
export class LateSuccessMemoryAdapter implements KnowledgeSearchPort, KnowledgePromotionPort {
  readonly promotionCalls: PromotionInput[] = [];
  /** Refs the adapter actually minted — i.e. projections that really exist. */
  readonly mintedRefs: string[] = [];
  /** Resolves once the late promotion has completed. */
  readonly settled: Promise<void>;
  #markSettled!: () => void;

  constructor(private readonly delayMs = 50) {
    this.settled = new Promise<void>((resolve) => {
      this.#markSettled = resolve;
    });
  }

  search(_query: string, _limit: number): Promise<KnowledgeSearchResult[]> {
    return Promise.resolve([]);
  }

  promoteDecision(input: PromotionInput): Promise<string> {
    this.promotionCalls.push(input);
    return new Promise<string>((resolve) => {
      setTimeout(() => {
        const ref = `late:${input.decisionId}`;
        this.mintedRefs.push(ref);
        resolve(ref);
        this.#markSettled();
      }, this.delayMs);
    });
  }
}
