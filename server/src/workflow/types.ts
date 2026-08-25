/**
 * ST-084 spike — Workflow Operations domain types.
 *
 * These are OPERATIONAL types, deliberately distinct from the memory domain's
 * `thought` representation. Nothing here is a thought, shard, wiki row, or graph
 * entity. That separation is criterion 1 of the ADR-016 host-acceptance gate.
 *
 * This is no longer a throwaway spike: the module now spans 12 source files,
 * 4 migrations under server/db/workflow/, and 11 test files, exercised by the
 * ST-086, ST-087 and ST-088 suites. Acceptance is still gated on ADR-016
 * (docs/design/adr/ADR-016-awcp-consolidation-host-topology.md), which as of
 * its revision 1.3 is Proposed — Conditional: Stage 1 criteria 1-4 are met,
 * 5-7 are outstanding. The revision is named because that is a point-in-time
 * claim about another document; re-read the ADR's own changelog rather than
 * trusting this line. So the shape here is provisional, not settled, pending
 * that gate. See docs/plans/2026-07-29-001-awcp-ai-memory-host-spike.md for
 * where it originated.
 *
 * **A seventh stamp survives, and not by oversight.**
 * server/db/workflow/001_workflow_schema.sql still opens `SPIKE / DISPOSABLE`,
 * so a reader following the "4 migrations" citation above lands on the very
 * claim this note retires. It could not be corrected with the other six: the
 * runner in schema.ts checksums raw file bytes, so any edit to an applied
 * migration — one comment character included — trips MigrationDriftError, and
 * index.ts exits 1 on drift before Deno.serve, so the port never opens.
 * Correcting it means updating the ledger checksum on every database that has
 * already applied it. That is an operational act, not a comment fix.
 */

/** Controlled policy scope. NOT a descriptive tag — a closed vocabulary. */
export type PolicyScope = "personal" | "corporate" | "mixed" | "public";

export const POLICY_SCOPES: readonly PolicyScope[] = [
  "personal",
  "corporate",
  "mixed",
  "public",
] as const;

/**
 * ADR-017 §2 — the closed set a WorkItem's provenance may name.
 *
 * Closed rather than open for the same reason {@link POLICY_SCOPES} is: a value
 * outside the set is a caller error, not a new integration. Widening it is an
 * amendment to ADR-017 §2 — its own Revisit Triggers say so explicitly — not an
 * edit at a call site.
 *
 * `awcp-native` is how work AWCP itself originated is represented. It names no
 * foreign namespace, so such items carry a null `source_ref`.
 */
export type SourceSystem = "jira" | "github" | "story-board" | "awcp-native";

export const SOURCE_SYSTEMS: readonly SourceSystem[] = [
  "jira",
  "github",
  "story-board",
  "awcp-native",
] as const;

/**
 * ADR-017 — one unit of *requested* work, and the optional parent of zero or more
 * {@link WorkPacket}s.
 *
 * **The omissions are the contract, so they are listed rather than left to be
 * rediscovered as gaps.**
 *
 *   - **No status field, and no derived status.** §6: a WorkItem has no aggregate
 *     status and no status projection. Requested-work status stays authoritative at
 *     its source (§2), and deriving one from packets whose own {@link PacketStatus}
 *     cannot leave `open` would manufacture a signal the server does not hold.
 *     There is nothing here to design later; a field added here reverses a settled
 *     decision.
 *   - **No {@link PolicyScope}.** §3: a Work Packet is the only authority for its
 *     own Policy Scope. A scope-gated operation reached through a WorkItem names
 *     the specific packet whose scope governs it — nothing is derived, defaulted or
 *     inferred from the set of a WorkItem's packets, because choosing among several
 *     packets' scopes implicitly would be choosing the boundary. There is no field
 *     to fabricate.
 *   - **No title, and no other copy of requested work.** §2 names *title*,
 *     hierarchy, priority and status as the columns whose authority sits at the
 *     source. The provenance pair is a reference to that authority, never a mirror
 *     of it.
 *   - **No attention.** §3: a WorkItem defines no attention semantics, no reasons
 *     and no rendering. {@link AttentionReason} stays derived and packet-level.
 *
 * Both secondary identities are nullable and neither is a primary key (§1) — the
 * `id` is the only identity, and both `(source_system, source_ref)` and `aw_label`
 * resolve *to* it. `aw_label` is nullable on every row rather than on native rows
 * only: §4 gives a dogfooded `story-board` item its own `AW-NNN` alongside its
 * provenance, and the label stays null until the allocator that mints `AW-NNN`
 * exists — which ADR-017 describes and deliberately does not build.
 */
export interface WorkItem {
  id: string;
  source_system: SourceSystem;
  source_ref: string | null;
  aw_label: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * What a caller may supply to create a WorkItem.
 *
 * Camel-cased to match `CreatePacketInput` and the other store inputs, which
 * is the seam where the API's naming meets the row's snake_case.
 *
 * **`awLabel` is absent, and that absence is the point.** ADR-017 §4 allocates
 * `AW-NNN` from AWCP's own persistence, where a database can enforce uniqueness —
 * never from a caller and never from the `ST-NNN` development-story registry. A
 * creation input with no label field cannot carry a minted one.
 */
export interface CreateWorkItemInput {
  sourceSystem: SourceSystem;
  sourceRef?: string | null;
}

/**
 * One CLAIM: an observed session associated with a WorkItem (ADR-017, KTD-D5).
 *
 * **An explicit operator act, never an inference.** Nothing derives this row from an
 * observation — `ingestRunEvents` materialises `observed_sessions` and stops there,
 * and a session that is never claimed stays observed forever, which is a legitimate
 * terminal state rather than a gap.
 *
 * **A claim does not promote the session.** A claimed session is still an
 * OBSERVATION: it carries no run, no packet and no policy scope, and this row adds
 * none of the three. An authoritative execution is an `agent_runs` row under a
 * packet, and nothing converts one into the other.
 *
 * `(node_id, session_id)` is the composite reference to `observed_sessions`, not two
 * independent fields — `session_id` is client-generated and explicitly
 * non-authoritative (KTD-B4 item 3), so it is only ever meaningful scoped to the node
 * whose bearer the hub actually proved.
 *
 * **There is no `released_at`, and no unclaim.** KTD-D5's table shape permits one, but
 * its authorization is unspecified; a column added ahead of that decision would be the
 * lifecycle chosen by whoever wrote the row type first.
 */
export interface WorkItemSessionClaim {
  id: string;
  work_item_id: string;
  node_id: string;
  session_id: string;
  claimed_at: Date;
}

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
  /**
   * The optional parent {@link WorkItem} (ADR-017 §3), added by migration 005.
   *
   * **Nullable is the contract, not a convenience.** A packet is entirely valid with
   * no parent, and every packet that predates the WorkItem layer stays valid,
   * unchanged and unparented. Binding is its own operator-only write and is never
   * settable at creation — `CreatePacketInput` deliberately has no counterpart to
   * this field, so a packet cannot arrive already parented.
   */
  work_item_id: string | null;
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
  /** The filename the ledger recorded, when it differs from the one being applied. */
  readonly appliedFilename: string | null;
  constructor(
    version: number,
    filename: string,
    appliedChecksum: string,
    currentChecksum: string,
    appliedFilename?: string,
  ) {
    // The checksum is the discriminating signal and the only thing raised on. The
    // recorded filename is carried for diagnosis — two runners in a mid-rollout deploy
    // may hold the same version under different names — but a rename with identical
    // contents is NOT drift and must not reach here.
    const named = appliedFilename !== undefined && appliedFilename !== filename
      ? ` (the ledger recorded it as ${appliedFilename})`
      : "";
    super(
      `Migration ${filename} (version ${version}) does not match what was applied` +
        `${named}: ledger recorded ${appliedChecksum.slice(0, 12)}…, this file hashes ` +
        `to ${currentChecksum.slice(0, 12)}…. Add a new migration instead of editing ` +
        `an applied one.`,
    );
    this.name = "MigrationDriftError";
    this.version = version;
    this.filename = filename;
    this.appliedChecksum = appliedChecksum;
    this.currentChecksum = currentChecksum;
    this.appliedFilename = appliedFilename ?? null;
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

/**
 * Raised when an already-terminal run is ended again with a DIFFERENT status.
 *
 * Mirrors {@link DecisionConflictError} for the same reason `store.endRun` mirrors
 * `resolveDecision`: ending a run is once-and-final. A same-status retry is
 * idempotent and returns the stored record untouched, so a caller that retries after
 * a timed-out request is safe. A different status is not a retry — it is a second,
 * conflicting verdict about how the run ended (e.g. `failed` arriving after `ended`
 * was already recorded), and silently overwriting the first would erase the verdict
 * the packet's history already depends on. Carries both statuses so the caller can
 * show what it collided with.
 */
export class RunConflictError extends Error {
  readonly runId: string;
  readonly existingStatus: RunStatus;
  readonly attemptedStatus: RunStatus;
  constructor(runId: string, existingStatus: RunStatus, attemptedStatus: RunStatus) {
    super(
      `Agent run ${runId} is already ended as ${JSON.stringify(existingStatus)}; refusing ` +
        `to overwrite it with ${JSON.stringify(attemptedStatus)}`,
    );
    this.name = "RunConflictError";
    this.runId = runId;
    this.existingStatus = existingStatus;
    this.attemptedStatus = attemptedStatus;
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
