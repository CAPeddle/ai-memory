/**
 * ST-084 spike — Workflow Operations persistence.
 *
 * This is the ONLY workflow file that imports the database handle. Every
 * statement is schema-qualified `workflow.*` — mandatory, because AGE graph
 * queries leave a sticky polluted `search_path` on pooled connections (the
 * `graph_traverse` MCP tool, server/index.ts:1033; the entity worker's graph
 * reads, server/src/entityWorker.ts:115), so `workflow` is never implicit.
 * Sites are named as well as numbered because the numbers drift: this citation
 * said :941 until 2026-08-22. Other copies of it elsewhere in the tree still do.
 * The current census is deliberately NOT kept here — it belongs in an editable
 * file, and lives in
 * docs/solutions/conventions/an-applied-migrations-body-is-byte-frozen.md.
 *
 * No statement here touches `thoughts`, `entity_mentions`, `memory_graph`, or any
 * other memory-domain object. `workflow-boundary.test.ts` asserts that by
 * scanning this module's source.
 *
 * PROVISIONAL — not a throwaway spike; gated on ADR-016. See types.ts.
 */

import { sql } from "../db.ts";
import {
  type AgentRun,
  type Checkpoint,
  CompletionBlockedError,
  type CreateWorkItemInput,
  CriteriaFrozenError,
  DecisionConflictError,
  type EvidenceItem,
  type EvidenceKind,
  type OperationalDecision,
  type PolicyScope,
  RunConflictError,
  type VerificationCriterion,
  type WorkItem,
  type WorkPacket,
  WorkflowNotFoundError,
} from "./types.ts";

type SqlExecutor = typeof sql;

// --------------------------------------------------------------------------
// Work items — the packet's optional parent (ADR-017)
// --------------------------------------------------------------------------

/**
 * Create a WorkItem from a provenance pair.
 *
 * **This function mints nothing.** `id` comes from `gen_random_uuid()` and `aw_label`
 * is left null: ADR-017 §4 allocates `AW-NNN` from an allocator that does not exist
 * yet, and a creation path that quietly assigned one would settle the allocation
 * question by writing a value rather than by deciding it. There is no `awLabel`
 * parameter for the same reason `CreateWorkItemInput` has no such field.
 *
 * **The provenance pair's own rule is enforced at the edge, not here.**
 * `createWorkItemSchema` (schema.ts) refuses a native item carrying a ref and a
 * foreign item carrying none, so this insert never sees an invalid pair from the
 * HTTP surface. The database CHECK `work_items_provenance_pair` remains as the
 * invariant of record for every other caller — belt and braces in the direction that
 * matters, since a constraint can outlive a validator.
 *
 * There is deliberately NO update function beside this one. §2 gives the source
 * system authority over the requested work; nothing here rewrites a provenance pair
 * after the fact, because a WorkItem whose provenance can be edited is a WorkItem
 * that can be pointed at different requested work while keeping the packets bound to
 * it — a re-parenting with no record that it happened.
 */
export async function createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
  const rows = await sql<WorkItem[]>`
    INSERT INTO workflow.work_items (source_system, source_ref)
    VALUES (${input.sourceSystem}, ${input.sourceRef ?? null})
    RETURNING *
  `;
  return rows[0];
}

/**
 * Bind an existing packet to an existing WorkItem.
 *
 * **This is the only write that sets `work_packets.work_item_id`.** `createPacket`
 * cannot reach the column — ADR-017 §3 and KTD-D4 make the binding an operator-only
 * act, and a packet that could arrive already parented would let an agent-authored
 * packet become the scope authority for anything reached through a WorkItem.
 *
 * **Both parents are checked explicitly rather than left to the foreign key.** The
 * FK reports only that *some* constraint was violated, which at the HTTP edge
 * becomes a 404 that cannot say which id was wrong; a caller holding two ids and
 * being told one of them is bad is being told nothing. The FK stays as the race
 * backstop for a work item deleted between the check and the update — the check
 * narrows the common case, it does not replace the constraint.
 *
 * **Re-binding overwrites, and that is deliberate rather than unconsidered.** No
 * decision of record settles what a second bind means, so this refuses nothing:
 * inventing a conflict rule here would be taking a contract decision at a call site,
 * which is the failure mode ADR-017 §2's closed set exists to bar elsewhere. If
 * re-parenting should be refused or recorded, that is an amendment with its own
 * reasoning, not a default chosen by whoever wrote the store function first.
 */
export async function bindPacketToWorkItem(
  packetId: string,
  workItemId: string,
): Promise<WorkPacket> {
  return await sql.begin(async (tx: SqlExecutor) => {
    const items = await tx<{ id: string }[]>`
      SELECT id FROM workflow.work_items WHERE id = ${workItemId}
    `;
    if (items[0] === undefined) {
      throw new WorkflowNotFoundError("work item", workItemId);
    }

    const updated = await tx<WorkPacket[]>`
      UPDATE workflow.work_packets
      SET work_item_id = ${workItemId}, updated_at = now()
      WHERE id = ${packetId}
      RETURNING *
    `;
    if (updated[0] === undefined) {
      throw new WorkflowNotFoundError("work packet", packetId);
    }
    return updated[0];
  });
}

// --------------------------------------------------------------------------
// Work packets
// --------------------------------------------------------------------------

export interface CreatePacketInput {
  title: string;
  objective: string;
  scope?: string;
  constraints?: string;
  repository?: string | null;
  branch?: string | null;
  policyScope: PolicyScope;
}

export async function createPacket(input: CreatePacketInput): Promise<WorkPacket> {
  const rows = await sql<WorkPacket[]>`
    INSERT INTO workflow.work_packets
      (title, objective, scope, constraints, repository, branch, policy_scope)
    VALUES (
      ${input.title},
      ${input.objective},
      ${input.scope ?? ""},
      ${input.constraints ?? ""},
      ${input.repository ?? null},
      ${input.branch ?? null},
      ${input.policyScope}
    )
    RETURNING *
  `;
  return rows[0];
}

export async function getPacket(id: string): Promise<WorkPacket | null> {
  const rows = await sql<WorkPacket[]>`
    SELECT * FROM workflow.work_packets WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

/**
 * Packets that have not reached `complete` — the dashboard's active set.
 *
 * Filters on `status <> 'complete'` rather than listing the three open statuses, so a
 * status added to the CHECK constraint later shows up as active by default instead of
 * silently vanishing from the operator's view. Failing visible beats failing quiet.
 */
export async function listActivePackets(): Promise<WorkPacket[]> {
  return await sql<WorkPacket[]>`
    SELECT * FROM workflow.work_packets
    WHERE status <> 'complete'
    ORDER BY created_at DESC
  `;
}

// There is deliberately NO generic packet-status setter here.
//
// One existed (`setPacketStatus`) and was removed. It had no callers and wrote any
// status, `complete` included, with no gate — so the public workflow API contained a
// route that manufactured a completed packet while its required criteria sat without
// evidence, and the reverse: `setPacketStatus(id, "open")` un-completed a packet and
// silently thawed the verification contract that `addCriterion` freezes. Either
// direction invalidates the claim that this API preserves the completion invariant,
// regardless of how well `completePacket` and `addCriterion` behave.
//
// Stage 1 therefore implements exactly two packet-status transitions, both earned:
// creation (`createPacket` → 'open') and verified completion (`completePacket` →
// 'complete'). 'in_progress' and 'blocked' are defined in the CHECK constraint and
// are currently unreachable; that is a known Stage 1 gap, not an invitation to add a
// setter back. Whatever reaches them must carry its own preconditions.

// --------------------------------------------------------------------------
// Agent runs
// --------------------------------------------------------------------------

export interface RegisterRunInput {
  packetId: string;
  agentType: string;
  host: string;
  nodeId?: string | null;
  workingDir?: string | null;
  repository?: string | null;
  branch?: string | null;
}

export async function registerRun(input: RegisterRunInput): Promise<AgentRun> {
  const rows = await sql<AgentRun[]>`
    INSERT INTO workflow.agent_runs
      (packet_id, agent_type, host, node_id, working_dir, repository, branch)
    VALUES (
      ${input.packetId},
      ${input.agentType},
      ${input.host},
      ${input.nodeId ?? null},
      ${input.workingDir ?? null},
      ${input.repository ?? null},
      ${input.branch ?? null}
    )
    RETURNING *
  `;
  return rows[0];
}

/**
 * End a run. Once-and-final, with an idempotent retry — the same shape as
 * {@link resolveDecision}, because it is the same problem.
 *
 * This used to be a bare `UPDATE ... WHERE id = $1` with no terminal-state check, and
 * that was falsifiable in exactly the way `resolveDecision`'s docblock warns about at
 * length: a timed-out client retrying its own "end" request re-stamped `ended_at` on
 * every retry, and a second call reporting a DIFFERENT status (`failed` after `ended`
 * was already recorded, or the reverse) silently overwrote the first verdict with no
 * record that the two ever disagreed. Over HTTP that is a 200 for a write that quietly
 * rewrote history, which is the shape of a silent failure.
 *
 * Three outcomes, all deliberate:
 *
 *   - **running** → ended/failed, as requested. `ended_at` and `last_event_at` are
 *     stamped now.
 *   - **already terminal, SAME status** → the stored row is returned *unchanged*,
 *     original `ended_at` intact. A caller retrying its own "end" call after a
 *     network blip must not see the run's close time move forward on every retry.
 *   - **already terminal, DIFFERENT status** → {@link RunConflictError}.
 *
 * `FOR UPDATE` for the same reason `resolveDecision` takes it: read-then-write
 * without the row lock is a race between two concurrent enders, and the lock makes
 * the loser observe the winner's committed row and take the idempotent or conflict
 * path instead of a second unconditional write.
 *
 * The existence check is unchanged from before: a run id that matches no row is a
 * {@link WorkflowNotFoundError}, not a silently-successful no-op.
 */
export async function endRun(
  runId: string,
  status: Extract<AgentRun["status"], "ended" | "failed">,
): Promise<AgentRun> {
  return await sql.begin(async (tx: SqlExecutor) => {
    const existing = await tx<AgentRun[]>`
      SELECT * FROM workflow.agent_runs WHERE id = ${runId} FOR UPDATE
    `;
    const current = existing[0];
    if (current === undefined) throw new WorkflowNotFoundError("agent run", runId);

    if (current.status === "ended" || current.status === "failed") {
      if (current.status === status) return current;
      throw new RunConflictError(runId, current.status, status);
    }

    const rows = await tx<AgentRun[]>`
      UPDATE workflow.agent_runs
      SET status = ${status}, ended_at = now(), last_event_at = now()
      WHERE id = ${runId}
      RETURNING *
    `;
    return rows[0];
  });
}

export async function getRun(id: string): Promise<AgentRun | null> {
  const rows = await sql<AgentRun[]>`
    SELECT * FROM workflow.agent_runs WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

export async function listRuns(packetId: string): Promise<AgentRun[]> {
  return await sql<AgentRun[]>`
    SELECT * FROM workflow.agent_runs
    WHERE packet_id = ${packetId}
    ORDER BY started_at ASC
  `;
}

/** Test seam: force a run's last_event_at into the past to exercise the stale rule. */
export async function backdateRunActivity(runId: string, interval: string): Promise<void> {
  await sql`
    UPDATE workflow.agent_runs
    SET last_event_at = now() - ${interval}::interval
    WHERE id = ${runId}
  `;
}

// --------------------------------------------------------------------------
// Checkpoints
// --------------------------------------------------------------------------

export interface RecordCheckpointInput {
  runId: string;
  completedWork: string;
  currentState: string;
  blockers?: string | null;
  nextAction?: string | null;
  repoCommit?: string | null;
}

export async function recordCheckpoint(
  input: RecordCheckpointInput,
): Promise<Checkpoint> {
  // A checkpoint is a meaningful event: it refreshes the run's staleness clock in
  // the same transaction, so the two can never disagree.
  return await sql.begin(async (tx: SqlExecutor) => {
    const rows = await tx<Checkpoint[]>`
      INSERT INTO workflow.checkpoints
        (run_id, completed_work, current_state, blockers, next_action, repo_commit)
      VALUES (
        ${input.runId},
        ${input.completedWork},
        ${input.currentState},
        ${input.blockers ?? null},
        ${input.nextAction ?? null},
        ${input.repoCommit ?? null}
      )
      RETURNING *
    `;
    await tx`
      UPDATE workflow.agent_runs SET last_event_at = now() WHERE id = ${input.runId}
    `;
    return rows[0];
  });
}

export async function listCheckpoints(packetId: string): Promise<Checkpoint[]> {
  return await sql<Checkpoint[]>`
    SELECT c.* FROM workflow.checkpoints c
    JOIN workflow.agent_runs r ON r.id = c.run_id
    WHERE r.packet_id = ${packetId}
    ORDER BY c.created_at ASC
  `;
}

/**
 * The most recent checkpoints for a packet, newest first.
 *
 * Bounded at the database rather than by slicing {@link listCheckpoints} in the
 * caller: a long-running packet accumulates checkpoints without limit, and the
 * dashboard only ever renders the tail of that list.
 */
export async function listRecentCheckpoints(
  packetId: string,
  limit = 10,
): Promise<Checkpoint[]> {
  return await sql<Checkpoint[]>`
    SELECT c.* FROM workflow.checkpoints c
    JOIN workflow.agent_runs r ON r.id = c.run_id
    WHERE r.packet_id = ${packetId}
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `;
}

// --------------------------------------------------------------------------
// Operational decisions
// --------------------------------------------------------------------------

export interface RecordDecisionInput {
  packetId: string;
  runId?: string | null;
  question: string;
  rationale?: string | null;
  blocking?: boolean;
}

export async function recordDecision(
  input: RecordDecisionInput,
): Promise<OperationalDecision> {
  const rows = await sql<OperationalDecision[]>`
    INSERT INTO workflow.operational_decisions
      (packet_id, run_id, question, rationale, blocking)
    VALUES (
      ${input.packetId},
      ${input.runId ?? null},
      ${input.question},
      ${input.rationale ?? null},
      ${input.blocking ?? true}
    )
    RETURNING *
  `;
  return rows[0];
}

/**
 * Resolve an OPEN decision. Once-and-final, with an idempotent retry.
 *
 * Three outcomes, all deliberate:
 *
 *   - **open** → resolved. `resolved_at` is stamped now.
 *   - **already resolved, same answer** → the stored row is returned *unchanged*,
 *     original `resolved_at` intact. This is what makes retry safe, and it matters
 *     more than it looks: {@link resolveAndPromoteDecision} can return an
 *     indeterminate promotion outcome, and the caller's only sane recovery is to
 *     call again. A blind re-UPDATE would have moved `resolved_at` forward on every
 *     such retry, quietly falsifying when the decision was actually made.
 *   - **already resolved, different answer** → {@link DecisionConflictError}.
 *
 * The read and the branch are in one transaction with `FOR UPDATE` for the same
 * reason `addCriterion` is: read-then-write without the row lock is a race, and two
 * concurrent resolutions with different answers could both observe `open` and the
 * second would overwrite the first. The lock makes the loser see the winner's
 * committed row and take the idempotent or conflict path.
 *
 * Note this deliberately does NOT clear `promoted_memory_ref` on the idempotent
 * path — see attachPromotionRef.
 */
export async function resolveDecision(
  decisionId: string,
  resolution: string,
): Promise<OperationalDecision> {
  return await sql.begin(async (tx: SqlExecutor) => {
    const existing = await tx<OperationalDecision[]>`
      SELECT * FROM workflow.operational_decisions WHERE id = ${decisionId} FOR UPDATE
    `;
    // Explicit existence check: a bare `rows[0]` on a no-match UPDATE is `undefined`
    // while the signature promises OperationalDecision. Returning it unchecked pushed
    // an opaque TypeError downstream, where a caller's catch misattributed it to a
    // memory-promotion failure.
    const current = existing[0];
    if (current === undefined) {
      throw new WorkflowNotFoundError("operational decision", decisionId);
    }

    if (current.status === "resolved") {
      if (current.resolution === resolution) return current;
      throw new DecisionConflictError(decisionId, current.resolution, resolution);
    }

    const rows = await tx<OperationalDecision[]>`
      UPDATE workflow.operational_decisions
      SET status = 'resolved', resolution = ${resolution}, resolved_at = now()
      WHERE id = ${decisionId}
      RETURNING *
    `;
    return rows[0];
  });
}

export async function getDecision(id: string): Promise<OperationalDecision | null> {
  const rows = await sql<OperationalDecision[]>`
    SELECT * FROM workflow.operational_decisions WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

export async function listDecisions(packetId: string): Promise<OperationalDecision[]> {
  return await sql<OperationalDecision[]>`
    SELECT * FROM workflow.operational_decisions
    WHERE packet_id = ${packetId}
    ORDER BY created_at ASC
  `;
}

/**
 * Record the memory projection reference. Deliberately a standalone UPDATE run
 * AFTER the operational write has committed — never inside an operational
 * transaction — so a promotion failure cannot roll back operational state.
 *
 * RESIDUAL (not fixed here, recorded so it is not mistaken for handled): this
 * overwrites unconditionally. With `resolveDecision` now idempotent on retry, the
 * reachable sequence "resolve → promote → retry → promote again" ends with the
 * second projection's ref overwriting the first, orphaning projection #1 with
 * nothing pointing at it. The fix is not here — it is `decisionId` as the port's
 * idempotency key, so the adapter returns the SAME ref rather than minting a
 * second projection. See KnowledgePromotionPort.
 */
export async function attachPromotionRef(
  decisionId: string,
  ref: string,
): Promise<void> {
  await sql`
    UPDATE workflow.operational_decisions
    SET promoted_memory_ref = ${ref}
    WHERE id = ${decisionId}
  `;
}

/** Simulates the memory-side projection being deleted out from under us. */
export async function clearPromotionRef(decisionId: string): Promise<void> {
  await sql`
    UPDATE workflow.operational_decisions
    SET promoted_memory_ref = NULL
    WHERE id = ${decisionId}
  `;
}

// --------------------------------------------------------------------------
// Verification criteria + evidence
// --------------------------------------------------------------------------

/**
 * Add a verification criterion, taking the packet lock first.
 *
 * **Why this locks, when a bare INSERT would satisfy the foreign key.** The
 * completion gate reads the criteria set and then marks the packet complete. If a
 * required criterion can be inserted between those two steps, the packet completes
 * holding an unmet criterion — the gate's invariant broken by a writer the gate
 * never sees. `FOR UPDATE` here takes the *same* row lock `completePacket` takes,
 * so the two serialise instead of interleaving.
 *
 * Locking alone is not sufficient, which is easy to get wrong: it makes the race
 * deterministic without making it safe, because a criterion inserted *after*
 * completion commits is not a race at all and still breaks the invariant. Hence the
 * status check — once a packet is complete its verification contract is frozen.
 *
 * Between them the two orderings are both safe: this call first, and the gate then
 * sees the new unmet criterion and refuses; the gate first, and this call rejects.
 */
export async function addCriterion(
  packetId: string,
  description: string,
  required = true,
): Promise<VerificationCriterion> {
  return await sql.begin(async (tx: SqlExecutor) => {
    const packets = await tx<WorkPacket[]>`
      SELECT * FROM workflow.work_packets WHERE id = ${packetId} FOR UPDATE
    `;
    const packet = packets[0];
    if (packet === undefined) throw new WorkflowNotFoundError("work packet", packetId);
    if (packet.status === "complete") throw new CriteriaFrozenError(packetId);

    const rows = await tx<VerificationCriterion[]>`
      INSERT INTO workflow.verification_criteria (packet_id, description, required)
      VALUES (${packetId}, ${description}, ${required})
      RETURNING *
    `;
    return rows[0];
  });
}

export async function listCriteria(packetId: string): Promise<VerificationCriterion[]> {
  return await sql<VerificationCriterion[]>`
    SELECT * FROM workflow.verification_criteria
    WHERE packet_id = ${packetId}
    ORDER BY created_at ASC
  `;
}

export interface AttachEvidenceInput {
  criterionId: string;
  kind: EvidenceKind;
  detail: string;
  recordedCommit?: string | null;
}

export async function attachEvidence(input: AttachEvidenceInput): Promise<EvidenceItem> {
  const rows = await sql<EvidenceItem[]>`
    INSERT INTO workflow.evidence_items (criterion_id, kind, detail, recorded_commit)
    VALUES (
      ${input.criterionId},
      ${input.kind},
      ${input.detail},
      ${input.recordedCommit ?? null}
    )
    RETURNING *
  `;
  return rows[0];
}

export async function getCriterion(id: string): Promise<VerificationCriterion | null> {
  const rows = await sql<VerificationCriterion[]>`
    SELECT * FROM workflow.verification_criteria WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

/** Every evidence item attached to any criterion of this packet, oldest first. */
export async function listEvidenceForPacket(packetId: string): Promise<EvidenceItem[]> {
  return await sql<EvidenceItem[]>`
    SELECT e.* FROM workflow.evidence_items e
    JOIN workflow.verification_criteria c ON c.id = e.criterion_id
    WHERE c.packet_id = ${packetId}
    ORDER BY e.created_at ASC
  `;
}

export async function evidenceCountsForPacket(
  packetId: string,
): Promise<Map<string, number>> {
  const rows = await sql<{ criterion_id: string; n: string }[]>`
    SELECT c.id AS criterion_id, count(e.id) AS n
    FROM workflow.verification_criteria c
    LEFT JOIN workflow.evidence_items e ON e.criterion_id = c.id
    WHERE c.packet_id = ${packetId}
    GROUP BY c.id
  `;
  return new Map(rows.map((r) => [r.criterion_id, Number(r.n)]));
}

// --------------------------------------------------------------------------
// Completion gate
// --------------------------------------------------------------------------

/**
 * Verify every required criterion has evidence, then mark the packet complete.
 * Throws `CompletionBlockedError` when criteria are unmet — the gate is a refusal,
 * not a warning.
 *
 * **What the locking actually guarantees — stated precisely, because two earlier
 * versions of this comment got it wrong in different ways.** `FOR UPDATE` locks the
 * one `work_packets` row. It does **not** lock `verification_criteria` or
 * `evidence_items`, which this transaction reads: under Postgres's default READ
 * COMMITTED those are re-snapshotted per statement.
 *
 * The criterion-insert window is nevertheless **closed**, not by this lock alone but
 * because `addCriterion` now takes the *same* row lock and refuses once the packet
 * is complete. That is what makes `FOR UPDATE` here load-bearing: with a contending
 * writer on the same row, the two operations serialise, and whichever loses observes
 * the other's committed state. Delete `FOR UPDATE` from this function and
 * `workflow-failure-isolation.test.ts` fails — the lock is now covered by a genuine
 * red/green control rather than asserted here in prose.
 *
 * **Still open — evidence DELETE.** A concurrent delete of an evidence row between
 * the check and the update is a different writer on a different table, and this lock
 * does not close it. In-module the only deletion route is `deletePacket`'s cascade,
 * which blocks on this same packet lock; an external writer is unconstrained.
 * Recorded as a residual rather than papered over. Closing it generally needs
 * SERIALIZABLE, or the same lock-and-refuse treatment on `attachEvidence`'s inverse.
 *
 * Note this touches ONLY workflow tables and calls no port: completion never
 * depends on the memory domain being reachable (criterion 1).
 */
export async function completePacket(packetId: string): Promise<WorkPacket> {
  return await sql.begin(async (tx: SqlExecutor) => {
    const packets = await tx<WorkPacket[]>`
      SELECT * FROM workflow.work_packets WHERE id = ${packetId} FOR UPDATE
    `;
    if (packets.length === 0) {
      throw new WorkflowNotFoundError("work packet", packetId);
    }

    const unmet = await tx<{ description: string }[]>`
      SELECT c.description
      FROM workflow.verification_criteria c
      WHERE c.packet_id = ${packetId}
        AND c.required = true
        AND NOT EXISTS (
          SELECT 1 FROM workflow.evidence_items e WHERE e.criterion_id = c.id
        )
      ORDER BY c.created_at ASC
    `;
    if (unmet.length > 0) {
      throw new CompletionBlockedError(unmet.map((r) => r.description));
    }

    const updated = await tx<WorkPacket[]>`
      UPDATE workflow.work_packets
      SET status = 'complete', completed_at = now(), updated_at = now()
      WHERE id = ${packetId}
      RETURNING *
    `;
    return updated[0];
  });
}

// --------------------------------------------------------------------------
// Live readiness probe
// --------------------------------------------------------------------------

/**
 * Cheap LIVE proof that the workflow schema is still present and queryable.
 *
 * `/ready` used to answer from the boot-time migration report alone — computed once
 * before `Deno.serve` and read on every request after that, forever. If the schema
 * were dropped or made unusable after boot, `/ready` would keep reporting
 * `workflow: {status: "ok"}` indefinitely, so an orchestrator would keep routing
 * traffic to a server whose workflow routes all fail. This is queried fresh on every
 * readiness check instead of trusting that frozen report.
 *
 * `to_regclass` returns NULL for a relation that does not exist (including one whose
 * schema was dropped entirely) rather than raising, so the boolean coercion above the
 * catch is the ordinary path; the `catch` exists for the rest — connection failures,
 * a permissions change, anything that makes the query itself impossible to run.
 * Either kind of failure collapses to `false`: the caller only needs to know whether
 * the workflow schema can currently answer a trivial query, not which way it failed.
 */
export async function probeWorkflowSchemaLive(): Promise<boolean> {
  try {
    const rows = await sql<{ present: boolean }[]>`
      SELECT to_regclass('workflow.schema_migrations') IS NOT NULL AS present
    `;
    return rows[0]?.present === true;
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// Remote execution nodes (ST-088 U2 — NODE-01, NODE-02)
// --------------------------------------------------------------------------
//
// These live here rather than in remoteNodeHub.ts because this is the only workflow
// file permitted to hold the database handle — workflow-boundary.test.ts asserts it by
// scanning the module's source. The route factory calls these; it never imports ../db.ts.

export interface UpsertExecutionNodeInput {
  /** sha256Hex of the presented bearer. The raw bearer never reaches this layer. */
  bearerTokenHash: string;
  hostname?: string | null;
  platform?: string | null;
  /**
   * May an UNKNOWN bearer become a node here?
   *
   * There is no default, deliberately. A caller that forgets this field fails to
   * compile rather than silently re-opening enrolment to anyone — which is precisely
   * how the original hole got in. The hub grants it only for a request that carried
   * the operator's enrolment secret; see remoteNodeHub.ts.
   */
  allowEnrolment: boolean;
}

/**
 * Resolve a bearer digest to a node identity, creating one only if it is new.
 *
 * UPDATE-then-INSERT rather than the obvious `INSERT ... ON CONFLICT DO UPDATE SET`,
 * for a reason that is not stylistic: workflow-boundary.test.ts scans this file with
 * `/\b(?:FROM|INTO|UPDATE|JOIN)\s+([A-Za-z_][\w.]*)/gi` and asserts every captured
 * identifier is `workflow.`-qualified. On `DO UPDATE SET last_seen_at` that regex
 * captures the token after UPDATE — `SET` — and fails the build. The shape below is
 * equivalent and does not trip it.
 *
 * Three statements, because a concurrent pair of registrations has three possible
 * outcomes and all of them must resolve to ONE identity:
 *   1. UPDATE hits    — the node already existed; refresh liveness, return it.
 *   2. INSERT hits    — genuinely new; UNIQUE(bearer_token_hash) makes this safe.
 *   3. INSERT no-ops  — we lost the race between 1 and 2. DO NOTHING returns no row,
 *                       so read back the identity the winner created.
 * Without step 3 the loser of a race would return no node_id at all, which is the
 * failure the NODE-01 concurrency probe exists to catch.
 *
 * ---------------------------------------------------------------------------
 * THE ENROLMENT GATE — the line between "known node" and "anyone".
 * ---------------------------------------------------------------------------
 * Only step 2 is gated. That split is the whole design:
 *
 *   - step 1 (UPDATE) is a bearer we have ALREADY enrolled proving it again. It needs
 *     no secret, which is what lets a node re-register on every boot forever with
 *     nothing on disk but its own bearer — the ssh-key half of the analogy.
 *   - step 2 (INSERT) is a bearer we have never seen asking to BECOME a node. That is
 *     the trust decision, and it requires the operator's enrolment secret — the
 *     ssh-copy-id half, presented once and then never again.
 *
 * Returns null when an unknown bearer arrives without that authorisation. Null is "no
 * identity", not an error: the route answers the same 401 as any other unrecognised
 * credential, so a prober learns nothing beyond what it already knew.
 *
 * A shared static secret has no per-node revocation, and `status` has no `revoked`
 * value — deleting a node's row lets the same secret re-enrol it. Adequate for a
 * single operator-provisioned node; Phase 3 must not assume otherwise.
 */
export async function upsertExecutionNode(
  input: UpsertExecutionNodeInput,
): Promise<{ node_id: string } | null> {
  const { bearerTokenHash, hostname = null, platform = null, allowEnrolment } = input;

  return await sql.begin(async (tx: SqlExecutor) => {
    // Serialise concurrent registrations OF THE SAME BEARER before reading anything.
    //
    // Step 3 alone is not sufficient without this. `ON CONFLICT DO NOTHING` explicitly
    // does NOT wait on a concurrent *uncommitted* conflicting insert, so under READ
    // COMMITTED the loser's read-back takes a fresh snapshot that still cannot see the
    // winner's row — and step 3 returns nothing, which is the exact race it was written
    // to close. The lock removes the interleaving rather than coping with it.
    //
    // Scoped to this digest, so it costs nothing in practice: contention is per node,
    // and a node registers once per boot.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${bearerTokenHash}, 0))`;

    // COALESCE so a re-registering node refreshes hostname/platform (it may have been
    // renamed or upgraded) while a payload that omits them keeps what was recorded,
    // rather than nulling it.
    //
    // Note for anyone editing, CORRECTED by ST-097: `ON CONFLICT ... DO UPDATE SET` was
    // barred here because the boundary scan captured the token after UPDATE and read
    // `SET` as an unqualified identifier. That false positive is fixed — the scan now
    // excludes `DO UPDATE` (workflow-boundary.test.ts), and `upsertObservedSessions`
    // below uses the construct. This function keeps its UPDATE-then-INSERT shape for
    // its own reasons, which the scanner never had anything to do with: the enrolment
    // gate sits BETWEEN the two statements, and the advisory lock above exists for the
    // read-back race that `ON CONFLICT DO NOTHING` cannot close.
    const updated = await tx<{ node_id: string }[]>`
      UPDATE workflow.execution_nodes
      SET last_seen_at = now(),
          status = 'active',
          hostname = COALESCE(${hostname}::text, hostname),
          platform = COALESCE(${platform}::text, platform)
      WHERE bearer_token_hash = ${bearerTokenHash}
      RETURNING node_id
    `;
    if (updated[0] !== undefined) return updated[0];

    // Unknown bearer. Everything past here is enrolment, and enrolment is gated.
    if (!allowEnrolment) return null;

    const inserted = await tx<{ node_id: string }[]>`
      INSERT INTO workflow.execution_nodes (bearer_token_hash, hostname, platform)
      VALUES (${bearerTokenHash}, ${hostname}, ${platform})
      ON CONFLICT (bearer_token_hash) DO NOTHING
      RETURNING node_id
    `;
    if (inserted[0] !== undefined) return inserted[0];

    const existing = await tx<{ node_id: string }[]>`
      SELECT node_id FROM workflow.execution_nodes
      WHERE bearer_token_hash = ${bearerTokenHash}
    `;
    if (existing[0] === undefined) {
      // Unreachable while the advisory lock holds: nothing else can have inserted and
      // then removed this digest inside our lock window. Asserted rather than assumed,
      // because the alternative is returning undefined through a signature that
      // promises a node_id and failing later as an opaque 500 in the route.
      throw new Error(
        "upsertExecutionNode: bearer conflicted on INSERT but no row was readable",
      );
    }
    return existing[0];
  });
}

/** Look up a node by id alone. Used to tell "unknown node" (404) from "not yours" (401). */
export async function findExecutionNode(
  nodeId: string,
): Promise<{ node_id: string } | null> {
  const rows = await sql<{ node_id: string }[]>`
    SELECT node_id FROM workflow.execution_nodes WHERE node_id = ${nodeId}
  `;
  return rows[0] ?? null;
}

/**
 * Does this bearer digest own this node?
 *
 * The comparison is a parameterised SQL predicate, deliberately, rather than fetching
 * the stored digest and comparing it in JS. Ownership is the cross-node injection
 * guard, and a JS compare would be one `===` away from a subtle bug (a non-constant
 * compare, a null-vs-undefined slip, a row that was never found being treated as a
 * match). Letting the database answer the question means there is no intermediate
 * value to get wrong.
 */
export async function nodeOwnsBearer(
  nodeId: string,
  bearerTokenHash: string,
): Promise<boolean> {
  const rows = await sql<{ node_id: string }[]>`
    SELECT node_id FROM workflow.execution_nodes
    WHERE node_id = ${nodeId} AND bearer_token_hash = ${bearerTokenHash}
  `;
  return rows.length === 1;
}

export interface RunEventInput {
  client_seq: number;
  event_type: string;
  /**
   * The payload VALUE, already screened by the edge, or null when absent.
   *
   * A value and not pre-encoded JSON text, deliberately: postgres.js serialises for a
   * `jsonb` column itself, so handing it a string stores that string AS a JSON string —
   * `"{\"line\":\"x\"}"` rather than an object — and the double encoding is invisible
   * until something reads the column back.
   *
   * "Already screened" means the edge has enforced the byte ceiling and removed the
   * characters Postgres rejects inside jsonb. That work lives there because the edge
   * must encode each payload to measure it anyway; doing it twice invited the two
   * copies to disagree.
   */
  payload: unknown;
}

/**
 * The event types that carry observed-session lifecycle (ST-097, KTD-B4 item 4).
 *
 * The EVENT TYPE is what decides whether an event is a session event — never the
 * presence of a payload key. That is the whole difference between this and the
 * rejected jsonb-grep view over `run_events`: a grep makes the claim (B4) and any
 * later abandonment evaluation depend on a payload field, and the abandonment case —
 * a `SIGKILL` that never writes a stop record — is the one most likely to omit it.
 *
 * B3 owns emitting these. This module owns only what they materialise into.
 */
const SESSION_EVENT_TYPES = new Set([
  "session_start",
  "session_heartbeat",
  "session_end",
]);

/**
 * The observed-session payload field set, read here and closed by KTD-B4 item 6.
 *
 * **ASSUMPTION ON B3, recorded rather than left implicit.** Item 6 closes the payload
 * at `session_id`, an event timestamp and `node_id`, but does not name the keys. These
 * are the keys this materialisation reads:
 *
 *   - `session_id` — a non-empty string. Client-generated, opaque and explicitly
 *     NON-AUTHORITATIVE (item 2).
 *   - `at` — the event's own instant, ISO 8601. Named for the `*_at` convention of the
 *     columns it lands in.
 *   - `node_id` — present because item 6 puts it there, and DELIBERATELY IGNORED here.
 *     Identity is the node the bearer proved at the route, not one a payload asserts
 *     (item 3): the hub's forgery defence covers `node_id`, and it cannot cover a
 *     payload field.
 *
 * Anything else in the payload is stored on the raw lane and read by nothing.
 */
interface SessionEventFacts {
  session_id: string;
  at: Date;
}

/**
 * Read the session facts out of one event's payload, or null if it carries none.
 *
 * Null is "not materialisable", not an error. The run event is still stored: the lane
 * of record records what arrived, and REJECTING a malformed session event belongs at
 * the edge, which is B3's. Failing here instead would abort the whole multi-row INSERT
 * — the batch is one statement — and the read-back acknowledgement would then turn one
 * bad payload into a permanent retry loop for every event beside it.
 *
 * `at` falls back to the caller's ingest instant when absent or unparseable, which is
 * the closest thing to the truth this layer holds. That fallback is safe against replay
 * only because materialisation is gated on the INSERT's `RETURNING` — see
 * {@link ingestRunEventsTx}.
 */
function sessionFactsOf(event: RunEventInput, fallbackAt: Date): SessionEventFacts | null {
  if (!SESSION_EVENT_TYPES.has(event.event_type)) return null;
  const payload = event.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;

  const { session_id: sessionId, at } = payload as Record<string, unknown>;
  if (typeof sessionId !== "string" || sessionId === "") return null;

  const parsed = typeof at === "string" ? new Date(at) : null;
  return {
    session_id: sessionId,
    at: parsed !== null && !Number.isNaN(parsed.getTime()) ? parsed : fallbackAt,
  };
}

interface ObservedSessionRow {
  session_id: string;
  started_at: Date;
  last_heartbeat_at: Date;
  ended_at: Date | null;
}

/**
 * Fold a batch down to one row per session, by the SAME monotone rule the upsert
 * applies against the stored row.
 *
 * One row per session is a requirement, not a tidiness: `ON CONFLICT DO UPDATE` refuses
 * a multi-row VALUES that conflicts on the same key twice ("cannot affect row a second
 * time"), and one batch legitimately carries a whole start/heartbeat/end lifecycle.
 *
 * The rule is min/max, never last-write-wins, and that is what makes the stored row a
 * pure function of the SET of events observed rather than of their arrival order — so a
 * spool draining out of order after a reconnect converges on the same row as an
 * in-order delivery.
 *
 * `session_end` also advances `last_heartbeat_at`: receiving a close IS an observation
 * that the session was alive at that instant.
 */
function foldSessionEvents(
  events: RunEventInput[],
  fallbackAt: Date,
): ObservedSessionRow[] {
  const folded = new Map<string, ObservedSessionRow>();

  for (const event of events) {
    const facts = sessionFactsOf(event, fallbackAt);
    if (facts === null) continue;

    const endedAt = event.event_type === "session_end" ? facts.at : null;
    const existing = folded.get(facts.session_id);
    if (existing === undefined) {
      folded.set(facts.session_id, {
        session_id: facts.session_id,
        // A heartbeat or a close arriving with no start seen is materialised anyway,
        // with the earliest instant actually observed as `started_at`. A lost
        // `session_start` must not cost the session its row — that is precisely the
        // case the rejected grep-on-read would have handled worst.
        started_at: facts.at,
        last_heartbeat_at: facts.at,
        ended_at: endedAt,
      });
      continue;
    }
    if (facts.at < existing.started_at) existing.started_at = facts.at;
    if (facts.at > existing.last_heartbeat_at) existing.last_heartbeat_at = facts.at;
    if (endedAt !== null && (existing.ended_at === null || endedAt > existing.ended_at)) {
      existing.ended_at = endedAt;
    }
  }

  return [...folded.values()];
}

/**
 * Persist a batch, ignoring anything already stored.
 *
 * `ON CONFLICT (node_id, client_seq) DO NOTHING` is what makes a node's retry safe:
 * the node re-sends whatever it did not see acknowledged, and a replayed batch must
 * neither duplicate state nor error.
 *
 * ONE multi-row statement, not one INSERT per event. The loop this replaced awaited up
 * to 500 sequential round trips while holding a connection from a pool of 10 that is
 * shared with search, capture, and every background worker — so a single authorised
 * node sending maximum batches could starve the memory API that is this process's
 * actual job.
 *
 * `RETURNING client_seq` names exactly the events this INSERT actually STORED — a
 * conflicting row returns nothing. That is what {@link ingestRunEventsTx} gates
 * materialisation on, so `EVENT-01`'s duplicate suppression and the observed-session
 * row are carried by ONE mechanism rather than two that can drift apart.
 */
async function insertRunEvents(
  exec: SqlExecutor,
  nodeId: string,
  events: RunEventInput[],
): Promise<Set<number>> {
  const rows = events.map((event) => ({
    node_id: nodeId,
    client_seq: event.client_seq,
    event_type: event.event_type,
    // sql.json() rather than the bare value: it marks the parameter as JSON explicitly,
    // which is both what the multi-row helper's types accept and what keeps an object
    // from being handed to the generic serialiser.
    payload: exec.json(event.payload as never),
  }));

  // The row type is a VARIABLE ANNOTATION, not the usual `exec<T[]>` type argument.
  // Supplying the type argument pins the template's parameter type to
  // `ParameterOrFragment<never>`, which the multi-row helper is then not assignable to
  // — and the failure surfaces as an unrelated complaint about awaiting a non-promise.
  // Every other typed query in this file reads `sql<T[]>` because none of them also
  // interpolates the helper.
  const stored: { client_seq: string }[] = await exec`
    INSERT INTO workflow.run_events ${
    exec(rows, "node_id", "client_seq", "event_type", "payload")
  }
    ON CONFLICT (node_id, client_seq) DO NOTHING
    RETURNING client_seq
  `;

  // Number(), for the reason acknowledgeSeqs documents at length: `client_seq` is
  // bigint and postgres.js hands bigint back as a STRING. A Set of strings tested with
  // the batch's numbers matches nothing, and materialisation would silently never fire.
  return new Set(stored.map((r) => Number(r.client_seq)));
}

/**
 * Merge observed sessions, monotonically, in one statement.
 *
 * LEAST/GREATEST rather than assignment is the whole idempotency argument: re-applying
 * the same values is a no-op, and a value that arrives late and small cannot roll the
 * row backwards. Postgres GREATEST/LEAST ignore NULLs, so `GREATEST(ended_at, EXCLUDED
 * .ended_at)` leaves a closed session closed when a later heartbeat carries no close —
 * a late heartbeat can never reopen a session.
 *
 * There is no status column to set (005's header says why): a session's state is READ
 * from these three instants, and the abandonment threshold that interprets the gap is
 * evaluation policy that deliberately does not live here.
 *
 * This statement touches `workflow.observed_sessions` and nothing else. It creates no
 * packet, no work item and no claim, and there is no `policy_scope` column within its
 * reach — a WorkItem is bound to a session only by B4's explicit operator claim, never
 * by inference from an observation.
 */
async function upsertObservedSessions(
  exec: SqlExecutor,
  nodeId: string,
  sessions: ObservedSessionRow[],
): Promise<void> {
  const rows = sessions.map((s) => ({
    node_id: nodeId,
    session_id: s.session_id,
    started_at: s.started_at,
    last_heartbeat_at: s.last_heartbeat_at,
    ended_at: s.ended_at,
  }));

  // NO `AS os` ALIAS, and that is a postgres.js constraint rather than a style choice.
  // The multi-row helper picks its builder from the LAST keyword appearing before the
  // interpolation, and postgres.js maps `as` to its SELECT builder — so
  // `INSERT INTO ... AS os ${helper}` hands an array of row objects to an identifier
  // escaper and fails at runtime with `str.replace is not a function`, nowhere near the
  // alias. The stored row is therefore named in full instead. The arbiter is inferred
  // from the `(node_id, session_id)` primary key.
  await exec`
    INSERT INTO workflow.observed_sessions ${
    exec(rows, "node_id", "session_id", "started_at", "last_heartbeat_at", "ended_at")
  }
    ON CONFLICT (node_id, session_id) DO UPDATE
    SET started_at        =
          LEAST(workflow.observed_sessions.started_at, EXCLUDED.started_at),
        last_heartbeat_at =
          GREATEST(workflow.observed_sessions.last_heartbeat_at, EXCLUDED.last_heartbeat_at),
        ended_at          =
          GREATEST(workflow.observed_sessions.ended_at, EXCLUDED.ended_at)
  `;
}

/**
 * Ingest a batch and materialise its observed sessions, on a caller-supplied executor.
 *
 * **The executor parameter is the atomicity contract, expressed in the type.** The
 * `run_events` write and the `observed_sessions` write are two statements that must
 * either both land or neither; taking the executor is what makes "inside the ingest
 * transaction" structural rather than a claim in a comment. It is also what lets a test
 * roll the caller's transaction back and observe that nothing survived — nothing
 * follows materialisation in this function, so no natural failure could prove it.
 *
 * MATERIALISATION IS GATED ON WHAT THE INSERT ACTUALLY STORED. A replayed event
 * conflicts, returns no row, and materialises nothing — so `EVENT-01`'s contract covers
 * the session row for free, and the ingest-instant fallback in {@link sessionFactsOf}
 * cannot drift a `last_heartbeat_at` forward on every retry.
 */
export async function ingestRunEventsTx(
  exec: SqlExecutor,
  nodeId: string,
  events: RunEventInput[],
): Promise<void> {
  if (events.length === 0) return;

  const stored = await insertRunEvents(exec, nodeId, events);
  const fresh = events.filter((e) => stored.has(e.client_seq));
  if (fresh.length === 0) return;

  const sessions = foldSessionEvents(fresh, new Date());
  if (sessions.length === 0) return;

  await upsertObservedSessions(exec, nodeId, sessions);
}

/**
 * Persist a batch, ignoring anything already stored, and materialise any observed
 * sessions it announces (ST-097 B2a(c)).
 *
 * A BATCH CARRYING NO SESSION EVENT TAKES NO TRANSACTION, and that is deliberate rather
 * than an oversight. Its single multi-row statement is atomic on its own, which is why
 * the explicit transaction was removed here in the first place — it was buying nothing.
 * It buys something now only when there is a second statement to be atomic WITH, so the
 * ordinary node lane keeps exactly the cost it had.
 */
export async function ingestRunEvents(
  nodeId: string,
  events: RunEventInput[],
): Promise<void> {
  if (events.length === 0) return;

  if (!events.some((e) => SESSION_EVENT_TYPES.has(e.event_type))) {
    await insertRunEvents(sql, nodeId, events);
    return;
  }

  await sql.begin((tx: SqlExecutor) => ingestRunEventsTx(tx, nodeId, events));
}

/**
 * Build the acknowledgement by READING BACK, not from the INSERT's output.
 *
 * This is the load-bearing half of idempotent delivery. A duplicate insert returns no
 * row, so an ack derived from INSERT results would omit precisely the events the node
 * is retrying — and the node, seeing them unacknowledged again, would retry forever.
 * Selecting the stored rows covers freshly-inserted and already-present alike.
 *
 * `client_seq` is returned as a NUMBER, and the coercion is load-bearing rather than
 * cosmetic. `client_seq` is `bigint`, and postgres.js hands bigint back as a string to
 * avoid silently truncating values above 2^53; db.ts sets no `types` override. So the
 * hub was acknowledging `"7"` for an event submitted as `7`, and a node comparing its
 * spool with `===` would never clear an entry — retrying acknowledged events forever,
 * defeating the delivery contract this function exists to provide. Lossless here
 * because the edge schema bounds client_seq well below Number.MAX_SAFE_INTEGER.
 */
export async function acknowledgeSeqs(
  nodeId: string,
  seqs: number[],
): Promise<{ client_seq: number; event_id: string }[]> {
  const rows = await sql<{ client_seq: string; event_id: string }[]>`
    SELECT event_id, client_seq FROM workflow.run_events
    WHERE node_id = ${nodeId} AND client_seq = ANY(${seqs}::bigint[])
    ORDER BY client_seq
  `;
  return rows.map((r) => ({ event_id: r.event_id, client_seq: Number(r.client_seq) }));
}

// --------------------------------------------------------------------------
// Teardown (spike disposability)
// --------------------------------------------------------------------------

/** Delete one packet and everything cascading from it. Test cleanup helper. */
export async function deletePacket(packetId: string): Promise<void> {
  await sql`DELETE FROM workflow.work_packets WHERE id = ${packetId}`;
}
