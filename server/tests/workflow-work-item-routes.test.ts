/**
 * ST-097 / B2a — the two WorkItem write routes, driven in-process through the real
 * router.
 *
 * **Why these are route tests rather than store tests.** The properties at stake are
 * properties of the HTTP edge: that a contract violation is a 400 from zod rather
 * than a 500 from a Postgres CHECK, that an unknown parent is a typed 404 rather
 * than an unhandled foreign-key error, and that `POST /packets` cannot reach
 * `work_item_id` at all. None of those is observable from `store.ts`, because each
 * one is about what the edge does with a request the store never sees.
 *
 * **Why in-process and not a server process.** `createWorkflowApi()` is a Hono app,
 * so `app.request()` drives the real router, the real zod schemas and the real store
 * against the real database — everything except the composition root's bearer
 * middleware, which is deliberately not this module's concern (see the
 * authentication note at the top of api.ts). The credential half of B2a's contract
 * lives where it can only live: `workflow-agent-key-e2e.test.ts`, against a real
 * process with real keys. Splitting it this way is what keeps this file free of
 * `--allow-run`.
 *
 * **Fixture provenance is randomised on purpose.** `uq_work_items_provenance` is a
 * real unique index and `db-test` accumulates across runs (it is wiped when its
 * container stops, not between `exec` invocations — see CLAUDE.md's dev/test
 * isolation note). A fixed `sourceRef` would pass once and then 23505 forever after.
 * `awcp-native` fixtures need no such care: the pair constraint gives every native
 * row a null `source_ref`, and the index's default NULLS DISTINCT semantics keep
 * them all mutually distinct.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import { createWorkflowApi } from "../src/workflow/api.ts";
import { ensureWorkflowSchema } from "../src/workflow/schema.ts";
import * as store from "../src/workflow/store.ts";

const T = { sanitizeResources: false, sanitizeOps: false };

const api = createWorkflowApi();

/** A uuid that is well-formed and names nothing. */
const ABSENT_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

/** A `source_ref` no previous run of this suite can have inserted. */
function uniqueRef(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
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

Deno.test({
  ...T,
  name: "setup: workflow schema applied by the module itself",
  fn: async () => {
    await ensureWorkflowSchema();
  },
});

// ---------------------------------------------------------------------------
// (a) POST /work-items
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "POST /work-items: creates a WorkItem from a provenance pair",
  fn: async () => {
    const sourceRef = uniqueRef("ST-097");
    const created = await call("/work-items", {
      method: "POST",
      body: JSON.stringify({ sourceSystem: "story-board", sourceRef }),
    });
    assertEquals(created.status, 201, JSON.stringify(created.body));
    assertEquals(created.body.source_system, "story-board");
    assertEquals(created.body.source_ref, sourceRef);
    // ADR-017 §4: this route allocates nothing. The label stays null until the
    // allocator that mints AW-NNN exists.
    assertEquals(created.body.aw_label, null);
    assert(typeof created.body.id === "string" && created.body.id.length > 0);

    // The row is real, and it is in the workflow schema.
    const rows = await sql<{ source_ref: string | null }[]>`
      SELECT source_ref FROM workflow.work_items WHERE id = ${created.body.id}
    `;
    assertEquals(rows.length, 1);
    assertEquals(rows[0].source_ref, sourceRef);
  },
});

Deno.test({
  ...T,
  name: "POST /work-items: a duplicate provenance pair is a conflict, not a 500",
  fn: async () => {
    // uq_work_items_provenance is the invariant and the route does not pre-check it,
    // so the second create arrives as SQLSTATE 23505. toHttpError's own docblock
    // argues the case against answering 500 for a client mistake — "500 invites a
    // retry, and retrying a bad id forever is exactly the wrong response" — and a
    // duplicate pair is the same class. It is also the first mistake dogfooding
    // makes, since re-creating the ST-097 item repeats its exact pair.
    const sourceRef = uniqueRef("ST-097-dup");
    const first = await call("/work-items", {
      method: "POST",
      body: JSON.stringify({ sourceSystem: "story-board", sourceRef }),
    });
    assertEquals(first.status, 201, JSON.stringify(first.body));

    const second = await call("/work-items", {
      method: "POST",
      body: JSON.stringify({ sourceSystem: "story-board", sourceRef }),
    });
    assertEquals(second.status, 409, JSON.stringify(second.body));
    assertEquals(second.body.error, "ConflictError");

    // Exactly one row survives — the refusal is the database's, reported honestly.
    const rows = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM workflow.work_items
      WHERE source_system = 'story-board' AND source_ref = ${sourceRef}
    `;
    assertEquals(rows[0].n, 1);
  },
});

Deno.test({
  ...T,
  name: "POST /work-items: an awcp-native item names no foreign namespace",
  fn: async () => {
    const created = await call("/work-items", {
      method: "POST",
      body: JSON.stringify({ sourceSystem: "awcp-native" }),
    });
    assertEquals(created.status, 201, JSON.stringify(created.body));
    assertEquals(created.body.source_system, "awcp-native");
    assertEquals(created.body.source_ref, null);
  },
});

Deno.test({
  ...T,
  name: "POST /work-items: a violated provenance pair is a 400 from the edge, not a 500 from the CHECK",
  fn: async () => {
    // The database CHECK `work_items_provenance_pair` would refuse both of these. The
    // route must not rely on it: a contract violation the caller can fix is a 400,
    // and a 500 would tell them the server is broken and invite a retry.
    const nativeWithRef = await call("/work-items", {
      method: "POST",
      body: JSON.stringify({ sourceSystem: "awcp-native", sourceRef: "ST-097" }),
    });
    assertEquals(nativeWithRef.status, 400, JSON.stringify(nativeWithRef.body));
    assertEquals(nativeWithRef.body.error, "BadRequest");
    assertEquals(nativeWithRef.body.issues[0].path, "sourceRef");

    const foreignWithoutRef = await call("/work-items", {
      method: "POST",
      body: JSON.stringify({ sourceSystem: "jira" }),
    });
    assertEquals(foreignWithoutRef.status, 400, JSON.stringify(foreignWithoutRef.body));
    assertEquals(foreignWithoutRef.body.error, "BadRequest");
    assertEquals(foreignWithoutRef.body.issues[0].path, "sourceRef");
  },
});

Deno.test({
  ...T,
  name: "POST /work-items: a source system outside ADR-017 §2's closed four is a 400",
  fn: async () => {
    const res = await call("/work-items", {
      method: "POST",
      body: JSON.stringify({ sourceSystem: "azure-devops", sourceRef: "PROJ-1" }),
    });
    assertEquals(res.status, 400, JSON.stringify(res.body));
    assertEquals(res.body.error, "BadRequest");
  },
});

Deno.test({
  ...T,
  name: "POST /work-items: a caller-supplied AW label is stripped, never minted",
  fn: async () => {
    // ADR-017 §4 — AW-NNN is allocated by AWCP's persistence, not by a caller. The
    // creation schema has no awLabel field, so a plain z.object drops it; this pins
    // that the route inherits that property rather than passing the key through.
    const created = await call("/work-items", {
      method: "POST",
      body: JSON.stringify({ sourceSystem: "awcp-native", awLabel: "AW-1" }),
    });
    assertEquals(created.status, 201, JSON.stringify(created.body));
    assertEquals(created.body.aw_label, null);
  },
});

// ---------------------------------------------------------------------------
// (b) PATCH /packets/:packetId/work-item
// ---------------------------------------------------------------------------

async function newPacket() {
  return await store.createPacket({
    title: "B2a binding probe",
    objective: "prove the work-item binding is its own operator-only write",
    policyScope: "personal",
  });
}

async function newWorkItem() {
  return await store.createWorkItem({ sourceSystem: "awcp-native" });
}

Deno.test({
  ...T,
  name: "PATCH /packets/:packetId/work-item: binds an existing packet to an existing work item",
  fn: async () => {
    const packet = await newPacket();
    const item = await newWorkItem();

    const bound = await call(`/packets/${packet.id}/work-item`, {
      method: "PATCH",
      body: JSON.stringify({ workItemId: item.id }),
    });
    assertEquals(bound.status, 200, JSON.stringify(bound.body));
    assertEquals(bound.body.id, packet.id);
    assertEquals(bound.body.work_item_id, item.id);

    const rows = await sql<{ work_item_id: string | null }[]>`
      SELECT work_item_id FROM workflow.work_packets WHERE id = ${packet.id}
    `;
    assertEquals(rows[0].work_item_id, item.id);

    // ADR-017 §3: the packet stays the only authority for its own Policy Scope, and
    // binding a parent changes nothing about it.
    assertEquals(bound.body.policy_scope, "personal");
  },
});

Deno.test({
  ...T,
  name: "PATCH /packets/:packetId/work-item: an unknown packet is a typed 404, not a 500",
  fn: async () => {
    const item = await newWorkItem();
    const res = await call(`/packets/${ABSENT_ID}/work-item`, {
      method: "PATCH",
      body: JSON.stringify({ workItemId: item.id }),
    });
    assertEquals(res.status, 404, JSON.stringify(res.body));
    assertEquals(res.body.error, "WorkflowNotFoundError");
    // The id is named, so the caller can tell WHICH half of the pair was missing.
    assertEquals(res.body.id, ABSENT_ID);
  },
});

Deno.test({
  ...T,
  name: "PATCH /packets/:packetId/work-item: an unknown work item is a typed 404 naming the work item",
  fn: async () => {
    const packet = await newPacket();
    const res = await call(`/packets/${packet.id}/work-item`, {
      method: "PATCH",
      body: JSON.stringify({ workItemId: ABSENT_ID }),
    });
    assertEquals(res.status, 404, JSON.stringify(res.body));
    assertEquals(res.body.error, "WorkflowNotFoundError");
    assertEquals(res.body.id, ABSENT_ID);

    // A refused bind must not have written anything.
    const rows = await sql<{ work_item_id: string | null }[]>`
      SELECT work_item_id FROM workflow.work_packets WHERE id = ${packet.id}
    `;
    assertEquals(rows[0].work_item_id, null);
  },
});

Deno.test({
  ...T,
  name: "PATCH /packets/:packetId/work-item: a malformed id is a 400, in the path and in the body",
  fn: async () => {
    const item = await newWorkItem();
    const badPath = await call("/packets/not-a-uuid/work-item", {
      method: "PATCH",
      body: JSON.stringify({ workItemId: item.id }),
    });
    assertEquals(badPath.status, 400, JSON.stringify(badPath.body));

    const packet = await newPacket();
    const badBody = await call(`/packets/${packet.id}/work-item`, {
      method: "PATCH",
      body: JSON.stringify({ workItemId: "not-a-uuid" }),
    });
    assertEquals(badBody.status, 400, JSON.stringify(badBody.body));
  },
});

// ---------------------------------------------------------------------------
// The POST /packets boundary — KTD-D4
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "POST /packets: work_item_id is not settable at packet creation (KTD-D4)",
  fn: async () => {
    // The work item is REAL, so a pass here cannot be a foreign key quietly refusing
    // a made-up id. If the route honoured `workItemId` at all, this packet would come
    // back parented.
    const item = await newWorkItem();
    const created = await call("/packets", {
      method: "POST",
      body: JSON.stringify({
        title: "unparented by contract",
        objective: "prove the binding is not reachable through packet creation",
        policyScope: "personal",
        workItemId: item.id,
      }),
    });
    assertEquals(created.status, 201, JSON.stringify(created.body));
    assertEquals(
      created.body.work_item_id,
      null,
      "binding is operator-only and never settable through POST /packets",
    );

    const rows = await sql<{ work_item_id: string | null }[]>`
      SELECT work_item_id FROM workflow.work_packets WHERE id = ${created.body.id}
    `;
    assertEquals(rows[0].work_item_id, null);
  },
});
