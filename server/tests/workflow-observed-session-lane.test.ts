/**
 * ST-097 B3 — the observed-session EVENT LANE: what emits, what the payload may
 * contain, and what refuses it.
 *
 * ---------------------------------------------------------------------------
 * THE DIVISION OF LABOUR, BECAUSE TWO FILES NOW COVER OBSERVED SESSIONS.
 * ---------------------------------------------------------------------------
 * `workflow-observed-sessions.test.ts` (B2a c) proves the MATERIALISATION: given
 * session events, `workflow.observed_sessions` converges monotonically, idempotently
 * and order-independently. It drives `store.ingestRunEvents` directly and deliberately
 * tolerates a malformed payload, because the lane of record must record what arrived.
 *
 * This file proves the other half — the one that file's own comments defer to B3:
 *
 *   1. EMISSION. The node client produces `session_start`, periodic
 *      `session_heartbeat`, and `session_end`, on the node bearer it already holds.
 *      No new endpoint, no new credential, no control channel.
 *   2. THE CLOSED PAYLOAD SET (KTD-B4 item 6). `{session_id, node_id, at}` and nothing
 *      else — enforced at the EDGE, which is where `store.ts` says rejection belongs.
 *   3. THE ABANDONMENT THRESHOLD (KTD-B4 items 4-5) exists as a NAMED CONSTANT with a
 *      pinned value, so changing it is visible in a diff. Nothing here evaluates
 *      abandonment; defining the threshold and evaluating it are separate slices.
 *   4. THE FABRICATION GUARD. Three events, and no packet, no policy scope, no run.
 *
 * ---------------------------------------------------------------------------
 * ISOLATION: unique bearers, temp homes, no scratch schema.
 * ---------------------------------------------------------------------------
 * Same rule as the sibling file — `store.ts` hardcodes `workflow.`-qualified
 * statements, so this necessarily runs against the real schema in a shared,
 * accumulating `db-test`. Every test mints its own node and its own random session
 * ids and deletes its node in `finally`; `observed_sessions` and `run_events` both
 * cascade from `execution_nodes`.
 *
 * Every node-client call writes only under a `Deno.makeTempDir()` root injected as
 * `config.home` (D-09 / RESEARCH.md Pattern 3), so this file needs no permission
 * beyond the suite's existing `--allow-write=/tmp`. NOTHING HERE SPAWNS A PROCESS —
 * the client is driven in-process through its exported functions, so `CLAUDE.md`'s
 * hand-maintained `--allow-run` inventory is untouched by design.
 */

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "hono";

import { sql } from "../src/db.ts";
import * as store from "../src/workflow/store.ts";
import { ensureWorkflowSchema } from "../src/workflow/schema.ts";
import { createRemoteNodeHubRoutes } from "../src/workflow/remoteNodeHub.ts";
import {
  SESSION_ABANDONED_AFTER_MS,
  SESSION_HEARTBEAT_INTERVAL_MS,
} from "../src/workflow/observedSession.ts";
// Imported to be COMPARED WITH, never touched: KTD-B4 item 5 requires the abandonment
// threshold to be distinct from the packet staleness window, and the only way to assert
// that is to read the other one.
import { DEFAULT_STALE_AFTER_MS } from "../src/workflow/attention.ts";
import * as nodeClient from "../scripts/awcp-node-client.mjs";

const T = { sanitizeResources: false, sanitizeOps: false };

const ENROLMENT_SECRET = "test-enrolment-secret-session-lane";

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

interface TestNode {
  nodeId: string;
  bearer: string;
}

async function newNode(): Promise<TestNode> {
  const bearer = mintBearer();
  const node = await store.upsertExecutionNode({
    bearerTokenHash: await sha256Hex(bearer),
    hostname: "session-lane.test",
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

const hub = () => {
  const app = new Hono();
  app.route("/workflow/nodes", createRemoteNodeHubRoutes());
  return app;
};

/** POST a raw events batch at the hub route, with whatever headers the caller wants. */
async function postEvents(
  app: Hono,
  nodeId: string,
  events: unknown[],
  headers: Record<string, string>,
): Promise<Response> {
  return await app.fetch(
    new Request(`http://hub.test/workflow/nodes/${nodeId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ events }),
    }),
  );
}

async function sessionRowCount(nodeId: string): Promise<number> {
  const rows = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM workflow.observed_sessions WHERE node_id = ${nodeId}
  `;
  return Number(rows[0].n);
}

/** The one observed-session row for a node, instants as ISO strings. */
async function sessionSnapshot(nodeId: string) {
  const rows = await sql<
    {
      session_id: string;
      started_at: Date;
      last_heartbeat_at: Date;
      ended_at: Date | null;
    }[]
  >`
    SELECT session_id, started_at, last_heartbeat_at, ended_at
    FROM workflow.observed_sessions WHERE node_id = ${nodeId}
  `;
  assertEquals(rows.length, 1, "exactly one row per (node_id, session_id)");
  return {
    session_id: rows[0].session_id,
    started_at: rows[0].started_at.toISOString(),
    last_heartbeat_at: rows[0].last_heartbeat_at.toISOString(),
    ended_at: rows[0].ended_at === null ? null : rows[0].ended_at.toISOString(),
  };
}

async function runEventCount(nodeId: string): Promise<number> {
  const rows = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM workflow.run_events WHERE node_id = ${nodeId}
  `;
  return Number(rows[0].n);
}

Deno.test({
  ...T,
  name: "setup: workflow schema applied before the session-lane suite runs",
  fn: async () => {
    Deno.env.set("AWCP_NODE_ENROLMENT_SECRET", ENROLMENT_SECRET);
    await ensureWorkflowSchema();
  },
});

// ---------------------------------------------------------------------------
// 1. Emission — the three typed events, and the closed payload they carry
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    "session lane: the node client emits three typed events whose payload is exactly {session_id, node_id, at}",
  fn: async () => {
    const home = await Deno.makeTempDir();
    const nodeId = "00000000-0000-4000-8000-0000000000b3";
    Deno.mkdirSync(home, { recursive: true, mode: 0o700 });
    Deno.writeTextFileSync(`${home}/node_id`, nodeId);

    // Namespace-read rather than a named import, deliberately. A named import of a
    // symbol the module does not export fails at LOAD time and takes the whole file
    // with it; read through the namespace and the absence is an assertion failure in
    // this test alone, which is what makes the red observable per behaviour.
    const api = nodeClient as unknown as Record<string, unknown>;
    for (const name of [
      "newSessionId",
      "emitSessionStart",
      "emitSessionHeartbeat",
      "emitSessionEnd",
    ]) {
      assert(
        typeof api[name] === "function",
        `awcp-node-client must export ${name}() — B3 emits the observed-session lane`,
      );
    }

    const newSessionId = api.newSessionId as () => string;
    const emitStart = api.emitSessionStart as (c: unknown, s: string) => number;
    const emitBeat = api.emitSessionHeartbeat as (c: unknown, s: string) => number;
    const emitEnd = api.emitSessionEnd as (c: unknown, s: string) => number;

    const config = nodeClient.resolveConfig({ home });
    const sessionId = newSessionId();
    assert(
      typeof sessionId === "string" && sessionId.length >= 16,
      "a session id must be an opaque, client-generated, hard-to-collide string",
    );

    emitStart(config, sessionId);
    emitBeat(config, sessionId);
    emitEnd(config, sessionId);

    const spooled = nodeClient.readSpool(config) as {
      event_type: string;
      payload: Record<string, unknown>;
    }[];
    assertEquals(
      spooled.map((e) => e.event_type),
      ["session_start", "session_heartbeat", "session_end"],
      "the lifecycle is TYPED — the event type decides, never a payload key",
    );

    for (const event of spooled) {
      // The whole of KTD-B4 item 6, asserted as a set equality rather than as three
      // presence checks: a presence check passes on a payload that has quietly grown a
      // fourth field, and permanent retention is what makes that growth expensive.
      assertEquals(
        Object.keys(event.payload).sort(),
        ["at", "node_id", "session_id"],
        `${event.event_type} payload must carry the closed field set and nothing else`,
      );
      assertEquals(event.payload.session_id, sessionId);
      assertEquals(event.payload.node_id, nodeId);
      const at = event.payload.at;
      assert(
        typeof at === "string" && !Number.isNaN(Date.parse(at)),
        "`at` must be an ISO 8601 instant — it lands in a timestamptz column",
      );
    }
  },
});

// ---------------------------------------------------------------------------
// 2. The closed set is CLOSED — enforced at the edge
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "session lane: the hub refuses a session payload carrying an unknown field",
  fn: async () => {
    const app = hub();
    const { nodeId, bearer } = await newNode();
    const sid = crypto.randomUUID();
    const auth = { "Authorization": `Bearer ${bearer}` };
    try {
      const rejected = await postEvents(app, nodeId, [{
        client_seq: 1,
        event_type: "session_start",
        payload: {
          session_id: sid,
          node_id: nodeId,
          at: "2026-08-25T09:00:00.000Z",
          // The field that must not travel: KTD-B4 item 6 puts repository and branch
          // on the WorkItem's provenance, never on the node lane.
          repo: "ai-memory",
        },
      }], auth);

      assertEquals(rejected.status, 400, "an unknown payload field must be REFUSED");
      const body = await rejected.json() as { issues?: { client_seq?: unknown }[] };
      assert(Array.isArray(body.issues) && body.issues.length > 0, "issues must name the offender");
      assert(
        body.issues.every((i) => typeof i.client_seq === "number"),
        "every issue must carry a numeric client_seq — that is the shape the node " +
          "client classifies as a per-event rejection and drops-and-counts, rather " +
          "than retrying a permanent rejection forever (D-15)",
      );

      // Refused before the store call: nothing was written on either lane.
      assertEquals(await runEventCount(nodeId), 0, "a refused batch must leave no run event");
      assertEquals(await sessionRowCount(nodeId), 0, "and materialise nothing");

      // NON-VACUITY. The same event without the extra field is accepted — so the 400
      // above is the closed set refusing one field, not the route refusing everything.
      const accepted = await postEvents(app, nodeId, [{
        client_seq: 2,
        event_type: "session_start",
        payload: { session_id: sid, node_id: nodeId, at: "2026-08-25T09:00:00.000Z" },
      }], auth);
      assertEquals(accepted.status, 200);
      assertEquals(await sessionRowCount(nodeId), 1);
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "session lane: an ordinary run event may still carry whatever payload it likes",
  fn: async () => {
    const app = hub();
    const { nodeId, bearer } = await newNode();
    try {
      // The closure is scoped to the SESSION event types. `checkpoint` and `heartbeat`
      // already ship rich payloads (`emitCheckpoint` merges caller JSON), and B3 must
      // not retroactively close a lane it did not open.
      const res = await postEvents(app, nodeId, [{
        client_seq: 1,
        event_type: "checkpoint",
        payload: { phase: "start", hostname: "z2", spooled_events: 0, anything: true },
      }], { "Authorization": `Bearer ${bearer}` });
      assertEquals(res.status, 200);
      assertEquals(await runEventCount(nodeId), 1);
      assertEquals(await sessionRowCount(nodeId), 0);
    } finally {
      await dropNode(bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// 3. Emission rides the existing node bearer — and nothing else
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "session lane: a session event is refused without the node's own bearer",
  fn: async () => {
    const app = hub();
    const target = await newNode();
    const other = await newNode();
    const sid = crypto.randomUUID();
    const event = {
      client_seq: 1,
      event_type: "session_start",
      payload: { session_id: sid, node_id: target.nodeId, at: "2026-08-25T10:00:00.000Z" },
    };
    try {
      const anonymous = await postEvents(app, target.nodeId, [event], {});
      assertEquals(anonymous.status, 401, "no credential at all");

      const wrongShape = await postEvents(app, target.nodeId, [event], {
        "Authorization": "Bearer not-a-node-bearer",
      });
      assertEquals(wrongShape.status, 401, "a credential of the wrong shape");

      // A GENUINE, ENROLLED bearer belonging to a DIFFERENT node. This is the one that
      // matters: holding a valid bearer proves you are *a* node, never *this* node, and
      // a session's identity is the node the bearer proved (KTD-B4 item 3).
      const crossNode = await postEvents(app, target.nodeId, [event], {
        "Authorization": `Bearer ${other.bearer}`,
      });
      assertEquals(crossNode.status, 401, "another node's genuine bearer");

      assertEquals(await runEventCount(target.nodeId), 0);
      assertEquals(await sessionRowCount(target.nodeId), 0);
      assertEquals(await sessionRowCount(other.nodeId), 0);
    } finally {
      await dropNode(target.bearer);
      await dropNode(other.bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// 4. Fabrication guard — no packet, no scope, no run
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "session lane: a lifecycle delivered over HTTP creates no packet, no policy scope and no run",
  fn: async () => {
    const app = hub();
    const { nodeId, bearer } = await newNode();
    const sid = crypto.randomUUID();

    const census = async () => {
      const rows = await sql<
        {
          packets: string;
          items: string;
          claims: string;
          runs: string;
          scopes: string;
        }[]
      >`
        SELECT
          (SELECT count(*)::text FROM workflow.work_packets)                     AS packets,
          (SELECT count(*)::text FROM workflow.work_items)                       AS items,
          (SELECT count(*)::text FROM workflow.work_item_sessions)               AS claims,
          (SELECT count(*)::text FROM workflow.agent_runs)                       AS runs,
          (SELECT count(DISTINCT policy_scope)::text FROM workflow.work_packets) AS scopes
      `;
      return rows[0];
    };

    try {
      const before = await census();

      const at = (m: number) => `2026-08-25T11:${String(m).padStart(2, "0")}:00.000Z`;
      const res = await postEvents(app, nodeId, [
        { client_seq: 1, event_type: "session_start", payload: { session_id: sid, node_id: nodeId, at: at(0) } },
        { client_seq: 2, event_type: "session_heartbeat", payload: { session_id: sid, node_id: nodeId, at: at(1) } },
        { client_seq: 3, event_type: "session_end", payload: { session_id: sid, node_id: nodeId, at: at(2) } },
      ], { "Authorization": `Bearer ${bearer}` });
      assertEquals(res.status, 200);

      assertEquals(await sessionRowCount(nodeId), 1, "the session WAS observed");
      // Row counts AND the distinct policy_scope population: counting rows alone would
      // miss a scope value written onto a packet that already existed, and a fabricated
      // boundary is the failure the column exists to prevent.
      assertEquals(await census(), before);
    } finally {
      await dropNode(bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// 5. Round trip — emitted on the node bearer, materialised by the hub
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    "session lane: start, heartbeat and end round-trip from the client's spool to observed_sessions",
  fn: async () => {
    const app = hub();
    const bearer = mintBearer();
    const home = await Deno.makeTempDir();
    try {
      // A REAL registration through the hub's own route — this test's whole point is
      // that emission rides the credential the node already holds, so the node_id must
      // be the one that credential actually resolves to.
      const registered = await app.fetch(
        new Request("http://hub.test/workflow/nodes/register", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${bearer}`,
            "Content-Type": "application/json",
            "X-Node-Enrolment-Secret": ENROLMENT_SECRET,
          },
          body: JSON.stringify({ hostname: "session-lane.test" }),
        }),
      );
      assertEquals(registered.status, 201);
      const { node_id: nodeId } = await registered.json() as { node_id: string };

      Deno.mkdirSync(home, { recursive: true, mode: 0o700 });
      Deno.writeTextFileSync(`${home}/node_id`, nodeId);
      const config = nodeClient.resolveConfig({
        home,
        bearer,
        hubUrl: "http://hub.test",
        // The node client's own transport, pointed at the in-process hub. No stub
        // response shape is invented here: what comes back is what the route returns.
        fetchImpl: (url: string, init: RequestInit) =>
          app.fetch(new Request(url, init)),
      });

      const sessionId = nodeClient.newSessionId();

      // FLUSHED IN TWO PHASES, and that is what makes this test discriminate.
      // Emitting all three at once cannot tell a working heartbeat from a missing one:
      // `session_end` advances `last_heartbeat_at` too (receiving a close IS an
      // observation that the session was alive), so start+end alone produce a row
      // identical to start+heartbeat+end whenever the close is last. Landing the
      // heartbeat while the session is still OPEN is the only arrangement in which its
      // own effect on its own column is visible.
      nodeClient.emitSessionStart(config, sessionId);
      await new Promise((resolve) => setTimeout(resolve, 10));
      nodeClient.emitSessionHeartbeat(config, sessionId);

      // Read the instants the CLIENT stamped, before the spool drains — the row is
      // asserted against what was actually emitted, never against a value recomputed
      // here that could agree with a bug on both sides.
      const openPhase = nodeClient.readSpool(config) as {
        event_type: string;
        payload: { at: string };
      }[];
      assertEquals(openPhase.map((e) => e.event_type), [
        "session_start",
        "session_heartbeat",
      ]);
      const [startAt, beatAt] = openPhase.map((e) => e.payload.at);
      assert(Date.parse(beatAt) > Date.parse(startAt), "the beat must be later");

      const first = await nodeClient.flush(config) as { outcome: string };
      assertEquals(first.outcome, "acked", "the node bearer must be accepted");
      assertEquals(
        (nodeClient.readSpool(config) as unknown[]).length,
        0,
        "the spool drains only when the hub names each client_seq (EVENT-03)",
      );

      const open = await sessionSnapshot(nodeId);
      assertEquals(open, {
        session_id: sessionId,
        started_at: startAt,
        last_heartbeat_at: beatAt,
        ended_at: null,
      }, "session_start set started_at; session_heartbeat advanced the beat; no close");

      // Phase 2 — the typed close, on its own, so `ended_at` is attributable to it.
      nodeClient.emitSessionEnd(config, sessionId);
      const endAt =
        (nodeClient.readSpool(config) as { payload: { at: string } }[])[0].payload.at;
      const second = await nodeClient.flush(config) as { outcome: string };
      assertEquals(second.outcome, "acked");

      assertEquals(await sessionSnapshot(nodeId), {
        session_id: sessionId,
        started_at: startAt,
        last_heartbeat_at: endAt,
        ended_at: endAt,
      }, "the close closes the session and is itself an observation of liveness");

      // And the three raw events are still on the lane of record.
      assertEquals(await runEventCount(nodeId), 3);
    } finally {
      await dropNode(bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// 6. The heartbeat is PERIODIC — one per tick, on the cadence the client already keeps
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "session lane: runAgent emits one session_start, one heartbeat per tick, and one session_end",
  fn: async () => {
    const home = await Deno.makeTempDir();
    Deno.mkdirSync(home, { recursive: true, mode: 0o700 });
    Deno.writeTextFileSync(`${home}/node_id`, "00000000-0000-4000-8000-0000000000b3");

    // deno-lint-ignore no-explicit-any
    const delivered: any[] = [];
    const ackingFetch = (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      delivered.push(...body.events);
      return Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            acknowledged: body.events.map((e: { client_seq: number }) => ({
              client_seq: e.client_seq,
            })),
          }),
      });
    };

    // deno-lint-ignore no-explicit-any
    const box: { controller?: { stop: () => void; done: Promise<any> } } = {};
    let ticks = 0;
    const sleepImpl = () => {
      ticks += 1;
      if (ticks === 4) box.controller!.stop();
      return Promise.resolve();
    };

    const sessionId = nodeClient.newSessionId();
    box.controller = nodeClient.runAgent({
      ...nodeClient.resolveConfig({ home }),
      sessionId,
      fetchImpl: ackingFetch,
      sleepImpl,
    });
    await box.controller.done;

    const lane = delivered.filter((e) => e.event_type.startsWith("session_"));
    assertEquals(
      lane.map((e) => e.event_type),
      [
        "session_start",
        "session_heartbeat",
        "session_heartbeat",
        "session_heartbeat",
        "session_end",
      ],
      "one start, one heartbeat per tick, one close — in that order",
    );
    for (const event of lane) {
      assertEquals(Object.keys(event.payload).sort(), ["at", "node_id", "session_id"]);
      assertEquals(event.payload.session_id, sessionId);
    }
    // Ordered by allocation, which is what the hub's `(node_id, client_seq)` key means.
    assertEquals(
      lane.map((e) => e.client_seq),
      [...lane.map((e) => e.client_seq)].sort((a, b) => a - b),
    );

    // The pre-B3 event stream is UNCHANGED beside it: the node agent's own start and
    // stop checkpoints and its three node heartbeats are all still there. A session
    // lane that displaced the node lane would be a regression, not a feature.
    assertEquals(delivered.filter((e) => e.event_type === "checkpoint").length, 2);
    assertEquals(delivered.filter((e) => e.event_type === "heartbeat").length, 3);
  },
});

Deno.test({
  ...T,
  name: "session lane: no session id means no session events at all",
  fn: async () => {
    const home = await Deno.makeTempDir();
    Deno.mkdirSync(home, { recursive: true, mode: 0o700 });
    Deno.writeTextFileSync(`${home}/node_id`, "00000000-0000-4000-8000-0000000000b3");

    // deno-lint-ignore no-explicit-any
    const delivered: any[] = [];
    const ackingFetch = (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      delivered.push(...body.events);
      return Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            acknowledged: body.events.map((e: { client_seq: number }) => ({
              client_seq: e.client_seq,
            })),
          }),
      });
    };

    // deno-lint-ignore no-explicit-any
    const box: { controller?: { stop: () => void; done: Promise<any> } } = {};
    let ticks = 0;
    const sleepImpl = () => {
      ticks += 1;
      if (ticks === 2) box.controller!.stop();
      return Promise.resolve();
    };

    box.controller = nodeClient.runAgent({
      ...nodeClient.resolveConfig({ home }),
      fetchImpl: ackingFetch,
      sleepImpl,
    });
    await box.controller.done;

    assertEquals(
      delivered.filter((e) => e.event_type.startsWith("session_")),
      [],
      "an observation is opted into — B3 must not make every node agent a session",
    );
  },
});

// ---------------------------------------------------------------------------
// 7. The abandonment threshold — defined here, evaluated nowhere
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "session lane: the abandonment threshold is a named constant with a pinned value",
  fn: () => {
    // A CHANGE DETECTOR, and deliberately so. The value is a decision the attention
    // milestone inherits (KTD-B4 item 5); pinning it is what makes changing it show up
    // in a diff instead of arriving as a quietly different number.
    assertEquals(SESSION_ABANDONED_AFTER_MS, 300_000, "five minutes");

    // Item 5's own requirement: the threshold is DISTINCT from the packet staleness
    // window. 30 minutes idle is normal; 30 minutes with no heartbeat is not.
    assert(
      SESSION_ABANDONED_AFTER_MS !== DEFAULT_STALE_AFTER_MS,
      "the abandonment threshold must not collapse into DEFAULT_STALE_AFTER_MS",
    );
    assert(SESSION_ABANDONED_AFTER_MS < DEFAULT_STALE_AFTER_MS);

    // Stated in the unit the signal arrives in: whole heartbeats, and enough of them
    // that one missed beat is not a verdict.
    assertEquals(SESSION_ABANDONED_AFTER_MS % SESSION_HEARTBEAT_INTERVAL_MS, 0);
    assert(SESSION_ABANDONED_AFTER_MS / SESSION_HEARTBEAT_INTERVAL_MS >= 3);

    // The emitter and the contract agree about the cadence. They are two files — one
    // TypeScript, one plain Node `.mjs` that cannot import it — so the mirror is
    // asserted rather than assumed.
    assertEquals(
      nodeClient.SESSION_HEARTBEAT_INTERVAL_MS,
      SESSION_HEARTBEAT_INTERVAL_MS,
      "the client's emission cadence must match the contract's",
    );
  },
});
