/**
 * ST-097 / B4 — `POST /work-items/:workItemId/sessions`, the explicit claim that
 * associates an OBSERVED session with a WorkItem.
 *
 * ---------------------------------------------------------------------------
 * THE ONE DISTINCTION THIS FILE EXISTS TO HOLD: EXCLUSION vs REPORT.
 * ---------------------------------------------------------------------------
 * `uq_work_item_sessions_claim` — the unique index on the
 * `(node_id, session_id, work_item_id)` triple in `005_work_items.sql` — is what
 * PREVENTS a duplicate association. The `SELECT`-derived acknowledgement REPORTS the
 * duplicate and prevents nothing, exactly as `004_run_events.sql` says of its own
 * `EVENT-01` ack: a duplicate insert returns no row, so an ack taken from the INSERT's
 * output would omit precisely the claim the caller is replaying.
 *
 * Two tests carry that pair, and neither one alone would:
 *
 *   * **Replay** proves the ack is `SELECT`-derived, by asserting the second call
 *     returns the FIRST call's `id` and `claimed_at` unchanged. An
 *     `INSERT ... RETURNING`-derived ack has no row to return on the replay, so this
 *     assertion — not a comment — is what pins the ack's provenance.
 *   * **The forced race** proves the exclusion is the index, by putting two claims
 *     inside the insert at the same instant and letting them contend. It does not
 *     merely fire two promises and hope: a third transaction holds a conflicting row
 *     uncommitted, both claims are OBSERVED parked on it in `pg_stat_activity`, and
 *     only then is the blocker rolled back so both proceed together.
 *
 * ---------------------------------------------------------------------------
 * WHAT A CLAIM MUST NOT DO, ASSERTED RATHER THAN ASSUMED.
 * ---------------------------------------------------------------------------
 * A claimed session is STILL AN OBSERVATION. The claim records an association; it does
 * not promote the session into supervised work. So `fabricates nothing` below asserts
 * three absences after a successful claim — no packet, no `agent_runs` row, and no
 * `policy_scope` column anywhere in the three tables this slice writes. The third is a
 * schema assertion because KTD-D4's guarantee is structural: the capture path cannot
 * invent a scope because there is no column to put one in.
 *
 * ---------------------------------------------------------------------------
 * ISOLATION AND FIXTURES.
 * ---------------------------------------------------------------------------
 * In-process against the real router (`createWorkflowApi()`), the real zod schemas and
 * the real store, for the reasons `workflow-work-item-routes.test.ts` gives. The
 * credential half of B4's contract lives where it can only live —
 * `workflow-agent-key-e2e.test.ts`, against a real process with real keys — which is
 * what keeps this file free of `--allow-run`.
 *
 * Sessions are OBSERVED into existence through `store.ingestRunEvents`, never inserted
 * directly. A fixture that wrote `observed_sessions` by hand would be asserting against
 * a row shape rather than against the lane, and the lane is the only way a real session
 * ever arrives.
 *
 * `db-test` is shared and accumulating (CLAUDE.md's dev/test isolation note), so every
 * test mints its own node and its own random session ids and drops its node in
 * `finally`; `observed_sessions` and `work_item_sessions` both cascade from
 * `execution_nodes`.
 */

import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import { createWorkflowApi } from "../src/workflow/api.ts";
import { ensureWorkflowSchema } from "../src/workflow/schema.ts";
import * as store from "../src/workflow/store.ts";

const T = { sanitizeResources: false, sanitizeOps: false };

const api = createWorkflowApi();

/** A uuid that is well-formed and names nothing. */
const ABSENT_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

/** SHA-256 hex, by the same rule remoteNodeHub.ts uses. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 32 random bytes as 64 lowercase hex — what `openssl rand -hex 32` produces. */
function mintBearer(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Fixture {
  nodeId: string;
  bearer: string;
  sessionId: string;
  workItemId: string;
}

/**
 * A node, an observed session on it, and a WorkItem to claim it for.
 *
 * The session is materialised by the ingest path rather than by an INSERT, so the row
 * under test is the one the lane actually produces.
 */
async function fixture(): Promise<Fixture> {
  const bearer = mintBearer();
  const node = await store.upsertExecutionNode({
    bearerTokenHash: await sha256Hex(bearer),
    hostname: "work-item-claim.test",
    platform: "deno-test",
    allowEnrolment: true,
  });
  assert(node !== null, "enrolment must succeed for a fresh bearer");

  const sessionId = `claim-${crypto.randomUUID()}`;
  await store.ingestRunEvents(node.node_id, [{
    client_seq: 1,
    event_type: "session_start",
    payload: {
      session_id: sessionId,
      node_id: node.node_id,
      at: new Date().toISOString(),
    },
  }]);

  const item = await store.createWorkItem({ sourceSystem: "awcp-native" });
  return { nodeId: node.node_id, bearer, sessionId, workItemId: item.id };
}

async function dropNode(bearer: string): Promise<void> {
  const hash = await sha256Hex(bearer);
  await sql`DELETE FROM workflow.execution_nodes WHERE bearer_token_hash = ${hash}`;
}

async function call(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const res = await api.request(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

function claim(
  workItemId: string,
  nodeId: string,
  sessionId: string,
): Promise<{ status: number; body: any }> {
  return call(`/work-items/${workItemId}/sessions`, {
    method: "POST",
    body: JSON.stringify({ nodeId, sessionId }),
  });
}

async function claimRows(
  nodeId: string,
  sessionId: string,
): Promise<{ id: string; work_item_id: string; claimed_at: Date }[]> {
  return await sql<{ id: string; work_item_id: string; claimed_at: Date }[]>`
    SELECT id, work_item_id, claimed_at
    FROM workflow.work_item_sessions
    WHERE node_id = ${nodeId} AND session_id = ${sessionId}
    ORDER BY claimed_at, id
  `;
}

Deno.test({
  ...T,
  name: "setup: workflow schema applied before the claim suite runs",
  fn: async () => {
    await ensureWorkflowSchema();
  },
});

// ---------------------------------------------------------------------------
// The claim itself
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "POST /work-items/:id/sessions: associates an observed session with a work item",
  fn: async () => {
    const f = await fixture();
    try {
      const res = await claim(f.workItemId, f.nodeId, f.sessionId);
      assertEquals(res.status, 201, JSON.stringify(res.body));
      assertEquals(res.body.work_item_id, f.workItemId);
      assertEquals(res.body.node_id, f.nodeId);
      assertEquals(res.body.session_id, f.sessionId);
      assert(typeof res.body.id === "string" && res.body.id.length > 0);

      const rows = await claimRows(f.nodeId, f.sessionId);
      assertEquals(rows.length, 1);
      assertEquals(rows[0].id, res.body.id);
    } finally {
      await dropNode(f.bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "B4 | Replay a claim | one association, and the ack is SELECT-derived",
  fn: async () => {
    const f = await fixture();
    try {
      const first = await claim(f.workItemId, f.nodeId, f.sessionId);
      assertEquals(first.status, 201, JSON.stringify(first.body));

      const replay = await claim(f.workItemId, f.nodeId, f.sessionId);
      assertEquals(replay.status, 201, JSON.stringify(replay.body));

      // THIS is the assertion that pins the ack's provenance. The replay's INSERT
      // conflicts and returns NO row, so an ack derived from `INSERT ... RETURNING`
      // would have nothing to answer with. Coming back with the FIRST claim's own id
      // and its original `claimed_at` is only possible from a subsequent SELECT of
      // the row that was already there — the `EVENT-01` precedent in
      // 004_run_events.sql, applied to a claim.
      assert(
        replay.body !== null,
        "an INSERT-derived ack answers nothing on a replay, because the duplicate " +
          "insert returned no row — that is why the ack is read back",
      );
      assertEquals(replay.body.id, first.body.id, "the ack must report the stored row");
      assertEquals(
        replay.body.claimed_at,
        first.body.claimed_at,
        "a replay must not re-stamp claimed_at — nothing was written",
      );

      const rows = await claimRows(f.nodeId, f.sessionId);
      assertEquals(rows.length, 1, "a replayed claim must not duplicate the association");
    } finally {
      await dropNode(f.bearer);
    }
  },
});

Deno.test({
  ...T,
  name:
    "B4 | Two concurrent identical claims | one association row; the UNIQUE constraint is what passes this, not the SELECT ack",
  fn: async () => {
    const f = await fixture();
    let releaseBlocker: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });

    /**
     * A third transaction holding the SAME triple, uncommitted, so both claims park
     * inside their INSERT instead of racing past each other by luck of scheduling.
     * It rolls back — by throwing out of `sql.begin` — so nothing it wrote survives
     * and the two claims are left contending with each other alone.
     */
    const ROLLBACK = "blocker rolls back by design";
    const blocker = sql.begin(async (tx: typeof sql) => {
      await tx`
        INSERT INTO workflow.work_item_sessions (work_item_id, node_id, session_id)
        VALUES (${f.workItemId}, ${f.nodeId}, ${f.sessionId})
      `;
      await gate;
      throw new Error(ROLLBACK);
    }).catch((err: unknown) => {
      if ((err as Error)?.message !== ROLLBACK) throw err;
    });

    // Launched here, and awaited BELOW — these two are the racers, and every assertion
    // about the race's outcome is made about them. Firing a fresh pair after the
    // blocker cleared would be asserting against two replays of a row that already
    // exists, which is the other test.
    const a = claim(f.workItemId, f.nodeId, f.sessionId);
    const b = claim(f.workItemId, f.nodeId, f.sessionId);

    try {
      let waiting = 0;
      try {
        // Both claims must be OBSERVED waiting before the blocker is released. This is
        // what makes the concurrency real rather than asserted: `wait_event_type =
        // 'Lock'` on two distinct backends inside the claim INSERT is two transactions
        // simultaneously in flight against one unique index.
        waiting = await waitForBlockedClaims(2);
      } finally {
        // In a finally, so a timed-out poll fails the test rather than hanging it with
        // two claims still parked on a transaction nothing will ever end.
        releaseBlocker();
        await blocker;
      }
      assertEquals(
        waiting,
        2,
        "both claims must be parked in the INSERT at the same instant, or this test " +
          "is proving sequential replay rather than a race",
      );

      const [first, second] = await Promise.all([a, b]);
      assertEquals(first.status, 201, JSON.stringify(first.body));
      assertEquals(second.status, 201, JSON.stringify(second.body));

      const rows = await claimRows(f.nodeId, f.sessionId);
      assertEquals(rows.length, 1, "two racing claims must leave exactly one association");
      // Both callers are acknowledged with the SAME row: the LOSER of the race reports
      // the winner's claim rather than erroring or answering with nothing. That is the
      // read-back doing its job under real contention — an ack taken from the loser's
      // own INSERT would have had no row to report.
      assertEquals(first.body.id, rows[0].id);
      assertEquals(second.body.id, rows[0].id);
    } finally {
      // Settle the racers even when an assertion above threw, so neither is left
      // floating with a connection checked out.
      await Promise.allSettled([a, b]);
      await dropNode(f.bearer);
    }
  },
});

/**
 * Poll until `expected` backends are blocked inside the claim INSERT, or give up.
 *
 * `wait_event_type = 'Lock'` is not decoration: without it the poll's own statement
 * text matches the `query LIKE` predicate and the count self-inflates.
 */
async function waitForBlockedClaims(expected: number, timeoutMs = 10_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let seen = 0;
  while (Date.now() < deadline) {
    const rows = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n
      FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'
        AND query LIKE '%work_item_sessions%'
    `;
    seen = Number(rows[0].n);
    if (seen >= expected) return seen;
    await new Promise((r) => setTimeout(r, 25));
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Uniqueness is on the TRIPLE, not on the session
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "B4: the same session claimed by a second work item is accepted",
  fn: async () => {
    const f = await fixture();
    try {
      const other = await store.createWorkItem({ sourceSystem: "awcp-native" });

      const first = await claim(f.workItemId, f.nodeId, f.sessionId);
      assertEquals(first.status, 201, JSON.stringify(first.body));
      const secondItem = await claim(other.id, f.nodeId, f.sessionId);
      assertEquals(secondItem.status, 201, JSON.stringify(secondItem.body));

      // 005's own header: "The TRIPLE is the constraint, and the narrower
      // (node_id, session_id) is deliberately not it — one observed session may be
      // claimed by more than one work item, and that is a legitimate state rather
      // than a duplicate."
      const rows = await claimRows(f.nodeId, f.sessionId);
      assertEquals(rows.length, 2);
      assertNotEquals(rows[0].work_item_id, rows[1].work_item_id);
      assertEquals(
        [rows[0].work_item_id, rows[1].work_item_id].sort(),
        [f.workItemId, other.id].sort(),
      );
    } finally {
      await dropNode(f.bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// Typed errors, not 500s
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "B4: claiming for an unknown work item is a typed 404 naming the work item",
  fn: async () => {
    const f = await fixture();
    try {
      const res = await claim(ABSENT_ID, f.nodeId, f.sessionId);
      assertEquals(res.status, 404, JSON.stringify(res.body));
      assertEquals(res.body.error, "WorkflowNotFoundError");
      assertEquals(res.body.id, ABSENT_ID);

      const rows = await claimRows(f.nodeId, f.sessionId);
      assertEquals(rows.length, 0, "a refused claim must not have written");
    } finally {
      await dropNode(f.bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "B4: claiming an unobserved session is a typed 404, not a 500",
  fn: async () => {
    const f = await fixture();
    try {
      // A real node, a session id nothing ever announced. The composite foreign key
      // would refuse this too, but an FK violation cannot say WHICH half was wrong —
      // a caller holding two ids and told one of them is bad is told nothing.
      const unobserved = `never-observed-${crypto.randomUUID()}`;
      const res = await claim(f.workItemId, f.nodeId, unobserved);
      assertEquals(res.status, 404, JSON.stringify(res.body));
      assertEquals(res.body.error, "WorkflowNotFoundError");
      assert(
        String(res.body.id).includes(unobserved),
        `the 404 must name the session that was not observed; got ${res.body.id}`,
      );

      // A node that does not exist at all is the same class of answer, not a 500.
      const unknownNode = await claim(f.workItemId, ABSENT_ID, f.sessionId);
      assertEquals(unknownNode.status, 404, JSON.stringify(unknownNode.body));
      assertEquals(unknownNode.body.error, "WorkflowNotFoundError");
    } finally {
      await dropNode(f.bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "B4: malformed ids are 400s, in the path and in the body",
  fn: async () => {
    const f = await fixture();
    try {
      const badPath = await call("/work-items/not-a-uuid/sessions", {
        method: "POST",
        body: JSON.stringify({ nodeId: f.nodeId, sessionId: f.sessionId }),
      });
      assertEquals(badPath.status, 400, JSON.stringify(badPath.body));

      const badNode = await claim(f.workItemId, "not-a-uuid", f.sessionId);
      assertEquals(badNode.status, 400, JSON.stringify(badNode.body));
      assertEquals(badNode.body.error, "BadRequest");

      // An empty session id is barred by `observed_sessions`'s own CHECK; the edge
      // must refuse it first, so a caller mistake is a 400 rather than a 500 from a
      // constraint deeper in.
      const emptySession = await claim(f.workItemId, f.nodeId, "");
      assertEquals(emptySession.status, 400, JSON.stringify(emptySession.body));
      assertEquals(emptySession.body.error, "BadRequest");
    } finally {
      await dropNode(f.bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// The fabrication guard
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "B4: a claim creates no packet, no run, and no policy_scope anywhere",
  fn: async () => {
    const f = await fixture();
    try {
      const before = await counts();
      const res = await claim(f.workItemId, f.nodeId, f.sessionId);
      assertEquals(res.status, 201, JSON.stringify(res.body));
      const after = await counts();

      // A claimed session is still an OBSERVATION. Nothing promotes it into
      // supervised work, so the two tables that carry supervised work are untouched.
      assertEquals(after.packets, before.packets, "a claim must create no packet");
      assertEquals(after.runs, before.runs, "a claim must create no agent run");

      // No packet acquired this work item as a parent either — the association is
      // session-to-WorkItem and reaches nothing else.
      const parented = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM workflow.work_packets
        WHERE work_item_id = ${f.workItemId}
      `;
      assertEquals(Number(parented[0].n), 0);

      // KTD-D4 made "do not fabricate a policy scope" structural: there is no column
      // to fabricate one into. A schema assertion rather than a value assertion,
      // because a value can be absent by accident and a column cannot.
      const scopeColumns = await sql<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'workflow'
          AND column_name = 'policy_scope'
          AND table_name IN ('work_items', 'observed_sessions', 'work_item_sessions')
      `;
      assertEquals(
        scopeColumns.map((r) => r.table_name),
        [],
        "the WorkItem layer carries no policy_scope column — ADR-017 §3, KTD-D4",
      );
    } finally {
      await dropNode(f.bearer);
    }
  },
});

async function counts(): Promise<{ packets: number; runs: number }> {
  const rows = await sql<{ packets: string; runs: string }[]>`
    SELECT
      (SELECT count(*) FROM workflow.work_packets)::text AS packets,
      (SELECT count(*) FROM workflow.agent_runs)::text   AS runs
  `;
  return { packets: Number(rows[0].packets), runs: Number(rows[0].runs) };
}
