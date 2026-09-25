---
name: project-deno-in-container-ai-memory
description: "In the ai-memory project, Deno runs inside the `mcp` Docker container, not on the host — ExecPlan commands must use `docker compose exec mcp deno ...`"
metadata:
  type: project
  consolidatedFrom: c--projects-ai-memory
  consolidatedDate: 2026-08-31
  originSessionId: 1e807240-f859-451f-bfbc-553a4f7f2a7a
  modified: 2026-08-31T12:05:23.069Z
---

The `ai-memory` project runs Deno inside the `mcp` Docker container — there is **no host Deno requirement**. ExecPlan tasks should run Deno commands via `docker compose exec mcp deno ...`.

**Architecture:**
- `server/Dockerfile`: `FROM denoland/deno:2.0.0`, `CMD ["run", "--allow-net", "--allow-env", "--allow-read", "index.ts"]`
- `docker-compose.yml` `mcp` service builds from `./server`, exposes port 3000
- Dev bind mount: `./server:/app` (added 2026-05-20) — host source changes are visible to the container immediately, no rebuild needed for new test files

**Convention for ExecPlan command authoring:**
- `deno test ...` → `docker compose exec mcp deno test ...`
- `deno check src/foo.ts` → `docker compose exec mcp deno check src/foo.ts`
- Run from repo root (where `docker-compose.yml` lives); no `cd server` needed
- Inside-container paths match host paths under `./server/`: `tests/foo.test.ts` in the container == `server/tests/foo.test.ts` on host

Same pattern applies to `psql`: use `docker compose exec db psql ...` rather than assuming a host psql install. See [[project-execplan-verification-scope-ai-memory]] for the general principle.

**Why:** ST-030 escalated to plan-review because Task 4.4 ran `deno test` assuming host Deno. The executor's environment didn't have Deno (Github Copilot CLI on Windows). The mcp container has Deno — that's the natural place to run it from. Same gap was present in ST-008's draft (17 deno invocations); fixed 2026-05-20.

**WoW captured:** `plan.prompt.md` Rules section now says "prefer `docker compose exec <service> <cmd>` over a bare host CLI when the tool is already in a service container."

**Project context:** the `ai-memory` project was not found under `C:\projects` as of this 2026-08-31 consolidation — verify it still exists before applying this.
