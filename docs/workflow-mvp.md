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
export MEMORY_API_KEY=...            # same key the server uses
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

Resolving decisions, attaching evidence and completing a packet are deliberately **not**
in the CLI. They are supervision actions belonging to the operator at the dashboard, and
keeping them apart is what stops an agent signing off its own verification.

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

| Method | Path |
|---|---|
| POST | `/packets` |
| POST | `/packets/:packetId/runs` |
| POST | `/runs/:runId/checkpoints` |
| POST | `/runs/:runId/end` |
| POST | `/packets/:packetId/decisions` |
| POST | `/decisions/:decisionId/resolve` |
| POST | `/packets/:packetId/criteria` |
| POST | `/criteria/:criterionId/evidence` |
| POST | `/packets/:packetId/complete` |
| GET | `/overview` |
| GET | `/packets/:packetId` |

Failures map deliberately: **400** malformed input or missing/invalid policy scope ·
**404** unknown packet, run, decision or criterion (including a foreign-key miss, which
is a client mistake, not a server fault) · **409** completion blocked, criteria frozen,
or a decision re-resolved with a different answer · **500** only for genuine
infrastructure failure.

## Verify it

```bash
docker compose --profile test exec -T mcp-test \
  deno test --frozen --allow-net --allow-env --allow-read --allow-run \
  tests/workflow-mvp-e2e.test.ts
```

`--allow-run` is required: the test starts and restarts a **real server process**, which
is the only way to observe that the composition root applies the migrations at boot,
that the process starts with no provider credential (the child is spawned with
`clearEnv`, so the absence is a fact about the child rather than a hope about its
parent), and that operational state survives a restart. A provider sentinel records
every outbound provider call; the slice makes zero, and a companion test boots the same
server with the provider **enabled** and requires the sentinel to record the call — so
the zero is a discriminating result, not a quiet one.

## What this is not

No remote collector, no offline spool, no Jira/Confluence/ADO writes, no semantic search
over operational state, no graph representation, no memory-domain refactor. ADR-016
remains **Proposed / Conditional**; nothing here accepts it.
