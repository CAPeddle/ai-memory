/**
 * ST-097 / B6 — the WorkItem web UI, driven as a real render rather than as a
 * string search over the served page.
 *
 * **Why this file executes the dashboard's script instead of grepping it.** The
 * B6 Verification Contract says observed sessions must be *"visually distinguishable
 * from authoritative packets — assert on the rendered markup, not on intent"*. A
 * `assertStringIncludes(html, "observed")` proves a word appears in a source file;
 * it proves nothing about what a reader sees. There is no browser in the test
 * container (`workflow-mvp-e2e.test.ts` says so, and records a hand-run browser
 * check instead), so this file supplies the smallest DOM the dashboard's script
 * actually touches, evaluates the script against it, drives `load()` with a stubbed
 * `/overview`, and asserts on the resulting element tree.
 *
 * The shim is deliberately tiny and deliberately dumb: `createElement`,
 * `getElementById`, `appendChild`, `replaceChildren`, `className`, `textContent`
 * and the four form properties the existing decision/criteria controls set. If the
 * dashboard ever needs more of the DOM than that, the shim failing loudly is the
 * correct outcome — it means the page stopped being the framework-free single file
 * ST-086 committed to.
 *
 * **What this file does NOT claim.** It is not a browser. Layout, CSS cascade and
 * real event dispatch are out of its reach, and the recorded manual browser
 * procedure in `docs/workflow-mvp.md` remains the only proof of those. Editing
 * `server/src/workflow/dashboard.ts` expires that recorded run — see the anchor
 * note in `workflow-mvp-e2e.test.ts`.
 *
 * **UI/agent read parity is asserted on the field set, not on a sample response.**
 * The last test extracts every data property the WorkItem renderers read off their
 * arguments — the renderers name their data-bearing locals `view`, `workItem`,
 * `entry`, `packet` and `session` precisely so this extraction is mechanical — and
 * asserts each set is a subset of the keys a live agent-callable GET returns at the
 * matching level. Subset, not equality: the UI legitimately declines to render
 * fields (`work_item_id` on a session is the WorkItem it is already nested under),
 * and the contract row is *"every field the UI renders is retrievable"*, which is
 * one direction.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import { createWorkflowApi } from "../src/workflow/api.ts";
import { ensureWorkflowSchema } from "../src/workflow/schema.ts";
import * as store from "../src/workflow/store.ts";
import {
  bootDashboard,
  byClass,
  extractScript,
  markup,
  type ShimNode,
  textOf,
} from "./_helpers/dashboardDom.ts";

const T = { sanitizeResources: false, sanitizeOps: false };

const api = createWorkflowApi();

// ---------------------------------------------------------------------------
// The shim lives in _helpers/dashboardDom.ts
//
// It moved there when ST-097 B9's end-to-end file needed the same harness. Two
// copies would be two definitions of what the dashboard is allowed to reach for,
// and the shim's whole value is that it fails loudly when the page stops being the
// framework-free single file ST-086 committed to. What stays here is what is
// specific to this file: the projection-shaped fixtures below, and the
// source-text extraction the UI/agent parity test uses.
// ---------------------------------------------------------------------------

/** One named function's source text, brace-matched out of the dashboard script. */
function renderFunctionSource(name: string): string {
  const script = extractScript();
  const start = script.indexOf("function " + name + "(");
  assert(
    start !== -1,
    `the dashboard script must define ${name}() — B6 renders the WorkItem lane here`,
  );
  let depth = 0;
  for (let i = script.indexOf("{", start); i < script.length; i++) {
    if (script[i] === "{") depth++;
    else if (script[i] === "}" && --depth === 0) return script.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}()`);
}

// ---------------------------------------------------------------------------
// Fixtures — plain projection-shaped objects, matching readModel.ts exactly
// ---------------------------------------------------------------------------

function packetEntry(id: string, title: string, scope: string, status = "open") {
  return {
    packet: {
      id,
      title,
      objective: "objective of " + title,
      scope: "in scope",
      constraints: "none",
      repository: "ai-memory",
      branch: "main",
      policy_scope: scope,
      status,
      work_item_id: "wi-1",
      created_at: "2026-08-20T10:00:00.000Z",
      updated_at: "2026-08-20T10:00:00.000Z",
    },
    policyScope: scope,
  };
}

function sessionEntry(sessionId: string, ended: string | null) {
  return {
    work_item_id: "wi-1",
    node_id: "node-alpha",
    session_id: sessionId,
    started_at: "2026-08-21T09:00:00.000Z",
    last_heartbeat_at: "2026-08-21T09:30:00.000Z",
    ended_at: ended,
    claimed_at: "2026-08-21T09:35:00.000Z",
  };
}

function workItemView(over: Record<string, unknown> = {}) {
  return {
    workItem: {
      id: "wi-1",
      source_system: "story-board",
      source_ref: "ST-097",
      aw_label: null,
      created_at: "2026-08-19T08:00:00.000Z",
      updated_at: "2026-08-19T08:00:00.000Z",
    },
    packets: [
      packetEntry("pk-corp", "Corporate slice", "corporate"),
      packetEntry("pk-pers", "Personal slice", "personal"),
      packetEntry("pk-done", "Finished slice", "mixed", "complete"),
    ],
    observedSessions: [
      sessionEntry("sess-open", null),
      sessionEntry("sess-closed", "2026-08-21T10:00:00.000Z"),
    ],
    ...over,
  };
}

/** A packet-lane view carrying attention, so the packet lane's own rendering is exercised. */
function packetLaneView() {
  return {
    packet: packetEntry("pk-lane", "Packet lane card", "personal").packet,
    policyScope: "personal",
    repository: "ai-memory",
    branch: "main",
    runs: [],
    recentCheckpoints: [],
    openDecisions: [],
    recentlyResolvedDecisions: [],
    criteria: [],
    attention: [{ packet_id: "pk-lane", reason: "stale", detail: "no events for 40m" }],
  };
}

function overview(over: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-08-24T12:00:00.000Z",
    packets: [packetLaneView()],
    workItems: [workItemView()],
    attention: [],
    ...over,
  };
}

async function render(data: Record<string, unknown>): Promise<ShimNode> {
  const { root, load } = bootDashboard(data);
  await load();
  return root;
}

/** The single WorkItem card in a rendered page. */
function workItemCard(root: ShimNode): ShimNode {
  const cards = byClass(root, "workitem");
  assertEquals(cards.length, 1, "exactly one WorkItem card was fixtured");
  return cards[0];
}

Deno.test({
  ...T,
  name: "setup: workflow schema applied by the module itself",
  fn: async () => {
    await ensureWorkflowSchema();
  },
});

// ---------------------------------------------------------------------------
// (a) Hierarchy — packets nest, sessions are flat at WorkItem level
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "B6(a): a WorkItem owning several packets nests every one of them, unranked and untruncated",
  fn: async () => {
    const card = workItemCard(await render(overview()));
    const rendered = markup(card);

    // Every packet the projection carried is present. No "top N", because ranking
    // three packets would need a priority the server does not hold.
    for (const title of ["Corporate slice", "Personal slice", "Finished slice"]) {
      assert(rendered.includes(title), `the WorkItem card must nest the packet "${title}"`);
    }
    assertEquals(byClass(card, "wi-packet").length, 3);

    // Projection order is preserved — the UI re-sorts nothing.
    const order = byClass(card, "wi-packet").map((n) => textOf(n));
    assert(order[0].includes("Corporate slice"), "projection order must survive the render");
    assert(order[2].includes("Finished slice"), "projection order must survive the render");
  },
});

Deno.test({
  ...T,
  name: "B6(a): sessions are a FLAT WorkItem-level list, never nested inside a packet",
  fn: async () => {
    const card = workItemCard(await render(overview()));

    // A claim carries `work_item_id` and no packet id, so a session rendered under a
    // packet would assert an association the server has no way to hold.
    for (const entry of byClass(card, "wi-packet")) {
      assertEquals(
        byClass(entry, "wi-session").length,
        0,
        "no observed session may render inside a packet entry",
      );
    }
    assertEquals(byClass(card, "wi-session").length, 2);
  },
});

Deno.test({
  ...T,
  name: "B6(a): the authoritative lane is what the reader meets first",
  fn: async () => {
    const root = await render(overview());
    const card = workItemCard(root);
    const rendered = markup(card);
    assert(
      rendered.indexOf("Packets") < rendered.indexOf("Observed sessions"),
      "the authoritative subsection must precede the observed one",
    );

    // And the WorkItem lane itself precedes the packet lane on the page: B6 makes
    // the WorkItem view the slice's primary surface.
    const page = markup(root);
    assert(
      page.indexOf("Work items") < page.indexOf("Packet lane card"),
      "the WorkItem lane must render above the packet lane",
    );
  },
});

// ---------------------------------------------------------------------------
// (b) Observed is visibly not authoritative
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "B6(b): an observed session is marked observed and carries no scope or status tag",
  fn: async () => {
    const card = workItemCard(await render(overview()));

    const sessions = byClass(card, "wi-session");
    assertEquals(sessions.length, 2);
    for (const session of sessions) {
      assertEquals(
        byClass(session, "observed").length,
        1,
        "every observed session must carry the observed tag",
      );
      assertEquals(
        byClass(session, "scope").length,
        0,
        "an observed session has no policy scope, so it must render none",
      );
      assert(
        /not supervised/i.test(textOf(session)),
        "the observed marker must say so in words, not only in a class name",
      );
    }

    // The authoritative half carries the scope tag, which is what makes the
    // difference a discrimination rather than a uniform absence.
    const packets = byClass(card, "wi-packet");
    assertEquals(packets.length, 3);
    for (const entry of packets) {
      assertEquals(byClass(entry, "scope").length, 1, "every packet renders its own scope");
      assertEquals(byClass(entry, "observed").length, 0, "a packet is not an observation");
    }
    // Three packets, three DIFFERENT scopes, all rendered: nothing was aggregated.
    const scopes = packets.map((p) => textOf(byClass(p, "scope")[0]));
    assert(scopes.some((s) => s.includes("corporate")));
    assert(scopes.some((s) => s.includes("personal")));
    assert(scopes.some((s) => s.includes("mixed")));
  },
});

Deno.test({
  ...T,
  name: "B6(b): a closed session reads as closed; an open one gets no derived liveness word",
  fn: async () => {
    const card = workItemCard(await render(overview()));
    const [open, closed] = byClass(card, "wi-session");

    // `ended_at IS NOT NULL` is a clean close and a fact, so it takes the existing
    // `.tag.done` vocabulary.
    assertEquals(byClass(closed, "done").length, 1, "an ended session renders as done");
    assertEquals(byClass(open, "done").length, 0);

    // The abandonment THRESHOLD is deferred (KTD-B4 item 5), so a session that has
    // not ended gets its heartbeat rendered and no judgement attached to it.
    assert(/heartbeat/i.test(textOf(open)), "an open session must show its last heartbeat");
    assert(
      !/\b(active|abandoned|stale|running|alive|dead)\b/i.test(textOf(open)),
      "the WorkItem view must not derive a liveness word the server does not hold",
    );
  },
});

// ---------------------------------------------------------------------------
// ST-098 Unit 1 (R2) — `last_heartbeat_at` always renders alongside `ended_at`
//
// R1 (the node-client fix, in awcp-node-client.mjs) stops NEW poisoning: a restarted
// process no longer reuses a pinned session id after a clean close. But any row
// poisoned BEFORE that fix landed — `ended_at` set, yet later heartbeats still landed
// under the store's monotone/`GREATEST` merge — stays indistinguishable from a real
// clean close unless the render itself carries enough data to judge. So
// `renderWorkItemSessions` must show `last_heartbeat_at` on every row, closed or not,
// rather than treating `ended_at` as if it made the heartbeat uninteresting.
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name:
    "ST-098 U1 R2: a session with ended_at set AND a last_heartbeat_at newer than it renders BOTH — not just \"ended\"",
  fn: async () => {
    const poisoned = {
      work_item_id: "wi-1",
      node_id: "node-alpha",
      session_id: "sess-poisoned",
      started_at: "2026-08-21T09:00:00.000Z",
      // A clean close was recorded...
      ended_at: "2026-08-21T10:00:00.000Z",
      // ...but a heartbeat landed AFTER it — the exact shape a reused session id
      // leaves behind under the store's monotone merge, and the reason `ended_at`
      // alone is not trustworthy enough to hide the heartbeat.
      last_heartbeat_at: "2026-08-21T11:00:00.000Z",
      claimed_at: "2026-08-21T09:35:00.000Z",
    };
    const card = workItemCard(
      await render(overview({
        workItems: [workItemView({ observedSessions: [poisoned] })],
      })),
    );
    const [row] = byClass(card, "wi-session");
    assertEquals(byClass(row, "done").length, 1, "the recorded close must still render");
    assert(
      /heartbeat/i.test(textOf(row)),
      "a heartbeat newer than the recorded close must still render, so the row " +
        "reads as suspicious rather than as an indistinguishable clean close",
    );
    // Both timestamps must actually be present, not just the word "heartbeat".
    assert(
      textOf(row).includes(new Date(poisoned.ended_at).toLocaleString()),
      "the ended_at timestamp must render",
    );
    assert(
      textOf(row).includes(new Date(poisoned.last_heartbeat_at).toLocaleString()),
      "the last_heartbeat_at timestamp must render even though ended_at is set",
    );
  },
});

Deno.test({
  ...T,
  name:
    "ST-098 U1 R2: a never-closed session (only last_heartbeat_at set) still renders exactly as before — no regression",
  fn: async () => {
    const card = workItemCard(await render(overview()));
    const [open] = byClass(card, "wi-session"); // sess-open, ended: null, from sessionEntry()

    assertEquals(byClass(open, "done").length, 0, "an open session must carry no done tag");
    assert(/heartbeat/i.test(textOf(open)), "an open session must show its last heartbeat");
    assert(
      !/\bended\b/i.test(textOf(open)),
      "an open session must not render an ended_at it does not have",
    );
  },
});

Deno.test({
  ...T,
  name: "B6(b): a packet's own status renders verbatim, and no WorkItem-level status is synthesised",
  fn: async () => {
    const card = workItemCard(await render(overview()));
    const packets = byClass(card, "wi-packet");
    const statuses = packets.map((p) => textOf(p));

    // `in_progress` and `blocked` are declared but unwritable, so everything in
    // flight reads `open`. Rendered honestly rather than inferred.
    assertEquals(statuses.filter((s) => /\bopen\b/.test(s)).length, 2);
    assertEquals(statuses.filter((s) => /\bcomplete\b/.test(s)).length, 1);

    // Nothing WorkItem-level reduces those three to one word (ADR-017 §6).
    const header = byClass(card, "wi-identity")[0];
    assert(header !== undefined, "the WorkItem card must carry an identity line");
    assert(
      !/\b(open|complete|in_progress|blocked|done|closed)\b/i.test(textOf(header)),
      "the WorkItem identity line must not carry an aggregate status",
    );
  },
});

// ---------------------------------------------------------------------------
// (c) Empty states — day-one behaviour, per subsection
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "B6(c): a packet-less, session-less WorkItem renders an empty state per subsection",
  fn: async () => {
    const card = workItemCard(
      await render(overview({ workItems: [workItemView({ packets: [], observedSessions: [] })] })),
    );

    // Two `.empty` notes, one per subsection — not one note covering both, which
    // would leave a reader unable to tell which lane is empty.
    const empties = byClass(card, "empty");
    assertEquals(empties.length, 2, "each subsection carries its own empty state");
    assert(
      empties.some((n) => /packet/i.test(textOf(n))),
      "the packets subsection must name itself in its empty state",
    );
    assert(
      empties.some((n) => /session/i.test(textOf(n))),
      "the sessions subsection must name itself in its empty state",
    );

    // The subsection headings still render: an empty lane is still a lane.
    assert(markup(card).includes("Packets"));
    assert(markup(card).includes("Observed sessions"));
  },
});

Deno.test({
  ...T,
  name: "B6(c): no WorkItems at all is its own lane-level empty state, and the packet lane is unaffected",
  fn: async () => {
    const root = await render(overview({ workItems: [] }));
    assertEquals(byClass(root, "workitem").length, 0);
    const page = markup(root);
    assert(/class="empty">No work items/.test(page), "the WorkItem lane needs its own empty state");
    // The packet lane still rendered its card.
    assert(page.includes("Packet lane card"));
  },
});

Deno.test({
  ...T,
  name: "B6(c): an empty packet lane no longer hides the WorkItem lane, and keeps its own wording",
  fn: async () => {
    const root = await render(overview({ packets: [] }));
    const page = markup(root);
    assert(page.includes("No active work packets."), "the packet lane keeps its ST-086 wording");
    assertEquals(byClass(root, "workitem").length, 1, "an empty packet lane must not hide WorkItems");
  },
});

// ---------------------------------------------------------------------------
// The stop condition: the WorkItem view renders NO attention (KTD-B1)
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "B6: the WorkItem view renders no attention, while the packet lane's rendering is untouched",
  fn: async () => {
    const root = await render(overview());
    const card = workItemCard(root);

    // Scoped to the WorkItem card's own subtree: the page at large legitimately
    // carries attention, and an unscoped assertion would be permanently red.
    assertEquals(
      byClass(card, "reason").length,
      0,
      "no attention reason may render inside a WorkItem card",
    );
    assert(
      !/Attention/i.test(textOf(card)),
      "the WorkItem view defines no attention semantics (ADR-017 §3, KTD-B1)",
    );

    // The discrimination control: the packet lane DID render attention from the same
    // payload, so the assertions above are not passing because nothing rendered.
    const page = markup(root);
    assert(page.includes("Attention"), "the packet lane's attention section must survive B6");
    assert(page.includes("reason stale"), "the packet lane's attention reasons must survive B6");
  },
});

// ---------------------------------------------------------------------------
// UI/agent read parity — the field set, against a live agent-callable GET
// ---------------------------------------------------------------------------

/**
 * The renderers' data-bearing locals. Anything else a renderer dereferences is a DOM
 * node or a helper, and is not a field the UI read off the projection.
 */
const DATA_LOCALS = ["view", "workItem", "entry", "packet", "session"];

function fieldsReadBy(functionNames: string[]): Map<string, Set<string>> {
  const source = functionNames.map(renderFunctionSource).join("\n");
  const found = new Map<string, Set<string>>(DATA_LOCALS.map((l) => [l, new Set<string>()]));
  const pattern = new RegExp(
    "\\b(" + DATA_LOCALS.join("|") + ")\\.([A-Za-z_][A-Za-z0-9_]*)",
    "g",
  );
  for (const match of source.matchAll(pattern)) {
    found.get(match[1])!.add(match[2]);
  }
  return found;
}

Deno.test({
  ...T,
  name: "B6: UI/agent read parity — every field the WorkItem view renders is in the agent-readable field set",
  fn: async () => {
    // A live projection, built through the store and read back through the real
    // router, so the parity target is what an agent key actually receives.
    const item = await store.createWorkItem({
      sourceSystem: "story-board",
      sourceRef: `B6-parity-${crypto.randomUUID()}`,
    });
    const packet = await store.createPacket({
      title: "B6 parity probe",
      objective: "prove the UI reads nothing the projection lacks",
      policyScope: "corporate",
    });
    await store.bindPacketToWorkItem(packet.id, item.id);

    const res = await api.request(`/work-items/${item.id}`, {
      headers: { "Content-Type": "application/json" },
    });
    assertEquals(res.status, 200);
    // deno-lint-ignore no-explicit-any
    const body: any = await res.json();

    const reachable: Record<string, string[]> = {
      view: Object.keys(body),
      workItem: Object.keys(body.workItem),
      entry: Object.keys(body.packets[0]),
      packet: Object.keys(body.packets[0].packet),
      // The session level has no row in this fixture, so its keys come from the
      // contract the read model pins rather than from a sample — which is what the
      // Verification Contract asked for in the first place.
      session: [
        "work_item_id",
        "node_id",
        "session_id",
        "started_at",
        "last_heartbeat_at",
        "ended_at",
        "claimed_at",
      ],
    };

    const read = fieldsReadBy([
      "renderWorkItem",
      "renderWorkItemPackets",
      "renderWorkItemSessions",
    ]);

    // Non-vacuity: an empty extraction would satisfy every subset check below.
    assert(read.get("view")!.size > 0, "the renderers must read fields off the view");
    assert(read.get("packet")!.size > 0, "the renderers must read fields off a packet");
    assert(read.get("session")!.size > 0, "the renderers must read fields off a session");

    for (const local of DATA_LOCALS) {
      for (const field of read.get(local)!) {
        assert(
          reachable[local].includes(field),
          `the UI renders ${local}.${field}, which no agent-key GET returns — ` +
            `reachable: ${reachable[local].join(", ")}`,
        );
      }
    }

    await sql`DELETE FROM workflow.work_packets WHERE id = ${packet.id}`;
    await sql`DELETE FROM workflow.work_items WHERE id = ${item.id}`;
  },
});
