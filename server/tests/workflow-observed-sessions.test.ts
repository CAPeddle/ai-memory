/**
 * ST-097 B2a(c) — the hub materialises `workflow.observed_sessions` from the node
 * event lane, inside the ingest transaction.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE IS PROVING, AND WHY IT IS NOT A jsonb GREP.
 * ---------------------------------------------------------------------------
 * The rejected alternative was a view that greps `run_events.payload` for a session
 * field on read. It is rejected because the claim (B4) and any later abandonment
 * evaluation would then depend on a payload key the abandonment case — a `SIGKILL`
 * that never writes a stop record — is the most likely to omit. Materialising on
 * INGEST means the row exists from the first event onwards and survives whatever the
 * last event fails to say.
 *
 * The materialisation is therefore asserted where it happens: against real rows in
 * `workflow.observed_sessions`, never against a payload.
 *
 * ---------------------------------------------------------------------------
 * THE THREE PROPERTIES, STATED SO A FUTURE EDIT KNOWS WHAT IT MAY NOT BREAK.
 * ---------------------------------------------------------------------------
 *   1. REPLAY IDEMPOTENCY (`EVENT-01`). Re-sending a stream converges on exactly one
 *      row per `(node_id, session_id)` whose content is byte-identical to the first
 *      pass. Two independent mechanisms carry this and both are asserted: only events
 *      the `run_events` INSERT actually stored are materialised, and the merge itself
 *      is monotone.
 *   2. ORDER INDEPENDENCE. The stored row is a pure function of the SET of session
 *      events observed, not of their arrival order — so a late heartbeat cannot roll
 *      `last_heartbeat_at` backwards and cannot reopen a closed session.
 *   3. ATOMICITY. Materialisation participates in the caller's transaction. If the
 *      transaction rolls back, neither the run event nor the session row survives.
 *
 * ---------------------------------------------------------------------------
 * ISOLATION: unique bearers, not scratch schemas.
 * ---------------------------------------------------------------------------
 * Same rule as workflow-remote-node-hub.test.ts, and for the same reason — store.ts
 * hardcodes `workflow.`-qualified statements, so these tests necessarily run against
 * the real schema in a shared, accumulating `db-test`. Every test mints its own node
 * and its own random session ids, and deletes its node in `finally`;
 * `observed_sessions` and `run_events` both cascade from `execution_nodes`.
 *
 * In-process throughout. One test drives the HTTP route to prove the hub is actually
 * wired to this path; the rest drive the store directly, because that is where the
 * transaction boundary lives and an HTTP round trip would only obscure it.
 */

import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "hono";

import { sql } from "../src/db.ts";
import * as store from "../src/workflow/store.ts";
import { ensureWorkflowSchema } from "../src/workflow/schema.ts";
import { createRemoteNodeHubRoutes } from "../src/workflow/remoteNodeHub.ts";

const T = { sanitizeResources: false, sanitizeOps: false };

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

const ENROLMENT_SECRET = "test-enrolment-secret-observed-sessions";

interface TestNode {
  nodeId: string;
  bearer: string;
}

async function newNode(): Promise<TestNode> {
  const bearer = mintBearer();
  const node = await store.upsertExecutionNode({
    bearerTokenHash: await sha256Hex(bearer),
    hostname: "observed-sessions.test",
    platform: "deno-test",
    allowEnrolment: true,
  });
  assert(node !== null, "enrolment must succeed for a fresh bearer");
  return { nodeId: node.node_id, bearer };
}

async function dropNode(bearer: string): Promise<void> {
  const hash = await sha256Hex(bearer);
  await sql`DELETE FROM workflow.execution_nodes WHERE bearer_token_hash = ${hash}`;
}

/**
 * The payload shape this materialisation reads.
 *
 * **This is an ASSUMPTION about B3's event lane, deliberately pinned in one place.**
 * KTD-B4 item 6 closes the payload at `session_id`, an event timestamp and `node_id`;
 * it does not name the keys. These are the keys — `at` for the timestamp, matching the
 * `*_at` column convention on the table being written. B3 is held to them, and if B3
 * chooses differently this helper is the single site that changes.
 *
 * `node_id` travels in the payload because item 6 puts it there, and is deliberately
 * NOT what the row is keyed on — see the impersonation test below.
 */
function sessionEvent(
  clientSeq: number,
  eventType: "session_start" | "session_heartbeat" | "session_end",
  sessionId: string,
  at: string,
  payloadNodeId = "00000000-0000-4000-8000-000000000000",
): store.RunEventInput {
  return {
    client_seq: clientSeq,
    event_type: eventType,
    payload: { session_id: sessionId, node_id: payloadNodeId, at },
  };
}

interface SessionSnapshot {
  session_id: string;
  started_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
}

async function sessionRows(nodeId: string): Promise<SessionSnapshot[]> {
  const rows = await sql<
    {
      session_id: string;
      started_at: Date;
      last_heartbeat_at: Date;
      ended_at: Date | null;
    }[]
  >`
    SELECT session_id, started_at, last_heartbeat_at, ended_at
    FROM workflow.observed_sessions
    WHERE node_id = ${nodeId}
    ORDER BY session_id
  `;
  // Compared as ISO strings rather than Date instances: assertEquals on Date is
  // reference-insensitive but a mismatch prints two opaque objects, and every
  // assertion here is about an instant, not an object identity.
  return rows.map((r) => ({
    session_id: r.session_id,
    started_at: r.started_at.toISOString(),
    last_heartbeat_at: r.last_heartbeat_at.toISOString(),
    ended_at: r.ended_at === null ? null : r.ended_at.toISOString(),
  }));
}

Deno.test({
  ...T,
  name: "setup: workflow schema applied before the observed-session suite runs",
  fn: async () => {
    Deno.env.set("AWCP_NODE_ENROLMENT_SECRET", ENROLMENT_SECRET);
    await ensureWorkflowSchema();
  },
});

// ---------------------------------------------------------------------------
// Materialisation
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "observed sessions: a start/heartbeat/end lifecycle materialises exactly one row",
  fn: async () => {
    const { nodeId, bearer } = await newNode();
    const sid = crypto.randomUUID();
    try {
      await store.ingestRunEvents(nodeId, [
        sessionEvent(1, "session_start", sid, "2026-08-24T10:00:00.000Z"),
        sessionEvent(2, "session_heartbeat", sid, "2026-08-24T10:05:00.000Z"),
        sessionEvent(3, "session_end", sid, "2026-08-24T10:09:00.000Z"),
      ]);

      assertEquals(await sessionRows(nodeId), [{
        session_id: sid,
        started_at: "2026-08-24T10:00:00.000Z",
        last_heartbeat_at: "2026-08-24T10:09:00.000Z",
        ended_at: "2026-08-24T10:09:00.000Z",
      }]);

      // The raw lane is untouched by materialisation — both records exist.
      const events = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM workflow.run_events WHERE node_id = ${nodeId}
      `;
      assertEquals(events[0].n, "3", "materialising must not consume the run event");
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "observed sessions: an ordinary run event materialises nothing",
  fn: async () => {
    const { nodeId, bearer } = await newNode();
    try {
      await store.ingestRunEvents(nodeId, [
        { client_seq: 1, event_type: "heartbeat", payload: { spooled_events: 0 } },
        { client_seq: 2, event_type: "checkpoint", payload: { session_id: "not-a-session" } },
      ]);
      // `checkpoint` carries a `session_id`-shaped key and is still not a session
      // event: the EVENT TYPE decides, never the presence of a payload field. That is
      // the whole difference between this and the rejected jsonb grep.
      assertEquals(await sessionRows(nodeId), []);
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "observed sessions: identity is the authenticated node, never the payload's node_id",
  fn: async () => {
    const victim = await newNode();
    const attacker = await newNode();
    const sid = crypto.randomUUID();
    try {
      // The attacker's own node lane, naming the victim in the payload. KTD-B4 item 3:
      // `session_id` is not a security boundary, so identity is node-bound — and the
      // node is the one the bearer proved, not one a payload asserts.
      await store.ingestRunEvents(attacker.nodeId, [
        sessionEvent(1, "session_start", sid, "2026-08-24T11:00:00.000Z", victim.nodeId),
      ]);

      assertEquals(await sessionRows(victim.nodeId), [], "no row may land on the victim");
      assertEquals((await sessionRows(attacker.nodeId)).length, 1);
    } finally {
      await dropNode(victim.bearer);
      await dropNode(attacker.bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "observed sessions: a session event with no usable session_id stores its run event and materialises nothing",
  fn: async () => {
    const { nodeId, bearer } = await newNode();
    try {
      await store.ingestRunEvents(nodeId, [
        { client_seq: 1, event_type: "session_start", payload: { at: "2026-08-24T12:00:00.000Z" } },
        { client_seq: 2, event_type: "session_start", payload: { session_id: "" } },
        { client_seq: 3, event_type: "session_start", payload: { session_id: 42 } },
        { client_seq: 4, event_type: "session_start", payload: null },
      ]);

      // The run events are kept: the lane of record records what arrived. Rejecting a
      // malformed session event at the EDGE is B3's job — this layer must not turn one
      // bad payload into a failed batch, because the batch is one statement and the
      // read-back ack would then retry every event beside it forever.
      const events = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM workflow.run_events WHERE node_id = ${nodeId}
      `;
      assertEquals(events[0].n, "4");
      assertEquals(await sessionRows(nodeId), []);
    } finally {
      await dropNode(bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// Property 1 — replay idempotency (EVENT-01)
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "observed sessions: replaying the same stream yields one row, unchanged",
  fn: async () => {
    const { nodeId, bearer } = await newNode();
    const sid = crypto.randomUUID();
    const batch = [
      sessionEvent(1, "session_start", sid, "2026-08-24T13:00:00.000Z"),
      sessionEvent(2, "session_heartbeat", sid, "2026-08-24T13:05:00.000Z"),
      sessionEvent(3, "session_end", sid, "2026-08-24T13:07:00.000Z"),
    ];
    try {
      await store.ingestRunEvents(nodeId, batch);
      const first = await sessionRows(nodeId);
      assertEquals(first.length, 1);

      // The node re-sends everything it did not see acknowledged. Three times, so a
      // "converges after one extra pass" bug cannot hide behind a single replay.
      await store.ingestRunEvents(nodeId, batch);
      await store.ingestRunEvents(nodeId, batch);
      await store.ingestRunEvents(nodeId, batch.slice(1));

      assertEquals(await sessionRows(nodeId), first, "replay must not change the row");
    } finally {
      await dropNode(bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// Property 2 — order independence
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "observed sessions: out-of-order arrival converges on the in-order result",
  fn: async () => {
    const ordered = await newNode();
    const scrambled = await newNode();
    const sid = crypto.randomUUID();
    const events = [
      sessionEvent(1, "session_start", sid, "2026-08-24T14:00:00.000Z"),
      sessionEvent(2, "session_heartbeat", sid, "2026-08-24T14:04:00.000Z"),
      sessionEvent(3, "session_heartbeat", sid, "2026-08-24T14:08:00.000Z"),
      sessionEvent(4, "session_end", sid, "2026-08-24T14:11:00.000Z"),
    ];
    try {
      await store.ingestRunEvents(ordered.nodeId, events);
      // NON-VACUITY GUARD. The comparison below is between two reads, so it would pass
      // trivially against an implementation that materialised nothing at all — which is
      // exactly what it did on the red run. Pin the reference first.
      assertEquals((await sessionRows(ordered.nodeId)).length, 1);

      // The same four events, delivered end-first and one batch at a time — a spool
      // draining after a reconnect, which is the realistic shape of this.
      await store.ingestRunEvents(scrambled.nodeId, [events[3]]);
      await store.ingestRunEvents(scrambled.nodeId, [events[2]]);
      await store.ingestRunEvents(scrambled.nodeId, [events[0]]);
      await store.ingestRunEvents(scrambled.nodeId, [events[1]]);

      assertEquals(
        await sessionRows(scrambled.nodeId),
        await sessionRows(ordered.nodeId),
        "the row must be a function of the event SET, not of arrival order",
      );
    } finally {
      await dropNode(ordered.bearer);
      await dropNode(scrambled.bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "observed sessions: a late heartbeat rolls nothing back and reopens nothing",
  fn: async () => {
    const { nodeId, bearer } = await newNode();
    const sid = crypto.randomUUID();
    try {
      await store.ingestRunEvents(nodeId, [
        sessionEvent(1, "session_start", sid, "2026-08-24T15:00:00.000Z"),
        sessionEvent(2, "session_heartbeat", sid, "2026-08-24T15:10:00.000Z"),
        sessionEvent(3, "session_end", sid, "2026-08-24T15:12:00.000Z"),
      ]);
      const closed = await sessionRows(nodeId);

      // A heartbeat from the middle of the session, arriving after the close.
      await store.ingestRunEvents(nodeId, [
        sessionEvent(4, "session_heartbeat", sid, "2026-08-24T15:05:00.000Z"),
      ]);

      assertEquals(await sessionRows(nodeId), closed);
      // Stated separately from the deep-equal above, because "ended_at survived" is
      // the claim a future edit is most likely to break and the least likely to read
      // out of a whole-row comparison.
      assertEquals(
        (await sessionRows(nodeId))[0].ended_at,
        "2026-08-24T15:12:00.000Z",
        "a late heartbeat must not reopen a closed session",
      );
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "observed sessions: a heartbeat-only session materialises from its first heartbeat",
  fn: async () => {
    const { nodeId, bearer } = await newNode();
    const sid = crypto.randomUUID();
    try {
      // The `session_start` was lost — which is exactly the case the jsonb-grep view
      // would have handled worst. The row exists anyway, and `started_at` is the
      // earliest instant actually observed rather than a guess or the ingest clock.
      await store.ingestRunEvents(nodeId, [
        sessionEvent(1, "session_heartbeat", sid, "2026-08-24T16:03:00.000Z"),
        sessionEvent(2, "session_heartbeat", sid, "2026-08-24T16:06:00.000Z"),
      ]);

      assertEquals(await sessionRows(nodeId), [{
        session_id: sid,
        started_at: "2026-08-24T16:03:00.000Z",
        last_heartbeat_at: "2026-08-24T16:06:00.000Z",
        ended_at: null,
      }]);
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "observed sessions: concurrent sessions on one node stay distinct",
  fn: async () => {
    const { nodeId, bearer } = await newNode();
    // KTD-B4 item 1: `client_seq` is per-NODE, so two concurrent sessions share one
    // counter and interleave. `session_id` is what keeps them apart.
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    try {
      await store.ingestRunEvents(nodeId, [
        sessionEvent(1, "session_start", a, "2026-08-24T17:00:00.000Z"),
        sessionEvent(2, "session_start", b, "2026-08-24T17:00:30.000Z"),
        sessionEvent(3, "session_heartbeat", a, "2026-08-24T17:05:00.000Z"),
        sessionEvent(4, "session_end", b, "2026-08-24T17:06:00.000Z"),
      ]);

      const rows = await sessionRows(nodeId);
      assertEquals(rows.length, 2);
      const byId = Object.fromEntries(rows.map((r) => [r.session_id, r]));
      assertEquals(byId[a].ended_at, null, "closing b must not close a");
      assertEquals(byId[a].last_heartbeat_at, "2026-08-24T17:05:00.000Z");
      assertEquals(byId[b].ended_at, "2026-08-24T17:06:00.000Z");
    } finally {
      await dropNode(bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// Property 3 — atomicity with the ingest transaction
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "observed sessions: a rolled-back ingest leaves no session row and no run event",
  fn: async () => {
    const { nodeId, bearer } = await newNode();
    const sid = crypto.randomUUID();
    try {
      await assertRejects(
        () =>
          sql.begin(async (tx: typeof sql) => {
            await store.ingestRunEventsTx(tx, nodeId, [
              sessionEvent(1, "session_start", sid, "2026-08-24T18:00:00.000Z"),
              sessionEvent(2, "session_heartbeat", sid, "2026-08-24T18:04:00.000Z"),
            ]);

            // Visible INSIDE the transaction — without this the test would also pass
            // against an implementation that never wrote anything at all, which is
            // the vacuous pass this property is most exposed to.
            const inside = await tx<{ session_id: string }[]>`
              SELECT session_id FROM workflow.observed_sessions WHERE node_id = ${nodeId}
            `;
            assertEquals(inside.length, 1, "the row must exist before the rollback");

            throw new Error("__rollback_observed_session_fixture__");
          }),
        Error,
        "__rollback_observed_session_fixture__",
      );

      assertEquals(await sessionRows(nodeId), [], "the session row must not survive");
      const events = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM workflow.run_events WHERE node_id = ${nodeId}
      `;
      assertEquals(events[0].n, "0", "the run event must not survive either");
    } finally {
      await dropNode(bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// Fabrication guard (Verification Contract, "B — all")
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "observed sessions: an unclaimed session fabricates no packet, no work item and no policy scope",
  fn: async () => {
    const { nodeId, bearer } = await newNode();
    const sid = crypto.randomUUID();

    const census = async () => {
      const counts = await sql<
        { packets: string; items: string; claims: string; scopes: string }[]
      >`
        SELECT
          (SELECT count(*)::text FROM workflow.work_packets)                      AS packets,
          (SELECT count(*)::text FROM workflow.work_items)                        AS items,
          (SELECT count(*)::text FROM workflow.work_item_sessions)                AS claims,
          (SELECT count(DISTINCT policy_scope)::text FROM workflow.work_packets)  AS scopes
      `;
      return counts[0];
    };

    try {
      const before = await census();

      await store.ingestRunEvents(nodeId, [
        sessionEvent(1, "session_start", sid, "2026-08-24T19:00:00.000Z"),
        sessionEvent(2, "session_heartbeat", sid, "2026-08-24T19:05:00.000Z"),
        sessionEvent(3, "session_end", sid, "2026-08-24T19:30:00.000Z"),
      ]);

      assertEquals((await sessionRows(nodeId)).length, 1, "the session WAS observed");

      // Both halves of the guard, as the Verification Contract states them: the packet
      // row count is unchanged, and no `policy_scope` VALUE came into existence. The
      // second is the sharper one — a fabricated boundary is the failure the column
      // exists to prevent, and counting rows alone would not catch a new scope value
      // written onto an existing row.
      assertEquals(await census(), before);

      // And nothing bound the session to requested work. A WorkItem is reached only by
      // B4's explicit operator claim, never by inference from an observation.
      const claims = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM workflow.work_item_sessions
        WHERE node_id = ${nodeId} AND session_id = ${sid}
      `;
      assertEquals(claims[0].n, "0");
    } finally {
      await dropNode(bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// The hub is actually wired to this path
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "observed sessions: POST /nodes/:id/events materialises through the hub route",
  fn: async () => {
    const app = new Hono();
    app.route("/workflow/nodes", createRemoteNodeHubRoutes());

    const bearer = mintBearer();
    const sid = crypto.randomUUID();
    try {
      const registered = await app.fetch(
        new Request("http://hub.test/workflow/nodes/register", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${bearer}`,
            "Content-Type": "application/json",
            "X-Node-Enrolment-Secret": ENROLMENT_SECRET,
          },
          body: JSON.stringify({ hostname: "observed-sessions.test" }),
        }),
      );
      assertEquals(registered.status, 201);
      const { node_id: nodeId } = await registered.json() as { node_id: string };

      const posted = await app.fetch(
        new Request(`http://hub.test/workflow/nodes/${nodeId}/events`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${bearer}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            events: [
              sessionEvent(1, "session_start", sid, "2026-08-24T20:00:00.000Z"),
              sessionEvent(2, "session_heartbeat", sid, "2026-08-24T20:05:00.000Z"),
            ],
          }),
        }),
      );
      assertEquals(posted.status, 200);
      // The acknowledgement contract is unchanged: every submitted seq comes back,
      // materialisation or not.
      const { acknowledged } = await posted.json() as {
        acknowledged: { client_seq: number }[];
      };
      assertEquals(acknowledged.map((a) => a.client_seq), [1, 2]);

      assertEquals(await sessionRows(nodeId), [{
        session_id: sid,
        started_at: "2026-08-24T20:00:00.000Z",
        last_heartbeat_at: "2026-08-24T20:05:00.000Z",
        ended_at: null,
      }]);
    } finally {
      await dropNode(bearer);
    }
  },
});
