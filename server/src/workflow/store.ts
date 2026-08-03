/**
 * ST-084 spike — Workflow Operations persistence.
 *
 * This is the ONLY workflow file that imports the database handle. Every
 * statement is schema-qualified `workflow.*` — mandatory, because AGE graph
 * queries leave a sticky polluted `search_path` on pooled connections
 * (server/index.ts:941, entityWorker.ts:115), so `workflow` is never implicit.
 *
 * No statement here touches `thoughts`, `entity_mentions`, `memory_graph`, or any
 * other memory-domain object. `workflow-boundary.test.ts` asserts that by
 * scanning this module's source.
 *
 * SPIKE / DISPOSABLE.
 */

import { sql } from "../db.ts";
import {
  type AgentRun,
  type Checkpoint,
  CompletionBlockedError,
  CriteriaFrozenError,
  DecisionConflictError,
  type EvidenceItem,
  type EvidenceKind,
  type OperationalDecision,
  type PolicyScope,
  RunConflictError,
  type VerificationCriterion,
  type WorkPacket,
  WorkflowNotFoundError,
} from "./types.ts";

type SqlExecutor = typeof sql;

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
// Teardown (spike disposability)
// --------------------------------------------------------------------------

/** Delete one packet and everything cascading from it. Test cleanup helper. */
export async function deletePacket(packetId: string): Promise<void> {
  await sql`DELETE FROM workflow.work_packets WHERE id = ${packetId}`;
}
