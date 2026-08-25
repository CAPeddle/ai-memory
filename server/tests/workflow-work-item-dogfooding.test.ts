/**
 * ST-097 B9 — the dogfooding item, and the end-to-end row that proves the slice is a
 * slice.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE IS, IN ONE SENTENCE.
 * ---------------------------------------------------------------------------
 * ONE work item — this repository's own ST-097, recorded as PROVENANCE rather than as
 * identity — travels all five stages of Workstream B over real HTTP against a real
 * server process: created (B2a), observed (B3), claimed (B4), read back by a caller
 * holding no uuid (B5), and rendered on the operator's page (B6).
 *
 * ---------------------------------------------------------------------------
 * WHY THE END-TO-END ROW EXISTS AT ALL, SINCE EVERY LINK IS ALREADY TESTED.
 * ---------------------------------------------------------------------------
 * The Verification Contract states it plainly: "without this row every link is proven
 * in isolation and the slice can pass while not being end-to-end." Each sibling file
 * builds its own fixture through `store.ts` and asserts its own layer. None of them
 * can fail if the layers stop composing — a route that writes a row no projection
 * reads, or a projection the page never renders, passes every one of them.
 *
 * ---------------------------------------------------------------------------
 * THE `ST-NNN` IS THE REFERENCE, NOT THE IDENTITY — WHICH IS THE POINT.
 * ---------------------------------------------------------------------------
 * `source_ref = 'ST-097'` is a reference into the story board's namespace (ADR-017
 * §2). Identity is the uuid the database minted (§1), and every stage after creation
 * reaches the item WITHOUT that uuid, by the provenance pair alone. That asymmetry is
 * the distinction the whole WorkItem restructure exists to draw, demonstrated on one
 * real item rather than argued.
 *
 * ---------------------------------------------------------------------------
 * THE `AW-NNN` LABEL IS NULL, AND THAT IS THE HONEST OUTCOME RATHER THAN A GAP.
 * ---------------------------------------------------------------------------
 * B9's own wording asks for an item "carrying its own `AW-NNN`". Nothing may mint one.
 * ADR-017 §4 closes with "this ADR allocates nothing … no `AW-NNN` value may be minted
 * until the allocator that governs minting exists", and no such allocator exists: the
 * create route's body schema has no `awLabel` field, `store.createWorkItem` mints
 * nothing, and `005_work_items.sql` inserts no row. The label is therefore null here,
 * asserted rather than glossed. `uq_work_items_aw_label` is already in place waiting
 * for the allocator, so the label can be filled in later without a schema change.
 * See docs/workflow-dogfooding.md.
 *
 * ---------------------------------------------------------------------------
 * WHY A REAL SERVER PROCESS, WHICH PUTS THIS FILE IN CLAUDE.md's --allow-run INVENTORY.
 * ---------------------------------------------------------------------------
 * Two of the five stages exist only at the process boundary. `awcp status` is a shipped
 * script whose exit code and stdout are its contract, and the operator/agent credential
 * split is applied by the composition root in `server/index.ts` — not by
 * `createWorkflowApi()` — so "an agent key resolves the item by provenance" is not
 * observable in-process at all. An in-process end-to-end test would prove the layers
 * compose in a program no operator runs.
 *
 * ---------------------------------------------------------------------------
 * ISOLATION: `db-test` ACCUMULATES, AND THIS FILE USES A FIXED REF ON PURPOSE.
 * ---------------------------------------------------------------------------
 * Every sibling randomises `source_ref` because `uq_work_items_provenance` is real and
 * `db-test` is wiped when its container stops, not between runs. This file cannot: the
 * dogfooded reference IS `ST-097` and a randomised one would demonstrate nothing. So it
 * deletes the pair before creating it, and deletes it again in `finally`. The
 * defensive un-parenting before that delete is not decoration — `work_packets.work_item_id`
 * is ON DELETE NO ACTION, so a half-cleaned earlier run would otherwise wedge every
 * later run of this file behind a foreign-key refusal.
 *
 * Assertions on the rendered page are scoped to THIS item's card for the same reason:
 * other files' residue is on the same page, and a page-level assertion would false-fail
 * against a neighbour's fixture.
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import { apiCall, type ServerProcess, startServerProcess } from "./_helpers/serverProcess.ts";
import { bootDashboard, byClass, type ShimNode, textOf } from "./_helpers/dashboardDom.ts";
import { runAwcp } from "./_helpers/awcpCli.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL")!;
const OPERATOR_KEY = Deno.env.get("MEMORY_API_KEY") ?? "test-key";
/** Distinct from the operator key — the server refuses to start when they match. */
const AGENT_KEY = `${OPERATOR_KEY}-st097-b9-agent`;
const ENROLMENT_SECRET = "enrolment-secret-for-st097-b9-dogfooding";

/** The dogfooded provenance pair. Fixed, because the whole point is that it is real. */
const SOURCE_SYSTEM = "story-board";
const SOURCE_REF = "ST-097";

const SERVER_ENV: Record<string, string> = {
  DATABASE_URL,
  MEMORY_API_KEY: OPERATOR_KEY,
  AWCP_AGENT_API_KEY: AGENT_KEY,
  AWCP_NODE_ENROLMENT_SECRET: ENROLMENT_SECRET,
  FEATURE_WORKFLOW: "true",
  FEATURE_ENTITY_WORKER: "false",
  FEATURE_CONSOLIDATION_WORKER: "false",
  FEATURE_EMBEDDING_BACKFILL: "false",
  MODEL_PROVIDER_ENABLED: "false",
};

/** 32 random bytes as 64 lowercase hex — what `openssl rand -hex 32` produces. */
function mintBearer(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input).slice().buffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Remove any `('story-board', 'ST-097')` row a previous run of this file left behind.
 *
 * The UPDATE first: a work item with packets still pointing at it cannot be deleted
 * (NO ACTION), and this file's own item is packet-less by design, so anything it would
 * un-parent is residue rather than state this run depends on.
 */
async function removeDogfoodItem(): Promise<void> {
  await sql`
    UPDATE workflow.work_packets SET work_item_id = NULL
     WHERE work_item_id IN (
       SELECT id FROM workflow.work_items
        WHERE source_system = ${SOURCE_SYSTEM} AND source_ref = ${SOURCE_REF}
     )
  `;
  await sql`
    DELETE FROM workflow.work_items
     WHERE source_system = ${SOURCE_SYSTEM} AND source_ref = ${SOURCE_REF}
  `;
}

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name: "ST-097 B9: one work item travels create -> observe -> claim -> read -> UI",
  fn: async (t) => {
    await removeDogfoodItem();
    const server: ServerProcess = await startServerProcess(SERVER_ENV);
    const nodeBearer = mintBearer();
    const sessionId = `st097-b9-${crypto.randomUUID()}`;

    // The fabrication guard's baseline. Nothing in this chain may create a packet, so
    // this number may not move — counted before the first stage rather than after, so
    // a packet created by any stage is caught.
    const packetsBefore = Number(
      (await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM workflow.work_packets`)[0].n,
    );

    let workItemId = "";
    let nodeId = "";

    try {
      // ------------------------------------------------------------------
      // Stage 1 (B2a) — create the WorkItem through the real operator-only route
      // ------------------------------------------------------------------
      await t.step("stage 1 (B2a): the operator creates the dogfooding WorkItem over HTTP", async () => {
        const created = await apiCall(
          server.baseUrl,
          OPERATOR_KEY,
          "/api/workflow/work-items",
          {
            method: "POST",
            body: JSON.stringify({ sourceSystem: SOURCE_SYSTEM, sourceRef: SOURCE_REF }),
          },
        );
        assertEquals(created.status, 201, JSON.stringify(created.body));
        assertEquals(created.body.source_system, SOURCE_SYSTEM);
        assertEquals(created.body.source_ref, SOURCE_REF);
        // ADR-017 §4 — the namespace exists, the allocator does not, so nothing here
        // may mint a label. Asserted rather than assumed: a future create route that
        // quietly started filling this in would be minting without an allocator.
        assertEquals(
          created.body.aw_label,
          null,
          "the AW-NNN label must stay null until the allocator that mints it exists",
        );
        assert(typeof created.body.id === "string" && created.body.id.length > 0);
        workItemId = created.body.id;

        // The route is operator-only, and that is part of the deliverable rather than
        // an aside: an agent key must not be able to bring requested work into being.
        const asAgent = await apiCall(
          server.baseUrl,
          AGENT_KEY,
          "/api/workflow/work-items",
          {
            method: "POST",
            body: JSON.stringify({ sourceSystem: "awcp-native" }),
          },
        );
        assertEquals(asAgent.status, 403, "an agent key created requested work");
      });

      // ------------------------------------------------------------------
      // Stage 2 (B3) — a session announces itself on the node lane
      // ------------------------------------------------------------------
      await t.step("stage 2 (B3): a session is observed on the node lane, with no packet and no scope", async () => {
        const registered = await fetch(`${server.baseUrl}/workflow/nodes/register`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${nodeBearer}`,
            "X-Node-Enrolment-Secret": ENROLMENT_SECRET,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ hostname: "b9-dogfooding", platform: "deno-test" }),
        });
        const node = await registered.json();
        assertEquals(registered.status, 201, JSON.stringify(node));
        nodeId = node.node_id;

        // The closed payload set (KTD-B4 item 6) and nothing else. A start and a
        // heartbeat, deliberately no `session_end`: the dogfooded session is LIVE,
        // which is the state an operator actually looks at.
        const at = new Date().toISOString();
        const events = await fetch(`${server.baseUrl}/workflow/nodes/${nodeId}/events`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${nodeBearer}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            events: [
              {
                client_seq: 1,
                event_type: "session_start",
                payload: { session_id: sessionId, node_id: nodeId, at },
              },
              {
                client_seq: 2,
                event_type: "session_heartbeat",
                payload: { session_id: sessionId, node_id: nodeId, at },
              },
            ],
          }),
        });
        const ack = await events.json();
        assertEquals(events.status, 200, JSON.stringify(ack));
        assertEquals(ack.acknowledged.map((a: { client_seq: number }) => a.client_seq), [1, 2]);

        // Materialised inside the ingest transaction, so the row exists from the first
        // event onwards rather than being greppable out of a payload later.
        const rows = await sql<{ ended_at: Date | null }[]>`
          SELECT ended_at FROM workflow.observed_sessions
           WHERE node_id = ${nodeId} AND session_id = ${sessionId}
        `;
        assertEquals(rows.length, 1, "the session did not materialise on the node lane");
        assertEquals(rows[0].ended_at, null, "an unended session must read as still open");
      });

      // ------------------------------------------------------------------
      // Stage 3 (B4) — the operator claims the session for the WorkItem
      // ------------------------------------------------------------------
      await t.step("stage 3 (B4): the operator claims the observed session for the WorkItem", async () => {
        const claim = await apiCall(
          server.baseUrl,
          OPERATOR_KEY,
          `/api/workflow/work-items/${workItemId}/sessions`,
          { method: "POST", body: JSON.stringify({ nodeId, sessionId }) },
        );
        assertEquals(claim.status, 201, JSON.stringify(claim.body));
        assertEquals(claim.body.work_item_id, workItemId);
        assertEquals(claim.body.session_id, sessionId);

        // The claim is an operator act. An agent key may read the association it
        // creates and may not create one — that asymmetry is KTD-D5's whole content.
        const asAgent = await apiCall(
          server.baseUrl,
          AGENT_KEY,
          `/api/workflow/work-items/${workItemId}/sessions`,
          { method: "POST", body: JSON.stringify({ nodeId, sessionId }) },
        );
        assertEquals(asAgent.status, 403, "an agent key claimed a session");
      });

      // ------------------------------------------------------------------
      // Stage 4 (B5) — resolved by provenance, by a caller holding no uuid
      // ------------------------------------------------------------------
      await t.step("stage 4 (B5): an agent holding no uuid resolves the item by its story-board reference", async () => {
        const path =
          `/api/workflow/work-items/by-ref?${new URLSearchParams({ source: SOURCE_SYSTEM, ref: SOURCE_REF })}`;
        // Not a uuid in sight — asserted on the request itself rather than trusted,
        // because a lookup that smuggled the id in would prove nothing about provenance.
        assert(
          !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(path),
          `the lookup carried a uuid: ${path}`,
        );

        // The AGENT key, not the operator's: these reads are agent-callable by KTD-B3,
        // and the caller that most needs provenance resolution is the one that knows
        // only which story it is working on.
        const view = await apiCall(server.baseUrl, AGENT_KEY, path);
        assertEquals(view.status, 200, JSON.stringify(view.body));
        assertEquals(view.body.workItem.id, workItemId, "provenance resolved a different item");
        assertEquals(view.body.workItem.source_ref, SOURCE_REF);
        assertEquals(view.body.workItem.aw_label, null);

        // The claimed session is reachable through the item, and the item is still
        // packet-less: a dogfooding item supervises nothing (KTD-D4).
        assertEquals(view.body.packets, []);
        assertEquals(view.body.observedSessions.length, 1);
        assertEquals(view.body.observedSessions[0].session_id, sessionId);
        assertEquals(view.body.observedSessions[0].node_id, nodeId);

        // No aggregate status anywhere in the projection (ADR-017 §6). Asserted on the
        // key set rather than on a sampled value, so a status field added later fails
        // here rather than being rendered as though the server held one.
        assert(
          !("status" in view.body.workItem) && !("policy_scope" in view.body.workItem),
          `the WorkItem grew a status or a scope: ${JSON.stringify(view.body.workItem)}`,
        );
      });

      // ------------------------------------------------------------------
      // Stage 5 (B6) — the operator sees it on the page
      // ------------------------------------------------------------------
      await t.step("stage 5 (B6): the item and its observed session render on the operator's page", async () => {
        // The REAL overview from the running server, handed to the REAL dashboard
        // script. The shim supplies the DOM and nothing else, so what is asserted below
        // is what the renderer produced from the server's own projection.
        const overview = await apiCall(server.baseUrl, OPERATOR_KEY, "/api/workflow/overview");
        assertEquals(overview.status, 200, JSON.stringify(overview.body));

        const { root, load } = bootDashboard(overview.body);
        await load();

        // Scoped to THIS item's card: db-test accumulates, so the page carries other
        // files' residue and a page-level assertion would be about somebody else's
        // fixture as much as this one.
        const cards = byClass(root, "workitem").filter((card: ShimNode) =>
          textOf(card).includes(workItemId)
        );
        assertEquals(cards.length, 1, "the dogfooding item is not on the page exactly once");
        const card = cards[0];
        const cardText = textOf(card);

        // Identity as the page states it: the provenance pair, and a dash where the
        // unallocated label is.
        assertStringIncludes(cardText, `source: ${SOURCE_SYSTEM}`);
        assertStringIncludes(cardText, `ref: ${SOURCE_REF}`);
        assertStringIncludes(cardText, "label: -");

        // The observed session is on the card, and it is marked as an observation in
        // WORDS. An unclaimed session read as supervised work at the one place a human
        // looks would defeat KTD-D5 entirely.
        assertStringIncludes(cardText, sessionId);
        assertStringIncludes(cardText, "not supervised");

        // And the empty authoritative lane is rendered as empty rather than omitted —
        // B9's item is packet-less on day one, so this is ordinary behaviour.
        assertStringIncludes(cardText, "No packets bound to this work item.");

        // Non-vacuity for the scope assertion below: the session lines carry no scope
        // tag anywhere on THIS card, because nothing under this item has one.
        const scopeTags = byClass(card, "scope");
        assertEquals(
          scopeTags.length,
          0,
          `a packet-less work item rendered a policy scope: ${scopeTags.map(textOf).join(", ")}`,
        );
      });

      // ------------------------------------------------------------------
      // The secondary client — `awcp status`, holding no uuid either
      // ------------------------------------------------------------------
      await t.step("the CLI answers the same question from the same read model", async () => {
        const result = await runAwcp(
          ["status", "--source", SOURCE_SYSTEM, "--ref", SOURCE_REF],
          { env: { AWCP_BASE_URL: server.baseUrl, MEMORY_API_KEY: OPERATOR_KEY } },
        );
        assertEquals(result.code, 0, `stderr: ${result.stderr}`);

        // The identity line, pinned whole. `label: -` is the unallocated AW-NNN, printed
        // as absent rather than omitted, and the line carries no summary word — ADR-017
        // §6 settles that there is none to print.
        assertEquals(
          result.stdout.split("\n").find((line) => line.startsWith("work-item ")),
          `work-item ${workItemId}  source: ${SOURCE_SYSTEM}  ref: ${SOURCE_REF}  label: -`,
        );
        assertStringIncludes(result.stdout, "(none bound)");
        assertStringIncludes(result.stdout, sessionId);
        assertStringIncludes(result.stdout, "observed - not supervised");
      });

      // ------------------------------------------------------------------
      // The fabrication guard, over the whole chain rather than per stage
      // ------------------------------------------------------------------
      await t.step("nothing in the chain fabricated a packet or a policy scope", async () => {
        const packetsAfter = Number(
          (await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM workflow.work_packets`)[0].n,
        );
        assertEquals(
          packetsAfter,
          packetsBefore,
          "a stage created a work packet — the capture path may not fabricate one",
        );

        // And nothing under this item holds a scope, because there is no column that
        // could: a work item has none, and an observed session has none.
        const scoped = await sql<{ n: string }[]>`
          SELECT count(*)::text AS n FROM workflow.work_packets WHERE work_item_id = ${workItemId}
        `;
        assertEquals(scoped[0].n, "0", "the dogfooding item acquired a packet");
      });
    } finally {
      await server.stop();
      // Order matters: the node cascade takes the observed session and its claim with
      // it, and the work item is deleted separately because nothing cascades to it.
      if (nodeId !== "") {
        await sql`DELETE FROM workflow.execution_nodes WHERE node_id = ${nodeId}`;
      } else {
        await sql`
          DELETE FROM workflow.execution_nodes WHERE bearer_token_hash = ${await sha256Hex(nodeBearer)}
        `;
      }
      await removeDogfoodItem();
    }
  },
});
