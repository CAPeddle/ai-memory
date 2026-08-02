# Workflow Operations — local MVP (ST-086)

Run one supervised WorkPacket end to end on your own machine, with **no model-provider
access**: report a real development session, supervise it in a browser, satisfy its
verification criteria, and complete it.

Workflow Operations is a separate operational domain from the memory domain. Nothing
here is a thought, shard or graph entity — see [CONCEPTS.md](../CONCEPTS.md).

## Start it

```bash
docker compose -f docker-compose.yml -f docker-compose.workflow.yml up -d --wait
```

That is the whole clean-checkout command. The overlay sets `FEATURE_WORKFLOW=true`,
turns off every provider-dependent capability, and **clears** `OPENROUTER_API_KEY`
rather than blanking it — startup validation only demands a provider credential when an
enabled capability actually needs one.

Requires **Docker Compose v2.24+** for the `!reset` directive (verified on v5.3.1). On
an older Compose, change that one line in `docker-compose.workflow.yml` to
`OPENROUTER_API_KEY: ""`; the stack still starts, because with all three capabilities
off the credential is never demanded. That is a weaker demonstration — a present but
empty variable rather than an absent one — not a broken configuration.

Check it came up, and that the provider really is off:

```bash
curl -s localhost:3000/ready | jq '.checks.workflow, .checks.embedding_api'
# { "status": "ok", "applied": [...], "skipped": [...] }
# { "status": "n/a", "reason": "model provider disabled" }
```

The workflow migrations in `server/db/workflow/` are applied by the composition root at
boot. The module reports the outcome; `index.ts` decides that a failure means the
process exits — because `FEATURE_WORKFLOW=true` is an operator explicitly asking for
this product, and serving a server whose workflow routes all fail answers a request
nobody made.

To go back to normal memory-domain operation, drop the overlay: `docker compose up -d`.

## Report a session from the CLI

`server/scripts/awcp.ts` talks to the HTTP API — it has no database credential and no
SQL. It runs `git`, and only `git`, with fixed argument arrays; the `--allow-run=git`
grant is the evidence, checkable without reading the source.

```bash
export AWCP_AGENT_API_KEY=...        # preferred if the deployment issued one — see below
export MEMORY_API_KEY=...            # used when AWCP_AGENT_API_KEY is unset
export AWCP_BASE_URL=http://localhost:3000

DENO="deno run --allow-net --allow-env --allow-sys=hostname --allow-run=git server/scripts/awcp.ts"

# 1. A packet. --policy-scope has no default: it is a boundary value and must be stated.
$DENO packet --title "ST-086 local slice" \
             --objective "Operate one WorkPacket end to end with no provider access" \
             --policy-scope personal
# -> packet <PACKET_ID>   (repository and branch are read from this checkout)

# 2. A local run.
$DENO run --packet <PACKET_ID>
# -> run <RUN_ID>

# 3. A commit-bearing checkpoint. --commit defaults to `git rev-parse HEAD`.
$DENO checkpoint --run <RUN_ID> \
                 --completed "composition-root seam, typed API, dashboard" \
                 --state "process-boundary test green" \
                 --next "story-board update"

# 4. A decision for the operator. Blocking by default; --advisory to opt out.
$DENO decision --packet <PACKET_ID> \
               --question "Fail startup on a workflow migration failure?"

# 5. End the run.
$DENO end-run --run <RUN_ID>
```

Resolving decisions, attaching evidence, authoring criteria and completing a packet are
deliberately **not** in the CLI. They are supervision actions belonging to the operator
at the dashboard, not to the agent-side reporter.

That separation is enforced **by the server**, not by the CLI's choice of subcommands.
Every `/api/workflow` route used to sit behind the single `MEMORY_API_KEY`, and this
guide told an agent to export that exact variable to use `awcp` at all — so any caller
holding it could reach `resolve`/`evidence`/`criteria`/`complete` directly over HTTP,
CLI or no CLI. The server now accepts a second, optional credential,
`AWCP_AGENT_API_KEY`, and refuses it on those four routes with **403**, regardless of
which client sends the request. See [The API](#the-api) below for the full split.

## Supervise it

Open **<http://localhost:3000/workflow>**.

The page asks for the API key once and keeps it in `sessionStorage` for the tab. The
shell is unauthenticated and carries no operational content; every byte it renders comes
from `/api/workflow`, which requires `Authorization: Bearer <MEMORY_API_KEY>`.

It shows active packets with their repository, branch and policy scope; runs; attention
grouped by reason; unresolved and recently resolved decisions; recent checkpoints; and
criteria with their evidence. Three actions: **resolve a decision**, **attach manual
evidence**, **complete a packet**. There is no status control — completion goes through
the gate like every other caller.

> **Coverage limit, stated rather than implied.** There is no browser in the test
> container, so the page's *rendering* is not proven by automation. What is proven: the
> page is served, it contains every required section and all three action affordances,
> each targets an endpoint the process-boundary test exercises, and it offers no
> status-editing control. Confirm the visual result by opening it once.

Completion is refused while any *required* criterion lacks evidence, and the refusal
names the unmet criteria. Add a criterion, try to complete, attach evidence, complete
again — the loop the gate exists for.

## The API

Eleven named commands under `/api/workflow`, all bearer-authenticated. There is no
generic row mutation, no SQL passthrough, no shell execution and no packet-status
setter.

**Two credentials, two different reaches.**

- **`MEMORY_API_KEY`** — the operator key. Unconditional and unchanged: every existing
  deployment keeps working with no config change, and it may call every route below.
- **`AWCP_AGENT_API_KEY`** — an optional agent key. Unset (the default), only the
  operator key is accepted anywhere and behaviour is exactly as it always was. When
  set, a request bearing it may call only the routes marked **reporting/read**; on a
  route marked **operator-only** it authenticates fine but the route itself is refused
  with **403** — authenticated, not authorised, which is distinct from an unrecognised
  or absent key (**401**). A misconfigured deployment that sets `AWCP_AGENT_API_KEY`
  equal to `MEMORY_API_KEY` refuses to start (see `startupValidation.ts`'s
  `agentKeyCollidesWithOperatorKey`) — an equal pair would collapse the split into no
  split at all.

The classification lives in `server/src/workflow/policy.ts`'s `requiresOperator`,
applied by the composition root's `/api/workflow` middleware in `server/index.ts`.

| Method | Path | Credential |
|---|---|---|
| POST | `/packets` | reporting/read |
| POST | `/packets/:packetId/runs` | reporting/read |
| POST | `/runs/:runId/checkpoints` | reporting/read |
| POST | `/runs/:runId/end` | reporting/read |
| POST | `/packets/:packetId/decisions` | reporting/read |
| GET | `/overview` | reporting/read |
| GET | `/packets/:packetId` | reporting/read |
| POST | `/decisions/:decisionId/resolve` | **operator-only** |
| POST | `/packets/:packetId/criteria` | **operator-only** |
| POST | `/criteria/:criterionId/evidence` | **operator-only** |
| POST | `/packets/:packetId/complete` | **operator-only** |

The two `GET` routes are deliberately reporting/read: a resuming agent otherwise has no
way to check whether a blocking decision it raised was ever resolved.

`/packets/:packetId/criteria` is operator-only for a reason worth stating explicitly:
criteria define the verification contract the agent will be judged against, so
authoring that contract is supervision, not reporting — the same self-certification
concern that puts `/complete` on the operator side, one step earlier in the process.

Failures map deliberately: **400** malformed input or missing/invalid policy scope ·
**404** unknown packet, run, decision or criterion (including a foreign-key miss, which
is a client mistake, not a server fault) · **409** completion blocked, criteria frozen,
a decision re-resolved with a different answer, or a run re-ended with a different
terminal status · **500** only for genuine infrastructure failure.

## Verify it

```bash
docker compose --profile test exec -T mcp-test \
  deno test --frozen --allow-net --allow-env --allow-read --allow-run=deno \
  tests/workflow-mvp-e2e.test.ts
```

`--allow-run=deno` is required: the test starts and restarts a **real server process**, which
is the only way to observe that the composition root applies the migrations at boot,
that the process starts with no provider credential (the child is spawned with
`clearEnv`, so the absence is a fact about the child rather than a hope about its
parent), and that operational state survives a restart.

A provider sentinel counts outbound calls and the slice makes zero, with a companion
test booting the same server with the provider **enabled** and requiring the sentinel to
record the call — so the zero is a discriminating result, not a quiet one. **What that
sentinel can and cannot see:** it observes every call that honours `OPENROUTER_BASE_URL`.
`server/src/entityWorker.ts` and `server/src/consolidationLLM.ts` hardcode the provider
URL, so they are invisible to it; making them configurable is ST-085's scope. Read the
zero as "no call on the redirectable path", not "no call at all".

## What this is not

No remote collector, no offline spool, no Jira/Confluence/ADO writes, no semantic search
over operational state, no graph representation, no memory-domain refactor. ADR-016
remains **Proposed / Conditional**; nothing here accepts it.
