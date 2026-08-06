/**
 * ST-088 U2 — remote execution node registration and event ingestion (NODE-01, NODE-02).
 *
 * Drives `createRemoteNodeHubRoutes()` IN-PROCESS via `app.fetch`. That is deliberate:
 * this file is about the route contract (status codes, idempotency, what reaches the
 * database), not about the composition root's wiring, which workflow-mvp-e2e.test.ts
 * covers by booting a real process. Keeping them separate means a wiring change cannot
 * quietly turn these assertions green or red for reasons unrelated to what they claim.
 *
 * ---------------------------------------------------------------------------
 * ISOLATION: unique bearers, not scratch schemas.
 * ---------------------------------------------------------------------------
 * store.ts holds the `sql` handle and every statement is hardcoded `workflow.`-qualified
 * (mandatory — see 001's header on AGE search_path pollution), so these tests necessarily
 * run against the real `workflow` schema. `withScratchSchema` cannot help: it governs
 * only where a synthetic migration's ledger lives, not where hardcoded DDL lands.
 *
 * Isolation therefore comes from the credential, which is the natural key here anyway:
 * every test mints its own random 32-byte bearer, so no two tests (and no two runs
 * against the shared, accumulating db-test) can collide on a node identity. Each test
 * deletes its own node in `finally`; run_events cascades.
 *
 * The migration/shape half of NODE-01/02 lives in workflow-migrations.test.ts, next to
 * the other real-directory migration assertions, because a missing-module failure here
 * would take the whole file down with it and prove nothing about the schema.
 */

import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "hono";

import { sql } from "../src/db.ts";
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

/**
 * A valid per-node bearer: 32 random bytes as 64 lowercase hex characters — exactly
 * what `openssl rand -hex 32` produces, which is the documented provisioning command.
 * Random per call so tests never collide on an identity in the shared schema.
 */
function mintBearer(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hubApp(): Hono {
  const app = new Hono();
  app.route("/workflow/nodes", createRemoteNodeHubRoutes());
  return app;
}

function register(app: Hono, bearer: string, body: Record<string, unknown> = {}) {
  return app.fetch(
    new Request("http://hub.test/workflow/nodes/register", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

function postEvents(
  app: Hono,
  bearer: string,
  nodeId: string,
  events: unknown[],
) {
  return app.fetch(
    new Request(`http://hub.test/workflow/nodes/${nodeId}/events`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events }),
    }),
  );
}

/** Delete the node this test created. run_events cascades, so one statement suffices. */
async function dropNode(bearer: string): Promise<void> {
  const hash = await sha256Hex(bearer);
  await sql`DELETE FROM workflow.execution_nodes WHERE bearer_token_hash = ${hash}`;
}

async function nodeRows(bearer: string) {
  const hash = await sha256Hex(bearer);
  return await sql<{ node_id: string; bearer_token_hash: string; status: string }[]>`
    SELECT node_id, bearer_token_hash, status
    FROM workflow.execution_nodes WHERE bearer_token_hash = ${hash}
  `;
}

Deno.test({
  ...T,
  name: "setup: workflow schema applied before the hub suite runs",
  fn: async () => {
    await ensureWorkflowSchema();
  },
});

// ---------------------------------------------------------------------------
// NODE-01 — registration
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "NODE-01a: a valid bearer registers and returns a uuid node_id",
  fn: async () => {
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const res = await register(app, bearer, { hostname: "z2", platform: "ubuntu-24.04" });
      const body = await res.json();
      assertEquals(res.status, 201, JSON.stringify(body));
      assert(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.node_id),
        `node_id is not a uuid: ${JSON.stringify(body)}`,
      );

      const rows = await nodeRows(bearer);
      assertEquals(rows.length, 1, "registration persisted exactly one node");
      assertEquals(rows[0].node_id, body.node_id);
      assertEquals(rows[0].status, "active");
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-01b: re-registering the same bearer is an upsert, not a second identity",
  fn: async () => {
    // The repeat-registration probe. A node restarts and registers again on every boot;
    // if that minted a new identity each time, its event history would fragment across
    // rows and the hub could never attribute a run to "that machine".
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const first = await (await register(app, bearer)).json();
      const second = await register(app, bearer);
      const secondBody = await second.json();

      assertEquals(second.status, 201);
      assertEquals(secondBody.node_id, first.node_id, "the same bearer must resolve to one identity");
      assertEquals((await nodeRows(bearer)).length, 1, "no second row was created");
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-01c: concurrent registrations with one bearer resolve to a single identity",
  fn: async () => {
    // The concurrency probe. Two racing registrations must not both INSERT. The
    // guarantee is UNIQUE(bearer_token_hash) in the database, not ordering in JS —
    // which is why this asserts on the row count as well as the returned ids.
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const [a, b] = await Promise.all([register(app, bearer), register(app, bearer)]);
      const bodyA = await a.json();
      const bodyB = await b.json();

      assertEquals(a.status, 201, JSON.stringify(bodyA));
      assertEquals(b.status, 201, JSON.stringify(bodyB));
      assertEquals(bodyA.node_id, bodyB.node_id, "the race resolved to two identities");
      assertEquals((await nodeRows(bearer)).length, 1, "the race created two rows");
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-01 security: only the digest is persisted — the raw bearer never lands in a column",
  fn: async () => {
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const body = await (await register(app, bearer)).json();

      // Serialise the whole row and search it, rather than checking the one column we
      // expect to be wrong. A future migration adding a column that captures the raw
      // bearer would slip past a targeted check and is exactly the leak worth catching.
      const [row] = await sql<Record<string, unknown>[]>`
        SELECT * FROM workflow.execution_nodes WHERE node_id = ${body.node_id}
      `;
      const serialised = JSON.stringify(row);
      assert(
        !serialised.includes(bearer),
        "the raw bearer appears in workflow.execution_nodes",
      );
      assertEquals(row.bearer_token_hash, await sha256Hex(bearer));
      assert(
        /^[0-9a-f]{64}$/.test(String(row.bearer_token_hash)),
        "stored credential is not a 64-char hex digest",
      );

      // ...and the response body does not hand one back either.
      assert(!JSON.stringify(body).includes(bearer), "the response echoed the raw bearer");
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-01 security: a bearer outside the 64-hex format is refused before anything is stored",
  fn: async () => {
    // The entropy floor that makes a deterministic SHA-256 credential store sound. A
    // fast digest is only safe against a high-entropy secret; this rejects anything
    // that cannot carry 256 bits of ENCODED entropy before it is ever hashed.
    //
    // Note what this does and does not prove: it enforces shape, not randomness. The
    // randomness comes from the documented `openssl rand -hex 32`.
    const app = hubApp();
    const malformed = [
      "short",
      "NOTHEX".repeat(10),
      mintBearer().toUpperCase(), // uppercase hex — right entropy, wrong canonical form
      mintBearer().slice(0, 63), // one character short
      mintBearer() + "a", // one character long
      "g".repeat(64), // right length, not hex
    ];

    for (const bad of malformed) {
      const res = await register(app, bad);
      assertEquals(res.status, 401, `expected 401 for bearer ${JSON.stringify(bad.slice(0, 12))}…`);
      assertEquals(
        (await nodeRows(bad)).length,
        0,
        "a rejected bearer must persist no row",
      );
    }

    // Positive control: the same request shape with a well-formed bearer succeeds, so
    // the 401s above are the format gate firing and not the route being broken.
    const good = mintBearer();
    try {
      const ok = await register(app, good);
      assertEquals(ok.status, 201, "a well-formed bearer must still register");
    } finally {
      await dropNode(good);
    }
  },
});

// ---------------------------------------------------------------------------
// NODE-02 — event ingestion
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "NODE-02a: a registered node's events are persisted and attributed to it",
  fn: async () => {
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const { node_id } = await (await register(app, bearer)).json();
      const res = await postEvents(app, bearer, node_id, [
        { client_seq: 1, event_type: "run_started", payload: { repo: "ai-memory" } },
      ]);
      const body = await res.json();
      assertEquals(res.status, 200, JSON.stringify(body));

      const rows = await sql<{ client_seq: string; event_type: string }[]>`
        SELECT client_seq, event_type FROM workflow.run_events WHERE node_id = ${node_id}
      `;
      assertEquals(rows.length, 1);
      assertEquals(Number(rows[0].client_seq), 1);
      assertEquals(rows[0].event_type, "run_started");
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-02b: replaying an identical (node_id, client_seq) adds no row and still acknowledges",
  fn: async () => {
    // The delivery contract. A node that does not see an ack re-sends, so the hub must
    // absorb the replay AND acknowledge it again — acking only fresh inserts would
    // leave the node retrying the same event forever.
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const { node_id } = await (await register(app, bearer)).json();
      const event = { client_seq: 7, event_type: "checkpoint", payload: { step: "build" } };

      const first = await postEvents(app, bearer, node_id, [event]);
      const firstBody = await first.json();
      const second = await postEvents(app, bearer, node_id, [event]);
      const secondBody = await second.json();

      assertEquals(first.status, 200, JSON.stringify(firstBody));
      assertEquals(second.status, 200, JSON.stringify(secondBody));

      const rows = await sql<{ n: string }[]>`
        SELECT count(*) AS n FROM workflow.run_events WHERE node_id = ${node_id}
      `;
      assertEquals(Number(rows[0].n), 1, "the replay inserted a second row");

      for (const body of [firstBody, secondBody]) {
        assertEquals(
          body.acknowledged.map((a: { client_seq: number }) => Number(a.client_seq)),
          [7],
          "both responses must acknowledge client_seq 7",
        );
      }
      assertEquals(
        firstBody.acknowledged[0].event_id,
        secondBody.acknowledged[0].event_id,
        "the replay acknowledged a different event_id",
      );
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-02c: a batch is acknowledged for every submitted client_seq",
  fn: async () => {
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const { node_id } = await (await register(app, bearer)).json();
      const events = Array.from({ length: 25 }, (_, i) => ({
        client_seq: i + 1,
        event_type: "heartbeat",
        payload: { i },
      }));

      const res = await postEvents(app, bearer, node_id, events);
      const body = await res.json();
      assertEquals(res.status, 200, JSON.stringify(body));

      const acked = body.acknowledged
        .map((a: { client_seq: number }) => Number(a.client_seq))
        .sort((a: number, b: number) => a - b);
      assertEquals(acked, events.map((e) => e.client_seq), "an event went unacknowledged");
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-02: two nodes may both use the same client_seq — uniqueness is per node",
  fn: async () => {
    // Discrimination control for the UNIQUE(node_id, client_seq) scoping. If uniqueness
    // were on client_seq alone, every node would have to coordinate its counter with
    // every other node, and the second node's event 1 would silently vanish.
    const bearerA = mintBearer();
    const bearerB = mintBearer();
    const app = hubApp();
    try {
      const a = await (await register(app, bearerA)).json();
      const b = await (await register(app, bearerB)).json();
      assertNotEquals(a.node_id, b.node_id);

      const event = { client_seq: 1, event_type: "run_started" };
      assertEquals((await postEvents(app, bearerA, a.node_id, [event])).status, 200);
      assertEquals((await postEvents(app, bearerB, b.node_id, [event])).status, 200);

      for (const id of [a.node_id, b.node_id]) {
        const rows = await sql<{ n: string }[]>`
          SELECT count(*) AS n FROM workflow.run_events WHERE node_id = ${id}
        `;
        assertEquals(Number(rows[0].n), 1, `node ${id} lost its event to the other node's seq`);
      }
    } finally {
      await dropNode(bearerA);
      await dropNode(bearerB);
    }
  },
});

// ---------------------------------------------------------------------------
// NODE-03 — rejection, isolation, and ownership (Plan 02)
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "NODE-03: a missing or malformed Authorization header is refused on both endpoints",
  fn: async () => {
    // REGRESSION, not a red control. Plan 01's validateNodeBearer already answers 401
    // for an absent or malformed header; these assertions were green before Plan 02's
    // production change and are here to keep them that way, not to prove a new guard.
    const app = hubApp();
    const headerCases: (HeadersInit | undefined)[] = [
      undefined, // no Authorization at all
      { "Authorization": "" },
      { "Authorization": "Bearer" }, // no token
      { "Authorization": "Bearer " }, // empty token
      { "Authorization": mintBearer() }, // token without the Bearer scheme
      { "Authorization": `Basic ${mintBearer()}` }, // wrong scheme
    ];

    for (const headers of headerCases) {
      for (
        const url of [
          "http://hub.test/workflow/nodes/register",
          "http://hub.test/workflow/nodes/00000000-0000-4000-8000-000000000000/events",
        ]
      ) {
        const res = await app.fetch(
          new Request(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(headers ?? {}) },
            body: JSON.stringify({ events: [{ client_seq: 1, event_type: "x" }] }),
          }),
        );
        assertEquals(res.status, 401, `${url} accepted ${JSON.stringify(headers)}`);
      }
    }

    // Nothing was written by any of the above.
    const rows = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM workflow.run_events
      WHERE node_id = '00000000-0000-4000-8000-000000000000'
    `;
    assertEquals(Number(rows[0].n), 0);
  },
});

Deno.test({
  ...T,
  name: "NODE-03: the platform operator key cannot authenticate the node surface",
  fn: async () => {
    // GENUINE red control — this guard is new in Plan 02.
    //
    // The platform key is set to a 64-LOWERCASE-HEX value on purpose. The format gate
    // runs first, so a platform key of any other shape would be rejected as malformed
    // and this test would pass without the isolation check existing at all — green for
    // the wrong reason. Making the key structurally valid forces the request past the
    // format gate so only bearerIsPlatformKey can refuse it.
    const app = hubApp();
    const platformKey = mintBearer();
    const original = Deno.env.get("MEMORY_API_KEY");
    Deno.env.set("MEMORY_API_KEY", platformKey);

    const control = mintBearer();
    try {
      const res = await register(app, platformKey);
      assertEquals(res.status, 401, "MEMORY_API_KEY authenticated a node surface");
      assertEquals(
        (await nodeRows(platformKey)).length,
        0,
        "the platform key minted a node identity",
      );

      // Positive control: an equally well-formed bearer that is NOT the platform key
      // registers normally. Without this, the 401 above could be the format gate.
      const ok = await register(app, control);
      assertEquals(ok.status, 201, "a non-platform bearer of the same shape must register");
    } finally {
      await dropNode(control);
      await dropNode(platformKey);
      if (original === undefined) Deno.env.delete("MEMORY_API_KEY");
      else Deno.env.set("MEMORY_API_KEY", original);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-03: node A's bearer cannot write events attributed to node B",
  fn: async () => {
    // GENUINE red control — the cross-node injection guard, the high blocker Plan 01
    // deliberately deferred. Holding a valid bearer proves you are *a* node, not *this*
    // node; before this guard, any authenticated node could forge another machine's
    // execution history.
    const bearerA = mintBearer();
    const bearerB = mintBearer();
    const app = hubApp();
    try {
      const a = await (await register(app, bearerA)).json();
      const b = await (await register(app, bearerB)).json();

      const res = await postEvents(app, bearerA, b.node_id, [
        { client_seq: 99, event_type: "forged" },
      ]);
      assertEquals(res.status, 401, "node A wrote to node B's stream");

      const rows = await sql<{ n: string }[]>`
        SELECT count(*) AS n FROM workflow.run_events WHERE node_id = ${b.node_id}
      `;
      assertEquals(Number(rows[0].n), 0, "a forged event reached node B");

      // Positive control: A writing to its OWN node_id still works, so the 401 above is
      // the ownership guard and not a route that stopped accepting events.
      const own = await postEvents(app, bearerA, a.node_id, [
        { client_seq: 99, event_type: "legitimate" },
      ]);
      assertEquals(own.status, 200, "the ownership guard also blocked the rightful node");
    } finally {
      await dropNode(bearerA);
      await dropNode(bearerB);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-03: over-limit batches and oversized payloads are refused with no partial write",
  fn: async () => {
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const { node_id } = await (await register(app, bearer)).json();

      // Batch count ceiling — REGRESSION, Plan 01's Zod .max(500) already enforced it.
      const tooMany = Array.from({ length: 501 }, (_, i) => ({
        client_seq: i + 1,
        event_type: "flood",
      }));
      assertEquals((await postEvents(app, bearer, node_id, tooMany)).status, 400);

      // Payload byte ceiling — GENUINE red control, new in Plan 02. A 500-event batch
      // bounds how many events arrive, not how big each is; without this a valid-looking
      // request can cost the hub hundreds of megabytes.
      const huge = { client_seq: 1, event_type: "fat", payload: { blob: "x".repeat(20_000) } };
      const res = await postEvents(app, bearer, node_id, [huge]);
      assertEquals(res.status, 400, "an oversized payload was accepted");

      const rows = await sql<{ n: string }[]>`
        SELECT count(*) AS n FROM workflow.run_events WHERE node_id = ${node_id}
      `;
      assertEquals(Number(rows[0].n), 0, "a rejected batch left a partial write");

      // Positive control: a payload just under the ceiling is accepted, so the 400s
      // above are the ceilings firing rather than the route refusing all payloads.
      const ok = await postEvents(app, bearer, node_id, [
        { client_seq: 1, event_type: "ok", payload: { blob: "x".repeat(1_000) } },
      ]);
      assertEquals(ok.status, 200);
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-02: events for a node_id that does not exist are refused, not orphaned",
  fn: async () => {
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const absent = "00000000-0000-4000-8000-000000000000";
      const res = await postEvents(app, bearer, absent, [
        { client_seq: 1, event_type: "run_started" },
      ]);
      assert(
        res.status === 404 || res.status === 401,
        `expected a refusal for an unknown node_id, got ${res.status}`,
      );

      const rows = await sql<{ n: string }[]>`
        SELECT count(*) AS n FROM workflow.run_events WHERE node_id = ${absent}
      `;
      assertEquals(Number(rows[0].n), 0);
    } finally {
      await dropNode(bearer);
    }
  },
});
