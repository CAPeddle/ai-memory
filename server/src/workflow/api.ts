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
import { z } from "npm:zod@4.1.13";

import { buildOverview, buildPacketView } from "./readModel.ts";
import * as store from "./store.ts";
import {
  CompletionBlockedError,
  CriteriaFrozenError,
  DecisionConflictError,
  POLICY_SCOPES,
  WorkflowNotFoundError,
} from "./types.ts";

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
const policyScopeSchema = z.enum(POLICY_SCOPES as unknown as [string, ...string[]]);

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
    return { status: 404, body: { error: err.name, message: err.message, id: err.id } };
  }
  if (err instanceof CompletionBlockedError) {
    return {
      status: 409,
      body: { error: err.name, message: err.message, unmetCriteria: err.unmetCriteria },
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

  const state = sqlState(err);
  if (state === FK_VIOLATION) {
    return {
      status: 404,
      body: {
        error: "WorkflowNotFoundError",
        message: "a referenced work packet, agent run or verification criterion does not exist",
      },
    };
  }
  if (state === INVALID_TEXT_REPRESENTATION) {
    return { status: 400, body: { error: "BadRequest", message: "malformed identifier" } };
  }

  return {
    status: 500,
    body: { error: "InternalError", message: (err as Error)?.message ?? "unknown failure" },
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

/** Parse a JSON body, treating an absent or unparseable body as an empty object. */
async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (text.trim() === "") return {};
    return JSON.parse(text);
  } catch {
    return Symbol.for("unparseable");
  }
}

export function createWorkflowApi(): Hono {
  const api = new Hono();

  /**
   * One handler shape for every route: validate the path id, validate the body, run
   * the command, map failures. Centralised so no individual route can quietly grow a
   * different error-mapping policy — the drift that ends with one endpoint answering
   * 200 for a failure another answers 409 for.
   */
  const command = <T>(
    schema: z.ZodType<T>,
    paramNames: string[],
    run: (body: T, params: Record<string, string>) => Promise<unknown>,
    successStatus: 200 | 201 = 201,
    // deno-lint-ignore no-explicit-any
  ) =>
  // deno-lint-ignore no-explicit-any
  async (c: any) => {
    const params: Record<string, string> = {};
    for (const name of paramNames) {
      const raw = c.req.param(name);
      const parsed = idSchema.safeParse(raw);
      if (!parsed.success) {
        return c.json(
          { error: "BadRequest", message: `${name} must be a uuid`, received: raw },
          400,
        );
      }
      params[name] = parsed.data;
    }

    const raw = await readJson(c.req.raw);
    if (typeof raw === "symbol") {
      return c.json({ error: "BadRequest", message: "body is not valid JSON" }, 400);
    }
    const body = schema.safeParse(raw);
    if (!body.success) {
      return c.json(
        {
          error: "BadRequest",
          message: "request body failed validation",
          issues: body.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
    }

    try {
      const result = await run(body.data, params);
      return c.json(result as Json, successStatus);
    } catch (err) {
      const mapped = toHttpError(err);
      return c.json(mapped.body, mapped.status);
    }
  };

  // --- Work packets -------------------------------------------------------

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
        // Narrowed by `policyScopeSchema`, which is built from POLICY_SCOPES itself.
        policyScope: body.policyScope as (typeof POLICY_SCOPES)[number],
      })),
  );

  api.post(
    "/packets/:packetId/runs",
    command(registerRunSchema, ["packetId"], (body, params) =>
      store.registerRun({
        packetId: params.packetId,
        agentType: body.agentType,
        host: body.host,
        nodeId: body.nodeId ?? null,
        workingDir: body.workingDir ?? null,
        repository: body.repository ?? null,
        branch: body.branch ?? null,
      })),
  );

  api.post(
    "/runs/:runId/checkpoints",
    command(checkpointSchema, ["runId"], (body, params) =>
      store.recordCheckpoint({
        runId: params.runId,
        completedWork: body.completedWork,
        currentState: body.currentState,
        blockers: body.blockers ?? null,
        nextAction: body.nextAction ?? null,
        repoCommit: body.repoCommit ?? null,
      })),
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
    command(decisionSchema, ["packetId"], (body, params) =>
      store.recordDecision({
        packetId: params.packetId,
        runId: body.runId ?? null,
        question: body.question,
        rationale: body.rationale ?? null,
        blocking: body.blocking,
      })),
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
      (body, params) => store.resolveDecision(params.decisionId, body.resolution),
      200,
    ),
  );

  // --- Verification contract ---------------------------------------------

  api.post(
    "/packets/:packetId/criteria",
    command(criterionSchema, ["packetId"], (body, params) =>
      store.addCriterion(params.packetId, body.description, body.required ?? true)),
  );

  api.post(
    "/criteria/:criterionId/evidence",
    command(evidenceSchema, ["criterionId"], (body, params) =>
      store.attachEvidence({
        criterionId: params.criterionId,
        kind: body.kind,
        detail: body.detail,
        recordedCommit: body.recordedCommit ?? null,
      })),
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
    command(z.object({}), ["packetId"], (_body, params) => store.completePacket(params.packetId), 200),
  );

  // --- Read model ---------------------------------------------------------

  api.get("/overview", async (c) => {
    try {
      return c.json(await buildOverview() as unknown as Json, 200);
    } catch (err) {
      const mapped = toHttpError(err);
      return c.json(mapped.body, mapped.status);
    }
  });

  api.get("/packets/:packetId", async (c) => {
    const parsed = idSchema.safeParse(c.req.param("packetId"));
    if (!parsed.success) {
      return c.json({ error: "BadRequest", message: "packetId must be a uuid" }, 400);
    }
    try {
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
    } catch (err) {
      const mapped = toHttpError(err);
      return c.json(mapped.body, mapped.status);
    }
  });

  return api;
}
