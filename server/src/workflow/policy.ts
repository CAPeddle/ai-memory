/**
 * Route classification for the operator/agent credential split (ST-086 follow-up).
 *
 * **Why this exists as its own file.** `server/scripts/awcp.ts` and
 * `docs/workflow-mvp.md` used to claim that simply omitting resolve-decision,
 * attach-evidence and complete-packet from the CLI "is what stops an agent signing
 * off its own verification." That was false: every `/api/workflow/*` route sat
 * behind one shared `MEMORY_API_KEY`, and any caller holding it — including an
 * agent, which the docs told to export that very key — could `curl` the routes the
 * CLI chose not to expose. The separation was a property of the CLI's surface, not
 * of the system. This module is the server-side fix: a route either requires the
 * operator credential or it does not, and that fact is checked by the server, not
 * merely implied by which subcommands a particular client happens to ship.
 *
 * **Why this is a pure function in its own file, not a method on the workflow API
 * router or a check inside index.ts.** `server/tests/workflow-boundary.test.ts`
 * enforces an import allowlist on every file under `server/src/workflow/`: only
 * `../db.ts`, `../logging.ts`, `./*`, or a package specifier. `../auth.ts` is
 * deliberately NOT on that list — the workflow product must not carry an opinion
 * about how a given deployment authenticates a caller. So the boundary between
 * "which routes are operator-only" (a fact about the workflow product's own
 * semantics — resolving decisions, completing packets, authoring the verification
 * contract are supervision; reporting progress is not) and "how a credential is
 * validated and what status code a mismatch gets" (a fact about THIS deployment's
 * auth mechanism) is drawn at the file boundary: this module answers the first
 * question and imports nothing beyond `./*`; the composition root
 * (`server/index.ts`) owns the second and calls this module's answer.
 *
 * Route classification is deliberately expressed against the path AS MOUNTED
 * (`/api/workflow/...`), because that is what the composition root's middleware
 * actually sees on `c.req.path` — matching against the router's un-mounted relative
 * paths (`/packets`, `/decisions/:id/resolve`, as declared in `api.ts`) would be
 * matching against a string the request never carries.
 */

/** Matches a single non-empty path segment — a packet/run/decision/criterion id. */
const ID = "[^/]+";

interface RoutePattern {
  method: string;
  regex: RegExp;
}

/**
 * Routes that require the OPERATOR credential. An agent key must be refused (403)
 * on every one of these, even though it authenticates fine elsewhere under
 * `/api/workflow`.
 *
 * - `POST /decisions/:decisionId/resolve` — resolving a decision is the operator
 *   adjudicating something the agent raised; letting the agent resolve its own
 *   blocking questions defeats the point of raising them.
 * - `POST /criteria/:criterionId/evidence` — attaching evidence is the operator
 *   accepting that a criterion is satisfied.
 * - `POST /packets/:packetId/complete` — completing a packet is the sign-off
 *   itself; this is the exact route the PO's decision exists to protect.
 * - `POST /packets/:packetId/criteria` — criteria define the verification
 *   contract the agent will be judged against. Authoring the contract you will be
 *   judged against is supervision, not reporting, for the same reason a student
 *   does not write their own exam questions: an agent that could add or omit its
 *   own criteria could shape what "done" means for its own work, which is the same
 *   self-certification hole `/complete` closes, one step earlier in the process.
 *   It sits on the operator side even though — unlike the other three — it is not
 *   literally an act of signing off.
 */
const OPERATOR_ONLY_ROUTES: RoutePattern[] = [
  { method: "POST", regex: new RegExp(`^/api/workflow/decisions/${ID}/resolve$`) },
  { method: "POST", regex: new RegExp(`^/api/workflow/criteria/${ID}/evidence$`) },
  { method: "POST", regex: new RegExp(`^/api/workflow/packets/${ID}/complete$`) },
  { method: "POST", regex: new RegExp(`^/api/workflow/packets/${ID}/criteria$`) },
];

/**
 * True when `method`+`path` names one of the four operator-only routes above.
 *
 * Every other `/api/workflow` route — including all seven reporting/read routes
 * (`POST /packets`, `POST /packets/:packetId/runs`, `POST /runs/:runId/checkpoints`,
 * `POST /runs/:runId/end`, `POST /packets/:packetId/decisions`, `GET /overview`,
 * `GET /packets/:packetId`) — returns `false`, so either credential may call it.
 *
 * This function makes no authentication decision of its own: it does not know
 * whether the caller presented a valid key, an agent key, or no key at all. It only
 * answers "does this route require the stronger credential" — the composition root
 * combines that with the credential the caller actually presented.
 */
export function requiresOperator(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return OPERATOR_ONLY_ROUTES.some(
    (route) => route.method === normalizedMethod && route.regex.test(path),
  );
}
