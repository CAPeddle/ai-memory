# Phase 3: Node Client, Reliable Delivery & Regression Safety - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning
**Revised:** 2026-08-15 after `ce-doc-review` (6 reviewers, 19 findings — see Open Questions for the 3 not applied)

<domain>
## Phase Boundary

A zero-dependency Node.js client running on the Ubuntu execution node (z2) spools execution
events locally, replays them oldest-first, and delivers them to the already-shipped hub exactly
once — across disconnection, duplicate delivery, and authentication failure — while every
existing MCP memory tool and workflow operation keeps passing its current tests unmodified.

**Heartbeat and checkpoint reporting are in scope**, alongside spool and replay. The canonical
plan defines criterion 6 as *"remote Ubuntu execution node (auth, heartbeat, checkpoint, spool,
replay, experiments 4–6)"* (`docs/plans/2026-08-04-002-...-plan.md:197`), so a client that spools
and replays but never heartbeats or checkpoints leaves criterion 6 partially undischarged and
hands Phase 4 a hole. Only their *cadence* is left open — see Claude's Discretion.

**The hub half already exists.** Phase 2 shipped `server/src/workflow/remoteNodeHub.ts`, mounted
at `/workflow/nodes`. This phase builds the *client* against that fixed contract and runs
experiments 4–6 against it. It does not extend, redesign, or add endpoints to the hub.

Requirements covered: EVENT-01, EVENT-02, EVENT-03, EVENT-04, SAFE-01, SAFE-02.

**Numbering caution:** *experiments* 4–6 (disconnection, duplicate delivery, invalid auth) and
ADR-016 *criterion* 6 are different numbering schemes that appear in the same sentences. They are
not related.

</domain>

<decisions>
## Implementation Decisions

### Real-node test target

- **D-01:** The real-node leg points at the **dev hub on `:3000`**, with one required change:
  **`FEATURE_WORKFLOW` must be enabled on the base `mcp` service.** The node routes mount only
  inside `if (workflowFeatureEnabled())` in `server/index.ts`, and that flag is set **only** by
  `docker-compose.workflow.yml`. Verified 2026-08-15 against the running stack:
  `POST /workflow/nodes/register` → **404**, `GET /health` → 200. The earlier preflight probed
  `/health`, which answers identically whether or not the workflow module is enabled, so the
  originally recorded "quiet 401" was **inferred, never observed** — the true current state is
  404, the endpoint does not exist.

  **Enable it on the base `mcp` service in `docker-compose.yml`, not via the
  `docker-compose.workflow.yml` overlay** — that overlay also sets `FEATURE_ENTITY_WORKER`,
  `FEATURE_CONSOLIDATION_WORKER`, `FEATURE_EMBEDDING_BACKFILL` and `MODEL_PROVIDER_ENABLED` to
  false, which would switch off half the memory subsystem and degrade precisely the co-tenancy
  ADR-016 criterion 6 is asking about.

  Reachability itself holds: z2 reaches `http://100.106.232.78:3000/health` over the tailnet.
  `docker-compose.yml:54` publishes `3000:3000` on all interfaces, while `mcp-test` is
  `127.0.0.1:3001:3000` and therefore unreachable from z2. The node registers under its own
  `node_id`, so every row it writes is attributable.

  **Plain `http://` is acceptable here only because the tailnet path is WireGuard-encrypted end
  to end.** Any repointing of the client must stay on the tailnet or move to TLS — the bearer and
  the enrolment secret cross this link.
  — **Reversibility:** reversible — repointing the client is a config change; the flag is one
  compose line plus a recreate.

- **D-02:** **A real node writing into the dev database does not put the existing suite at risk —
  but not for the reason originally recorded.** `server/tests/workflow-remote-node-hub.test.ts`
  *does* read both `execution_nodes` and `run_events`, throughout. What makes a foreign node's
  rows harmless is that **every one of those reads is scoped** by `node_id` or by
  `bearer_token_hash` (including the apparently-global count at `:570`, which carries
  `WHERE node_id = '00000000-...'`).

  **Constraint this places on Phase 3:** every new assertion over `execution_nodes` or
  `run_events` must carry the same scoping. An unscoped `SELECT count(*) FROM workflow.run_events`
  is nondeterministic the moment a live node is streaming into the same database.

- **D-03:** After the experiments, **the node's rows stay in the dev database**, and the `node_id`
  keeps them attributable if they ever need removing. **But the durable criterion-6 artifact is
  the §13 write-up, not the rows.** The §13 entry must embed the captured client transcript plus a
  committed SQL readback (`node_id`, `client_seq`, `event_type`, `received_at`), because rows in a
  local Docker volume do not survive a `docker compose down -v`, a machine change, or a database
  rebuild — and by then D-11 has closed the enrolment window, so reproducing the run means
  reopening it.

  **The rows are also destroyed by the suite this phase itself mandates.**
  `server/tests/workflow-mvp-e2e.test.ts:104` and `:601` both issue an unconditional
  `DROP SCHEMA IF EXISTS workflow CASCADE` against whatever `DATABASE_URL` resolves to — and
  CLAUDE.md documents a native inner loop (`./dev.sh`, `deno test … server/tests/…`) pointed at the
  shared dev Postgres. That drop deletes z2's `execution_nodes` row too, and because
  `upsertExecutionNode` returns null for an unknown bearer when enrolment is closed
  (`store.ts:704-716`), the node is **de-enrolled and locked out** behind the deliberately-opaque
  401 until an operator re-opens the window. Capture the evidence into §13 at experiment time, not
  afterwards.
  — **Reversibility:** reversible — scoped `DELETE ... WHERE node_id = ...` at any later point.

- **D-18:** **Experiment 4 simulates disconnection client-side on z2 only** — a dropped tailnet
  link or a deliberately misconfigured hub endpoint in the client's config. **Never** by stopping,
  restarting, or recreating the dev hub or its database: that is the same family of command that,
  with `-v`, erases the D-03 evidence and disrupts the maintainer's dev database. Client-side
  simulation costs nothing, touches no shared state, and produces the same spool-and-replay
  behaviour.

### Client shape

- **D-04:** The client is **`server/scripts/awcp-node-client.mjs`** — the `.mjs` extension, not
  `.js`. The repo contains **no `package.json` at any level**, so Node resolves a bare `.js` as
  CommonJS and the ESM client named in the plan would be a `SyntaxError` on z2. `.mjs` is
  unambiguous ESM regardless of any `package.json` added later, and costs no new files.
  — **Reversibility:** costly — the name is copied across documents. `ROADMAP.md`'s Phase 3
  **Delivery artifacts** line **has been corrected** to `.mjs`. The U3 section of
  `docs/plans/2026-08-04-002-...-plan.md` still names `.js` and is **deliberately left unedited**:
  it is Tier-1 decision authority, and this document's supersession note is the correction. Any
  later doc that copies the name needs the same treatment.

- **D-05:** **Rejected: adding `server/scripts/package.json`.** It would preserve the `.js` name
  but introduces the repo's first `package.json`, changing what Node and npm tooling infer about
  a directory that is otherwise Deno-only.

- **D-06:** HTTP calls use **global `fetch`, with the Node 18 ExperimentalWarning suppressed**
  (`--no-warnings` or an equivalent process-level filter). z2 runs Node v18.19.1, where `fetch`
  works but prints an experimental notice to stderr on every run. Captured stderr is evidence in
  this phase, so the warning must not open every transcript in the findings doc. Prefer the
  targeted filter over blanket `--no-warnings`, which would also silence genuine runtime warnings
  in the very stderr being captured as evidence.

- **D-07:** **Zero npm dependencies** stands (carried from STATE.md). Node built-ins only.

- **D-14:** **The client persists its `client_seq` counter in its own state file, separate from
  `spool.jsonl`, advanced monotonically on append and never derived from spool contents.**
  Deriving the next sequence number from the spool's last line resets it to zero every time the
  spool drains — which is the steady state after every successful flush, not an edge case. On the
  next event the client sends seq 1 with new content, the hub's `ON CONFLICT (node_id, client_seq)
  DO NOTHING` discards it, the acknowledgement reads back the row still holding the *old* content,
  and the client drops the entry believing it was delivered. **Every ROADMAP success criterion
  still passes in that failure mode**, so the phase could discharge "exactly once" on evidence
  that does not establish it. A Deno test must restart the client with a drained spool and assert
  the next allocated seq exceeds the highest previously delivered one.

- **D-15:** **Each flush is capped at 500 events, and a permanent rejection drops the offending
  entries rather than retrying them.** Ack-before-drop (D-03/criterion 3) is correct for the
  retryable 401 that experiment 6 exercises and **wrong for a permanent 400**. Without this rule
  experiment 4 livelocks and presents as a hub bug: a flush of everything spooled after a long
  outage exceeds the hub's `.max(500)` bound, the hub rejects the whole batch, nothing is acked,
  ack-before-drop forbids dropping, and the client retries forever. The same trap fires on a
  single event above `MAX_PAYLOAD_BYTES`, which `normalizeBatch` also converts into a 400 for the
  entire batch. On a 400 whose `issues` array names specific `client_seq` values, drop exactly
  those entries and increment the same visible counter criterion 4 defines.

- **D-17:** **The authentication-failure path must reach a stated terminal state** — stop
  attempting, keep the spool intact, surface the condition — rather than retrying indefinitely.
  A permanent 401 never clears the spool under ack-before-drop, so the naive implementation
  hammers a hub whose port is published on all interfaces while filling both the spool and the
  captured transcript. Backoff shape and ceiling are Claude's Discretion; the terminal state is not.

### Proof strategy

- **D-08:** Criteria 1–4 are proven **both ways, and the two are not interchangeable**: Deno tests
  are the **repeatable gate** that guards regressions; **one captured real z2 run** is the
  **criterion-6 evidence**. Deno-tests-only would leave criterion 6 UNPROVEN on exactly the point
  Stage 1 was honest about; a z2-run-only leaves no gate for future changes.

- **D-09:** The client-logic tests **run under Deno, importing the `.mjs` directly** via `node:`
  specifier support, driving the spool functions in-process. One runner, one command, and the new
  tests join the existing suite gate automatically. **Verified feasible** during review: a Node
  `.mjs` importing `node:fs`/`path`/`os`/`crypto`/`process` imports cleanly into a Deno test under
  Deno 2.0.0 with this repo's `strict` + `frozen` settings.

  Two constraints this places on the client: it must carry an **explicit entry-point guard**
  (`import.meta.url === file://${process.argv[1]}`) so importing it does not start a real network
  flush; and its **spool path must be injectable**, so the test can point it at `/tmp` and stay
  inside CLAUDE.md's existing `--allow-write=/tmp` grant rather than widening it.

- **D-10:** Criterion 5 (SAFE-01/02) is proven by the **existing suite passing unmodified** —
  compared **by test identity, not by count**. Record the file and test name of each of the nine
  known provider-401 failures (`OpenRouter 401: Missing Authentication header`) and compare
  name-for-name over the **pre-Phase-3 test files only**. A count comparison (`357 passed / 9
  failed`) hides a real regression whenever one break coincides with one flaky-test recovery, and
  D-09's new tests join the same suite, so the total will not be 357 on the next run anyway.

- **D-16:** **Node bearer provenance and at-rest protection.** z2's 64-lowercase-hex bearer is
  generated out of band with `openssl rand -hex 32` (the command `docker-compose.yml:44` already
  documents for the enrolment secret) and supplied to the client through a dedicated environment
  variable — proposed name `AWCP_NODE_BEARER`, which does not yet exist anywhere in the repo —
  **not** through a config file. The client creates `~/.awcp/` with mode `0700` and writes the
  persisted `node_id` file with mode `0600`. Phase 2 deliberately left this to Phase 3
  (`02-02-SUMMARY.md`: *"the env var belongs to the Phase-3 node"*), and the hub's entire per-node
  identity model — including its cross-node injection guard — rests on that bearer being
  unguessable and unshared.

### Enrolment and credentials

- **D-11:** z2 is enrolled by **opening the enrolment window, registering once, then closing it**,
  which exercises the real Phase 2 enrolment path end-to-end — itself worth proving, since no real
  client has ever driven it.

  **The mechanism is not "export a variable".** The hub reads the value from a container
  environment fixed at creation (`docker-compose.yml:45` interpolates
  `${AWCP_NODE_ENROLMENT_SECRET:-}`), so:

  1. **Confirm which process is serving `:3000`** — the containerized `mcp` or a native `./dev.sh`.
     `Deno.serve({ port: PORT })` binds `0.0.0.0` and `dev.sh` serves the same port from
     `.env.dev`, so a healthy `curl` from z2 does **not** distinguish them.
  2. Set `AWCP_NODE_ENROLMENT_SECRET` (generated with `openssl rand -hex 32`) in the **matching**
     env file — `.env` for the container, `.env.dev` for native. The variable is currently absent
     from `.env`, present only in `.env.example:27`.
  3. **Recreate the process** — `docker compose up -d mcp` — so the value is actually read.
  4. Register once.
  5. Clear the value and **recreate again**.
  6. **Prove closure:** attempt one further registration with a fresh unknown 64-hex bearer while
     still presenting the old secret. The resulting 401 is the closed-enrolment proof; record it
     in the findings doc alongside the criterion-6 evidence.

  **Every failure in this sequence looks identical.** The hub answers the same deliberately-opaque
  401 for a wrong bearer, an unenrolled bearer, and a secret the process never received — so a
  missed recreate is undiagnosable from the response. **Verify the value inside the running
  process, never infer it from the response.**
  — **Reversibility:** reversible — an env var and two container recreates; no schema or contract
  change.

- **D-12:** **The client implements the enrolment handshake itself**, and the secret does not
  outlive it. It reads the enrolment secret from an **environment variable supplied only for the
  one enrolling invocation**, never writes it into the persisted `~/.awcp/` config, and after the
  first registration returns a `node_id` it persists **only that `node_id`**. So the secret exists
  on z2 for the duration of a single process and nowhere afterward — otherwise D-11's hub-side
  closure is one-sided, and anyone who later reads z2's config recovers exactly the credential the
  closure was meant to retire. Rejected alternative: pre-seeding the `execution_nodes` row in SQL,
  which is faster but leaves the enrolment gate with no real caller.

- **D-13:** **Neither the raw bearer nor the enrolment secret** may reach a column, a log line, a
  response body, or a **captured transcript**, and no endpoint may return, mint, or recover one.
  This extends the Phase 2 invariant to the credential the client itself sends: D-12 makes the
  client the sender of the `X-Node-Enrolment-Secret` header, and the single registration most
  worth capturing is the only one carrying it — so an unredacted transcript quoted into §13
  publishes the operator's secret into git history. Any registration transcript quoted into the
  findings doc must have the header value replaced with a redaction placeholder before commit.

  **This invariant gets the same repeatable gate as the others:** D-09's test set includes an
  assertion that captures the client's stdout and stderr across a register-flush-retry cycle and
  asserts neither credential string appears in the output. Without it, D-13 is the only decision
  in this document asserted and unchecked — and it would be discovered after publication.

### Claude's Discretion

The user explicitly declined to pre-decide these; the researcher and planner choose, bounded by
the decisions above and by the hub contract:

- **Spool bounding specifics** — whether the cap is expressed in bytes or entries, its value, and
  where the drop counter is persisted. Constraint from ROADMAP success criterion 4: when capacity
  is exceeded the oldest event is dropped and a **visible** counter increments rather than
  silently filling disk. "Visible" needs a concrete meaning; pick one and make it assertable.
  **The spool location is not open** — criterion 2 fixes it at `~/.awcp/spool.jsonl`.
- **Heartbeat and checkpoint cadence.** Their *inclusion* is settled (see Phase Boundary); only
  how often they fire is open. **Whether repo-rescan is in Phase 3 scope at all** remains open —
  the canonical plan lists it under U3, so Phase 4 must record criterion 6 against that definition.
- **The client's config file location and format** on z2. The *spool* path is fixed (above), and
  per D-16 the bearer and enrolment secret do not live in this file at all.
- **Batching policy** — how many events the client sends per flush, bounded by D-15's 500-event cap.
- **Retry policy** — backoff shape and ceiling, bounded by D-17's required terminal state.

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
- `server/index.ts` — the mount sits inside `if (workflowFeatureEnabled())`; see D-01.
- `server/src/workflow/store.ts` — `ingestRunEvents`, `acknowledgeSeqs`, `nodeOwnsBearer`,
  `upsertExecutionNode`. **Check the element shape of `acknowledged` before matching against it:**
  `acknowledgeSeqs` returns `{client_seq, event_id}` objects with `client_seq` coerced to a number.
  A client comparing spool entries against the raw array without unwrapping `client_seq` would
  never clear an entry.

### Story and decision authority

- `docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md` §U3, §U4 —
  the unit contracts this phase implements; line 197 carries criterion 6's full definition. Note
  its U3 names `awcp-node-client.js`; **D-04 supersedes that filename**.
- `docs/investigations/ST-084-awcp-host-spike-findings.md` — Stage 1 findings; **§12a first**, per
  STATE.md, before trusting any Stage 1 claim. Stage 2 findings append as a new §13.
- `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` §1 — the acceptance criteria.
  **Criterion 6 is what this phase discharges.** ADR-016 remains Proposed/Conditional until
  Phase 4.
- `.github/planning/story-board.md` — ST-088 entry.
- `.planning/STATE.md` — Blockers/Concerns. **Do not re-litigate the reachability investigation or
  record UNPROVEN on reachability grounds** — but **do** run `curl http://100.106.232.78:3000/health`
  from z2 as the first step of the real-node leg, matching the canonical plan's U3 risk mitigation
  (`:186`). Reachability was verified 2026-08-15 with no stated expiry; if the tailnet link, the
  SSH alias, or the process on `:3000` has changed by execution time, the failure would otherwise
  surface as ambiguous client behaviour instead of an obvious unreachable host.

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
  for the new client-logic tests, or the sibling pattern for a new file. Its scoping discipline is
  the pattern D-02 requires new assertions to follow.
- **`server/tests/_helpers/serverProcess.ts`** — spawns and manages a real server process; the
  established pattern if any test needs a live hub.
- **`server/scripts/awcp.ts`** — the only existing file in `server/scripts/`. It is Deno
  TypeScript, so the new `.mjs` is the first Node artifact in that directory; do not assume
  `awcp.ts`'s conventions transfer.
- **`server/tests/workflow-node-hub-e2e.test.ts`** — proves the mount and the 401 at the
  `/workflow/nodes` prefix over real HTTP. It supplies its own `AWCP_NODE_ENROLMENT_SECRET` when
  spawning, so it is unaffected by D-11's window.

### Established Patterns

- **Module boundary enforcement** (`workflow-boundary.test.ts`): only `store.ts` and `schema.ts`
  may import `../db.ts`. The boundary test **enumerates `server/src/workflow/`**, so any new file
  there is auto-covered the moment it is created. **The client is not covered** — it lives in
  `server/scripts/`, outside that directory. This is checked, not assumed: do not expect the
  boundary test to constrain the client, and do not add it to that test's scope, since the client
  has no database access to constrain in the first place.
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
- **No per-node revocation exists.** `store.ts:677-679` warns that a shared static secret has no
  per-node revocation and `status` has no `revoked` value — deleting a node's row lets the same
  secret re-enrol it. Adequate for one operator-provisioned node with the window closed; it
  becomes a real gap the moment a second node is added.

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

## Deferred / Open Questions

### From 2026-08-15 review

Three findings from `ce-doc-review` were surfaced rather than applied, because each adds a work
obligation the discuss-phase interview never put to the user. The planner should resolve them.

1. **Nothing in this phase observes memory tools and a live node on the same stack.**
   (product-lens, P1) Criterion 6 asks whether the topology works *against this host* — a
   co-tenancy claim — yet regression evidence comes from the test stack while the only real node
   writes to the dev stack. The phase can ship every criterion green and leave co-tenancy
   untested, and Phase 4 must then reconcile its host recommendation without any observation of
   the memory MCP under a real node's traffic. *Proposed:* immediately after the captured z2 run,
   exercise an authenticated `search_thoughts` and `capture_thought` against the same stack the
   node streamed into, and record the result in §13 as the co-tenancy observation.

2. **Duplicate-suppression (EVENT-01) is a hub-side property that in-process spool tests cannot
   prove.** (scope-guardian, P1) D-09 describes the gate as "driving the spool functions
   in-process", which fits EVENT-02/03/04 but not EVENT-01 — that one requires a network
   round-trip against a hub. As described, the repeatable gate would not catch a regression in
   server-side dedup, defeating D-08's own stated purpose. *Proposed:* add a hub-interaction Deno
   test using the `serverProcess.ts` pattern that submits the same `(node_id, client_seq)` twice
   and asserts one ack and no duplicate row.

3. **Host-fit friction discovered here is never routed to criterion 7.** (product-lens, P2)
   Phase 4 must answer whether inheriting this codebase costs less than it saves, and D-04/D-05
   already record a concrete inheritance cost — no `package.json` anywhere, so the first Node
   artifact must be `.mjs`, and the obvious remedy would change what npm tooling infers about a
   Deno-only tree. Because Phase 3 routes nothing into §13 beyond experiment results, that
   assessment gets written from recall. *Proposed:* record host-fit friction observed while
   building the client — the `.mjs` resolution, the first Node artifact in a Deno-only tree, the
   D-09 permission-grant expansion — in §13 as criterion-7 input.

**Also surfaced, not blocking** (FYI tier, no decision forced): no proportionality principle tells
the planner how durable this spike-grade client needs to be; D-03's permanent retention has no
matching decision about what the event payloads may contain (synthetic payloads would settle it).

---

*Phase: 3-Node Client, Reliable Delivery & Regression Safety*
*Context gathered: 2026-08-15 · Revised after review 2026-08-15*
