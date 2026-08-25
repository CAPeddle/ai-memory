/**
 * ST-097 B3 — the observed-session lane contract: which event types carry it, what
 * their payload may contain, and the two time constants that describe it.
 *
 * ---------------------------------------------------------------------------
 * WHAT AN OBSERVED SESSION IS, AND WHAT IT IS NOT.
 * ---------------------------------------------------------------------------
 * A session is an OBSERVATION — a coding session announcing itself on the node event
 * lane using the node bearer it already holds. It is never a supervised run. Nothing
 * here creates a packet, a policy scope, or an `agent_runs` row, and a WorkItem is
 * reached only by B4's explicit operator claim, never by inference from an observation.
 * An unclaimed session stays observed forever, which is a legitimate terminal state.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CONTRACT LIVES IN ITS OWN MODULE.
 * ---------------------------------------------------------------------------
 * Three call sites have to agree about it and they sit in three different layers:
 * `remoteNodeHub.ts` refuses a payload that violates it, `store.ts` materialises the
 * rows it describes, and `server/scripts/awcp-node-client.mjs` emits it. The first two
 * import from here so "which event types are session events" has exactly one answer.
 *
 * The node client cannot: it is plain Node `.mjs` shipped to the node and cannot import
 * a `.ts` module. Its copy of the type names and of the emission cadence is therefore a
 * deliberate MIRROR, named as such at both ends, and it is the hub-side refusal below
 * that keeps the two from drifting silently — a client that widens its payload gets a
 * 400 naming the offending `client_seq`, not a quietly stored extra field.
 */

import { z } from "npm:zod@4.1.13";

/**
 * The event types that carry observed-session lifecycle (KTD-B4 item 4).
 *
 * The EVENT TYPE is what decides whether an event is a session event — never the
 * presence of a payload key. That is the whole difference between this lane and the
 * rejected jsonb-grep view over `run_events`: a grep makes the claim (B4), and any
 * later abandonment evaluation, depend on a payload field the abandonment case — a
 * `SIGKILL` that never writes a stop record — is the one most likely to omit.
 *
 * A clean close is therefore distinguishable from a crash by the presence of a typed
 * `session_end`, and abandonment is decided by a HEARTBEAT GAP rather than by the
 * absence of that close.
 */
export const SESSION_EVENT_TYPES: ReadonlySet<string> = new Set([
  "session_start",
  "session_heartbeat",
  "session_end",
]);

export function isSessionEventType(eventType: string): boolean {
  return SESSION_EVENT_TYPES.has(eventType);
}

/**
 * An ISO 8601 instant with an explicit offset. `Date.parse` alone is far too generous —
 * it accepts `"March 3 2026"` — and a value that parses to a different instant on a
 * different runtime is not a timestamp this lane can key an abandonment gap on.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/**
 * The CLOSED payload field set (KTD-B4 item 6): `session_id`, an event timestamp, and
 * `node_id`. Nothing else, and the closure is enforced rather than asserted.
 *
 *   - `session_id` — non-empty, client-generated, opaque, and explicitly
 *     NON-AUTHORITATIVE (item 2). Bounded here only so a node cannot spend the
 *     per-event byte ceiling on one key.
 *   - `at` — the event's own instant, ISO 8601. Named for the `*_at` convention of the
 *     columns it lands in. Required at the edge, so the store's ingest-instant fallback
 *     is a defence against a malformed *stored* row rather than a routine path.
 *   - `node_id` — present because item 6 puts it there, and DELIBERATELY IGNORED by
 *     everything downstream. Identity is the node the bearer proved at the route, not
 *     one a payload asserts (item 3): the hub's forgery defence covers `node_id` and it
 *     cannot cover a payload field. Nullable because the client's own precedent
 *     (`emitCheckpoint`'s `readNodeIdOrNull`) keeps the KEY present with a null value
 *     rather than letting `JSON.stringify` drop it — the closed set is about which keys
 *     may appear, and a node that has not yet registered still has no id to state.
 *
 * REJECTED, NOT STRIPPED, and the choice is load-bearing. Stripping would accept a
 * producer that has drifted from the contract and leave no trace of the drift, which is
 * the silent failure this plan keeps guarding against; refusal makes it a 400 the
 * operator can read. Refusal is also what KTD-B7 asks for: session events inherit the
 * existing run-event retention posture, which is permanent, and "deliberately minimal"
 * is only defensible if a payload that is not minimal never lands in the first place.
 *
 * `store.ts`'s tolerance is the complement of this, not a contradiction: rejecting a
 * malformed session event belongs at the EDGE, because the ingest INSERT is one
 * statement and failing there would turn one bad payload into a permanent retry loop
 * for every event beside it.
 */
export const sessionPayloadSchema = z.object({
  session_id: z.string().min(1).max(256),
  node_id: z.string().min(1).max(256).nullable(),
  at: z.string().refine(
    (value) => ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value)),
    { message: "at must be an ISO 8601 instant" },
  ),
}).strict();

/**
 * The emission cadence for `session_heartbeat`, mirrored in the node client as
 * `SESSION_HEARTBEAT_INTERVAL_MS` (see the module docblock for why it is a mirror).
 *
 * One minute: frequent enough to make a gap meaningful within a few minutes, and cheap
 * enough that a day of continuous observation is under 1500 events on a spool that
 * drains continuously. It matches the client's existing node-heartbeat tick, so the
 * session lane rides a cadence the client already keeps rather than adding a timer.
 */
export const SESSION_HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * The heartbeat-gap ABANDONMENT THRESHOLD (KTD-B4 items 4-5), fixed here.
 *
 * **This slice defines the threshold and evaluates nothing.** There is no evaluator
 * yet — attention is deferred to the post-continuity boundary (KTD-B1) — so this
 * constant's only consumer today is the test that pins its value. That is deliberate:
 * a threshold invented later, next to the evaluator that needs one, is a decision made
 * under deadline; fixed here it is a decision the attention milestone INHERITS, and a
 * change to it shows up in a diff rather than as a quietly different number.
 *
 * **Five minutes — five missed heartbeats — and here is why that value and not another.**
 *
 *   1. It is DISTINCT FROM `DEFAULT_STALE_AFTER_MS` (30 minutes), which item 5 requires
 *      explicitly: 30 minutes idle is normal for a supervised run and normal for a
 *      human's dev session; 30 minutes with no heartbeat is not. Two thresholds that
 *      happened to share a value would read as one concept and get refactored into one.
 *   2. It is a whole multiple of the emission cadence, so it is stated in the unit the
 *      signal actually arrives in. Anything under about three cadences would turn a
 *      single missed beat into a verdict.
 *   3. It clears the client's worst-case DELIVERY window by an order of magnitude. A
 *      live client whose hub is briefly unreachable spends at most ~31s in bounded
 *      backoff (`MAX_FLUSH_ATTEMPTS` = 6, base 1s, capped at 30s) before deferring to
 *      its next tick, so a node that is alive but temporarily disconnected must not be
 *      read as abandoned on that account alone.
 *
 * **A gap closes retroactively, and an evaluator must not assume otherwise.** Each
 * heartbeat carries its own `at`, so a backlog delivered after a reconnection advances
 * `last_heartbeat_at` to the instants that actually happened. The threshold therefore
 * describes what is true of a session NOW, from what has been observed so far — never a
 * permanent verdict.
 */
export const SESSION_ABANDONED_AFTER_MS = 5 * SESSION_HEARTBEAT_INTERVAL_MS;
