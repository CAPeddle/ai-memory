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
 * Boundary: this file must never import ../db.ts.
 * ---------------------------------------------------------------------------
 * workflow-boundary.test.ts enforces that only store.ts and schema.ts hold the database
 * handle, by scanning source. All SQL lives in store.ts and is called from here.
 */

import { Hono } from "npm:hono@4.9.2";
import type { Context } from "npm:hono@4.9.2";
import { z } from "npm:zod@4.1.13";

import * as store from "./store.ts";
import { toHttpError } from "./api.ts";

/**
 * The required shape of a per-node bearer: 32 random bytes as 64 lowercase hex
 * characters — `openssl rand -hex 32`.
 *
 * This is an entropy FLOOR on the encoding, and it is what makes storing a plain
 * SHA-256 digest sound. A fast digest is the wrong choice for a human-chosen password
 * precisely because such passwords are guessable; against 256 bits of machine-generated
 * entropy there is nothing to slow down and a KDF buys nothing.
 *
 * What this cannot do is prove the bytes were random — `"a".repeat(64)` matches. The
 * randomness comes from the documented generation command; this rejects the shapes that
 * could not possibly carry the entropy, before any hashing or persistence happens.
 */
const BEARER_FORMAT = /^[0-9a-f]{64}$/;

/** SHA-256, hex. Same construction as schema.ts's checksumOf — no dependency needed. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Extract the token from an `Authorization: Bearer <token>` header, if well-formed. */
function extractBearer(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (header === null) return null;
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token === "" ? null : token;
}

/**
 * Structural gate on the presented credential.
 *
 * Returns a 401 Response to send, or null to continue. It NEVER throws and NEVER calls
 * Deno.exit — that distinction matters. `auth.ts`'s `requireApiKey` throws when its env
 * var is missing, which is right for a credential the deployment cannot run without.
 * The node bearer is not that: no node configured is a perfectly ordinary deployment,
 * and treating an absent node credential as a server misconfiguration would let an
 * optional module take down a server nobody asked to run it on.
 *
 * Never logs the header or the token.
 */
export function validateNodeBearer(req: Request): Response | null {
  const token = extractBearer(req);
  if (token === null || !BEARER_FORMAT.test(token)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const registerBody = z.object({
  hostname: z.string().min(1).max(255).optional(),
  platform: z.string().min(1).max(255).optional(),
});

const uuidSchema = z.string().uuid();

const eventsBody = z.object({
  events: z.array(
    z.object({
      client_seq: z.number().int().min(0),
      event_type: z.string().min(1).max(128),
      payload: z.unknown().optional(),
    }),
  ).min(1).max(500),
});

/** Parse a JSON body; an absent body is an empty object, an unparseable one is a symbol. */
async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (text.trim() === "") return {};
    return JSON.parse(text);
  } catch {
    return Symbol.for("unparseable");
  }
}

/** Map thrown domain errors through the shared policy instead of Hono's default 500. */
function withErrorMapping(
  handler: (c: Context) => Promise<Response>,
): (c: Context) => Promise<Response> {
  return async (c: Context) => {
    try {
      return await handler(c);
    } catch (err) {
      const mapped = toHttpError(err);
      return c.json(mapped.body, mapped.status);
    }
  };
}

function badRequest(c: Context, message: string, issues?: unknown) {
  return c.json({ error: "BadRequest", message, ...(issues ? { issues } : {}) }, 400);
}

export function createRemoteNodeHubRoutes(): Hono {
  const routes = new Hono();

  routes.post(
    "/register",
    withErrorMapping(async (c: Context) => {
      const denied = validateNodeBearer(c.req.raw);
      if (denied) return denied;

      const raw = await readJson(c.req.raw);
      if (typeof raw === "symbol") return badRequest(c, "body is not valid JSON");
      const parsed = registerBody.safeParse(raw);
      if (!parsed.success) {
        return badRequest(c, "request body failed validation", parsed.error.issues);
      }

      // Safe to assert: validateNodeBearer already proved the header is well-formed.
      const bearer = extractBearer(c.req.raw)!;
      const node = await store.upsertExecutionNode({
        bearerTokenHash: await sha256Hex(bearer),
        hostname: parsed.data.hostname ?? null,
        platform: parsed.data.platform ?? null,
      });

      // node_id only. Never the bearer, never the digest.
      return c.json({ node_id: node.node_id }, 201);
    }),
  );

  routes.post(
    "/:node_id/events",
    withErrorMapping(async (c: Context) => {
      const denied = validateNodeBearer(c.req.raw);
      if (denied) return denied;

      const nodeId = uuidSchema.safeParse(c.req.param("node_id"));
      if (!nodeId.success) return badRequest(c, "node_id must be a uuid");

      const raw = await readJson(c.req.raw);
      if (typeof raw === "symbol") return badRequest(c, "body is not valid JSON");
      const parsed = eventsBody.safeParse(raw);
      if (!parsed.success) {
        return badRequest(c, "request body failed validation", parsed.error.issues);
      }

      // Validation precedes the store call, so a rejected batch leaves no partial write.
      const node = await store.findExecutionNode(nodeId.data);
      if (node === null) {
        return c.json(
          { error: "WorkflowNotFoundError", message: "unknown node", id: nodeId.data },
          404,
        );
      }

      await store.ingestRunEvents(nodeId.data, parsed.data.events);
      const acknowledged = await store.acknowledgeSeqs(
        nodeId.data,
        parsed.data.events.map((e) => e.client_seq),
      );
      return c.json({ acknowledged }, 200);
    }),
  );

  return routes;
}
