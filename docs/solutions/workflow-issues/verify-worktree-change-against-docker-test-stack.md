---
title: Verify a worktree change against a Docker test stack rooted in another checkout
date: 2026-08-02
category: workflow-issues
module: testing-workflow
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "More than one working copy of this repo exists on the machine (git worktree, second clone, agent sandbox)"
  - "Running the documented `docker compose --profile test exec mcp-test deno test ...` while a worktree exists"
  - "Falling back to a native `deno test` run against the shared ephemeral `db-test` on port 5433"
  - "Writing or trusting a `N passed / M failed` figure in a plan, board entry, or handoff"
symptoms:
  - "A green containerised suite that never executed the file just edited in the worktree"
  - "96 tests fail with HTTP 401 as soon as the suite runs natively instead of in the container"
  - "A row-count assertion fails on a later container run (expected 23, actual 19) with no matching code change"
  - "The observed pass count disagrees with a recorded baseline"
related_components:
  - "testing_framework"
  - "tooling"
  - "database"
root_cause: config_error
resolution_type: environment_setup
tags:
  - "git-worktree"
  - "docker-compose"
  - "bind-mount"
  - "test-isolation"
  - "deno-test"
  - "verification"
  - "baseline-drift"
---

# Verify a worktree change against a Docker test stack rooted in another checkout

## Context

The documented way to run the server suite is a `docker compose exec` into a long-lived
container ([CLAUDE.md:75](../../../CLAUDE.md)):

```bash
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-run tests/
```

That command is correct, and it is silently wrong the moment a second working copy of the
repo exists on the machine. During ST-086 the change lived in a worktree at
`ai-memory-st086-browser`; the main checkout sat at the same commit. A worktree contains
every tracked file, so both directories *look* like a valid place to run the command from.
Only one of them is wired to the containers actually running.

The cost of getting this wrong is not an error message. It is a green run that proves
nothing about the code you just edited.

### The mechanism, precisely

`mcp-test` bind-mounts the server source ([docker-compose.yml:102](../../../docker-compose.yml)).
The tempting explanation is that `./` resolves against the main checkout. **It does not** —
Compose resolves the bind correctly for whichever directory you invoke it from:

```console
$ cd <worktree> && docker compose --profile test config --format json | \
    python3 -c "import json,sys;d=json.load(sys.stdin);print(d['name']);print(d['services']['mcp-test']['volumes'][0]['source'])"
ai-memory-st086-browser
/home/cpeddle/projects/ai-memory-st086-browser/server
```

The trap is one layer down: **a bind mount is fixed when `up` creates the container, not
when you `exec` into it.** This repo pins no project name — `docker-compose.yml` has no
top-level `name:` and no `COMPOSE_PROJECT_NAME` is set — so Compose derives the project
from the *directory basename*. The stack was started from the main checkout, so:

```console
$ docker compose ls
NAME         STATUS        CONFIG FILES
ai-memory    running(4)    /home/cpeddle/projects/ai-memory/docker-compose.yml

$ docker inspect --format '{{range .Mounts}}{{.Source}}=>{{.Destination}}{{"\n"}}{{end}}' ai-memory-mcp-test-1
/home/cpeddle/projects/ai-memory/server=>/app
```

Two different failure modes follow, and only one is loud:

- **From the worktree**, the command targets project `ai-memory-st086-browser`, which has
  no running containers, so the `exec` simply errors. (Reaching for `up` to fix that is
  worse: it starts a *second* stack that fights the first over host ports 5433/3001, with
  blank credentials.) Noisy either way, but honest.
- **From the main checkout** — out of habit, or from a shell that was already sitting
  there — it passes, against the main checkout's source. That is the silent false pass.
  Nothing in the output names a path.

A worktree also has no `.env` of its own (it is gitignored, so it is not a tracked file to
inherit). Invoking Compose from the worktree warns that `DB_PASSWORD`, `MEMORY_API_KEY`
and `OPENROUTER_API_KEY` are unset and defaults them to blank strings.

## Guidance

### 1. Prove which tree is mounted before trusting any `exec` run

```bash
docker inspect --format '{{range .Mounts}}{{.Source}}=>{{.Destination}}{{"\n"}}{{end}}' ai-memory-mcp-test-1
```

If the `=>/app` source is not the directory you edited, the run tells you nothing about
your change. `docker compose ls` answers from the other end — its `CONFIG FILES` column
names the checkout that owns the running stack.

This is a *sibling* of the stale-tree hazard already documented in
[.github/instructions/dev-environment.instructions.md:54](../../../.github/instructions/dev-environment.instructions.md)
(the server process loads `index.ts` at boot and Deno does not hot-reload it, so you must
restart `mcp-test` after editing). Same class — the container is running a tree that is not
what you edited — but a different trigger: mount root rather than process age. Both checks
are needed; neither implies the other.

### 2. Run natively from the worktree, and scope the run

Native runs bypass the mount entirely. But note the documented native path
([CLAUDE.md:99](../../../CLAUDE.md)) targets the **shared dev Postgres on 5432**, and
CLAUDE.md already warns those runs "may leave test data behind". Pointing native runs at
`db-test` on 5433 instead — to protect dev data — simply moves the contamination somewhere
that *manufactures a convincing false regression* (see 3). Both databases are shared; pick
deliberately and scope tightly.

```bash
cd <worktree>/server
export DATABASE_URL="postgresql://ai_memory:${DB_PASSWORD}@127.0.0.1:5433/ai_memory"
export MEMORY_API_KEY="test-key-not-a-secret"
export CONSOLIDATION_WORKER_DISABLED=true EMBEDDING_BACKFILL_DISABLED=true
deno test --frozen --allow-net --allow-env --allow-read --allow-run tests/workflow-*.test.ts
```

`DB_PASSWORD` must come from somewhere you supply — the worktree has no `.env`.

**Do not point a native run at `tests/`.** The HTTP-based tests authenticate against the
already-running `mcp-test` container (port 3001), which holds the real `MEMORY_API_KEY`. A
native process with a dummy key does not match: in this session that produced **96
failures**, every one an artifact. In-process suites like `tests/workflow-*.test.ts` make
no authenticated HTTP calls to that container and are unaffected. The same two-environments-
one-variable shape is documented in
[developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md](../developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md),
whose diagnostic (hash both values and compare) transfers directly.

### 3. When a strange failure appears in a shared DB, recreate before debugging

That `db-test` accumulates state across runs is already documented
([dev-environment.instructions.md:61](../../../.github/instructions/dev-environment.instructions.md)),
including why: a fresh seed yields ~33 pending `consolidation_queue` rows, and tests that
drain with `limit=1` must backdate their own `queued_at` to be claimed first. What that
gotcha does not anticipate is that a **native** run against 5433 is also a contamination
source, and that the resulting failure arrives wearing a regression's clothes.

Here the full native run left rows behind, and the next container run failed
`consolidation-worker-observability.test.ts:36` with `expected 23, actual 19` — a **10th**
failure atop the known 9, appearing for the first time immediately after a code change.
It looked exactly like a regression that change had caused. It was self-inflicted.

`tmpfs` makes the cure cheap, so recreate rather than debug:

```bash
docker compose --profile test rm -sf mcp-test seed db-test
docker compose --profile test up -d --wait
```

**Rule of thumb:** if an unfamiliar failure shows up in a shared ephemeral database right
after you ran something unusual against it, recreate the stack *before* opening the
debugger. Survives a clean recreate → real. Does not → you were about to spend an hour on
your own footprint.

### 4. Record the failure set as the baseline, never the pass count

A handoff file recorded the baseline as `300 passed / 9 failed`; the clean run showed
**301/9**. Nothing was wrong — the ST-086 commit that closed three review gaps added
exactly one `Deno.test`, which is the whole difference:

```bash
git show <commit> -- server/tests/ | grep -c "^+Deno.test"   # -> 1
```

(That commit was `788fe9e` on the pre-merge branch. This repo squash-merges, so
branch SHAs are rewritten on the way into `main` — find the work by its story trailer,
`git log --grep="Story: ST-086"`, rather than by that SHA.)

A pass count is invalidated by anyone adding a test, including you. Two things *are*
durable:

- **The failure set** — which files, which tests, and why. "9 failed, all pre-existing
  **OpenRouter**-401 in `e2e.test.ts` (8) and `entity-worker-observability.test.ts` (1)"
  stays true across every added test and still catches a real regression. Name the *kind*
  of 401: these are a placeholder `OPENROUTER_API_KEY` that CI supplies for real, which is
  a different failure from the `MEMORY_API_KEY` mismatch in §2. Two 401s in one workflow is
  exactly the confusion a baseline should prevent, not create.
- **A reconciliation identity.** This repo already uses one: the ST-084 findings doc
  reconciles `216 + 82 = 298`. It carries forward — 216 non-workflow **passing** (225
  exist; the 9 above fail) plus 85 workflow is exactly the 301 observed here. Note the
  identity is over *passing* counts, not test counts; anyone counting `Deno.test` blocks
  gets 225 and concludes the identity is broken. An identity that recomputes beats a frozen
  total only if it states precisely what it counts.

Note how fast this went stale: not "eventually", but *within the same story, on the same
morning* — the handoff carrying `300` was written roughly nine hours before the run that
showed `301`.
(The same anti-pattern sits on the board at `story-board.md:553` as ST-084's
`253 passed / 9 failed`.)

### 5. Prefer a scope-matched run over a full-suite safety net

[CLAUDE.md:141](../../../CLAUDE.md) already says to match verification to the deliverable's
scope and not to run unrelated suites as a safety net. That applies with extra force here,
because the full suite is precisely the run that trips hazards 2 and 3.

ST-086's change was to `server/src/workflow/dashboard.ts`, whose sole importer is
`server/index.ts:37`, and only the workflow tests assert on it. Running
`server/tests/workflow-*.test.ts` natively from the worktree — 85/85 — was sufficient and
defensible, and unlike the full suite it was actually running the edited code. That one
glob covers both relevant angles: `workflow-mvp-e2e.test.ts` asserts on the *served page*
(that it carries every required section and action), while `workflow-boundary.test.ts`
scans every file in `server/src/workflow/` — `dashboard.ts` included — for forbidden
imports and memory-domain tokens.

Resist quoting the two as separate wins: `workflow-boundary.test.ts` is matched by that
glob, so its 16 are already inside the 85. Reporting "85 plus 16" would claim 101 tests
that were never run — the same class of arithmetic error as §4.
(Inside the shell blocks above the paths are written `tests/...` because the working
directory is `server/`.)

## Why This Matters

A false green is worse than a red. A red run costs an hour; a green run against the wrong
source tree ships an unverified change and devalues every future green. `docker compose
exec` is *designed* to be indifferent to your working directory — that is what makes it
convenient, and what makes it dangerous once more than one checkout exists on disk.

The second-order cost is worse. Contaminating a shared ephemeral database does not merely
fail — it **fabricates evidence against the change under test**. A brand-new count
assertion failing right after you touched code is the most convincing shape a regression
can take, and here it was pure artifact.

And a hardcoded pass-count baseline teaches the wrong reflex: it goes stale on every added
test, training you either to ignore baseline drift (and miss a real regression) or to chase
a number that was never the invariant.

## When to Apply

- Whenever more than one working copy of this repo exists on the machine — check
  `git worktree list` if unsure.
- Before believing any `docker compose exec ... deno test` result while a worktree exists.
- Before running a *full* suite natively against a shared database — don't; scope it.
- Whenever an unexplained new failure appears in a `db-test`-backed test.
- Whenever you are about to write `N passed / M failed` into a plan, board entry, or handoff.

It does **not** apply when there is exactly one checkout and the stack was started from it.
There the documented command is right, and the "Dev vs Test isolation" guarantee at
[CLAUDE.md:87](../../../CLAUDE.md) (tests never touch the dev database) holds. The worktree
case is what the documentation does not cover.

## Examples

### Before — the silent false pass

```console
$ cd <worktree> && $EDITOR server/src/workflow/dashboard.ts
$ cd <main-checkout>          # habit, or a shell already sitting here
$ docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-run tests/
ok | 301 passed | 9 failed
```

Green. The container's `/app` is the **main checkout's** `server/` — the edit was never
loaded, and nothing in that output says so.

### After — pin the mount, then scope the run

```console
$ docker inspect --format '{{range .Mounts}}{{.Source}}=>{{.Destination}}{{"\n"}}{{end}}' ai-memory-mcp-test-1
/home/cpeddle/projects/ai-memory/server=>/app        # <-- not my worktree

$ cd <worktree>/server
$ deno test --frozen --allow-net --allow-env --allow-read --allow-run tests/workflow-*.test.ts
ok | 85 passed | 0 failed
```

### Baselines — stale vs durable

```diff
- Baseline: 300 passed / 9 failed on the full suite.
+ Baseline: 9 failures, all pre-existing OpenRouter-401 (placeholder key locally;
+   CI injects the real secret) —
+   server/tests/e2e.test.ts (8), server/tests/entity-worker-observability.test.ts (1).
+ Reconciles as 216 non-workflow passing + 85 workflow passing = 301 passed.
+ A pass count is not a baseline; it moves whenever anyone adds a test.
```

## Related

- [.github/instructions/dev-environment.instructions.md](../../../.github/instructions/dev-environment.instructions.md) — owns the sibling stale-tree hazard (in-memory boot), `db-test` state accumulation, and the local-401 baseline. Auto-loads (`applyTo: "**"`); the worktree trigger is the gap this doc fills.
- [docs/workflow-mvp.md](../../workflow-mvp.md) — carries the story-scoped recreate recipe this generalizes.
- [developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md](../developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md) — the same "two environments, one variable name, silent 401" shape.
- [workflow-issues/verify-claimed-work-before-rebuild-cross-clone-2026-07-03.md](verify-claimed-work-before-rebuild-cross-clone-2026-07-03.md) — conceptual sibling: "which checkout am I actually looking at?", there via human handoff rather than tooling.
- [conventions/verification-mechanisms-need-adversarial-review.md](../conventions/verification-mechanisms-need-adversarial-review.md) — conceptual parent: review the verification mechanism as adversarially as the code.
