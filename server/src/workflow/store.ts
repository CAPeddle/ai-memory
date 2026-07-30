/**
 * ST-084 spike — Workflow Operations persistence.
 *
 * This is the ONLY workflow file that imports the database handle. Every
 * statement is schema-qualified `workflow.*` — mandatory, because AGE graph
 * queries leave a sticky polluted `search_path` on pooled connections
 * (server/index.ts:940, entityWorker.ts:113), so `workflow` is never implicit.
 *
 * No statement here touches `thoughts`, `entity_mentions`, `memory_graph`, or any
 * other memory-domain object. `workflow-dependency.test.ts` asserts that by
 * scanning this module's source.
 *
 * SPIKE / DISPOSABLE.
 */

import { sql } from "../db.ts";
import {
  type AgentRun,
  type Checkpoint,
  CompletionBlockedError,
  type EvidenceItem,
  type EvidenceKind,
  type OperationalDecision,
  type PolicyScope,
  type VerificationCriterion,
  type WorkPacket,
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

export async function setPacketStatus(
  id: string,
  status: WorkPacket["status"],
): Promise<void> {
  await sql`
    UPDATE workflow.work_packets
    SET status = ${status}, updated_at = now()
    WHERE id = ${id}
  `;
}

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

export async function endRun(
  runId: string,
  status: Extract<AgentRun["status"], "ended" | "failed">,
): Promise<void> {
  await sql`
    UPDATE workflow.agent_runs
    SET status = ${status}, ended_at = now(), last_event_at = now()
    WHERE id = ${runId}
  `;
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
  }) as Checkpoint;
}

export async function listCheckpoints(packetId: string): Promise<Checkpoint[]> {
  return await sql<Checkpoint[]>`
    SELECT c.* FROM workflow.checkpoints c
    JOIN workflow.agent_runs r ON r.id = c.run_id
    WHERE r.packet_id = ${packetId}
    ORDER BY c.created_at ASC
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

export async function resolveDecision(
  decisionId: string,
  resolution: string,
): Promise<OperationalDecision> {
  const rows = await sql<OperationalDecision[]>`
    UPDATE workflow.operational_decisions
    SET status = 'resolved', resolution = ${resolution}, resolved_at = now()
    WHERE id = ${decisionId}
    RETURNING *
  `;
  return rows[0];
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

export async function addCriterion(
  packetId: string,
  description: string,
  required = true,
): Promise<VerificationCriterion> {
  const rows = await sql<VerificationCriterion[]>`
    INSERT INTO workflow.verification_criteria (packet_id, description, required)
    VALUES (${packetId}, ${description}, ${required})
    RETURNING *
  `;
  return rows[0];
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
 * Atomically verify every required criterion has evidence, then mark complete.
 *
 * The check and the write share one transaction with `FOR UPDATE` on the packet,
 * so a concurrent evidence deletion cannot produce a completed packet with unmet
 * criteria. Throws `CompletionBlockedError` when criteria are unmet — the gate is
 * a refusal, not a warning.
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
      throw new Error(`Work packet ${packetId} not found`);
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
  }) as WorkPacket;
}

// --------------------------------------------------------------------------
// Teardown (spike disposability)
// --------------------------------------------------------------------------

/** Delete one packet and everything cascading from it. Test cleanup helper. */
export async function deletePacket(packetId: string): Promise<void> {
  await sql`DELETE FROM workflow.work_packets WHERE id = ${packetId}`;
}
