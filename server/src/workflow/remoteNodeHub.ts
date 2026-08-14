/**
 * ST-088 U2 — the hub half of the remote execution node surface (NODE-01, NODE-02).
 *
 * Two endpoints, and deliberately only two:
 *
 *   POST /workflow/nodes/register        — resolve a per-node bearer to a node_id
 *   POST /workflow/nodes/:node_id/events — ingest a batch of that node's events
 *
 * There is no node-list, no cross-node read, no events-read, and no control channel.
 * The §7.1 allow-listed control messages are NOT dispatched to nodes from here — this
 * is an ingestion hub, not a remote shell, and keeping the surface this small is what
 * makes that claim checkable rather than aspirational.
 *
 * ---------------------------------------------------------------------------
 * Registration takes a PRE-PROVISIONED bearer. It does not mint one.
 * ---------------------------------------------------------------------------
 * Each node carries its own bearer in its own env var; the hub validates and upserts,
 * and returns only `node_id`. No endpoint returns, mints, or recovers a raw bearer, so
 * a compromised hub database yields digests and nothing replayable.
 *
 * ---------------------------------------------------------------------------
 * ENROLMENT: a well-formed bearer is not an authorised one.
 * ---------------------------------------------------------------------------
 * The shape gate below proves a credential *could* carry 256 bits of entropy. It says
 * nothing about whether this hub was ever told to trust it — and for a while nothing
 * else did either, so any 64 hex characters registered themselves and got a real
 * node_id. "Pre-provisioned" was asserted in this docblock and enforced nowhere.
 *
 * The model is ssh-copy-id, and the split matters:
 *
 *   - FIRST registration of an unknown bearer must also carry the operator's enrolment
 *     secret in `X-Node-Enrolment-Secret` — the one-time act of trust.
 *   - EVERY LATER registration needs only the bearer itself, because by then the hub
 *     knows it. A node re-registering on boot keeps nothing but its own credential,
 *     exactly as an ssh client keeps its key and not the password it enrolled with.
 *
 * The secret lives in `AWCP_NODE_ENROLMENT_SECRET` on the hub. UNSET MEANS CLOSED: no
 * new node can enrol. That is the safe default — the opposite one is the hole this
 * replaced — and it is also why the variable must never join the startup-required set:
 * a deployment running no nodes at all is ordinary, and it should boot.
 *
 * ---------------------------------------------------------------------------
 * Boundary: this file must never import ../db.ts.
 * ---------------------------------------------------------------------------
 * workflow-boundary.test.ts enforces that only store.ts and schema.ts hold the database
 * handle, by scanning source. All SQL lives in store.ts and is called from here.
 */

import { Hono } from "npm:hono@4.9.2";
import type { Context } from "npm:hono@4.9.2";
import { z } from "npm:zod@4.1.13";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

import * as store from "./store.ts";
import {
  BODY_TOO_LARGE,
  MAX_REQUEST_BYTES,
  normalizeZodIssues,
  readJson,
  withErrorMapping,
} from "./api.ts";
import { checksumOfText } from "./schema.ts";

/**
 * The required shape of a per-node bearer: 32 random bytes as 64 lowercase hex
 * characters — `openssl rand -hex 32`.
 *
 * This is an entropy FLOOR on the encoding, and it is what makes storing a plain
 * SHA-256 digest sound. A fast digest is the wrong choice for a human-chosen password
 * precisely because such passwords are guessable; against 256 bits of machine-generated
 * entropy there is nothing to slow down and a KDF buys nothing.
 *
 * What this cannot do is prove the bytes were random — `"a".repeat(64)` matches — nor
 * that anyone authorised this particular node. The randomness comes from the documented
 * generation command; the authorisation comes from the enrolment secret.
 */
const BEARER_FORMAT = /^[0-9a-f]{64}$/;

/** Header carrying the operator's enrolment secret on a node's FIRST registration. */
const ENROLMENT_HEADER = "X-Node-Enrolment-Secret";

/** Hub-side env var holding that secret. Absent means enrolment is closed. */
const ENROLMENT_SECRET_ENV = "AWCP_NODE_ENROLMENT_SECRET";

/**
 * Platform credentials a node bearer must never be.
 *
 * Both, not just the operator key: index.ts accepts `AWCP_AGENT_API_KEY` on
 * `/api/workflow` as well, so checking only `MEMORY_API_KEY` would leave a real
 * platform credential able to register itself as a node — the isolation this enforces
 * would then hold in one direction and not the other, which is no isolation at all.
 */
const PLATFORM_KEY_ENVS = ["MEMORY_API_KEY", "AWCP_AGENT_API_KEY"] as const;

/** Extract the token from an `Authorization: Bearer <token>` header, if well-formed. */
function extractBearer(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (header === null) return null;
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token === "" ? null : token;
}

/**
 * Plain text, matching auth.ts and the /api/workflow middleware. An auth failure is
 * the one response shape this server is already consistent about; answering JSON only
 * here would tell a caller which subsystem refused it.
 */
const unauthorized = () => new Response("Unauthorized", { status: 401 });

/**
 * Constant-time equality of two secrets, compared as fixed-length SHA-256 digests.
 *
 * Digesting first is what makes the comparison safe for operator-chosen values of any
 * length: both sides are always 64 hex characters, so the comparison leaks no length
 * signal, and `timingSafeEqual` removes the byte-position signal an early-exit compare
 * would hand an attacker probing for the secret.
 */
async function secretsMatch(presented: string, configured: string): Promise<boolean> {
  const a = Buffer.from(await checksumOfText(presented), "utf8");
  const b = Buffer.from(await checksumOfText(configured), "utf8");
  // Both are 64-char hex digests, so this is belt-and-braces — but timingSafeEqual
  // THROWS on a length mismatch, and a throw here would become a 500 that tells the
  // caller more than a 401 does.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Is this bearer actually a platform credential?
 *
 * The two credential systems must stay isolated in BOTH directions. `/api/workflow`
 * already refuses a node bearer by simply not recognising it; this is the other half —
 * a platform key must not be able to register or impersonate a node. Without it, the
 * node identity would not be a distinct principal at all, just a second name for the
 * operator, and every per-node guarantee downstream (ownership, attribution, the
 * cross-node injection guard) would rest on nothing.
 *
 * An unset variable is skipped rather than throwing: this module must never be the
 * reason a server fails to start.
 */
async function bearerIsPlatformKey(bearer: string): Promise<boolean> {
  for (const name of PLATFORM_KEY_ENVS) {
    const key = Deno.env.get(name);
    if (!key) continue;
    if (await secretsMatch(bearer, key)) return true;
  }
  return false;
}

/**
 * Did this request carry the operator's enrolment secret?
 *
 * Fails closed on every path that is not an exact match — no configured secret, no
 * header, empty header, wrong value. Read at request time and never at boot, so an
 * unset variable disables enrolment instead of preventing startup.
 */
async function enrolmentAuthorized(req: Request): Promise<boolean> {
  const configured = Deno.env.get(ENROLMENT_SECRET_ENV);
  if (!configured) return false;
  const presented = req.headers.get(ENROLMENT_HEADER);
  if (presented === null || presented === "") return false;
  return await secretsMatch(presented, configured);
}

/** A validated node bearer, or the response to send instead. */
export type NodeBearerCheck =
  | { ok: true; token: string }
  | { ok: false; response: Response };

/**
 * Structural gate on the presented credential.
 *
 * Returns the validated token so callers do not re-parse the header — the previous
 * shape forced a second `extractBearer(...)!` at each use site, and a non-null
 * assertion whose safety depends on an earlier call having run is the kind of coupling
 * that survives exactly until someone reorders the handler.
 *
 * It NEVER throws and NEVER calls Deno.exit — that distinction matters. `auth.ts`'s
 * `requireApiKey` throws when its env var is missing, which is right for a credential
 * the deployment cannot run without. The node bearer is not that: no node configured is
 * a perfectly ordinary deployment, and treating an absent node credential as a server
 * misconfiguration would let an optional module take down a server nobody asked to run
 * it on.
 *
 * Rejects, in order: an absent header, a header without a well-formed `Bearer <token>`,
 * a token outside the 64-hex format, and any platform key. Every branch fails CLOSED —
 * there is no path from here to a write.
 *
 * ORDERING NOTE, because it changes what a test proves: the format gate runs BEFORE the
 * platform-key check, so a platform key that is not 64 lowercase hex is rejected as
 * malformed and never reaches `bearerIsPlatformKey`. Both answer 401, so a test that
 * only asserts the status cannot tell which fired. The isolation tests therefore drive
 * deliberately 64-hex platform keys.
 *
 * What this does NOT decide is whether the bearer belongs to a node this hub trusts.
 * That is the enrolment gate in `upsertExecutionNode`, and it is deliberately separate:
 * a known node must keep authenticating with nothing but its bearer.
 *
 * Never logs the header or the token.
 */
export async function validateNodeBearer(req: Request): Promise<NodeBearerCheck> {
  const token = extractBearer(req);
  if (token === null || !BEARER_FORMAT.test(token)) {
    return { ok: false, response: unauthorized() };
  }
  if (await bearerIsPlatformKey(token)) return { ok: false, response: unauthorized() };
  return { ok: true, token };
}

const registerBody = z.object({
  hostname: z.string().min(1).max(255).optional(),
  platform: z.string().min(1).max(255).optional(),
});

const uuidSchema = z.string().uuid();

/**
 * Per-event payload ceiling, in bytes of encoded JSON.
 *
 * `.max(500)` on the array bounds how MANY events arrive; it says nothing about how big
 * each one is, so without this a single 500-element batch of megabyte payloads is a
 * legitimate-looking request that costs the hub half a gigabyte. 16 KiB is generous for
 * an execution event (the memory domain caps a whole thought at 32 KiB) and small enough
 * that the worst-case batch stays bounded at ~8 MiB — which is where MAX_REQUEST_BYTES
 * gets its value, so the two ceilings stay consistent by construction.
 */
const MAX_PAYLOAD_BYTES = 16_384;

const eventsBody = z.object({
  events: z.array(
    z.object({
      client_seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      event_type: z.string().min(1).max(128),
      payload: z.unknown().optional(),
    }),
  ).min(1).max(500),
});

/**
 * Remove NUL characters from every string in a payload, keys included.
 *
 * Postgres rejects U+0000 inside a `jsonb` value (SQLSTATE 22P05) even though JSON
 * permits it, and `toHttpError` does not map that code — so one NUL anywhere in a batch
 * was a 500. Worse than it sounds: the batch is one statement, so a single bad event
 * blocked acknowledgement of every event beside it, and the read-back ack contract then
 * turned that into a permanent retry loop for all of them. Captured command output is
 * exactly the kind of payload that carries a stray NUL.
 *
 * Sanitised structurally rather than by editing the encoded JSON text. Deleting the
 * six-character `\u0000` escape from the output of JSON.stringify looks equivalent and
 * is not: a payload containing the literal characters `\u0000` encodes to `\\u0000`, and
 * a substring deletion there leaves a dangling backslash — invalid JSON, and the same
 * 500 by a longer route.
 */
function stripNulChars(value: unknown): unknown {
  if (typeof value === "string") return value.replaceAll("\u0000", "");
  if (Array.isArray(value)) return value.map(stripNulChars);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map((
        [k, v],
      ) => [k.replaceAll("\u0000", ""), stripNulChars(v)]),
    );
  }
  return value;
}

interface NormalizedBatch {
  accepted: store.RunEventInput[];
  oversized: { client_seq: number; bytes: number }[];
}

/**
 * Encode, measure, sanitise and de-duplicate a batch in one pass, before anything
 * reaches the database.
 *
 * DUPLICATE client_seq WITHIN A BATCH: first occurrence wins, later ones are dropped.
 * `client_seq` is the per-node idempotency key — that is what `UNIQUE(node_id,
 * client_seq)` already means for replays across requests, and a batch cannot mean
 * something different. The de-duplication is explicit here rather than left to
 * `ON CONFLICT DO NOTHING` so that the acknowledgement matches the submission BY
 * CONSTRUCTION: acks are read back per stored row, so two entries sharing a seq would
 * otherwise return one ack for two submitted events and the client could not tell
 * which of them the hub kept.
 *
 * The contract this places on a node: never reuse a client_seq for different content.
 * Doing so silently discards the later payload.
 */
function normalizeBatch(
  events: z.infer<typeof eventsBody>["events"],
): NormalizedBatch {
  const accepted: store.RunEventInput[] = [];
  const oversized: { client_seq: number; bytes: number }[] = [];
  const seen = new Set<number>();

  for (const event of events) {
    const encoded = event.payload === undefined ? null : JSON.stringify(event.payload);
    const bytes = encoded === null ? 0 : new TextEncoder().encode(encoded).length;
    if (bytes > MAX_PAYLOAD_BYTES) {
      oversized.push({ client_seq: event.client_seq, bytes });
      continue;
    }
    if (seen.has(event.client_seq)) continue;
    seen.add(event.client_seq);

    // Cheap guard: the escape can only appear in the ENCODED form if there is a real
    // NUL to strip, or a literal backslash-u sequence for which the structural pass is
    // a no-op. Encoding is only ever used to detect and to measure — the VALUE is what
    // goes to the store, because postgres.js does its own jsonb serialisation.
    const sanitised = encoded !== null && encoded.includes("\\u0000")
      ? stripNulChars(event.payload)
      : event.payload;

    accepted.push({
      client_seq: event.client_seq,
      event_type: event.event_type,
      payload: event.payload === undefined ? null : sanitised,
    });
  }

  return { accepted, oversized };
}

function badRequest(c: Context, message: string, issues?: unknown) {
  return c.json({ error: "BadRequest", message, ...(issues ? { issues } : {}) }, 400);
}

function payloadTooLarge(c: Context) {
  return c.json(
    {
      error: "PayloadTooLarge",
      message: `request body exceeds ${MAX_REQUEST_BYTES} bytes`,
    },
    413,
  );
}

export function createRemoteNodeHubRoutes(): Hono {
  const routes = new Hono();

  routes.post(
    "/register",
    withErrorMapping(async (c: Context) => {
      const auth = await validateNodeBearer(c.req.raw);
      if (!auth.ok) return auth.response;

      const raw = await readJson(c.req.raw);
      if (raw === BODY_TOO_LARGE) return payloadTooLarge(c);
      if (typeof raw === "symbol") return badRequest(c, "body is not valid JSON");
      const parsed = registerBody.safeParse(raw);
      if (!parsed.success) {
        return badRequest(
          c,
          "request body failed validation",
          normalizeZodIssues(parsed.error.issues),
        );
      }

      const node = await store.upsertExecutionNode({
        bearerTokenHash: await checksumOfText(auth.token),
        hostname: parsed.data.hostname ?? null,
        platform: parsed.data.platform ?? null,
        allowEnrolment: await enrolmentAuthorized(c.req.raw),
      });

      // An unknown bearer with no enrolment authorisation. Same 401 as an unrecognised
      // credential anywhere else, deliberately: distinguishing "not enrolled" from
      // "wrong secret" would let a prober confirm which bearers this hub already knows.
      if (node === null) return unauthorized();

      // node_id only. Never the bearer, never the digest.
      return c.json({ node_id: node.node_id }, 201);
    }),
  );

  routes.post(
    "/:node_id/events",
    withErrorMapping(async (c: Context) => {
      const auth = await validateNodeBearer(c.req.raw);
      if (!auth.ok) return auth.response;

      const nodeId = uuidSchema.safeParse(c.req.param("node_id"));
      if (!nodeId.success) return badRequest(c, "node_id must be a uuid");

      const raw = await readJson(c.req.raw);
      if (raw === BODY_TOO_LARGE) return payloadTooLarge(c);
      if (typeof raw === "symbol") return badRequest(c, "body is not valid JSON");
      const parsed = eventsBody.safeParse(raw);
      if (!parsed.success) {
        return badRequest(
          c,
          "request body failed validation",
          normalizeZodIssues(parsed.error.issues),
        );
      }

      // Every check below precedes the store call, so a rejected batch leaves no
      // partial write. Ordering within them is deliberate.
      const { accepted, oversized } = normalizeBatch(parsed.data.events);
      if (oversized.length > 0) {
        return badRequest(c, `event payload exceeds ${MAX_PAYLOAD_BYTES} bytes`, oversized);
      }

      const node = await store.findExecutionNode(nodeId.data);
      if (node === null) {
        return c.json(
          { error: "WorkflowNotFoundError", message: "unknown node", id: nodeId.data },
          404,
        );
      }

      // CROSS-NODE INJECTION GUARD. Holding a valid bearer proves you are *a* node; it
      // does not prove you are *this* node. Without this check any authenticated node
      // could write events attributed to any other — forging another machine's
      // execution history, which is the whole point of attributing events at all.
      //
      // The ownership question is answered in SQL by nodeOwnsBearer rather than by
      // fetching the stored digest and comparing it here, so there is no intermediate
      // value in JS to get wrong.
      //
      // 401, not 403. Be precise about what that does and does not buy: it avoids
      // confirming that the caller's bearer is genuine-but-wrong for this node. It does
      // NOT hide whether the node exists — the findExecutionNode branch above already
      // answers 404 for an unknown id, which is a deliberate plan decision (an unknown
      // node_id is an ordinary client error worth distinguishing from a permission
      // failure). The resulting existence oracle is acceptable only because node ids are
      // unguessable v4 uuids; if node ids ever become enumerable, collapse the 404 into
      // this 401.
      const owns = await store.nodeOwnsBearer(nodeId.data, await checksumOfText(auth.token));
      if (!owns) return unauthorized();

      await store.ingestRunEvents(nodeId.data, accepted);
      const acknowledged = await store.acknowledgeSeqs(
        nodeId.data,
        accepted.map((e) => e.client_seq),
      );
      return c.json({ acknowledged }, 200);
    }),
  );

  return routes;
}
