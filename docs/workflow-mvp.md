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

> **Coverage limit, stated rather than implied.** There is still no browser in the test
> container, so CI does not prove the page *renders* — `workflow-mvp-e2e.test.ts` checks
> the served asset, not the DOM. That gap was closed **once, by hand** on 2026-08-02
> against a real headless Chromium: 28 checks covering render, attention grouping and
> reason colours, packet metadata, criteria met/unmet, all three interactions, the
> completion gate refusing and naming its unmet criteria, and a 401 clearing the stored
> key. See [Verifying the dashboard in a real browser](#verifying-the-dashboard-in-a-real-browser).
>
> **EXPIRED as of `585d2c9` (ST-097).** That commit added the WorkItem lane to
> `dashboard.ts`, so the 28 checks below no longer describe the served page. They are
> also now *under-covering*: they predate the WorkItem lane entirely and cover none of
> it, and the lane is the page's primary surface. Re-run them against the current file
> before treating the browser criterion as verified again, and re-anchor to the commit
> you run them against.
>
> **Verified surface:** `server/src/workflow/dashboard.ts` at `0d3af13`. **Any** commit
> touching that file — anyone's, not just yours — expires this result. Check before
> relying on it:
>
> ```bash
> git diff 0d3af13..HEAD -- server/src/workflow/dashboard.ts
> ```
>
> Non-empty output means re-run the 28 checks before treating the criterion as verified.
> `0d3af13` is a pre-squash branch SHA and will not survive the merge into `main`; after
> that, find this work with `git log --grep="Story: ST-086"` and re-anchor to the commit it
> names. Why a commit and not just the date:
> [docs/solutions/workflow-issues/verification-expires-when-the-verified-surface-changes.md](solutions/workflow-issues/verification-expires-when-the-verified-surface-changes.md).

Completion is refused while any *required* criterion lacks evidence, and the refusal
names the unmet criteria. Add a criterion, try to complete, attach evidence, complete
again — the loop the gate exists for.

### Verifying the dashboard in a real browser

There is no browser in this repo's toolchain, and deliberately so — see the cost note
below. To check the page by hand on a WSL2 host with no desktop session:

```bash
# 1. A browser, installed OUTSIDE the repo. Do this from a scratch directory,
#    never from server/ — server/deno.json pins "frozen": true and this must not
#    become a project dependency.
mkdir -p /tmp/awcp-browser && cd /tmp/awcp-browser
npm init -y && npm i playwright
npx playwright install chromium          # ~115 MB into ~/.cache/ms-playwright

# 2. Chromium needs libnss3/libnspr4, which a headless WSL2 Ubuntu usually lacks.
#    `sudo npx playwright install-deps chromium` is the normal fix. Without root,
#    extract the two packages locally instead — no sudo required:
mkdir -p libs && cd libs
apt-get download libnss3 libnspr4
for d in *.deb; do dpkg-deb -x "$d" root/; done
export LD_LIBRARY_PATH=$PWD/root/usr/lib/x86_64-linux-gnu
```

> Step 2 is a general technique, not a browser one. It is written up on its own terms in
> [docs/solutions/developer-experience/run-a-binary-without-root-by-extracting-its-libs.md](solutions/developer-experience/run-a-binary-without-root-by-extracting-its-libs.md)
> — including how to diagnose which libraries are missing, and when to stop and ask for
> root instead. Use that when the binary is not Chromium.

Then start a **throwaway** server with a dummy key rather than typing the real
`MEMORY_API_KEY` into a browser prompt or a terminal transcript:

```bash
docker compose up -d db --wait
cd server && DATABASE_URL="postgresql://ai_memory:$DB_PASSWORD@127.0.0.1:5432/ai_memory" \
  MEMORY_API_KEY="demo-key-not-a-secret" PORT=3199 FEATURE_WORKFLOW=true \
  FEATURE_ENTITY_WORKER=false FEATURE_CONSOLIDATION_WORKER=false \
  FEATURE_EMBEDDING_BACKFILL=false MODEL_PROVIDER_ENABLED=false \
  deno run --allow-net --allow-env --allow-read index.ts
```

Open `http://127.0.0.1:3199/workflow` and answer the prompt with the dummy key. Seed a
**disposable** packet through the API for the resolve → refuse-complete → attach-evidence
→ complete sequence; those actions are one-way, so do not spend an existing packet on
them. Stop the server by its listening port (`ss -lptn 'sport = :3199'`), not with a
broad `pkill`.

> **Why this is not in CI.** Automating it means a browser layer in `server/Dockerfile`
> (`FROM denoland/deno:2.0.0`), which runs into the in-container HTTPS proxy that
> [CLAUDE.md](../CLAUDE.md) documents, adds minutes to every CI run, and adds an npm
> dependency to a Deno server whose lockfile is deliberately frozen. For one page with
> five sections and three buttons — whose *contract* the process-boundary test already
> holds — that price buys too little. The decision is to verify by hand when
> `dashboard.ts` changes.

#### What was checked, 2026-08-02 — 28/28

The checklist is here rather than in a committed harness, because the harness would be an
npm dependency in a Deno repo whose lockfile is deliberately frozen — the same cost
weighed above, not a separate one. Re-run these by hand.

Render and layout — the page renders packets fetched from `/api/workflow`; no uncaught
console or page errors on load, or after the negative paths; policy scope renders exactly
once per packet and is never copied per row; repository and branch render; attention items
are grouped by reason, each group carries a count, and **every reason class resolves to a
non-default colour** (the CSS vocabulary and the server's `reason` strings agree);
criteria show met/unmet state.

The completion gate — completion is refused while a required criterion lacks evidence; the
refusal **names** the unmet criteria; the optional criterion is *not* named as blocking;
the packet is still not complete after the refusal.

The three interactions — an open decision offers a resolve control; resolving removes the
`decision-required` attention item, empties the open-decision list, and shows the answer
under "Recently resolved"; attaching manual evidence flips the criterion to met and
displays the evidence beneath it; completion then succeeds, the optional criterion having
not blocked it, and the completed packet leaves the active overview (`/overview` is every
non-complete packet, so this is correct, not a disappearing bug).

Auth — a bad key produces a 401 banner, the 401 clears the stored key, and it does not
loop on the key prompt.

If you run the native `deno test` commands against `db-test` on port 5433, recreate it
afterwards (`docker compose --profile test rm -sf db-test seed mcp-test && docker compose
--profile test up -d --wait`). Leftover rows there make the row-count assertions in
`consolidation-worker-observability.test.ts` fail on a later run.

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
| GET | `/work-items` | reporting/read |
| GET | `/work-items/by-ref?source=&ref=` | reporting/read |
| GET | `/work-items/:workItemId` | reporting/read |
| POST | `/decisions/:decisionId/resolve` | **operator-only** |
| POST | `/packets/:packetId/criteria` | **operator-only** |
| POST | `/criteria/:criterionId/evidence` | **operator-only** |
| POST | `/packets/:packetId/complete` | **operator-only** |
| POST | `/work-items` | **operator-only** |
| PATCH | `/packets/:packetId/work-item` | **operator-only** |
| POST | `/work-items/:workItemId/sessions` | **operator-only** |

The five `GET` routes are deliberately reporting/read: a resuming agent otherwise has no
way to check whether a blocking decision it raised was ever resolved, and an agent
reporting into a WorkItem must be able to read the one it is reporting into. What that
posture inherits is worth stating rather than implying — retrieval-time scope
enforcement is deferred to Stage 2, so an agent key reads the whole surface. These
routes add no new exposure and no object-level authorization either.

`/work-items/by-ref` takes **query parameters, not path segments**, and that is a
contract rather than a style choice: a `source_ref` may legitimately be `#57`, which no
path segment can carry — `#` opens a fragment the client never sends — and a key
containing a slash would split into two segments.

`/packets/:packetId/criteria` is operator-only for a reason worth stating explicitly:
criteria define the verification contract the agent will be judged against, so
authoring that contract is supervision, not reporting — the same self-certification
concern that puts `/complete` on the operator side, one step earlier in the process.

The two WorkItem writes (ST-097) are operator-only for a related but distinct reason.
A WorkItem records *requested* work and its external provenance, and only the operator
knows what was requested — so `POST /work-items` is supervision, and an agent minting
one would be AWCP inventing a unit of work nobody asked for. `PATCH
/packets/:packetId/work-item` follows from that plus scope: a packet is the only
authority for its own Policy Scope, an agent key may legitimately create a packet, and
an agent-authored packet parented to a WorkItem would become the scope authority for
anything reached through it. For the same reason `work_item_id` is **not** accepted by
`POST /packets` — binding is only ever the PATCH above, never a field on creation.
`POST /work-items/:workItemId/sessions` joins them on two independent grounds: only the
operator knows which requested work an observed session belongs to, and the caller holds
no ownership proof over the session it names.

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

The CLI has its own suite, and it needs two grants this one does not (ST-087):

```bash
docker compose --profile test exec -T mcp-test \
  deno test --frozen --allow-net --allow-env --allow-read \
  --allow-write=/tmp --allow-run=deno,git \
  tests/awcp-cli.test.ts
```

`--allow-run=git` and `--allow-write=/tmp` exist because `awcp` derives a checkpoint's
repository, branch and commit by running git, and the only honest way to prove that is
to give it a repository and check what it reported. The test builds a throwaway one in a
temp directory — this checkout is not mounted into the test container, so reading it was
never an option, and a hermetic fixture behaves the same in CI anyway. Running the whole
suite needs the union of both commands' grants; see CLAUDE.md.

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
