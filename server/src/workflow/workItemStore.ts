/**
 * ST-097 review follow-up (ST-098 U2) — WorkItem persistence, split out of store.ts.
 *
 * This module holds every write and read against `workflow.work_items` and
 * `workflow.work_item_sessions` (ADR-017). It is a SIBLING of `store.ts`, not a
 * consumer of it: it imports `sql` from `../db.ts` directly, and it joins store.ts
 * and schema.ts as an explicitly-allowed database-handle holder in
 * `workflow-boundary.test.ts` — see the "only store.ts holds the database handle"
 * test there, which now also permits this file by name.
 *
 * The functions below moved verbatim from store.ts. No behavior changed in the
 * move; only the file they live in and the module they import `sql` from did.
 */

import { sql } from "../db.ts";
import {
  type ClaimedObservedSession,
  type CreateWorkItemInput,
  type SourceSystem,
  type WorkItem,
  type WorkItemSessionClaim,
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

/**
 * Claim an observed session for a WorkItem (ST-097 B4, KTD-D5).
 *
 * **The exclusion is `uq_work_item_sessions_claim`, and the acknowledgement is a
 * report.** Those are two different mechanisms and conflating them is the failure this
 * function is shaped to avoid. The unique index on the
 * `(node_id, session_id, work_item_id)` triple is what makes a second association
 * impossible; the `SELECT` below only says which association exists. An
 * application-level "does this claim already exist?" check ahead of the INSERT would
 * be neither — two callers can both pass it — so there is none.
 *
 * **The ack is read back rather than taken from the INSERT, and that is
 * `004_run_events.sql`'s `EVENT-01` precedent applied to a claim.** A duplicate insert
 * returns no row, so `INSERT ... ON CONFLICT DO NOTHING RETURNING *` answers nothing on
 * exactly the request a replaying caller is retrying — and a caller that never sees its
 * claim acknowledged retries forever. Selecting afterwards covers the freshly-inserted
 * and the already-present alike, and returns the SAME `id` and `claimed_at` both times.
 *
 * **Under a genuine race the read-back is still correct, and it is correct because of
 * how the conflict is resolved rather than by luck.** `ON CONFLICT DO NOTHING` waits on
 * a conflicting insert that is still in flight; when that transaction commits, the
 * loser skips its own insert and its subsequent `SELECT` — a new statement snapshot
 * under READ COMMITTED — sees the winner's committed row. So both callers are
 * acknowledged with one association rather than one of them being told nothing exists.
 *
 * **That claim contradicts `upsertExecutionNode`'s advisory-lock comment (store.ts),
 * so it was measured rather than reasoned.** Against this Postgres, two transactions
 * issuing this exact statement shape park on the conflicting insert with
 * `wait_event_type = 'Lock'`, and the loser's read-back sees the winner's committed
 * row — which is what the concurrency test in workflow-work-item-claim.test.ts
 * observes directly, by holding a conflicting row uncommitted and watching both claims
 * block on it. Nothing here changes that other function: its lock is harmless, and
 * whether its stated reason still holds is a question for whoever revisits it, not a
 * thing to settle from this call site.
 *
 * **Both parents are checked explicitly, for `bindPacketToWorkItem`'s reason.** The
 * foreign keys would refuse an unknown work item or an unobserved session anyway, but
 * an FK violation reports only that *some* constraint failed — at the HTTP edge that
 * becomes a 404 that cannot say which of the two ids was wrong, and a caller holding
 * both and told one of them is bad is told nothing. The constraints stay as the race
 * backstop for a parent deleted between the check and the insert; the checks narrow the
 * common case, they do not replace them.
 *
 * **THIS FUNCTION PROMOTES NOTHING.** It writes one row in
 * `workflow.work_item_sessions` and touches no other table. It creates no packet, no
 * `agent_runs` row and no policy scope — there is no column within its reach to put one
 * in (ADR-017 §3, KTD-D4) — so a claimed session remains an observation.
 *
 * **There is deliberately no unclaim beside this one.** KTD-D5's table shape permits
 * one and this slice does not build it: its authorization is unspecified, and a delete
 * path whose credential rule was chosen at the call site is the same class of error as
 * a route omitted from `OPERATOR_ONLY_ROUTES`.
 */
export async function claimSessionForWorkItem(
  workItemId: string,
  nodeId: string,
  sessionId: string,
): Promise<WorkItemSessionClaim> {
  return await sql.begin(async (tx: SqlExecutor) => {
    const items = await tx<{ id: string }[]>`
      SELECT id FROM workflow.work_items WHERE id = ${workItemId}
    `;
    if (items[0] === undefined) {
      throw new WorkflowNotFoundError("work item", workItemId);
    }

    const sessions = await tx<{ session_id: string }[]>`
      SELECT session_id FROM workflow.observed_sessions
      WHERE node_id = ${nodeId} AND session_id = ${sessionId}
    `;
    if (sessions[0] === undefined) {
      // Named as the composite it is. A session id alone identifies nothing — it is
      // client-generated and node-scoped — so a 404 quoting only half of the key would
      // send the caller looking for the wrong thing.
      throw new WorkflowNotFoundError("observed session", `${nodeId}/${sessionId}`);
    }

    await tx`
      INSERT INTO workflow.work_item_sessions (work_item_id, node_id, session_id)
      VALUES (${workItemId}, ${nodeId}, ${sessionId})
      ON CONFLICT (node_id, session_id, work_item_id) DO NOTHING
    `;

    const claims = await tx<WorkItemSessionClaim[]>`
      SELECT id, work_item_id, node_id, session_id, claimed_at
      FROM workflow.work_item_sessions
      WHERE node_id = ${nodeId}
        AND session_id = ${sessionId}
        AND work_item_id = ${workItemId}
    `;
    return claims[0];
  });
}

// --------------------------------------------------------------------------
// Work item reads (ST-097 B5) — the provenance lookup and the projection's parts
// --------------------------------------------------------------------------

/** One WorkItem by its primary identity. Null when it does not exist. */
export async function getWorkItem(id: string): Promise<WorkItem | null> {
  const rows = await sql<WorkItem[]>`
    SELECT * FROM workflow.work_items WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

/**
 * Every WorkItem, newest first.
 *
 * **There is no active/inactive filter here, and its absence is the contract rather
 * than an omission.** `listActivePackets` can filter because a packet has a status
 * column; a WorkItem has none and never will (ADR-017 §6), so there is nothing to
 * filter on. Inventing a liveness rule — "has an open packet", "was claimed
 * recently" — would be synthesising exactly the aggregate state §6 settles does not
 * exist, one layer up from the field it forbids.
 */
export async function listWorkItems(): Promise<WorkItem[]> {
  return await sql<WorkItem[]>`
    SELECT * FROM workflow.work_items
    ORDER BY created_at DESC
  `;
}

/**
 * Resolve a WorkItem by its ADR-017 §2 provenance pair.
 *
 * The pair is the lookup key, never `source_ref` alone: the same `#57` is a different
 * unit of work in a different source system, and `uq_work_items_provenance` is over
 * both columns. `awcp-native` can never resolve here — the pair CHECK gives every
 * native row a null `source_ref` — which the edge refuses ahead of this call rather
 * than leaving it to return an unexplained miss.
 */
export async function findWorkItemByProvenance(
  sourceSystem: SourceSystem,
  sourceRef: string,
): Promise<WorkItem | null> {
  const rows = await sql<WorkItem[]>`
    SELECT * FROM workflow.work_items
    WHERE source_system = ${sourceSystem} AND source_ref = ${sourceRef}
  `;
  return rows[0] ?? null;
}

/**
 * The packets parented to any of `workItemIds`, newest first.
 *
 * Batched over the whole set rather than queried per item, so the overview's WorkItem
 * lane costs two statements regardless of how many items it renders. `= ANY(...)`
 * follows `acknowledgeSeqs`'s precedent (store.ts).
 */
export async function listPacketsForWorkItems(
  workItemIds: string[],
): Promise<WorkPacket[]> {
  if (workItemIds.length === 0) return [];
  return await sql<WorkPacket[]>`
    SELECT * FROM workflow.work_packets
    WHERE work_item_id = ANY(${workItemIds}::uuid[])
    ORDER BY created_at DESC
  `;
}

/**
 * The observed sessions CLAIMED by any of `workItemIds`, newest claim first.
 *
 * **The join is the whole point.** An observed session is reachable from a WorkItem
 * only through `work_item_sessions`, which is an explicit operator claim; an
 * unclaimed session has no row there and is therefore reachable from no WorkItem at
 * all. That is KTD-D5's "never an inference" expressed as the query's own shape —
 * there is no predicate here that could match a session nobody claimed.
 *
 * The projection selects columns rather than `*`: `observed_sessions` carries no
 * packet, run or scope today, and naming the columns keeps that true of this read
 * even if a later migration adds something to the table.
 */
export async function listClaimedSessionsForWorkItems(
  workItemIds: string[],
): Promise<ClaimedObservedSession[]> {
  if (workItemIds.length === 0) return [];
  return await sql<ClaimedObservedSession[]>`
    SELECT
      c.work_item_id,
      c.node_id,
      c.session_id,
      s.started_at,
      s.last_heartbeat_at,
      s.ended_at,
      c.claimed_at
    FROM workflow.work_item_sessions c
    JOIN workflow.observed_sessions s
      ON s.node_id = c.node_id AND s.session_id = c.session_id
    WHERE c.work_item_id = ANY(${workItemIds}::uuid[])
    ORDER BY c.claimed_at DESC
  `;
}
