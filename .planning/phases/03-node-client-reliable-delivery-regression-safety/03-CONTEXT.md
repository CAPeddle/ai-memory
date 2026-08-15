# Phase 3: Node Client, Reliable Delivery & Regression Safety - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

<domain>
## Phase Boundary

A zero-dependency Node.js client running on the Ubuntu execution node (z2) spools execution
events locally, replays them oldest-first, and delivers them to the already-shipped hub exactly
once — across disconnection, duplicate delivery, and authentication failure — while every
existing MCP memory tool and workflow operation keeps passing its current tests unmodified.

**The hub half already exists.** Phase 2 shipped `server/src/workflow/remoteNodeHub.ts`, mounted
at `/workflow/nodes`. This phase builds the *client* against that fixed contract and runs
experiments 4–6 against it. It does not extend, redesign, or add endpoints to the hub.

Requirements covered: EVENT-01, EVENT-02, EVENT-03, EVENT-04, SAFE-01, SAFE-02.

</domain>

<decisions>
## Implementation Decisions

### Real-node test target

- **D-01:** The real-node leg points at the **dev hub on `:3000` as-is**. No compose changes.
  The verified reachability facts: z2 reaches `http://100.106.232.78:3000/health` over the
  tailnet and gets `{"status":"healthy"}`; `docker-compose.yml:54` publishes `3000:3000` on all
  interfaces, while `mcp-test` is `127.0.0.1:3001:3000` and therefore unreachable from z2.
  The node registers under its own `node_id`, so every row it writes is attributable.
  — **Reversibility:** reversible — nothing is published or migrated; repointing the client is a
  config change.

- **D-02:** **The SAFE-01/02 exposure is narrower than the loopback finding first suggested.**
  `execution_nodes` and `run_events` are new Phase 2 tables that no pre-existing test reads, so a
  real node writing into the dev database does not put the existing suite at risk. Do not treat
  "z2 writes to dev" as a blocking hazard; do treat it as a fact worth stating in the findings.

- **D-03:** After the experiments, **the node's rows stay in the dev database as evidence**. They
  *are* the criterion-6 proof the findings doc cites; deleting them destroys the artifact. The
  `node_id` keeps them attributable if they ever need removing.
  — **Reversibility:** reversible — scoped `DELETE ... WHERE node_id = ...` at any later point.

### Client shape

- **D-04:** The client is **`server/scripts/awcp-node-client.mjs`** — the `.mjs` extension, not
  `.js`. The repo contains **no `package.json` at any level**, so Node resolves a bare `.js` as
  CommonJS and the ESM client named in the plan would be a `SyntaxError` on z2. `.mjs` is
  unambiguous ESM regardless of any `package.json` added later, and costs no new files.
  — **Reversibility:** costly — `ROADMAP.md`'s Phase 3 **Delivery artifacts** line and the U3
  section of `docs/plans/2026-08-04-002-...-plan.md` both name `awcp-node-client.js`; both need a
  one-line correction, and any later doc that has copied the name needs the same.

- **D-05:** **Rejected: adding `server/scripts/package.json`.** It would preserve the `.js` name
  but introduces the repo's first `package.json`, changing what Node and npm tooling infer about
  a directory that is otherwise Deno-only.

- **D-06:** HTTP calls use **global `fetch`, with the Node 18 ExperimentalWarning suppressed**
  (`--no-warnings` or an equivalent process-level filter). z2 runs Node v18.19.1, where `fetch`
  works but prints an experimental notice to stderr on every run. Captured stderr is evidence in
  this phase, so the warning must not open every transcript in the findings doc.

- **D-07:** **Zero npm dependencies** stands (carried from STATE.md). Node built-ins only.

### Proof strategy

- **D-08:** Criteria 1–4 are proven **both ways, and the two are not interchangeable**: Deno tests
  are the **repeatable gate** that guards regressions; **one captured real z2 run** is the
  **criterion-6 evidence**. Deno-tests-only would leave criterion 6 UNPROVEN on exactly the point
  Stage 1 was honest about; a z2-run-only leaves no gate for future changes.

- **D-09:** The client-logic tests **run under Deno, importing the `.mjs` directly** via `node:`
  specifier support, driving the spool functions in-process. One runner, one command, and the new
  tests join the existing suite gate automatically. This requires a `--allow-write` grant for the
  spool path — see the note in `CLAUDE.md` about keeping that grant list an accurate inventory.

- **D-10:** Criterion 5 (SAFE-01/02) is proven by the **existing suite passing unmodified**. The
  documented baseline is 357 passed / 9 failed, the nine being the known provider-401 failures
  (`OpenRouter 401: Missing Authentication header`), not regressions.

### Enrolment and credentials

- **D-11:** z2 is enrolled by **setting `AWCP_NODE_ENROLMENT_SECRET`, enrolling once, then
  unsetting it**. This exercises the real Phase 2 enrolment path end-to-end — itself worth
  proving, since no real client has ever driven it — and leaves enrolment closed afterward. The
  variable is currently unset/empty in both `mcp` and `mcp-test`, which is why registration
  currently returns a quiet 401 by design.
  — **Reversibility:** reversible — an env var set and unset; no schema or contract change.

- **D-12:** **The client implements the enrolment handshake itself.** It sends the
  `X-Node-Enrolment-Secret` header when a secret is present in its own config and omits it
  otherwise, then persists the returned `node_id` locally. Rejected alternative: pre-seeding the
  `execution_nodes` row in SQL, which is faster but leaves the enrolment gate with no real caller.

- **D-13:** The raw bearer must never reach a column, a log line, or a response body, and no
  endpoint may return, mint, or recover one. This is a Phase 2 invariant the client must not
  undermine — in particular the client's own logging and any captured experiment transcript.

### Claude's Discretion

The user explicitly declined to pre-decide these; the researcher and planner choose, bounded by
the decisions above and by the hub contract:

- **Spool bounding specifics** — whether the cap is expressed in bytes or entries, its value, and
  where the drop counter is persisted. Constraint from ROADMAP success criterion 4: when capacity
  is exceeded the oldest event is dropped and a **visible** counter increments rather than
  silently filling disk. "Visible" needs a concrete meaning; pick one and make it assertable.
- **Heartbeat and checkpoint cadence**, and whether repo-rescan is in Phase 3 scope at all.
- **The client's config location and format** on z2 (the plan assumes a `~/.awcp/` directory
  alongside `spool.jsonl`).
- **Batching policy** — the hub accepts 1–500 events per request; how many the client sends per
  flush is unconstrained by this discussion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The hub contract this client is written against

- `server/src/workflow/remoteNodeHub.ts` — the fixed endpoint contract. `POST /register` →
  `201 {node_id}`; `POST /:node_id/events` → `200 {acknowledged: [...]}`. Bearer must match
  `^[0-9a-f]{64}$`. Per-event payload ceiling `MAX_PAYLOAD_BYTES = 16_384`; batch is 1–500 events.
  **Read the `normalizeBatch` docblock** — it states the contract the node must honour: never
  reuse a `client_seq` for different content, because within a batch the first occurrence wins and
  the later payload is silently discarded.
- `server/index.ts:1241-1257` — where the routes are mounted (`/workflow/nodes`, deliberately
  outside `/api/workflow/*` so the operator/agent middleware does not apply).
- `server/src/workflow/store.ts` — `ingestRunEvents`, `acknowledgeSeqs`, `nodeOwnsBearer`,
  `upsertExecutionNode`. The ack semantics the client's ack-before-drop rule depends on.

### Story and decision authority

- `docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md` §U3, §U4 —
  the unit contracts this phase implements. Note its U3 names `awcp-node-client.js`; **D-04
  supersedes that filename**.
- `docs/investigations/ST-084-awcp-host-spike-findings.md` — Stage 1 findings; **§12a first**, per
  STATE.md, before trusting any Stage 1 claim. Stage 2 findings append as a new §13.
- `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` §1 — the acceptance criteria.
  **Criterion 6 is what this phase discharges.** ADR-016 remains Proposed/Conditional until
  Phase 4.
- `.github/planning/story-board.md` — ST-088 entry; the 2026-08-15 header records the Phase 3
  preflight findings that produced D-01, D-04, and D-11.
- `.planning/STATE.md` — Blockers/Concerns records the same three constraints plus the resolved
  z2 reachability. **Reachability is already verified; do not re-probe it.**

### Project governance

- `CLAUDE.md` — the test command and its permission-grant inventory (which D-09 extends), the
  worktree/bind-mount hazard, the `Story: ST-088` trailer convention, and the squash-vs-merge rule.
- `docs/solutions/workflow-issues/verify-worktree-change-against-docker-test-stack.md` — confirm
  the bind mount before trusting any test run.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`server/tests/workflow-remote-node-hub.test.ts`** already exists (Phase 2) — the natural home
  for the new client-logic tests, or the sibling pattern for a new file.
- **`server/tests/_helpers/serverProcess.ts`** — spawns and manages a real server process; the
  established pattern if any test needs a live hub.
- **`server/scripts/awcp.ts`** — the only existing file in `server/scripts/`. It is Deno
  TypeScript, so the new `.mjs` is the first Node artifact in that directory; do not assume
  `awcp.ts`'s conventions transfer.
- **`server/tests/workflow-node-hub-e2e.test.ts`** — proves the mount and the 401 at the
  `/workflow/nodes` prefix over real HTTP.

### Established Patterns

- **Module boundary enforcement** (`workflow-boundary.test.ts`): only `store.ts` and `schema.ts`
  may import `../db.ts`. The boundary test **enumerates its directory**, so any new file under
  `server/src/workflow/` is auto-covered the moment it is created. A client under
  `server/scripts/` is outside that directory — confirm whether the boundary test's scope reaches
  it before assuming either way.
- **Test naming** is `descriptive-name.test.ts` in `server/tests/`; helpers are camelCase under
  `server/tests/_helpers/`.
- **Module-level constants** are `UPPER_SNAKE_CASE`; exported functions `camelCase`; no `Async`
  suffix (that is the .NET convention, not this stack's).

### Integration Points

- The client talks to the hub **only** over `POST /workflow/nodes/register` and
  `POST /workflow/nodes/:node_id/events`. It has no database access and no MCP surface.
- Nothing in `server/` imports the client — it is a leaf artifact that runs on a different
  machine. The only in-repo coupling is the Deno test that imports it (D-09).

</code_context>

<specifics>
## Specific Ideas

- **z2 is reachable via the `personal-server` SSH alias**, not a bare `ssh z2`. The alias in
  `~/.ssh/config` maps to Tailscale `100.65.192.115` with `IdentityFile ~/.ssh/id_ed25519_personal`;
  a bare `ssh z2` matches no alias, offers no key, and fails on publickey. This near-miss is what
  previously made the node look unreachable — record it wherever a future session might repeat it.
- z2 is Ubuntu `6.8.0-136-generic`, **Node v18.19.1, no Deno** — matching the plan's §7.1
  assumption. This box reaches the tailnet as `100.106.232.78`.
- The hub returns **401 for an unknown-but-unenrolled bearer**, deliberately identical to the 401
  for a wrong credential, so a prober cannot confirm which bearers the hub knows. The client must
  not try to distinguish those cases or report them differently.

</specifics>

<deferred>
## Deferred Ideas

- **Republishing `mcp-test` off loopback** — considered as a way to keep dev data pristine, and
  rejected for Phase 3 (D-01/D-02). If a later phase needs a real node against an ephemeral
  database, this is the change to revisit.
- **A dedicated throwaway compose stack** for remote-node experiments — maximum isolation, but a
  third stack to keep in sync with the other two. Not worth it for one experiment window.
- **`node --test` as a second test runner** — rejected in favour of Deno importing the `.mjs`
  (D-09). Revisit only if Deno's `node:` compatibility proves to be the thing under test rather
  than a transparent layer.
- Phase 4 items (`BLOCK-01`, `HOST-01`, `HOST-02`) stay out of scope: execution-blocking evidence
  and the final ADR-016 disposition are a separate phase.

</deferred>

---

*Phase: 3-Node Client, Reliable Delivery & Regression Safety*
*Context gathered: 2026-08-15*
