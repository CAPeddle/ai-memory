/**
 * ST-084 spike — Workflow Operations domain types.
 *
 * These are OPERATIONAL types, deliberately distinct from the memory domain's
 * `thought` representation. Nothing here is a thought, shard, wiki row, or graph
 * entity. That separation is criterion 1 of the ADR-016 host-acceptance gate.
 *
 * SPIKE / DISPOSABLE — see docs/plans/2026-07-29-001-awcp-ai-memory-host-spike.md
 */

/** Controlled policy scope. NOT a descriptive tag — a closed vocabulary. */
export type PolicyScope = "personal" | "corporate" | "mixed" | "public";

export const POLICY_SCOPES: readonly PolicyScope[] = [
  "personal",
  "corporate",
  "mixed",
  "public",
] as const;

export type PacketStatus = "open" | "in_progress" | "blocked" | "complete";
export type RunStatus = "running" | "ended" | "failed";
export type DecisionStatus = "open" | "resolved";
export type EvidenceKind = "manual" | "command_result" | "external_build";

export interface WorkPacket {
  id: string;
  title: string;
  objective: string;
  scope: string;
  constraints: string;
  repository: string | null;
  branch: string | null;
  policy_scope: PolicyScope;
  status: PacketStatus;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface AgentRun {
  id: string;
  packet_id: string;
  agent_type: string;
  host: string;
  node_id: string | null;
  working_dir: string | null;
  repository: string | null;
  branch: string | null;
  status: RunStatus;
  started_at: Date;
  ended_at: Date | null;
  last_event_at: Date;
}

export interface Checkpoint {
  id: string;
  run_id: string;
  completed_work: string;
  current_state: string;
  blockers: string | null;
  next_action: string | null;
  repo_commit: string | null;
  created_at: Date;
}

export interface OperationalDecision {
  id: string;
  packet_id: string;
  run_id: string | null;
  question: string;
  rationale: string | null;
  resolution: string | null;
  blocking: boolean;
  status: DecisionStatus;
  /**
   * Pointer OUT to an optional memory projection. Nullable, non-authoritative,
   * and deliberately NOT a foreign key — the memory domain may lose this row
   * without invalidating the decision. Criterion 3 depends on this property.
   */
  promoted_memory_ref: string | null;
  created_at: Date;
  resolved_at: Date | null;
}

export interface VerificationCriterion {
  id: string;
  packet_id: string;
  description: string;
  required: boolean;
  created_at: Date;
}

export interface EvidenceItem {
  id: string;
  criterion_id: string;
  kind: EvidenceKind;
  detail: string;
  recorded_commit: string | null;
  created_at: Date;
}

/** Deterministic attention reasons. No LLM inference is permitted (plan §Attention logic). */
export type AttentionReason =
  | "decision-required"
  | "blocked"
  | "stale"
  | "ended-without-checkpoint"
  | "ready-for-review";

export interface AttentionItem {
  packet_id: string;
  run_id: string | null;
  reason: AttentionReason;
  detail: string;
}

/**
 * Raised when applying the workflow schema fails.
 *
 * A typed, catchable failure is the whole point: the workflow module reports that
 * its schema could not be applied and lets the composition root decide whether that
 * should abort startup, degrade, or disable the product. It must never terminate
 * the process itself.
 */
export class WorkflowSchemaError extends Error {
  override readonly cause?: Error;
  constructor(message: string, cause?: Error) {
    super(cause ? `${message}: ${cause.message}` : message);
    this.name = "WorkflowSchemaError";
    this.cause = cause;
  }
}

/**
 * Base class for ordered-migration failures.
 *
 * Extends {@link WorkflowSchemaError} so an existing caller that catches "the
 * workflow module could not set up its schema" keeps working, while a caller that
 * wants to tell *which* way it failed — bad directory, drifted file, failed apply —
 * can branch on the subclass. None of them terminate the process.
 */
export class WorkflowMigrationError extends WorkflowSchemaError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "WorkflowMigrationError";
  }
}

/** Raised when the migration directory cannot be read or its contents are ambiguous. */
export class MigrationDiscoveryError extends WorkflowMigrationError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "MigrationDiscoveryError";
  }
}

/**
 * Raised when an ALREADY-APPLIED migration's file contents no longer match what was
 * applied.
 *
 * This is the failure mode that silently corrupts environments: someone edits an
 * applied migration, it re-runs as a no-op because the ledger says "done", and the
 * database quietly diverges from the file that claims to describe it. Detecting it
 * requires storing a checksum, which is the whole reason the ledger has that column.
 */
export class MigrationDriftError extends WorkflowMigrationError {
  readonly version: number;
  readonly filename: string;
  readonly appliedChecksum: string;
  readonly currentChecksum: string;
  constructor(
    version: number,
    filename: string,
    appliedChecksum: string,
    currentChecksum: string,
  ) {
    super(
      `Migration ${filename} (version ${version}) has changed since it was applied: ` +
        `ledger recorded ${appliedChecksum.slice(0, 12)}…, file now hashes to ` +
        `${currentChecksum.slice(0, 12)}…. Add a new migration instead of editing an ` +
        `applied one.`,
    );
    this.name = "MigrationDriftError";
    this.version = version;
    this.filename = filename;
    this.appliedChecksum = appliedChecksum;
    this.currentChecksum = currentChecksum;
  }
}

/** Raised when a pending migration failed to apply. Its transaction was rolled back. */
export class MigrationApplyError extends WorkflowMigrationError {
  readonly version: number;
  readonly filename: string;
  constructor(version: number, filename: string, cause: Error) {
    super(`Migration ${filename} (version ${version}) failed to apply`, cause);
    this.name = "MigrationApplyError";
    this.version = version;
    this.filename = filename;
  }
}

/**
 * Raised when a workflow record does not exist.
 *
 * A distinct class rather than a bare `Error` so a caller can tell "you asked for
 * something that isn't there" from an infrastructure fault. A bare Error made the
 * two indistinguishable to anyone branching on error type.
 */
export class WorkflowNotFoundError extends Error {
  readonly kind: string;
  readonly id: string;
  constructor(kind: string, id: string) {
    super(`No such ${kind}: ${id}`);
    this.name = "WorkflowNotFoundError";
    this.kind = kind;
    this.id = id;
  }
}

/**
 * Raised when the verification contract is modified after the packet is complete.
 *
 * A completed packet's contract is closed. Without this, a required criterion could
 * be inserted after completion and leave a `complete` packet permanently holding an
 * unmet required criterion — the completion gate's invariant broken *after* the gate
 * had already passed, which no amount of locking inside `completePacket` can prevent.
 */
export class CriteriaFrozenError extends Error {
  readonly packetId: string;
  constructor(packetId: string) {
    super(
      `Work packet ${packetId} is complete; its verification contract is frozen and ` +
        "cannot accept new criteria",
    );
    this.name = "CriteriaFrozenError";
    this.packetId = packetId;
  }
}

/**
 * Raised when an already-resolved decision is re-resolved with a DIFFERENT answer.
 *
 * Resolution is once-and-final. A same-answer retry is idempotent and returns the
 * stored record untouched, so a caller that retries after a network blip or an
 * indeterminate promotion is safe. A different answer is not a retry — it is a
 * second, conflicting decision wearing the first one's identity, and silently
 * overwriting it would erase the resolution the packet's history already depends on.
 * Carries both answers so the caller can show what it collided with.
 */
export class DecisionConflictError extends Error {
  readonly decisionId: string;
  readonly existingResolution: string | null;
  readonly attemptedResolution: string;
  constructor(
    decisionId: string,
    existingResolution: string | null,
    attemptedResolution: string,
  ) {
    super(
      `Operational decision ${decisionId} is already resolved as ` +
        `${JSON.stringify(existingResolution)}; refusing to overwrite it with ` +
        `${JSON.stringify(attemptedResolution)}`,
    );
    this.name = "DecisionConflictError";
    this.decisionId = decisionId;
    this.existingResolution = existingResolution;
    this.attemptedResolution = attemptedResolution;
  }
}

/** Raised when the completion gate rejects a packet. Carries the unmet criteria. */
export class CompletionBlockedError extends Error {
  readonly unmetCriteria: readonly string[];
  constructor(unmetCriteria: readonly string[]) {
    super(
      `Completion refused: ${unmetCriteria.length} verification criterion/criteria lack evidence: ${
        unmetCriteria.join("; ")
      }`,
    );
    this.name = "CompletionBlockedError";
    this.unmetCriteria = unmetCriteria;
  }
}
