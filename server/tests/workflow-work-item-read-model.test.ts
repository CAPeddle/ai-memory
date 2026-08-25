/**
 * ST-097 / B5 — the WorkItem read model and the three provenance-lookup GETs, driven
 * in-process through the real router.
 *
 * **What is actually at stake here, stated as properties rather than as coverage.**
 *
 *   1. **The projection presents state component by component and reduces nothing.**
 *      ADR-017 §6 and KTD-D6: a WorkItem has no aggregate status, derived or stored.
 *      A `status`/`state`/`phase` field appearing on this view later would be a
 *      reversal of a settled decision, so the field set is pinned rather than
 *      sampled — see the field-set test below, which is also what B6's UI/agent read
 *      parity row is asserted against.
 *   2. **Policy scope stays per-packet.** ADR-017 §3: a Work Packet is the only
 *      authority for its own scope, and a WorkItem may own several packets with
 *      different scopes. Choosing among them implicitly would be choosing the
 *      boundary. The fixture therefore binds TWO packets with DIFFERENT scopes, so a
 *      projection that aggregated (first-wins, most-restrictive-wins, any rule at
 *      all) could not pass.
 *   3. **Observed is distinguishable from authoritative in the projection's own
 *      shape.** Not by a naming convention and not by a comment: the two live under
 *      separate keys with disjoint field sets, and the observed entries carry no
 *      packet, no run and no scope — the same structural incapacity
 *      `005_work_items.sql` gives the row itself.
 *   4. **`source_ref` survives the round trip.** KTD-B5 routes provenance lookup
 *      through query parameters precisely because `#57` cannot travel in a path
 *      segment (`#` opens a fragment). `%2357`, `PROJ-1234` and `ST-097` are all
 *      exercised literally.
 *
 * **Why in-process rather than a server process.** `createWorkflowApi()` is a Hono
 * app, so `app.request()` drives the real router, the real schemas and the real store
 * against the real database — everything except the composition root's bearer
 * middleware, which is deliberately not this module's concern (see api.ts's
 * authentication note). The credential half of B5's contract lives where it can only
 * live: `workflow-agent-key-e2e.test.ts`, against a real process with real keys.
 * Splitting it this way is what keeps this file free of `--allow-run`.
 *
 * **Fixture provenance is randomised, except where the contract names a literal.**
 * `uq_work_items_provenance` is a real unique index and `db-test` accumulates across
 * runs (wiped when its container stops, not between `exec` invocations). The three
 * literal refs the Verification Contract names are therefore deleted before they are
 * created; they are bound to no packet and claimed by no session, so the delete
 * cannot hit `work_packets.work_item_id`'s NO ACTION refusal.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import { createWorkflowApi } from "../src/workflow/api.ts";
import { ensureWorkflowSchema } from "../src/workflow/schema.ts";
import * as store from "../src/workflow/store.ts";
import * as workItemStore from "../src/workflow/workItemStore.ts";
import type { SourceSystem } from "../src/workflow/types.ts";

const T = { sanitizeResources: false, sanitizeOps: false };

const api = createWorkflowApi();

/** A uuid that is well-formed and names nothing. */
const ABSENT_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

/** A `source_ref` no previous run of this suite can have inserted. */
function uniqueRef(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

// deno-lint-ignore no-explicit-any
type Body = any;

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: Body }> {
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

/** SHA-256 hex, by the same rule remoteNodeHub.ts uses. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Observe a session into existence through `ingestRunEvents`, not through a
 * hand-written INSERT.
 *
 * A session that never travelled the node lane is not the thing a claim claims, and
 * a fixture that wrote `observed_sessions` directly would prove the read model can
 * render a row this system has no way to produce.
 */
async function observeSession(): Promise<{ nodeId: string; sessionId: string; bearer: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const bearer = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

  const node = await store.upsertExecutionNode({
    bearerTokenHash: await sha256Hex(bearer),
    hostname: "b5-read-model.test",
    platform: "deno-test",
    allowEnrolment: true,
  });
  assert(node !== null, "enrolment must succeed for a fresh bearer");

  const sessionId = `b5-read-model-${crypto.randomUUID()}`;
  await store.ingestRunEvents(node.node_id, [{
    client_seq: 1,
    event_type: "session_start",
    payload: { session_id: sessionId, node_id: node.node_id, at: new Date().toISOString() },
  }]);
  return { nodeId: node.node_id, sessionId, bearer };
}

async function dropNode(bearer: string): Promise<void> {
  const hash = await sha256Hex(bearer);
  await sql`DELETE FROM workflow.execution_nodes WHERE bearer_token_hash = ${hash}`;
}

/**
 * The full fixture: one WorkItem, two packets under it carrying DIFFERENT policy
 * scopes, and one claimed observed session.
 */
async function fullFixture() {
  const sourceRef = uniqueRef("ST-097");
  const item = await workItemStore.createWorkItem({ sourceSystem: "story-board", sourceRef });

  const corporate = await store.createPacket({
    title: "B5 read-model probe (corporate)",
    objective: "prove the projection keeps scope per packet",
    policyScope: "corporate",
  });
  const personal = await store.createPacket({
    title: "B5 read-model probe (personal)",
    objective: "prove the projection keeps scope per packet",
    policyScope: "personal",
  });
  await workItemStore.bindPacketToWorkItem(corporate.id, item.id);
  await workItemStore.bindPacketToWorkItem(personal.id, item.id);

  const observed = await observeSession();
  await workItemStore.claimSessionForWorkItem(item.id, observed.nodeId, observed.sessionId);

  return { item, sourceRef, corporate, personal, observed };
}

/** Create a WorkItem at a LITERAL provenance pair, clearing any earlier run's row. */
async function literalWorkItem(sourceSystem: SourceSystem, sourceRef: string) {
  await sql`
    DELETE FROM workflow.work_items
    WHERE source_system = ${sourceSystem} AND source_ref = ${sourceRef}
  `;
  return await workItemStore.createWorkItem({ sourceSystem, sourceRef });
}

Deno.test({
  ...T,
  name: "setup: workflow schema applied by the module itself",
  fn: async () => {
    await ensureWorkflowSchema();
  },
});

// ---------------------------------------------------------------------------
// (a) The projection's shape — pinned, not sampled
// ---------------------------------------------------------------------------

/**
 * The WorkItem projection's field set, at all three levels.
 *
 * **This is B6's UI/agent read-parity contract expressed as data.** The parity row
 * says "assert on the field set, not a sample response", and this is the field set:
 * anything the UI renders for a WorkItem must be one of these keys, and every one of
 * them is reachable by an agent-key GET (proved at the process boundary in
 * `workflow-agent-key-e2e.test.ts`).
 */
const VIEW_KEYS = ["workItem", "packets", "observedSessions"];
const PACKET_ENTRY_KEYS = ["packet", "policyScope"];
const SESSION_ENTRY_KEYS = [
  "work_item_id",
  "node_id",
  "session_id",
  "started_at",
  "last_heartbeat_at",
  "ended_at",
  "claimed_at",
];

function keysOf(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort();
}

Deno.test({
  ...T,
  name: "GET /work-items/:id: the projection's field set is exactly the contract, at every level",
  fn: async () => {
    const { item } = await fullFixture();
    const res = await call(`/work-items/${item.id}`);
    assertEquals(res.status, 200, JSON.stringify(res.body));

    assertEquals(keysOf(res.body), [...VIEW_KEYS].sort());
    assertEquals(keysOf(res.body.packets[0]), [...PACKET_ENTRY_KEYS].sort());
    assertEquals(keysOf(res.body.observedSessions[0]), [...SESSION_ENTRY_KEYS].sort());
  },
});

Deno.test({
  ...T,
  name: "GET /work-items/:id: no aggregate status is synthesised, at any level (ADR-017 §6)",
  fn: async () => {
    const { item } = await fullFixture();
    const res = await call(`/work-items/${item.id}`);
    assertEquals(res.status, 200, JSON.stringify(res.body));

    for (const banned of ["status", "state", "phase"]) {
      assertEquals(
        banned in res.body,
        false,
        `the WorkItem view must not carry "${banned}" — ADR-017 §6 settles that there is nothing to aggregate`,
      );
      assertEquals(banned in res.body.workItem, false, `the WorkItem row must not carry "${banned}"`);
      assertEquals(
        banned in res.body.observedSessions[0],
        false,
        `an observed session has no status column, by decision — "${banned}" would be one derived`,
      );
    }
    // The PACKET keeps its own status, and that is not an aggregate: it is the
    // packet's own column, presented as itself. Asserting it here is the
    // discrimination control for the loop above — a projection that had simply
    // dropped every status-shaped key would pass the loop vacuously.
    assertEquals(res.body.packets[0].packet.status, "open");
  },
});

// ---------------------------------------------------------------------------
// (b) Policy scope — per packet, never aggregated
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "GET /work-items/:id: each packet carries its own policy scope and the WorkItem carries none",
  fn: async () => {
    const { item, corporate, personal } = await fullFixture();
    const res = await call(`/work-items/${item.id}`);
    assertEquals(res.status, 200, JSON.stringify(res.body));

    // Two packets, two DIFFERENT scopes. No aggregation rule — first-wins,
    // most-restrictive-wins, or any other — can reproduce both of these.
    const byId = new Map<string, string>(
      res.body.packets.map((p: Body) => [p.packet.id, p.policyScope]),
    );
    assertEquals(byId.get(corporate.id), "corporate");
    assertEquals(byId.get(personal.id), "personal");

    // And nothing WorkItem-level holds a scope. ADR-017 §3: a scope-gated operation
    // reached through a WorkItem names the specific packet whose scope governs it.
    assertEquals("policyScope" in res.body, false);
    assertEquals("policy_scope" in res.body, false);
    assertEquals("policyScope" in res.body.workItem, false);
    assertEquals("policy_scope" in res.body.workItem, false);
  },
});

// ---------------------------------------------------------------------------
// (c) Observed vs authoritative — a shape difference, not a naming convention
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "GET /work-items/:id: an observed session is structurally not a supervised run",
  fn: async () => {
    const { item, observed } = await fullFixture();
    const res = await call(`/work-items/${item.id}`);
    assertEquals(res.status, 200, JSON.stringify(res.body));

    const session = res.body.observedSessions.find(
      (s: Body) => s.session_id === observed.sessionId,
    );
    assert(session !== undefined, "the claimed session must appear under its work item");

    // The observed half carries no packet, no run and no scope — the same three
    // absences `workflow.observed_sessions` itself has. An observed session that
    // could be read as supervised work is the exact conflation KTD-D5 designs out.
    for (const banned of ["packet", "packet_id", "run", "run_id", "policy_scope", "policyScope"]) {
      assertEquals(banned in session, false, `an observed session must not carry "${banned}"`);
    }

    // The authoritative half does carry them, which is what makes the difference a
    // discrimination rather than a uniform absence.
    assert("packet" in res.body.packets[0]);
    assert("policyScope" in res.body.packets[0]);
  },
});

Deno.test({
  ...T,
  name: "an unclaimed observed session is reached from no WorkItem (never by inference)",
  fn: async () => {
    const { item } = await fullFixture();
    const unclaimed = await observeSession();
    try {
      const res = await call(`/work-items/${item.id}`);
      assertEquals(res.status, 200, JSON.stringify(res.body));
      const ids = res.body.observedSessions.map((s: Body) => s.session_id);
      assertEquals(
        ids.includes(unclaimed.sessionId),
        false,
        "association is an explicit claim; nothing infers it from an observation",
      );

      // Nor does it surface anywhere else in the WorkItem projection.
      const all = await call("/work-items");
      assertEquals(all.status, 200, JSON.stringify(all.body));
      const everySession = all.body.workItems.flatMap((v: Body) =>
        v.observedSessions.map((s: Body) => s.session_id)
      );
      assertEquals(everySession.includes(unclaimed.sessionId), false);
    } finally {
      await dropNode(unclaimed.bearer);
    }
  },
});

// ---------------------------------------------------------------------------
// (d) GET /work-items
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "GET /work-items: lists work items under the same projection as the single read",
  fn: async () => {
    const { item } = await fullFixture();
    const list = await call("/work-items");
    assertEquals(list.status, 200, JSON.stringify(list.body));

    const found = list.body.workItems.find((v: Body) => v.workItem.id === item.id);
    assert(found !== undefined, "a created work item must appear in the listing");
    assertEquals(keysOf(found), [...VIEW_KEYS].sort());

    // One builder, one shape: the listed entry and the single read are identical.
    const single = await call(`/work-items/${item.id}`);
    assertEquals(single.status, 200, JSON.stringify(single.body));
    assertEquals(JSON.stringify(found), JSON.stringify(single.body));
  },
});

// ---------------------------------------------------------------------------
// (e) GET /work-items/by-ref — the provenance lookup, KTD-B5
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "GET /work-items/by-ref: resolves without a uuid, and #57 survives the round trip",
  fn: async () => {
    // The three refs the Verification Contract names, exercised literally. `#57` is
    // the reason the route takes query parameters at all: a path segment cannot
    // carry it, because `#` opens a fragment the server never receives.
    const cases: { source: SourceSystem; ref: string }[] = [
      { source: "github", ref: "#57" },
      { source: "jira", ref: "PROJ-1234" },
      { source: "story-board", ref: "ST-097" },
    ];

    for (const { source, ref } of cases) {
      const created = await literalWorkItem(source, ref);
      const res = await call(
        `/work-items/by-ref?source=${encodeURIComponent(source)}&ref=${encodeURIComponent(ref)}`,
      );
      assertEquals(res.status, 200, `${source}/${ref}: ${JSON.stringify(res.body)}`);
      assertEquals(res.body.workItem.id, created.id);
      assertEquals(res.body.workItem.source_system, source);
      assertEquals(res.body.workItem.source_ref, ref, "the ref must come back byte-identical");
      assertEquals(keysOf(res.body), [...VIEW_KEYS].sort());
    }
  },
});

Deno.test({
  ...T,
  name: "GET /work-items/by-ref: an unresolved pair is a typed 404 with the stable key set",
  fn: async () => {
    const res = await call(
      `/work-items/by-ref?source=jira&ref=${encodeURIComponent(uniqueRef("NOPE"))}`,
    );
    assertEquals(res.status, 404, JSON.stringify(res.body));
    assertEquals(res.body.error, "WorkflowNotFoundError");
    // `id: null` rather than an omitted key — the same rule the FK branch of
    // `toHttpError` follows, so a consumer trusting the discriminator to imply a
    // stable shape does not break on this branch.
    assertEquals(res.body.id, null);
  },
});

Deno.test({
  ...T,
  name: "GET /work-items/by-ref: a source outside the closed four, and a missing half, are 400s",
  fn: async () => {
    const unknownSource = await call("/work-items/by-ref?source=azure-devops&ref=PROJ-1");
    assertEquals(unknownSource.status, 400, JSON.stringify(unknownSource.body));
    assertEquals(unknownSource.body.error, "BadRequest");

    const noRef = await call("/work-items/by-ref?source=jira");
    assertEquals(noRef.status, 400, JSON.stringify(noRef.body));

    const noSource = await call("/work-items/by-ref?ref=PROJ-1");
    assertEquals(noSource.status, 400, JSON.stringify(noSource.body));

    const emptyRef = await call("/work-items/by-ref?source=jira&ref=");
    assertEquals(emptyRef.status, 400, JSON.stringify(emptyRef.body));
  },
});

Deno.test({
  ...T,
  name: "GET /work-items/by-ref: awcp-native names no foreign namespace, so it is a 400 not a 404",
  fn: async () => {
    // Every `awcp-native` row carries a null `source_ref` by CHECK constraint, so no
    // ref can ever resolve one. A 404 would tell the caller to go looking for a row
    // that cannot exist; the request itself is the mistake.
    const res = await call("/work-items/by-ref?source=awcp-native&ref=anything");
    assertEquals(res.status, 400, JSON.stringify(res.body));
    assertEquals(res.body.error, "BadRequest");
  },
});

Deno.test({
  ...T,
  name: "GET /work-items/by-ref: the literal segment is matched before the :id parameter",
  fn: async () => {
    // Registration order is load-bearing: if `by-ref` were captured as `:workItemId`
    // the uuid parse would answer 400 and the provenance route would be unreachable.
    const res = await call("/work-items/by-ref?source=jira&ref=PROJ-1234");
    assert(res.status === 200 || res.status === 404, JSON.stringify(res.body));
  },
});

// ---------------------------------------------------------------------------
// (f) GET /work-items/:id — the failure shapes
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "GET /work-items/:id: an unknown id is a typed 404 naming it; a malformed one is a 400",
  fn: async () => {
    const missing = await call(`/work-items/${ABSENT_ID}`);
    assertEquals(missing.status, 404, JSON.stringify(missing.body));
    assertEquals(missing.body.error, "WorkflowNotFoundError");
    assertEquals(missing.body.id, ABSENT_ID);

    const malformed = await call("/work-items/not-a-uuid");
    assertEquals(malformed.status, 400, JSON.stringify(malformed.body));
    assertEquals(malformed.body.error, "BadRequest");
  },
});

// ---------------------------------------------------------------------------
// (g) The overview extension
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "GET /overview: carries the WorkItem projection alongside the packet views",
  fn: async () => {
    const { item } = await fullFixture();
    const overview = await call("/overview");
    assertEquals(overview.status, 200, JSON.stringify(overview.body));

    assert(Array.isArray(overview.body.workItems), "the overview must carry a workItems array");
    const found = overview.body.workItems.find((v: Body) => v.workItem.id === item.id);
    assert(found !== undefined, "a created work item must appear in the overview");

    // Same builder, same shape — which is what makes UI/agent parity hold by
    // construction rather than by two projections agreeing.
    const single = await call(`/work-items/${item.id}`);
    assertEquals(JSON.stringify(found), JSON.stringify(single.body));

    // The packet lane is untouched: the overview still carries its own active-packet
    // views, and they still carry attention. Extending the aggregate must not have
    // displaced what was already there.
    assert(Array.isArray(overview.body.packets));
    assert(Array.isArray(overview.body.attention));
    assertEquals(typeof overview.body.generatedAt, "string");
  },
});
