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

/**
 * The hub-side enrolment secret for this suite, installed by the setup test below.
 *
 * Not a bearer and deliberately not 64-hex: the enrolment secret is operator-chosen and
 * has no format rule, so a value that would *also* pass BEARER_FORMAT could let a test
 * pass for the wrong reason.
 */
const ENROLMENT_SECRET = "test-enrolment-secret-4f2c9ab1";

/**
 * Register, presenting the enrolment secret by default.
 *
 * Default rather than opt-in, because nearly every test in this file needs a node to
 * exist and is not itself about enrolment — making it explicit everywhere would bury
 * the two tests that actually vary it. Pass `null` to omit the header entirely, or a
 * string to present the wrong secret.
 */
function register(
  app: Hono,
  bearer: string,
  body: Record<string, unknown> = {},
  enrolment: string | null = ENROLMENT_SECRET,
) {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${bearer}`,
    "Content-Type": "application/json",
  };
  if (enrolment !== null) headers["X-Node-Enrolment-Secret"] = enrolment;
  return app.fetch(
    new Request("http://hub.test/workflow/nodes/register", {
      method: "POST",
      headers,
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
    Deno.env.set("AWCP_NODE_ENROLMENT_SECRET", ENROLMENT_SECRET);
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

      // No Number() coercion, deliberately. The acknowledgement is the ONLY thing a
      // node's spool compares against, and a client doing `sent === acked` never
      // matches a string. Coercing here would make this assertion pass whether the hub
      // answered 7 or "7" — i.e. it would not test the property the delivery contract
      // depends on. Assert the wire type as strictly as the client must consume it.
      for (const body of [firstBody, secondBody]) {
        assertEquals(
          body.acknowledged.map((a: { client_seq: number }) => a.client_seq),
          [7],
          "both responses must acknowledge client_seq 7 as a NUMBER",
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
        .map((a: { client_seq: number }) => a.client_seq)
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

Deno.test({
  ...T,
  name: "NODE-02: a client_seq repeated WITHIN one batch is acknowledged once, first payload wins",
  fn: async () => {
    // The acknowledgement contract, pinned. client_seq is the per-node idempotency key,
    // which is already what UNIQUE(node_id, client_seq) means for replays ACROSS
    // requests; a batch cannot mean something different. So: one ack per distinct
    // submitted seq, and the first occurrence is the one stored.
    //
    // This is a real loss of the later payload, which is why it is asserted rather than
    // left implicit — the contract on a node is "never reuse a client_seq for different
    // content", and a node that breaks it must not be able to mistake the single ack for
    // confirmation that both entries landed.
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const { node_id } = await (await register(app, bearer)).json();

      const res = await postEvents(app, bearer, node_id, [
        { client_seq: 5, event_type: "first", payload: { which: "first" } },
        { client_seq: 5, event_type: "second", payload: { which: "second" } },
        { client_seq: 6, event_type: "distinct", payload: { which: "distinct" } },
      ]);
      const body = await res.json();
      assertEquals(res.status, 200, JSON.stringify(body));

      assertEquals(
        body.acknowledged.map((a: { client_seq: number }) => a.client_seq),
        [5, 6],
        "the batch must be acknowledged once per DISTINCT client_seq",
      );

      const rows = await sql<{ client_seq: string; event_type: string }[]>`
        SELECT client_seq, event_type FROM workflow.run_events
        WHERE node_id = ${node_id} ORDER BY client_seq
      `;
      assertEquals(rows.length, 2, "a duplicated client_seq stored a second row");
      assertEquals(rows[0].event_type, "first", "the LATER duplicate overwrote the first");
      assertEquals(rows[1].event_type, "distinct");
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-02: a payload containing a NUL character is stored, not turned into a 500",
  fn: async () => {
    // Postgres rejects U+0000 inside jsonb (22P05) though JSON permits it, and
    // toHttpError does not map that code — so one NUL was a 500. The batch is a single
    // statement, so that 500 also blocked acknowledgement of every event beside it, and
    // the read-back ack contract turned the whole batch into a permanent retry loop.
    // Captured command output is precisely where a stray NUL comes from.
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const { node_id } = await (await register(app, bearer)).json();

      const res = await postEvents(app, bearer, node_id, [
        { client_seq: 1, event_type: "stdout", payload: { line: "before\u0000after" } },
        // A key carrying one too — sanitising values alone would still 500 here.
        { client_seq: 2, event_type: "stdout", payload: { "k\u0000ey": "v" } },
        // And the literal characters \u0000 in ordinary text, which must survive intact:
        // the encoded form of THIS is \\u0000, and a naive string-level deletion of the
        // escape would leave a dangling backslash and 500 by a longer route.
        { client_seq: 3, event_type: "stdout", payload: { line: "literal \\u0000 text" } },
      ]);
      const body = await res.json();
      assertEquals(res.status, 200, JSON.stringify(body));
      assertEquals(
        body.acknowledged.map((a: { client_seq: number }) => a.client_seq),
        [1, 2, 3],
        "a NUL anywhere in the batch cost the whole batch its acknowledgement",
      );

      const rows = await sql<{ payload: Record<string, string> }[]>`
        SELECT payload FROM workflow.run_events
        WHERE node_id = ${node_id} ORDER BY client_seq
      `;
      assertEquals(rows[0].payload.line, "beforeafter", "the NUL was not stripped");
      assertEquals(Object.keys(rows[1].payload), ["key"], "the NUL key was not stripped");
      assertEquals(
        rows[2].payload.line,
        "literal \\u0000 text",
        "legitimate backslash-u text was corrupted by the NUL sanitiser",
      );
    } finally {
      await dropNode(bearer);
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
  name: "NODE-03: no platform credential can authenticate the node surface",
  fn: async () => {
    // GENUINE red control — this guard is new in Plan 02.
    //
    // Each platform key is set to a 64-LOWERCASE-HEX value on purpose. The format gate
    // runs first, so a platform key of any other shape would be rejected as malformed
    // and this test would pass without the isolation check existing at all — green for
    // the wrong reason. Making the key structurally valid forces the request past the
    // format gate so only bearerIsPlatformKey can refuse it.
    //
    // BOTH keys, not just the operator's: index.ts accepts AWCP_AGENT_API_KEY on
    // /api/workflow too, so an isolation check covering only MEMORY_API_KEY would leave
    // a genuine platform credential able to enrol itself as a node.
    const app = hubApp();
    for (const envVar of ["MEMORY_API_KEY", "AWCP_AGENT_API_KEY"]) {
      const platformKey = mintBearer();
      const original = Deno.env.get(envVar);
      Deno.env.set(envVar, platformKey);

      const control = mintBearer();
      try {
        const res = await register(app, platformKey);
        assertEquals(res.status, 401, `${envVar} authenticated a node surface`);
        assertEquals(
          (await nodeRows(platformKey)).length,
          0,
          `${envVar} minted a node identity`,
        );

        // Positive control: an equally well-formed bearer that is NOT the platform key
        // registers normally. Without this, the 401 above could be the format gate.
        const ok = await register(app, control);
        assertEquals(ok.status, 201, "a non-platform bearer of the same shape must register");
      } finally {
        await dropNode(control);
        await dropNode(platformKey);
        if (original === undefined) Deno.env.delete(envVar);
        else Deno.env.set(envVar, original);
      }
    }
  },
});

// ---------------------------------------------------------------------------
// NODE-01 enrolment — a well-formed bearer is not an authorised one
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "NODE-01 enrolment: an unknown bearer without the enrolment secret is refused and stored nowhere",
  fn: async () => {
    // THE HOLE THIS CLOSES. Before the enrolment gate, `openssl rand -hex 32` piped at
    // this endpoint returned 201 and a real node_id — "pre-provisioned bearer" was
    // asserted in a docblock and enforced by nothing. Every downstream guarantee
    // (ownership, attribution, the cross-node guard) was scoped to a principal anyone
    // could create.
    //
    // Assert the ABSENCE of a row, not just the status. A 401 that still enrolled the
    // node would be the same bug wearing a different response code.
    const app = hubApp();
    const noHeader = mintBearer();
    const wrongSecret = mintBearer();
    try {
      const missing = await register(app, noHeader, {}, null);
      assertEquals(missing.status, 401, "an unknown bearer enrolled with no secret at all");
      assertEquals((await nodeRows(noHeader)).length, 0, "a refused bearer was persisted");

      const wrong = await register(app, wrongSecret, {}, "not-the-enrolment-secret");
      assertEquals(wrong.status, 401, "an unknown bearer enrolled with the wrong secret");
      assertEquals((await nodeRows(wrongSecret)).length, 0, "a refused bearer was persisted");

      // Positive control: the same request with the RIGHT secret enrols. Without this,
      // both 401s above would pass against a route that refused every registration.
      const ok = mintBearer();
      try {
        assertEquals((await register(app, ok)).status, 201, "a correct secret must enrol");
      } finally {
        await dropNode(ok);
      }
    } finally {
      await dropNode(noHeader);
      await dropNode(wrongSecret);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-01 enrolment: an already-enrolled bearer re-registers without the secret",
  fn: async () => {
    // The ssh-key half of the model, and the reason the gate sits on the INSERT branch
    // alone. A node keeps its bearer and nothing else; it must be able to re-register on
    // every boot forever without the operator's enrolment secret ever touching its disk.
    // Gating the whole endpoint instead would have been simpler and wrong.
    const bearer = mintBearer();
    const app = hubApp();
    try {
      const first = await register(app, bearer, { hostname: "z2" });
      const firstBody = await first.json();
      assertEquals(first.status, 201, JSON.stringify(firstBody));

      const reboot = await register(app, bearer, {}, null);
      const rebootBody = await reboot.json();
      assertEquals(reboot.status, 201, "a known node was refused its own re-registration");
      assertEquals(rebootBody.node_id, firstBody.node_id, "re-registration forked the identity");
      assertEquals((await nodeRows(bearer)).length, 1);
    } finally {
      await dropNode(bearer);
    }
  },
});

Deno.test({
  ...T,
  name: "NODE-01 enrolment: with no secret configured, enrolment is CLOSED",
  fn: async () => {
    // The default matters more than the mechanism. A hub that has not been told to
    // enrol anyone must enrol no one — the opposite default (unset means open) is
    // exactly the original hole, reachable by forgetting to set a variable.
    const app = hubApp();
    const bearer = mintBearer();
    const original = Deno.env.get("AWCP_NODE_ENROLMENT_SECRET");
    Deno.env.delete("AWCP_NODE_ENROLMENT_SECRET");
    try {
      // Presenting a secret cannot help: there is nothing configured for it to match.
      const res = await register(app, bearer, {}, ENROLMENT_SECRET);
      assertEquals(res.status, 401, "enrolment succeeded with no secret configured");
      assertEquals((await nodeRows(bearer)).length, 0, "a node enrolled against no secret");
    } finally {
      await dropNode(bearer);
      if (original === undefined) Deno.env.delete("AWCP_NODE_ENROLMENT_SECRET");
      else Deno.env.set("AWCP_NODE_ENROLMENT_SECRET", original);
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
      // Exactly 404, not "404 or 401". The handler resolves this deterministically:
      // findExecutionNode runs BEFORE the ownership check, which the source docblock
      // calls a deliberate decision (an unknown node_id is an ordinary client error,
      // worth distinguishing from a permission failure). An assertion that accepts
      // either would keep passing if that ordering silently reversed — which would
      // change what the endpoint discloses.
      assertEquals(res.status, 404, "an unknown node_id must answer 404");

      const rows = await sql<{ n: string }[]>`
        SELECT count(*) AS n FROM workflow.run_events WHERE node_id = ${absent}
      `;
      assertEquals(Number(rows[0].n), 0);
    } finally {
      await dropNode(bearer);
    }
  },
});
