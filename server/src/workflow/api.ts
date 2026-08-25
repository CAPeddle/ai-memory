/**
 * ST-086 — the typed HTTP surface for Workflow Operations.
 *
 * **What this deliberately is not.** There is no generic row mutation, no SQL
 * passthrough, no shell execution, and no packet-status setter. Every route is a named
 * command whose preconditions live in store.ts, and the set below is the whole API.
 * store.ts explains at length why `setPacketStatus` was deleted rather than exposed;
 * re-adding it here would reintroduce exactly the hole — a route that manufactures a
 * completed packet while its required criteria sit without evidence — one layer up,
 * where the completion gate cannot see it.
 *
 * **Authentication is applied by the composition root, not here.** This module's
 * import surface is enforced by `workflow-boundary.test.ts` against an allowlist, and
 * `../auth.ts` is not on it. That is the right way round: the workflow product should
 * not carry an opinion about how the deployment authenticates. `index.ts` mounts this
 * router behind the same bearer-key middleware `/mcp` uses.
 *
 * **Error mapping is the contract, and it is exhaustive by construction** — see
 * {@link toHttpError}. Anything unrecognised is a 500, never a 400 by accident: a
 * caller must be able to tell "you sent something wrong" from "we are broken".
 */

import { Hono } from "npm:hono@4.9.2";
import type { Context } from "npm:hono@4.9.2";
import { z } from "npm:zod@4.1.13";

import {
  buildOverview,
  buildPacketView,
  buildWorkItemOverview,
  buildWorkItemView,
  buildWorkItemViewByProvenance,
} from "./readModel.ts";
import { createWorkItemSchema, sourceSystemSchema } from "./schema.ts";
import * as store from "./store.ts";
import {
  CompletionBlockedError,
  CriteriaFrozenError,
  DecisionConflictError,
  POLICY_SCOPES,
  RunConflictError,
  WorkflowNotFoundError,
} from "./types.ts";
import type { PolicyScope } from "./types.ts";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

/**
 * Policy scope has NO default and NO fallback, deliberately — it fails closed.
 *
 * `z.enum` over the same closed vocabulary the CHECK constraint enforces, so a
 * malformed or absent scope is a 400 at the edge rather than a constraint violation
 * deeper in. Giving this a default would be the exact failure the column was designed
 * against: a permissive value minted wherever a caller forgot to state one.
 */
const policyScopeSchema = z.enum(
  POLICY_SCOPES as unknown as [PolicyScope, ...PolicyScope[]],
);

const createPacketSchema = z.object({
  title: z.string().min(1),
  objective: z.string().min(1),
  scope: z.string().optional(),
  constraints: z.string().optional(),
  repository: z.string().nullish(),
  branch: z.string().nullish(),
  policyScope: policyScopeSchema,
});

const registerRunSchema = z.object({
  agentType: z.string().min(1),
  host: z.string().min(1),
  nodeId: z.string().nullish(),
  workingDir: z.string().nullish(),
  repository: z.string().nullish(),
  branch: z.string().nullish(),
});

const checkpointSchema = z.object({
  completedWork: z.string().min(1),
  currentState: z.string().min(1),
  blockers: z.string().nullish(),
  nextAction: z.string().nullish(),
  repoCommit: z.string().nullish(),
});

const endRunSchema = z.object({
  status: z.enum(["ended", "failed"]).default("ended"),
});

const decisionSchema = z.object({
  question: z.string().min(1),
  rationale: z.string().nullish(),
  runId: z.uuid().nullish(),
  blocking: z.boolean().optional(),
});

const resolveSchema = z.object({
  resolution: z.string().min(1),
});

const criterionSchema = z.object({
  description: z.string().min(1),
  required: z.boolean().optional(),
});

const evidenceSchema = z.object({
  kind: z.enum(["manual", "command_result", "external_build"]),
  detail: z.string().min(1),
  recordedCommit: z.string().nullish(),
});

/**
 * The WorkItem binding's body — one id and nothing else.
 *
 * Deliberately NOT `createWorkItemSchema`: binding names an existing WorkItem, it
 * does not describe one. A route that accepted a provenance pair here would be a
 * second creation path wearing an update's name, and the WorkItem it minted would
 * bypass whatever the create route later grows.
 */
const bindWorkItemSchema = z.object({
  workItemId: z.uuid(),
});

/**
 * The claim's body: the composite key of an already-observed session, and nothing else.
 *
 * `nodeId` and `sessionId` together are ONE reference — `observed_sessions` is keyed on
 * the pair, because `session_id` is client-generated and explicitly non-authoritative
 * (KTD-B4 item 3) and only means something scoped to the node whose bearer the hub
 * proved. Accepting a bare `sessionId` would be accepting a value one node can use to
 * name another node's session.
 *
 * The 256-character bound mirrors `sessionPayloadSchema` in observedSession.ts, which
 * is the only place a `session_id` can legitimately enter the system: a claim naming a
 * longer one is naming a session the lane could never have stored. `.min(1)` sits ahead
 * of `observed_sessions`'s own `CHECK (session_id <> '')` so an empty id is a 400 the
 * caller can act on rather than a 500 from a constraint deeper in.
 *
 * There is deliberately nothing else here — no work-item fields (the claim names an
 * existing one, it does not describe one), and no scope, status or attention, none of
 * which a claim may invent.
 */
const claimSessionSchema = z.object({
  nodeId: z.uuid(),
  sessionId: z.string().min(1).max(256),
});

/**
 * The provenance lookup's QUERY STRING — `?source=<s>&ref=<r>` (KTD-B5).
 *
 * **Query parameters rather than path segments, and that is a contract rather than a
 * style choice.** ADR-017 §2's own example refs include `#57`, which no path segment
 * can carry — `#` opens a fragment the client never sends — and a Jira-style key
 * containing a slash would split into two segments. Percent-encoding in a query
 * parameter round-trips both, so the route resolves the identifiers the source
 * systems actually use rather than the subset a path happens to tolerate.
 *
 * `source` reuses `sourceSystemSchema` for the same reason the create route reuses
 * `createWorkItemSchema`: §2's closed set is the versioned contract, and a second
 * declaration of it here would be a second place for the vocabulary to drift.
 *
 * **`awcp-native` is refused rather than left to miss.** The pair rule gives every
 * native row a null `source_ref`, so no ref can ever resolve one — the request is
 * itself the mistake, and a 404 would send the caller looking for a row that cannot
 * exist. The message is `checkProvenancePair`'s, deliberately, so the same
 * impossibility reads the same way whether it is met on the way in or on the way out.
 */
const byRefQuerySchema = z.object({
  source: sourceSystemSchema,
  ref: z.string().min(1),
}).superRefine((value, ctx) => {
  if (value.source === "awcp-native") {
    ctx.addIssue({
      code: "custom",
      path: ["source"],
      message:
        "awcp-native work names no foreign namespace: it carries no sourceRef and cannot be resolved by one",
    });
  }
});

const idSchema = z.uuid();

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/** Postgres SQLSTATE for a foreign-key violation. */
const FK_VIOLATION = "23503";
/** Postgres SQLSTATE for a malformed literal — e.g. a non-uuid where a uuid is due. */
const INVALID_TEXT_REPRESENTATION = "22P02";

interface HttpError {
  status: 400 | 404 | 409 | 500;
  body: Record<string, unknown>;
}

function sqlState(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

/**
 * Map a domain failure onto its HTTP status.
 *
 * The foreign-key branch is the one that is easy to miss and wrong to skip. Four store
 * functions — `registerRun`, `recordCheckpoint`, `recordDecision`, `attachEvidence` —
 * carry no existence check and rely on the foreign key instead, so a request naming a
 * parent that does not exist arrives here as SQLSTATE 23503 rather than as
 * {@link WorkflowNotFoundError}. Without this branch those four would answer 500 for a
 * plain client mistake, telling the caller the server is broken when the id was simply
 * wrong. That is not cosmetic: 500 invites a retry, and retrying a bad id forever is
 * exactly the wrong response.
 */
export function toHttpError(err: unknown): HttpError {
  if (err instanceof WorkflowNotFoundError) {
    return {
      status: 404,
      body: { error: err.name, message: err.message, id: err.id },
    };
  }
  if (err instanceof CompletionBlockedError) {
    return {
      status: 409,
      body: {
        error: err.name,
        message: err.message,
        unmetCriteria: err.unmetCriteria,
      },
    };
  }
  if (err instanceof CriteriaFrozenError) {
    return { status: 409, body: { error: err.name, message: err.message } };
  }
  if (err instanceof DecisionConflictError) {
    return {
      status: 409,
      body: {
        error: err.name,
        message: err.message,
        existingResolution: err.existingResolution,
      },
    };
  }
  if (err instanceof RunConflictError) {
    return {
      status: 409,
      body: {
        error: err.name,
        message: err.message,
        existingStatus: err.existingStatus,
      },
    };
  }

  const state = sqlState(err);
  if (state === FK_VIOLATION) {
    return {
      status: 404,
      body: {
        error: "WorkflowNotFoundError",
        message:
          "a referenced work packet, agent run or verification criterion does not exist",
        // Unlike the WorkflowNotFoundError branch above, the FK violation does not
        // tell us WHICH id was missing — Postgres reports only that some constraint
        // was violated. `null` rather than omitting the key: every WorkflowNotFoundError
        // -discriminated 404 body must carry the same key set, or a consumer trusting
        // the discriminator to imply a stable shape breaks on this branch specifically.
        id: null,
      },
    };
  }
  if (state === INVALID_TEXT_REPRESENTATION) {
    return {
      status: 400,
      body: { error: "BadRequest", message: "malformed identifier" },
    };
  }

  return {
    status: 500,
    body: {
      error: "InternalError",
      message: (err as Error)?.message ?? "unknown failure",
    },
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

/**
 * Ceiling on a request body, in bytes.
 *
 * Sized by the largest batch the node hub declares legal — 500 events x 16 KiB of
 * payload is ~8 MiB — plus headroom for the JSON envelope around them. Any surface
 * needing a tighter bound passes its own; none may exceed this one.
 */
export const MAX_REQUEST_BYTES = 9 * 1024 * 1024;

/** {@link readJson} could not parse the body. */
export const BODY_UNPARSEABLE = Symbol.for("workflow.body.unparseable");

/** {@link readJson} stopped reading: the body exceeded the byte ceiling. */
export const BODY_TOO_LARGE = Symbol.for("workflow.body.too-large");

/**
 * Reduce Zod issues to `{path, message}` — the validation-error shape every workflow
 * route answers with.
 *
 * Worth doing rather than passing `error.issues` through: a raw issue carries
 * validator internals (codes, expected/received types, and for some checks the value
 * that failed), so echoing it both varies the response shape by which check fired and
 * risks reflecting submitted content back to the caller.
 */
export function normalizeZodIssues(
  issues: readonly { path: PropertyKey[]; message: string }[],
): { path: string; message: string }[] {
  return issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

/**
 * Parse a JSON body, treating an absent body as an empty object; returns BODY_UNPARSEABLE / BODY_TOO_LARGE on failure.
 *
 * Exported for remoteNodeHub.ts. The node hub had a byte-identical private copy; two
 * copies of the "what counts as an unparseable body" rule is two places for the answer
 * to drift, and nothing in the module boundary ever required the duplication.
 */
export async function readJson(
  req: Request,
  maxBytes: number = MAX_REQUEST_BYTES,
): Promise<unknown> {
  // Content-Length first, because rejecting before reading is free when the client is
  // honest. It is only a hint: the header is attacker-supplied and chunked uploads omit
  // it entirely, so it can never be the actual bound — hence the capped read below.
  const declared = Number(req.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) return BODY_TOO_LARGE;

  let text: string | null;
  try {
    text = await readTextCapped(req, maxBytes);
  } catch {
    return BODY_UNPARSEABLE;
  }
  if (text === null) return BODY_TOO_LARGE;
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return BODY_UNPARSEABLE;
  }
}

/**
 * Read a request body to text, abandoning it the moment it exceeds `maxBytes`.
 * Returns null when it did.
 *
 * `req.text()` cannot do this: it buffers whatever arrives and only then hands it over,
 * so any ceiling applied to its result is enforced after the memory has already been
 * committed. Counting while reading is the difference between a bound and a report.
 */
async function readTextCapped(req: Request, maxBytes: number): Promise<string | null> {
  const body = req.body;
  if (body === null) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Wrap a handler with the shared error-mapping policy: run it, and map any thrown
 * domain error through {@link toHttpError} instead of letting it fall through to
 * Hono's default 500. `command()` and the two read-only GET routes below all go
 * through this, which is what makes "every route maps errors the same way" true
 * rather than merely asserted in a docblock.
 */
export function withErrorMapping(
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

export function createWorkflowApi(): Hono {
  const api = new Hono();

  /**
   * One handler shape for every route: validate the path id, validate the body, run
   * the command, map failures via {@link withErrorMapping}. Centralised so no
   * individual route can quietly grow a different error-mapping policy — the drift
   * that ends with one endpoint answering 200 for a failure another answers 409 for.
   */
  const command = <T>(
    schema: z.ZodType<T>,
    paramNames: string[],
    run: (body: T, params: Record<string, string>) => Promise<unknown>,
    successStatus: 200 | 201 = 201,
  ) =>
    withErrorMapping(async (c: Context) => {
      const params: Record<string, string> = {};
      for (const name of paramNames) {
        const raw = c.req.param(name);
        const parsed = idSchema.safeParse(raw);
        if (!parsed.success) {
          return c.json(
            {
              error: "BadRequest",
              message: `${name} must be a uuid`,
              received: raw,
            },
            400,
          );
        }
        params[name] = parsed.data;
      }

      const raw = await readJson(c.req.raw);
      if (typeof raw === "symbol") {
        return raw === BODY_TOO_LARGE
          ? c.json({
            error: "PayloadTooLarge",
            message: `request body exceeds ${MAX_REQUEST_BYTES} bytes`,
          }, 413)
          : c.json({
            error: "BadRequest",
            message: "body is not valid JSON",
          }, 400);
      }
      const body = schema.safeParse(raw);
      if (!body.success) {
        return c.json(
          {
            error: "BadRequest",
            message: "request body failed validation",
            issues: normalizeZodIssues(body.error.issues),
          },
          400,
        );
      }

      const result = await run(body.data, params);
      return c.json(result as Json, successStatus);
    });

  // --- Work items ---------------------------------------------------------

  /**
   * Create a WorkItem (ADR-017 §1-§4). OPERATOR-ONLY — see policy.ts.
   *
   * The body schema is `createWorkItemSchema` from schema.ts rather than a private
   * copy declared here beside the others. That is the one deliberate break from this
   * file's own idiom, and it is the ADR's instruction: §2's closed provenance set and
   * the pair rule that goes with it are the versioned contract, so a second
   * declaration of them at the HTTP edge would be a second place for the vocabulary
   * to drift. Everything the schema does NOT accept is load-bearing too — no
   * `awLabel` (§4 mints nothing here), no `policyScope` (§3), no `status` (§6), no
   * `title` (§2) — and a plain `z.object` strips all four rather than smuggling them
   * through.
   */
  api.post(
    "/work-items",
    command(createWorkItemSchema, [], (body) =>
      store.createWorkItem({
        sourceSystem: body.sourceSystem,
        sourceRef: body.sourceRef ?? null,
      })),
  );

  /**
   * Bind a packet to a WorkItem. OPERATOR-ONLY — see policy.ts.
   *
   * PATCH rather than POST because this sets one field on an existing packet;
   * it is the module's only non-POST write, which is why policy.ts's classification
   * has to be method-aware for it and not merely path-aware.
   *
   * 200 rather than 201: nothing is created. The updated packet comes back so the
   * caller can see the binding it just made without a second read.
   */
  api.patch(
    "/packets/:packetId/work-item",
    command(
      bindWorkItemSchema,
      ["packetId"],
      (body, params) => store.bindPacketToWorkItem(params.packetId, body.workItemId),
      200,
    ),
  );

  /**
   * Claim an observed session for a WorkItem. OPERATOR-ONLY — see policy.ts.
   *
   * **The claim is explicit; nothing infers it.** An observed session announces itself
   * on the node lane and stays unassociated until an operator says which requested work
   * it belongs to. `POST /packets/:packetId/runs` is not a precedent for making this
   * agent-callable: that route attaches execution to work that is ALREADY supervised,
   * whereas a packet-less WorkItem is by KTD-D4 not supervised at all — and the caller
   * here holds no proof of ownership over the session it is naming, because the node
   * lane's cross-node defence covers `node_id` at the node's own route and reaches no
   * further.
   *
   * **201 on a replay too, and that is decided rather than defaulted.** The response is
   * the association, which exists either way, and `store.claimSessionForWorkItem`
   * returns the identical row both times. Splitting the status on whether the INSERT
   * happened would put "did this write?" into the contract — the exact
   * exclusion-versus-report conflation the `SELECT`-derived acknowledgement exists to
   * keep out — and would make a caller's retry look like a failure.
   *
   * **No unclaim counterpart.** KTD-D5's table shape permits one; its authorization is
   * unspecified, so it is not built here.
   */
  api.post(
    "/work-items/:workItemId/sessions",
    command(
      claimSessionSchema,
      ["workItemId"],
      (body, params) =>
        store.claimSessionForWorkItem(params.workItemId, body.nodeId, body.sessionId),
    ),
  );

  // --- Work packets -------------------------------------------------------

  /**
   * Create a packet.
   *
   * **`workItemId` is not in `createPacketSchema`, and its absence is the contract**
   * (ADR-017 §3, KTD-D4). A plain `z.object` strips an unknown key, so a body
   * carrying one parses to a body that does not, and `store.createPacket` never
   * names the column. Binding is the operator-only PATCH above; if it were reachable
   * here, an agent key — which may legitimately create packets — could mint a packet
   * already parented to a WorkItem and become the scope authority for anything
   * reached through it.
   */
  api.post(
    "/packets",
    command(createPacketSchema, [], (body) =>
      store.createPacket({
        title: body.title,
        objective: body.objective,
        scope: body.scope,
        constraints: body.constraints,
        repository: body.repository ?? null,
        branch: body.branch ?? null,
        policyScope: body.policyScope,
      })),
  );

  api.post(
    "/packets/:packetId/runs",
    command(
      registerRunSchema,
      ["packetId"],
      (body, params) =>
        store.registerRun({
          packetId: params.packetId,
          agentType: body.agentType,
          host: body.host,
          nodeId: body.nodeId ?? null,
          workingDir: body.workingDir ?? null,
          repository: body.repository ?? null,
          branch: body.branch ?? null,
        }),
    ),
  );

  api.post(
    "/runs/:runId/checkpoints",
    command(
      checkpointSchema,
      ["runId"],
      (body, params) =>
        store.recordCheckpoint({
          runId: params.runId,
          completedWork: body.completedWork,
          currentState: body.currentState,
          blockers: body.blockers ?? null,
          nextAction: body.nextAction ?? null,
          repoCommit: body.repoCommit ?? null,
        }),
    ),
  );

  api.post(
    "/runs/:runId/end",
    command(
      endRunSchema,
      ["runId"],
      (body, params) => store.endRun(params.runId, body.status),
      200,
    ),
  );

  // --- Operational decisions ---------------------------------------------

  api.post(
    "/packets/:packetId/decisions",
    command(
      decisionSchema,
      ["packetId"],
      (body, params) =>
        store.recordDecision({
          packetId: params.packetId,
          runId: body.runId ?? null,
          question: body.question,
          rationale: body.rationale ?? null,
          blocking: body.blocking,
        }),
    ),
  );

  /**
   * Resolve a decision. Deliberately calls `store.resolveDecision` and NOT
   * `service.resolveAndPromoteDecision`.
   *
   * Promotion into the memory domain is optional, non-authoritative, and — for this
   * slice — not deployed at all: the whole point of ST-086 is a local operator loop
   * that runs with the memory workers and the model provider switched off. Wiring an
   * optional projection into the one route that must work offline would make the
   * offline claim depend on a port that is not there. Promotion belongs behind an
   * adapter the deployment supplies, which is a later concern.
   *
   * Same-answer retries return the stored record unchanged (200 either way); a
   * different answer is a 409. Both properties come from the store, not from here.
   */
  api.post(
    "/decisions/:decisionId/resolve",
    command(
      resolveSchema,
      ["decisionId"],
      (body, params) =>
        store.resolveDecision(params.decisionId, body.resolution),
      200,
    ),
  );

  // --- Verification contract ---------------------------------------------

  api.post(
    "/packets/:packetId/criteria",
    command(
      criterionSchema,
      ["packetId"],
      (body, params) =>
        store.addCriterion(
          params.packetId,
          body.description,
          body.required ?? true,
        ),
    ),
  );

  api.post(
    "/criteria/:criterionId/evidence",
    command(
      evidenceSchema,
      ["criterionId"],
      (body, params) =>
        store.attachEvidence({
          criterionId: params.criterionId,
          kind: body.kind,
          detail: body.detail,
          recordedCommit: body.recordedCommit ?? null,
        }),
    ),
  );

  /**
   * Complete a packet through the real gate.
   *
   * This route adds nothing of its own — no override flag, no force parameter, no
   * "skip optional" query string. It calls `store.completePacket`, which refuses while
   * any required criterion lacks evidence, and surfaces that refusal as 409 with the
   * unmet criteria named.
   */
  api.post(
    "/packets/:packetId/complete",
    command(
      z.object({}),
      ["packetId"],
      (_body, params) => store.completePacket(params.packetId),
      200,
    ),
  );

  // --- Read model ---------------------------------------------------------

  api.get(
    "/overview",
    withErrorMapping(async (c) => {
      return c.json(await buildOverview() as unknown as Json, 200);
    }),
  );

  api.get(
    "/packets/:packetId",
    withErrorMapping(async (c) => {
      const parsed = idSchema.safeParse(c.req.param("packetId"));
      if (!parsed.success) {
        return c.json({
          error: "BadRequest",
          message: "packetId must be a uuid",
        }, 400);
      }
      const view = await buildPacketView(parsed.data);
      if (view === null) {
        return c.json(
          {
            error: "WorkflowNotFoundError",
            message: `No such work packet: ${parsed.data}`,
            id: parsed.data,
          },
          404,
        );
      }
      return c.json(view as unknown as Json, 200);
    }),
  );

  // --- Work item reads (ST-097 B5) ----------------------------------------
  //
  // These three are READS, so they are deliberately NOT in `OPERATOR_ONLY_ROUTES`
  // — they match `/overview`'s existing posture, and an agent key must be able to
  // GET them. The read-authorization limit that comes with that posture is real and
  // is stated rather than implied: every authenticated caller of `/api/workflow`
  // already sees every active packet through `/overview`, because retrieval-time
  // scope enforcement was deferred to Stage 2. These routes inherit that and add no
  // object-level authorization of their own. Closing it is ST-082's job.
  //
  // What they add over `/overview`, which is the whole reason they exist: resolution
  // by an EXTERNAL reference with no uuid in hand, and reach into COMPLETE packets,
  // which `buildOverview`'s active-only packet lane excludes.

  /**
   * Every WorkItem, under the projection ADR-017 §6 settles.
   *
   * Wrapped in `{ workItems: [...] }` rather than returned as a bare array: a
   * top-level JSON array is awkward to extend without breaking every consumer, and
   * this is the one surface the CLI and the web UI both read.
   */
  api.get(
    "/work-items",
    withErrorMapping(async (c) => {
      return c.json({ workItems: await buildWorkItemOverview() } as unknown as Json, 200);
    }),
  );

  /**
   * Resolve a WorkItem by its provenance pair — `ST-097`, `PROJ-1234`, `#57`.
   *
   * **Registered BEFORE `/work-items/:workItemId`, and the order is load-bearing.**
   * `by-ref` is a literal segment sitting where a uuid parameter also matches; if the
   * parameter route won, `by-ref` would be parsed as an id, fail the uuid check, and
   * answer 400 — a route that exists and is unreachable.
   *
   * A miss is a 404 whose body carries `id: null`, matching `toHttpError`'s
   * foreign-key branch: every `WorkflowNotFoundError`-discriminated body keeps the
   * same key set, so a consumer trusting the discriminator to imply a shape does not
   * break on the one branch that has no id to name.
   */
  api.get(
    "/work-items/by-ref",
    withErrorMapping(async (c) => {
      const parsed = byRefQuerySchema.safeParse({
        source: c.req.query("source"),
        ref: c.req.query("ref"),
      });
      if (!parsed.success) {
        return c.json({
          error: "BadRequest",
          message: "source and ref must name a provenance pair from ADR-017 §2's closed set",
          issues: normalizeZodIssues(parsed.error.issues),
        }, 400);
      }

      const view = await buildWorkItemViewByProvenance(parsed.data.source, parsed.data.ref);
      if (view === null) {
        return c.json({
          error: "WorkflowNotFoundError",
          message: `No work item with provenance ${parsed.data.source}/${parsed.data.ref}`,
          id: null,
        }, 404);
      }
      return c.json(view as unknown as Json, 200);
    }),
  );

  api.get(
    "/work-items/:workItemId",
    withErrorMapping(async (c) => {
      const parsed = idSchema.safeParse(c.req.param("workItemId"));
      if (!parsed.success) {
        return c.json({
          error: "BadRequest",
          message: "workItemId must be a uuid",
        }, 400);
      }
      const view = await buildWorkItemView(parsed.data);
      if (view === null) {
        return c.json(
          {
            error: "WorkflowNotFoundError",
            message: `No such work item: ${parsed.data}`,
            id: parsed.data,
          },
          404,
        );
      }
      return c.json(view as unknown as Json, 200);
    }),
  );

  return api;
}
