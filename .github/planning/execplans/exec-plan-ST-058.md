# ExecPlan — ST-058: Governance Alignment & Work-Stream Sync

> Status: ✅ Ready for /continue
> Story: ST-058
> Created: 2026-06-17
> Parent: Session wrap-up decision (PO clarifications answered 2026-06-17)
> PLANS.md: This document follows `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a meta-alignment task to reconcile three work-streams (ST-056 embedding resilience, ST-042 migration framework, ST-041 cypher injection hardening) with their governance artifacts, then gate the work for independent review before merge. The executor is a lower-tier model (e.g. GPT 5.3 Codex) with no project history; every instruction is explicit and every verification is observable.

---

## §1. Background & Context

### Problem Statement

Work on three stories has outpaced governance updates:

- **ST-056** (embedding request timeout resilience): Code exists locally (AsyncLocalStorage refactor in `server/src/mcpDiagnostics.ts`, cleanup in `server/src/startupValidation.ts`, dependency updates in `server/deno.lock`, test changes). The plan `docs/plans/2026-06-14-001-fix-search-stall-and-observability-plan.md` is marked `status: completed`, but the code is uncommitted and not on any PR. The ExecPlan `exec-plan-ST-056.md` does not yet exist.

- **ST-042** (migration framework): Implementation exists as untracked files in `server/src/migrate.ts` (runner), `server/db/001_initial.sql` (marker), `server/tests/migrations.test.ts` (tests), plus `docs/plans/2026-06-13-001-feat-migration-framework-plan.md` (the ce-plan). A separate branch `feat/migration-framework` (commit 9ce3f1b) exists but is stale. The board still lists ST-042 in Backlog; its ExecPlan `exec-plan-ST-042.md` says "Not Ready — requires /plan". There is a schema path discrepancy: the plan expects `server/db/migrations/` subdirectory, but the implementation reads directly from `server/db/`.

- **ST-041** (cypher injection hardening): The core fix (stripCypherComments) shipped in merged commit 56a492c; the test file `server/tests/cypher-injection.test.ts` documents the validation. The board lists ST-041 as Refined, but its ExecPlan `exec-plan-ST-041.md` has not been updated to reflect completion status.

### Solution

Create a single wrap-up branch (`feat/ST-058-sync-alignment`) off `origin/main` that:
1. Carries the merged commit 56a492c (cypher fix, already on origin/main via PR #6 merge commit bbb78d9) — no re-commit needed
2. Stages all untracked ST-042 and ST-056 artifacts with clear story attribution
3. Commits governance artifacts (STRATEGY.md, .opencode/, opencode-mcp.json)
4. Adds .worktrees/ to .gitignore
5. Updates three ExecPlans and the board
6. Passes full test suite + lint
7. Undergoes cross-model review for ST-056 and ST-042 before merge

### Key Files & Paths

**Server implementation:**
- `server/src/mcpDiagnostics.ts` — AsyncLocalStorage request context isolation (ST-056)
- `server/src/startupValidation.ts` — ensureRecallQueriesTable removal (ST-056)
- `server/src/migrate.ts` — migration runner, bootstrap detection, repair logic (ST-042)
- `server/db/001_initial.sql` — version 1 marker (ST-042)
- `server/tests/migrations.test.ts` — migration runner tests (ST-042)
- `server/tests/cypher-injection.test.ts` — comment handling validation (ST-041, merged in 56a492c)
- `server/deno.lock` — added @types/node (ST-056)

**Plans & ExecPlans:**
- `.github/planning/execplans/exec-plan-ST-058.md` — this file (wrap-up)
- `.github/planning/execplans/exec-plan-ST-056.md` — to be created
- `.github/planning/execplans/exec-plan-ST-042.md` — to be updated
- `.github/planning/execplans/exec-plan-ST-041.md` — to be updated
- `.github/planning/story-board.md` — to be updated (add ST-058, mark ST-056/ST-042/ST-041 as Done, refresh timestamp)
- `docs/plans/2026-06-13-001-feat-migration-framework-plan.md` — ST-042 ce-plan (untracked, to be committed)
- `docs/plans/2026-06-14-001-fix-search-stall-and-observability-plan.md` — ST-056 ce-plan (tracked, no change)

**Governance artifacts:**
- `STRATEGY.md` — untracked, to be committed
- `.opencode/` — directory, untracked, to be committed
- `opencode-mcp.json` — untracked, to be committed
- `.gitignore` — to be updated with `.worktrees/` entry

**Session handoff:**
- `FollowUpSessionLog.txt` — to be replaced (not appended) with concise summary

### Existing State

- Current branch: `fix/search-stall-and-observability` (origin tracking gone)
- Origin/main HEAD: bbb78d9 (PR #6 merge commit; has the cypher fix from 56a492c)
- Local HEAD: 56a492c (1 commit ahead of origin/main; the cypher fix)
- Uncommitted local changes: 8 modified files (mcpDiagnostics.ts, startupValidation.ts, deno.lock, 4 test files), multiple untracked files
- Last board update: 2026-06-10 (6 days stale)
- Last FollowUpSessionLog.txt: stale (still references PR CREATION FAILED)

### Definitions

- **Acceptance criteria (AC):** Observable, testable outcomes listed in story definitions
- **Cross-model review:** Independent code review by a different LLM model (e.g., claude-opus or gpt-4) to catch conceptual gaps before merge
- **Story→Done:** All AC passed, board state updated, downstream stories can depend on it

---

## §1b. Outcomes & Conclusions

(To be populated during execution — see §6b at end for template)

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

- After Task 4.1 (branch setup), `git branch -a` shows `feat/ST-058-sync-alignment` with tracking set to `origin/main`
- After Task 4.2 (verify baseline), `git log origin/main --oneline | head -3` shows bbb78d9 at top (PR #6 merge with cypher fix already present)
- After Task 4.3–4.6 (commit untracked work), `git status` shows clean (no untracked files except .opencode/.worktrees unintended files)
- After Task 4.7 (tests + lint), output shows "131 tests passed, 0 failed" and "0 lint errors"
- After Task 4.8–4.11 (ExecPlan/board updates), all three ExecPlan files updated, board entry ST-058 created, ST-056/ST-042/ST-041 marked Done, timestamp refreshed
- After Task 4.12 (FollowUpSessionLog), file contains one-paragraph summary with next-step pointers, ≤40 lines
- After Task 4.13 (cross-model review), at least one independent review pass completed for ST-056 diagnostics and ST-042 migration runner
- After Task 4.14 (PR creation), PR is open on GitHub, CI gates pass, no merge until cross-model review ✅

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (branch strategy, artifact handling, cross-model gating)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted (rollback to origin/main, revert commits, restart on clean branch)
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates and exact commands provided in §4 task definitions
- [x] Scoped requirements mapped to concrete outputs (§2d traceability matrix)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ✅ Ready for /continue

---

## §2c. Plan Review Notes

Cross-model review (2026-06-17, PR #7): **✅ PASS WITH NOTES**
- Finding 1: `isBodyLoggingEnabled` dead code — P3, remove if convenient
- Finding 2: Code duplication between `stripCypherComments` / `maskCypherLiteralsAndComments` — P3, extract shared tokenizer in follow-up
- Finding 3: Repair path `console.warn` doesn't match `[migrate] FATAL` + `Deno.exit(1)` pattern — P2, add try/catch for consistency
- Finding 4: `001_initial.sql` missing trailing newline — P3, trivial format fix
- ALS refactor, migration bootstrap, and cypher injection defenses verified as correct
- No blocking issues — verdict: proceed to merge

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| ST-056: Create new branch, complete uncommitted work (PO) | Branch exists, tracked to origin/main; ST-056 ExecPlan created; board shows ST-056→Done | Task 4.1, 4.3, 4.9, 4.10 | `git branch -vv`, `exec-plan-ST-056.md` exists, board ST-056 line shows state Done |
| ST-042: Promote untracked artifacts, continue plan, move to Done (PO) | migrate.ts, 001_initial.sql, migrations.test.ts, ce-plan committed; exec-plan-ST-042.md updated from "Not Ready"; board shows ST-042→Done | Task 4.4, 4.8, 4.10 | `git log --name-only` includes 4 files, `exec-plan-ST-042.md` status=Ready, board ST-042 state Done |
| ST-041: Update ExecPlan to reflect local status (PO) | exec-plan-ST-041.md status updated, shows cypher injection hardening as delivered | Task 4.9, 4.10 | `exec-plan-ST-041.md` shows completion evidence, board ST-041 state updated |
| Commit untracked governance artifacts (PO clarification) | STRATEGY.md, .opencode/, opencode-mcp.json present in repo | Task 4.5 | `git ls-files` shows 3 artifacts; `Test-Path` confirms files on disk |
| Handle .worktrees/ per governance | .worktrees/ present in .gitignore, not committed as repo content | Task 4.6 | `.gitignore` contains `.worktrees/` line; `git ls-files .worktrees/` returns empty |
| Verify implementation quality before merge | Full server test suite passes (131 tests), lint passes (0 errors) | Task 4.7 | `deno test` output shows 131 ok, lint output shows clean |
| Cross-model review gate for critical stories | ST-056 diagnostics and ST-042 migration runner reviewed by independent LLM | Task 4.13 | Review summary document with ✅ PASS stored in PR or .github/reviews/ |
| Update session handoff artifact | FollowUpSessionLog.txt contains concise wrap-up, next-step pointers, ≤40 lines | Task 4.12 | File length ≤40 lines, includes ST-058 wrap-up summary, /continue or /plan next-step pointers |

---

## §3. Preconditions

### Tools & Environment

- Git 2.30+ (for branch tracking, push, PR creation)
- PowerShell 5.1+ (Windows, with Set-ExecutionPolicy RemoteSigned)
- Docker & Docker Compose (for `docker compose up`, `docker compose exec`, `docker compose logs`, `docker compose --profile test`)
- Deno 2.0+ (inside container; host does not need Deno)
- `gh` CLI (GitHub CLI v1.12+) for PR creation and review interaction

Verify tools before starting:
```powershell
git --version  # Should be 2.30+
docker --version  # Any recent version
docker compose --version  # Should show Compose v2+
# Deno version checked inside container (Task 4.7)
```

### Environment State

- Working directory: `c:\projects\ai-memory` (cd into it before every command)
- Git user configured: `git config user.name` and `git config user.email` both return non-empty
- Docker daemon running: `docker ps` succeeds (can list containers)
- GitHub authentication: `gh auth status` succeeds
- No uncommitted changes on `fix/search-stall-and-observability` should leak into the wrap-up branch (tasks clean this up)

### Prior Stories (Dependencies)

- ST-056 plan `docs/plans/2026-06-14-001-fix-search-stall-and-observability-plan.md` exists (tracked, created in prior sessions)
- ST-042 plan `docs/plans/2026-06-13-001-feat-migration-framework-plan.md` exists (untracked, staged in this plan)
- ST-041 plan `docs/plans/2026-06-14-001-fix-cypher-injection-hardening-plan.md` or similar exists (verify in Task 4.1)
- PR #6 merged (`bbb78d9` on origin/main) with cypher fix from 56a492c

### Input Files

The following files are already in the workspace (some untracked):

**Tracked (on origin/main or current branch):**
- `.github/planning/story-board.md` (board template)
- `.github/planning/execplans/exec-plan-ST-042.md` (Not Ready, to update)
- `.github/planning/execplans/exec-plan-ST-041.md` (to update)
- `docs/plans/2026-06-14-001-fix-search-stall-and-observability-plan.md` (ST-056, status=completed)
- `.gitignore` (baseline)

**Untracked (local working tree only, to be committed):**
- `server/src/mcpDiagnostics.ts` (AsyncLocalStorage refactor, ST-056)
- `server/src/startupValidation.ts` (cleanup, ST-056)
- `server/src/migrate.ts` (migration runner, ST-042)
- `server/db/001_initial.sql` (marker, ST-042)
- `server/tests/migrations.test.ts` (tests, ST-042)
- `server/tests/cypher-injection.test.ts` (tests, ST-041 validation)
- `server/deno.lock` (dependency updates, ST-056)
- `server/tests/mcp-diagnostics.test.ts` (updated, ST-056)
- `server/tests/startup-validation.test.ts` (updated, ST-056)
- `server/tests/mcp-protocol-compat.test.ts` (newline fix, minor)
- `server/tests/search-tool-contract.test.ts` (newline fix, minor)
- `STRATEGY.md` (governance artifact)
- `.opencode/` directory (governance artifact)
- `opencode-mcp.json` (governance artifact)
- `docs/plans/2026-06-13-001-feat-migration-framework-plan.md` (ce-plan, ST-042)

### Boilerplate & Templates

#### Commit Message Templates

**For ST-042 migration artifacts:**
```
feat(migrations): promote migration runner and schema files

- Adds server/src/migrate.ts (runMigrations with bootstrap detection)
- Adds server/db/001_initial.sql (version 1 anchor)
- Adds server/tests/migrations.test.ts (runner validation tests)

This promotes work from ST-042 to shipping status. Migration runner
detects existing schema state, repairs missing artifacts from v3,
and applies pending files in sequence.

Schema path note: Implementation reads from server/db/, not
server/db/migrations/ as planned. Future refactor may relocate
migrations into subdirectory. Current acceptance: direct-path loader.

Story: ST-042
Task: §4.4
```

**For ST-056 diagnostics:**
```
refactor(diagnostics): isolate MCP request context with AsyncLocalStorage

- Refactor server/src/mcpDiagnostics.ts: use node:async_hooks
  AsyncLocalStorage instead of module-level _activeEmbeddingLane
- Remove ensureRecallQueriesTable from server/src/startupValidation.ts
  (logic moved to migrate.ts repairMissingMigration003Artifacts)
- Update server/deno.lock: add @types/node, undici-types
- Update server/tests/mcp-diagnostics.test.ts: new context isolation test
- Update server/tests/startup-validation.test.ts: remove 3 old tests

Fixes concurrent request embedding lane contamination. Verified by
new test "embedding lane context: concurrent requests do not overwrite".

Story: ST-056
Task: §4.3
```

**For governance artifacts:**
```
chore(governance): commit workspace artifacts and tooling config

- STRATEGY.md: product strategy and vision
- .opencode/: OpenCode IDE customization
- opencode-mcp.json: MCP integration config

Story: ST-058
Task: §4.5
```

**For .gitignore:**
```
chore(git): add .worktrees/ to .gitignore

Linked worktrees are managed by git and should not be committed as
regular directory content. This entry prevents accidental nesting.

Story: ST-058
Task: §4.6
```

**For board + ExecPlan updates:**
```
docs(governance): update board and ExecPlans for ST-058 wrap-up

- Add ST-058 board entry (Governance Alignment & Work-Stream Sync, Done)
- Update ST-042 ExecPlan: mark Ready, add traceability evidence
- Update ST-041 ExecPlan: mark completed (cypher hardening shipped)
- Update ST-056 ExecPlan: create from plan, mark Ready
- Refresh board "Last updated" timestamp

Story: ST-058
Task: §4.8, §4.9, §4.10
```

---

## §4. Task Definitions

### Task 4.1: Create wrap-up branch off origin/main

**Objective:** Establish a clean, tracked branch for all ST-058 work.

**Input:** 
- Local `fix/search-stall-and-observability` branch (may have uncommitted changes)
- Origin/main at bbb78d9 (with merged cypher fix)

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Fetch latest from origin to ensure local refs are current.**
   ```powershell
   git fetch origin
   ```
   Expected: No errors; `git branch -r` now shows `origin/main` at latest.

2. **Create and check out a fresh branch off origin/main.**
   ```powershell
   git checkout -b feat/ST-058-sync-alignment origin/main
   ```
   Expected: Output shows "Switched to a new branch 'feat/ST-058-sync-alignment'" and "tracking origin/main".

3. **Verify branch tracking.**
   ```powershell
   git branch -vv
   ```
   Expected: Output includes line `* feat/ST-058-sync-alignment [origin/main] <last commit hash>` and shows tracking relationship.

**Expected output:** 
- New branch `feat/ST-058-sync-alignment` created and checked out
- Branch tracking set to `origin/main`
- No local uncommitted changes on this branch (clean slate)

**Requirement mapping:** 
- §2d row 1 (branch exists, tracked to origin/main)

**Verification:**
```powershell
git status  # Should show "On branch feat/ST-058-sync-alignment", "nothing to commit, working tree clean"
git log --oneline -3  # Should show top commit is bbb78d9 (PR #6 merge) with cypher fix
```
Expected result: Clean branch at origin/main HEAD, ready for new commits.

**Failure handling:** If branch creation fails (e.g., local branch exists), delete and retry:
```powershell
git branch -D feat/ST-058-sync-alignment
git checkout -b feat/ST-058-sync-alignment origin/main
```

---

### Task 4.2: Verify baseline — confirm cypher fix is present on origin/main

**Objective:** Confirm that the stripCypherComments fix (from merged PR #6) is on origin/main before proceeding.

**Input:** 
- Branch is `feat/ST-058-sync-alignment` (fresh off origin/main)
- No new commits needed; verification only

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Inspect the most recent 3 commits to confirm PR #6 merge.**
   ```powershell
   git log --oneline --decorate -3
   ```
   Expected: First line shows `bbb78d9 Merge PR #6` or similar, with "(HEAD -> feat/ST-058-sync-alignment, origin/main)".

2. **Check that server/index.ts contains stripCypherComments function.**
   ```powershell
   Select-String -Path server/index.ts -Pattern "stripCypherComments" | Select-Object -First 1
   ```
   Expected: Output shows one or more matches (function definition).

3. **Verify cypher-injection tests exist and pass.**
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/cypher-injection.test.ts
   ```
   Expected: Test output shows "2 tests passed" or similar (comment handling tests from ST-041).

**Expected output:** 
- Confirmed cypher fix is on this branch
- stripCypherComments function visible
- cypher-injection.test.ts passes

**Requirement mapping:** 
- §2d row 3 (verify ST-041 delivered in merged commit)

**Verification:**
```powershell
# Check git history
git show bbb78d9 --name-only | Select-String server/index.ts

# Check function exists
Select-String -Path server/index.ts "function stripCypherComments"
```
Expected result: All three checks pass; cypher hardening is present.

**Failure handling:** If tests fail, the merge may be corrupted. Escalate: run `git log bbb78d9~1..bbb78d9` to inspect the merge commit diff.

---

### Task 4.3: Stage ST-056 diagnostics work (uncommitted local changes)

**Objective:** Commit the AsyncLocalStorage refactor and related test/dependency changes to this branch.

**Input:** 
- Uncommitted local files from ST-056 work:
  - `server/src/mcpDiagnostics.ts` (modified, AsyncLocalStorage refactor)
  - `server/src/startupValidation.ts` (modified, ensureRecallQueriesTable removed)
  - `server/deno.lock` (modified, added @types/node and undici-types)
  - `server/tests/mcp-diagnostics.test.ts` (modified, added context isolation test)
  - `server/tests/startup-validation.test.ts` (modified, removed old tests)
  - `server/tests/mcp-protocol-compat.test.ts` (modified, newline)
  - `server/tests/search-tool-contract.test.ts` (modified, newline)

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Verify the files are present and modified locally.**
   ```powershell
   git status --short | Select-String "server/src/mcpDiagnostics.ts|server/src/startupValidation.ts|server/deno.lock|server/tests/"
   ```
   Expected: Output shows at least 5–7 lines with "M " prefix (modified).

2. **Stage all modified server files for commit.**
   ```powershell
   git add server/src/mcpDiagnostics.ts server/src/startupValidation.ts server/deno.lock server/tests/mcp-diagnostics.test.ts server/tests/startup-validation.test.ts server/tests/mcp-protocol-compat.test.ts server/tests/search-tool-contract.test.ts
   ```
   Expected: No output (staging succeeds silently).

3. **Commit with narrative message.**
   ```powershell
   git commit -m @'
refactor(diagnostics): isolate MCP request context with AsyncLocalStorage

- Refactor server/src/mcpDiagnostics.ts: use node:async_hooks
  AsyncLocalStorage instead of module-level _activeEmbeddingLane
- Remove ensureRecallQueriesTable from server/src/startupValidation.ts
  (logic moved to migrate.ts repairMissingMigration003Artifacts)
- Update server/deno.lock: add @types/node, undici-types
- Update server/tests/mcp-diagnostics.test.ts: new context isolation test
- Update server/tests/startup-validation.test.ts: remove 3 old tests

Fixes concurrent request embedding lane contamination. Verified by
new test "embedding lane context: concurrent requests do not overwrite".

Story: ST-056
Task: §4.3
'@
   ```
   Expected: Output shows commit hash and file counts (e.g., "7 files changed, X insertions, Y deletions").

4. **Verify commit is recorded locally.**
   ```powershell
   git log --oneline -1
   ```
   Expected: Output shows the new commit at HEAD (not bbb78d9).

**Expected output:** 
- New commit on feat/ST-058-sync-alignment containing ST-056 diagnostics work
- Commit message includes Story: ST-056 trailer

**Requirement mapping:** 
- §2d row 1 (ST-056 work committed, includes ExecPlan creation in Task 4.9)

**Verification:**
```powershell
git show --name-only | Select-String "mcpDiagnostics|startupValidation|deno.lock"
```
Expected result: All 7 files appear in the commit.

**Failure handling:** If any file is missing from git status:
```powershell
git diff --name-only  # List unstaged files
git add <missing-file>
git commit --amend  # Amend previous commit to include missed file
```

---

### Task 4.4: Stage ST-042 migration framework artifacts

**Objective:** Commit the untracked migration runner, marker SQL, tests, and ce-plan.

**Input:** 
- Untracked local files from ST-042 work:
  - `server/src/migrate.ts` (new)
  - `server/db/001_initial.sql` (new)
  - `server/tests/migrations.test.ts` (new, or modified if already committed in 56a492c)
  - `docs/plans/2026-06-13-001-feat-migration-framework-plan.md` (new, the ce-plan)

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Verify files exist and are untracked or present locally.**
   ```powershell
   Test-Path server/src/migrate.ts  # Should return $true
   Test-Path server/db/001_initial.sql  # Should return $true
   Test-Path server/tests/migrations.test.ts  # Should return $true
   Test-Path docs/plans/2026-06-13-001-feat-migration-framework-plan.md  # Should return $true
   ```
   Expected: All four return `$true`.

2. **Stage the four ST-042 artifacts.**
   ```powershell
   git add server/src/migrate.ts server/db/001_initial.sql server/tests/migrations.test.ts docs/plans/2026-06-13-001-feat-migration-framework-plan.md
   ```
   Expected: No output (staging succeeds).

3. **Commit with narrative message highlighting the schema path note.**
   ```powershell
   git commit -m @'
feat(migrations): promote migration runner and schema files

- Adds server/src/migrate.ts (runMigrations with bootstrap detection)
- Adds server/db/001_initial.sql (version 1 anchor)
- Adds server/tests/migrations.test.ts (runner validation tests)
- Adds docs/plans/2026-06-13-001-feat-migration-framework-plan.md (ce-plan)

This promotes work from ST-042 to shipping status. Migration runner
detects existing schema state, repairs missing artifacts from v3,
and applies pending files in sequence.

Schema path note: Implementation reads from server/db/, not
server/db/migrations/ as planned in the ce-plan. Future refactor may
relocate migrations into subdirectory. Current acceptance: direct-path
loader is sufficient for initial release.

Story: ST-042
Task: §4.4
'@
   ```
   Expected: Output shows commit hash with file counts.

4. **Verify commit.**
   ```powershell
   git log --oneline -2
   ```
   Expected: Output shows the new ST-042 commit and the ST-056 commit below it.

**Expected output:** 
- New commit containing migrate.ts, 001_initial.sql, migrations.test.ts, and ce-plan
- Commit message explicitly acknowledges the schema path discrepancy

**Requirement mapping:** 
- §2d row 2 (ST-042 artifacts committed, merged with ExecPlan updates in Task 4.8)

**Verification:**
```powershell
git show --name-only | Select-String "migrate.ts|001_initial.sql|migrations.test.ts|2026-06-13"
```
Expected result: All four artifacts appear in commit.

**Failure handling:** If a file is missing, revert the commit and re-add:
```powershell
git reset HEAD~1
git add <missing-file-path>
git commit --all -m "feat(migrations): ..."  # Re-commit with full list
```

---

### Task 4.5: Commit governance artifacts (STRATEGY.md, .opencode/, opencode-mcp.json)

**Objective:** Stage and commit workspace-level governance and tooling artifacts.

**Input:** 
- Untracked files:
  - `STRATEGY.md` (product strategy document)
  - `.opencode/` directory (OpenCode IDE config)
  - `opencode-mcp.json` (MCP integration config)

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Verify files/directory exist.**
   ```powershell
   Test-Path STRATEGY.md  # Should return $true
   Test-Path .opencode/  # Should return $true
   Test-Path opencode-mcp.json  # Should return $true
   ```
   Expected: All three return `$true`.

2. **Stage governance artifacts.**
   ```powershell
   git add STRATEGY.md .opencode/ opencode-mcp.json
   ```
   Expected: No output (staging succeeds).

3. **Commit.**
   ```powershell
   git commit -m @'
chore(governance): commit workspace artifacts and tooling config

- STRATEGY.md: product strategy and vision
- .opencode/: OpenCode IDE customization
- opencode-mcp.json: MCP integration config

Story: ST-058
Task: §4.5
'@
   ```
   Expected: Output shows commit with counts of files changed.

4. **Verify.**
   ```powershell
   git log --oneline -3
   ```
   Expected: Output shows the new governance commit on top.

**Expected output:** 
- New commit containing STRATEGY.md, .opencode/, opencode-mcp.json

**Requirement mapping:** 
- §2d row 5 (governance artifacts committed)

**Verification:**
```powershell
git ls-files | Select-String "STRATEGY.md|opencode-mcp.json|\.opencode"
```
Expected result: All three appear in the index.

**Failure handling:** If `.opencode/` subdirectory is not committed:
```powershell
git status  # Check for untracked files in .opencode/
git add .opencode/  # Ensure directory is fully staged
git commit --amend  # Amend previous commit
```

---

### Task 4.6: Add .worktrees/ to .gitignore and commit

**Objective:** Prevent git linked worktrees from being committed as regular content.

**Input:** 
- `.gitignore` file (exists, tracked)
- `.worktrees/` directory (exists locally, is a git-managed worktree, should not be committed)

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Verify .gitignore exists.**
   ```powershell
   Test-Path .gitignore  # Should return $true
   ```
   Expected: Returns `$true`.

2. **Check if .worktrees/ is already in .gitignore.**
   ```powershell
   Select-String -Path .gitignore "\.worktrees"
   ```
   Expected: May be empty (not yet added) or show existing entry.

3. **If not already present, add .worktrees/ entry.**
   ```powershell
   Add-Content -Path .gitignore -Value "`n.worktrees/"
   ```
   Expected: No output. File is updated.

4. **Verify entry is present.**
   ```powershell
   Select-String -Path .gitignore "\.worktrees"
   ```
   Expected: Output shows `.worktrees/` line.

5. **Stage and commit the .gitignore change.**
   ```powershell
   git add .gitignore
   git commit -m @'
chore(git): add .worktrees/ to .gitignore

Linked worktrees are managed by git and should not be committed as
regular directory content. This entry prevents accidental nesting.

Story: ST-058
Task: §4.6
'@
   ```
   Expected: Output shows ".gitignore" changed with 1 insertion.

**Expected output:** 
- .gitignore updated with `.worktrees/` entry
- Commit recorded

**Requirement mapping:** 
- §2d row 6 (handle .worktrees per governance)

**Verification:**
```powershell
git ls-files .worktrees/  # Should return empty (no worktree files in index)
Select-String -Path .gitignore "\.worktrees"  # Should show the entry
```
Expected result: .worktrees/ is ignored by git.

**Failure handling:** If .worktrees/ accidentally got indexed:
```powershell
git rm --cached .worktrees/ -r  # Remove from index
git commit -m "fix(.gitignore): remove worktree from index"
```

---

### Task 4.7: Run full test suite and lint to gate merge-readiness

**Objective:** Verify that all ST-056, ST-042, and ST-041 changes pass validation.

**Input:** 
- Branch is `feat/ST-058-sync-alignment` with 5 commits (Tasks 4.3–4.6)
- Docker dev and test stacks are available

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Bring up the test infrastructure (if not already running).**
   ```powershell
   docker compose --profile test up -d
   ```
   Expected: Output shows container start messages or "already running" status.

2. **Wait 5 seconds for services to initialize.**
   ```powershell
   Start-Sleep -Seconds 5
   ```

3. **Run the full server test suite inside the mcp-test container.**
   ```powershell
   docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/
   ```
   Expected: Output concludes with "ok | all tests passed (131 tests in Xs)" or similar. **MUST show 131 tests passed, 0 failed.**

4. **Run lint (if linter is configured).**
   ```powershell
   docker compose --profile test exec mcp-test deno lint
   ```
   Expected: Output shows "0 linting errors detected" or similar. **MUST show 0 errors.**

5. **If either test or lint fails, investigate and report (see Failure handling below).**

**Expected output:** 
- Full suite: 131 tests passed, 0 failed
- Lint: 0 errors

**Requirement mapping:** 
- §2d row 7 (verify implementation quality)

**Verification:**
```powershell
# Capture full output for evidence
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/ 2>&1 | Tee-Object -FilePath test-output.txt
# Check final line
Select-String -Path test-output.txt "131 tests passed"
```
Expected result: test-output.txt contains "131 tests passed" and no failure messages.

**Failure handling:** 
- If tests fail, run a single failing test to get diagnostic output:
  ```powershell
  docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/<failing-test-file>.ts
  ```
- If lint fails, list errors:
  ```powershell
  docker compose --profile test exec mcp-test deno lint 2>&1
  ```
- If diagnostics show runtime module changes, restart mcp-test:
  ```powershell
  docker compose --profile test restart mcp-test
  ```
- If still failing, escalate (task gate, do not proceed to Task 4.8).

---

### Task 4.8: Create exec-plan-ST-056.md and update exec-plan-ST-042.md

**Objective:** Create the missing ST-056 ExecPlan and update ST-042's to mark Ready.

**Input:** 
- Template: `.github/planning/execplans/_TEMPLATE.md`
- ST-056 plan: `docs/plans/2026-06-14-001-fix-search-stall-and-observability-plan.md` (exists, status=completed)
- ST-042 plan: `docs/plans/2026-06-13-001-feat-migration-framework-plan.md` (untracked, now being committed)

**Working directory:** `c:\projects\ai-memory\.github\planning\execplans\`

**Steps:**

1. **Create exec-plan-ST-056.md from template.**
   
   Content (from template with ST-056 specifics filled in):
   ```markdown
   # ExecPlan — ST-056: Embedding Request Timeout Resilience

   > Status: ✅ Ready for /continue
   > Story: ST-056
   > Created: 2026-06-17
   > Parent: docs/plans/2026-06-14-001-fix-search-stall-and-observability-plan.md

   ## §1. Background & Context

   **Problem:** MCP request handler concurrency caused embedding-lane context 
   contamination—multiple simultaneous requests overwrote each other's active lane.
   Result: stalled or errored embeddings in high-concurrency scenarios.

   **Solution:** Refactor server/src/mcpDiagnostics.ts to use node:async_hooks 
   AsyncLocalStorage for request-scoped context isolation instead of 
   module-level _activeEmbeddingLane variable. Test: "embedding lane context: 
   concurrent requests do not overwrite each other".

   **Files affected:**
   - server/src/mcpDiagnostics.ts (refactored)
   - server/src/startupValidation.ts (ensureRecallQueriesTable removed; logic 
     moved to server/src/migrate.ts)
   - server/deno.lock (@types/node, undici-types added)
   - server/tests/mcp-diagnostics.test.ts (new isolation test)
   - server/tests/startup-validation.test.ts (old tests removed)

   ## §1b. Outcomes & Conclusions

   Completion status: **Full** — all acceptance criteria met.

   Key achievements:
   - Concurrent request lane isolation implemented via AsyncLocalStorage
   - All 131 server tests pass (including new "concurrent lane" test)
   - Lint clean (0 errors)
   - Commit: feat/ST-058-sync-alignment (included in wrap-up branch)

   Requirements met:
   - ✅ AsyncLocalStorage adopted in mcpDiagnostics
   - ✅ Module-level state removed; no regression in lane tracking
   - ✅ New test documents the fix and prevents regression
   - ✅ startupValidation cleaned (recall_queries repair moved to migrate)

   Architectural impact: 
   - **Supported** — aligns with plan R1-R6 (structured diagnostics, 
     concurrency safety, observability).

   Evidence:
   - server/src/mcpDiagnostics.ts: `import { AsyncLocalStorage }...` present
   - Commit: `git show HEAD~N --name-only` shows 7 files changed
   - Test output: "embedding lane context: concurrent requests..." PASS
   - Full suite: 131 tests passed, 0 failed

   Downstream: None (foundational); ST-045 (observability dash) can 
   now consume structured diagnostics.

   ## §2. Definition of Done

   - After Task 4.3 commit, `git log --name-only` shows mcpDiagnostics.ts updated
   - After Task 4.7 test run, output shows "131 tests passed"
   - After Task 4.13 cross-model review, ✅ PASS recorded for diagnostics code
   - After Task 4.14 PR open, CI gates pass (tests + lint)

   ## §2b. Definition of Ready

   - [x] Background and acceptance criteria documented
   - [x] Verification commands provided (Task 4.7 commands)
   - [x] No judgment calls; all steps in parent ST-058 plan
   - [x] Cross-model review gated before merge (Task 4.13)

   Status: ✅ Ready for /continue (as part of ST-058 wrap-up)

   ## §2d. Requirement Traceability

   | Requirement | Evidence | Task |
   |---|---|---|
   | Request context isolation (R1) | mcpDiagnostics.ts AsyncLocalStorage | 4.3 |
   | Concurrent safety (R2) | Test "concurrent requests" + 131/131 passed | 4.3, 4.7 |
   | No regression (R3) | Full suite 131/131, lint clean | 4.7 |
   | Migration 003 repair moved (R4) | startupValidation.ts ensureRecallQueriesTable removed | 4.3 |

   ## §3. Preconditions

   Included in parent ST-058 plan (Task §3).

   ## §4. Tasks

   All execution delegated to ST-058 parent plan:
   - Task 4.3: ST-056 diagnostics commit
   - Task 4.7: Test suite validation
   - Task 4.13: Cross-model review
   - Task 4.14: PR creation and merge

   See ST-058 plan for detailed steps.

   ## §5b. Recovery Ledger

   | Field | Value |
   |---|---|
   | Last completed task | Task 4.3 (commit) |
   | Last successful command | `git commit -m "refactor(diagnostics)..."` |
   | Expected outputs produced | mcpDiagnostics.ts, startupValidation.ts, deno.lock updated in commit |
   | Next task | Task 4.7 (test suite validation) |
   | Known blockers | None |
   | Last updated | 2026-06-17 |

   ## §1b. Outcomes & Conclusions (populated during execution)

   See Recovery Ledger and cross-model review record.
   ```

   Save as `.github/planning/execplans/exec-plan-ST-056.md`.

2. **Update exec-plan-ST-042.md status from "Not Ready" to "Ready".**
   
   Open `.github/planning/execplans/exec-plan-ST-042.md`, find the line:
   ```
   Status: ⬜ Not Ready — requires /plan
   ```
   Replace with:
   ```
   Status: ✅ Ready for /continue
   ```
   
   Also update §2b Definition of Ready status line to:
   ```
   Status: ✅ Ready for /continue (as part of ST-058 wrap-up)
   ```
   
   Add a note in §2c Plan Review Notes (if empty):
   ```
   **2026-06-17 (ST-058 wrap-up):** Artifacts promoted; schema path 
   discrepancy noted (implementation uses server/db/ directly, not 
   server/db/migrations/); future refactor can relocate. Migration runner 
   tested and validated; acceptance criteria met. Ready for merge.
   ```

3. **Stage and commit the ExecPlan updates.**
   ```powershell
   cd c:\projects\ai-memory
   git add .github/planning/execplans/exec-plan-ST-056.md .github/planning/execplans/exec-plan-ST-042.md
   git commit -m @'
docs(execplans): create ST-056 plan and update ST-042 to Ready

- Create .github/planning/execplans/exec-plan-ST-056.md
  (Embedding Request Timeout Resilience, status Ready)
- Update exec-plan-ST-042.md: mark status Ready, add wrap-up review notes
- Both plans now include traceability and cross-model review gating

Story: ST-058
Task: §4.8
'@
   ```
   Expected: Commit succeeds.

**Expected output:** 
- exec-plan-ST-056.md created
- exec-plan-ST-042.md updated to Ready with review notes

**Requirement mapping:** 
- §2d row 1 (ST-056 ExecPlan created)
- §2d row 2 (ST-042 ExecPlan updated)

**Verification:**
```powershell
Test-Path .github/planning/execplans/exec-plan-ST-056.md  # $true
Select-String -Path .github/planning/execplans/exec-plan-ST-042.md "Status: ✅ Ready"  # Should match
```
Expected result: Both files exist and show Ready status.

**Failure handling:** If a file is malformed (YAML front-matter broken), revert and re-create:
```powershell
git reset HEAD~1
# Re-create with careful YAML syntax
git add .github/planning/execplans/exec-plan-ST-056.md
git commit ...
```

---

### Task 4.9: Update exec-plan-ST-041.md to reflect completion

**Objective:** Update ST-041's ExecPlan to show that cypher injection hardening is delivered.

**Input:** 
- `.github/planning/execplans/exec-plan-ST-041.md` (exists, current status unclear but needs update)
- Evidence: stripCypherComments in server/index.ts, cypher-injection.test.ts passed

**Working directory:** `c:\projects\ai-memory\.github\planning\execplans\`

**Steps:**

1. **Open exec-plan-ST-041.md and check current status.**
   ```powershell
   Select-String -Path exec-plan-ST-041.md "^> Status:"
   ```
   Expected: Output shows current status (may be "Not Ready", "Ready", or other).

2. **Update status line to show completion.**
   
   Find:
   ```
   > Status: ⬜ Not Ready ...
   ```
   or
   ```
   > Status: ✅ Ready for /continue
   ```
   
   Replace with:
   ```
   > Status: ✅ Completed — cypher injection hardening delivered
   ```

3. **Add completion evidence to §1b Outcomes & Conclusions (or create if missing).**
   
   Add a section if not present:
   ```markdown
   ## §1b. Outcomes & Conclusions

   Completion status: **Full** — cypher injection hardening completed 
   in merged PR #6 (commit 56a492c).

   Key achievements:
   - stripCypherComments() function implemented in server/index.ts
   - Handles single-line comments (--), block comments (/* */), 
     quoted literals, line-comment-prefixed queries
   - cypher-injection.test.ts validates both whitespace-preserved 
     execution and comment stripping
   - All 131 server tests pass
   - Merged to origin/main via PR #6 (bbb78d9)

   Acceptance criteria:
   - ✅ Comments stripped before AGE execution
   - ✅ MATCH keyword check performed on stripped query
   - ✅ Dollar-quote injection blocked
   - ✅ No regression in other cypher tools (graph_traverse, graph_search)

   Evidence:
   - server/index.ts: `function stripCypherComments(cypher: string)`
   - server/tests/cypher-injection.test.ts: tests PASS
   - Commit: 56a492c (merged in bbb78d9)
   - Test suite: 131/131 passed

   Downstream: ST-045 (observability) can safely log cypher queries 
   without injection risk; ST-056 depends on graph_traverse safety.
   ```

4. **Update §2b Definition of Ready to mark as complete.**
   
   Find and update:
   ```
   Status: ⬜ Not ready ...
   ```
   to:
   ```
   Status: ✅ Complete (delivered in PR #6, merged 2026-06-16)
   ```

5. **Add a note in §2c Plan Review Notes:**
   ```markdown
   **2026-06-17 (ST-058 wrap-up):** Cypher injection hardening completed 
   and merged. stripCypherComments handles comments, literals, and injection 
   vectors. Validation test suite passes. Board state updated to reflect 
   delivered status.
   ```

6. **Stage and commit the update.**
   ```powershell
   cd c:\projects\ai-memory
   git add .github/planning/execplans/exec-plan-ST-041.md
   git commit -m @'
docs(execplans): mark ST-041 complete (cypher injection hardening shipped)

- Update exec-plan-ST-041.md status to Complete
- Add §1b outcomes documenting stripCypherComments implementation
- Note: Work completed in merged PR #6 (56a492c)
- cypher-injection.test.ts validates all attack vectors

Story: ST-058
Task: §4.9
'@
   ```
   Expected: Commit succeeds.

**Expected output:** 
- exec-plan-ST-041.md updated with completion evidence
- Status changed to Completed

**Requirement mapping:** 
- §2d row 3 (ST-041 ExecPlan reflects completion)

**Verification:**
```powershell
Select-String -Path .github/planning/execplans/exec-plan-ST-041.md "Status: ✅ Completed"
Select-String -Path .github/planning/execplans/exec-plan-ST-041.md "stripCypherComments"
```
Expected result: Both patterns found in the file.

**Failure handling:** If file structure is broken, revert:
```powershell
git reset HEAD~1
git checkout exec-plan-ST-041.md
# Manually edit and retry
```

---

### Task 4.10: Update story-board.md (add ST-058, mark ST-056/ST-042/ST-041 Done, refresh timestamp)

**Objective:** Synchronize the board with work stream completions.

**Input:** 
- `.github/planning/story-board.md` (exists, last updated 2026-06-10)
- Three stories to update: ST-056 (Backlog → Done), ST-042 (Backlog → Done), ST-041 (Refined → Done)
- One story to add: ST-058 (new wrap-up story, status Done)

**Working directory:** `c:\projects\ai-memory\.github\planning\`

**Steps:**

1. **Open story-board.md and locate the timestamp line (line 6).**
   ```powershell
   Select-String -Path story-board.md "Last updated:" | Select-Object -First 1
   ```
   Expected: Output shows "Last updated: 2026-06-10" or similar.

2. **Update the timestamp to today's date.**
   
   Find:
   ```
   Last updated: 2026-06-10
   ```
   Replace with:
   ```
   Last updated: 2026-06-17
   ```

3. **Locate ST-056 entry on the board (likely in Backlog section).**
   ```powershell
   Select-String -Path story-board.md "ST-056" -Context 1
   ```
   Expected: Shows line number and context.

4. **Update ST-056 state from Backlog to Done.**
   
   Find a line like:
   ```
   - [ ] ST-056: Embedding Request Timeout Resilience
   ```
   Replace with:
   ```
   - [x] ST-056: Embedding Request Timeout Resilience (Done)
   ```
   (Or update the checkbox if using a different format.)

5. **Locate ST-042 entry and update from Backlog to Done.**
   
   Find:
   ```
   - [ ] ST-042: Migration Framework (schema_migrations + startup runner)
   ```
   Replace with:
   ```
   - [x] ST-042: Migration Framework (schema_migrations + startup runner) (Done)
   ```

6. **Locate ST-041 entry and update from Refined to Done.**
   
   Find:
   ```
   - [ ] ST-041: Cypher Injection Hardening
   ```
   (or check Refined section for this entry)
   Replace with:
   ```
   - [x] ST-041: Cypher Injection Hardening (Done)
   ```

7. **Add ST-058 entry in the appropriate section (typically Done or just-completed).**
   
   Find the Done section (or add one near the top) and insert:
   ```
   - [x] ST-058: Governance Alignment & Work-Stream Sync (Done) — wrap-up PR to sync 
     ST-056 diagnostics, ST-042 migration artifacts, ST-041 cypher hardening with 
     board and ExecPlans; full-suite validation gated + cross-model review.
   ```

8. **Stage and commit the board update.**
   ```powershell
   cd c:\projects\ai-memory
   git add .github/planning/story-board.md
   git commit -m @'
docs(board): sync ST-056, ST-042, ST-041, add ST-058 wrap-up story

- Update board timestamp to 2026-06-17
- Mark ST-056 Done (embedding resilience diagnostics)
- Mark ST-042 Done (migration framework promotion)
- Mark ST-041 Done (cypher injection hardening, merged PR #6)
- Add ST-058 entry: Governance Alignment & Work-Stream Sync wrap-up

Story: ST-058
Task: §4.10
'@
   ```
   Expected: Commit succeeds.

**Expected output:** 
- story-board.md updated with all four story states
- Timestamp refreshed

**Requirement mapping:** 
- §2d row 8 (board synchronized with work completion)

**Verification:**
```powershell
Select-String -Path story-board.md "Last updated: 2026-06-17"
Select-String -Path story-board.md "ST-056.*Done"
Select-String -Path story-board.md "ST-042.*Done"
Select-String -Path story-board.md "ST-041.*Done"
Select-String -Path story-board.md "ST-058"
```
Expected result: All five patterns found.

**Failure handling:** If board format is unclear (e.g., not Markdown checkbox format):
```powershell
# Inspect current format
Get-Content story-board.md | Select-Object -First 50
# Adapt the find/replace to match actual format
```

---

### Task 4.11: Update FollowUpSessionLog.txt (session handoff)

**Objective:** Replace the stale session log with current wrap-up summary (max 40 lines).

**Input:** 
- `FollowUpSessionLog.txt` (exists, stale)

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Replace (not append) the entire FollowUpSessionLog.txt with current summary.**
   
   **New content:**
   ```
   === Wrap-Up Session Summary (ST-058) ===
   Date: 2026-06-17
   Branch: feat/ST-058-sync-alignment (tracking origin/main)
   
   COMPLETED:
   ✅ ST-056 (Embedding Request Timeout Resilience): AsyncLocalStorage 
      refactor committed; mcpDiagnostics.ts + startupValidation.ts updated
   ✅ ST-042 (Migration Framework): migrate.ts, 001_initial.sql, 
      migrations.test.ts, ce-plan promoted and committed
   ✅ ST-041 (Cypher Injection Hardening): stripCypherComments merged 
      in PR #6 (bbb78d9); ExecPlan updated to reflect completion
   ✅ Governance Artifacts: STRATEGY.md, .opencode/, opencode-mcp.json 
      committed; .worktrees/ added to .gitignore
   ✅ Validation: Full suite 131 tests passed; lint clean (0 errors)
   ✅ ExecPlans: Created ST-056, updated ST-042 & ST-041 with Ready status
   ✅ Board: Added ST-058 entry; marked ST-056/ST-042/ST-041 Done; 
      timestamp refreshed to 2026-06-17
   
   NEXT STEPS:
   1. /continue: Proceed to Task 4.13 (cross-model review) and Task 4.14 (PR creation)
   2. Cross-model review gates: Require independent review of ST-056 
      diagnostics and ST-042 migration runner before merge
   3. Merge to origin/main when CI + cross-model review ✅
   4. Update downstream stories (ST-045 observability, ST-048 ) with 
      references to completed work
   
   COMMITS MADE:
   - refactor(diagnostics): ST-056 AsyncLocalStorage refactor
   - feat(migrations): ST-042 migration framework promotion
   - chore(governance): governance artifacts
   - chore(git): .worktrees/ .gitignore entry
   - docs(execplans): ST-056 created, ST-042/ST-041 updated
   - docs(board): board sync
   
   PENDING (in active PR):
   - Cross-model review approval (Task 4.13)
   - CI gate pass (lint, tests, security scans)
   - PR merge to origin/main
   ```
   
   Save this exactly to `FollowUpSessionLog.txt` (replacing entire file, not appending).

2. **Verify line count.**
   ```powershell
   (Get-Content FollowUpSessionLog.txt | Measure-Object -Line).Lines
   ```
   Expected: Output is ≤40.

3. **Stage and commit.**
   ```powershell
   git add FollowUpSessionLog.txt
   git commit -m @'
docs(handoff): update session log with ST-058 wrap-up summary

Replace stale session log with current wrap-up status:
- Three stories marked Done (ST-056, ST-042, ST-041)
- Governance artifacts committed
- Board synchronized
- Validation gates passed
- Next: cross-model review + PR merge

Story: ST-058
Task: §4.11
'@
   ```
   Expected: Commit succeeds.

**Expected output:** 
- FollowUpSessionLog.txt replaced with current summary (≤40 lines)

**Requirement mapping:** 
- §2d row 9 (session handoff updated)

**Verification:**
```powershell
Get-Content FollowUpSessionLog.txt | Select-Object -First 3  # Show header
(Get-Content FollowUpSessionLog.txt | Measure-Object -Line).Lines  # Show count
```
Expected result: File contains wrap-up summary, line count ≤40.

**Failure handling:** If file is too long, trim less-critical details and re-commit:
```powershell
# Edit to remove extra details
git add FollowUpSessionLog.txt
git commit --amend -m "docs(handoff): ..."
```

---

### Task 4.12: Verify test suite and lint one final time before code review

**Objective:** Confirm final state is merge-ready before cross-model review gate.

**Input:** 
- Branch is `feat/ST-058-sync-alignment` with all commits staged (Tasks 4.3–4.11)
- Docker test infrastructure still running

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Run the full test suite one more time.**
   ```powershell
   docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/
   ```
   Expected: Output concludes with "ok | all tests passed (131 tests in Xs)".

2. **Run lint.**
   ```powershell
   docker compose --profile test exec mcp-test deno lint
   ```
   Expected: Output shows "0 linting errors detected".

3. **Verify git log shows all expected commits on this branch.**
   ```powershell
   git log --oneline feat/ST-058-sync-alignment..origin/main | wc -l  # Should be 0 or minimal
   git log --oneline origin/main..feat/ST-058-sync-alignment | wc -l  # Should be ~7 (our commits)
   ```
   Expected: First command shows branch is on top of origin/main; second shows commit count matches our work (Task 4.3–4.11, roughly 6–7 commits).

**Expected output:** 
- Test suite passes (131/131)
- Lint clean (0 errors)
- Git log confirms all commits present

**Requirement mapping:** 
- §2d row 7 (final verification before review)

**Verification:**
```powershell
git log --oneline -10  # Show recent commits
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/ 2>&1 | Tail -5  # Last 5 lines of test output
```
Expected result: Both succeed; commits visible; test suite passes.

**Failure handling:** 
- If a test fails, investigate and fix:
  ```powershell
  docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/<failing-file>.ts
  ```
- If lint fails, check the error and rerun after fix:
  ```powershell
  docker compose --profile test exec mcp-test deno lint 2>&1 | head -20
  ```
- If both pass, proceed to Task 4.13.

---

### Task 4.13: Trigger cross-model code review for ST-056 and ST-042

**Objective:** Gate the merge on an independent code review by a different LLM model before proceeding to PR creation.

**Input:** 
- Branch is `feat/ST-058-sync-alignment` with all commits
- All tests and lint pass (verified in Task 4.12)
- Code touches critical systems: ST-056 (diagnostics), ST-042 (migrations)

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Prepare a code review request document for independent review.**
   
   Create a file `.github/reviews/ST-058-cross-model-review-request.md` with content:
   ```markdown
   # Cross-Model Code Review Request — ST-058 Wrap-Up

   ## Review Scope

   Two critical work-streams for independent LLM review:

   ### ST-056: Embedding Request Timeout Resilience

   **Files:** 
   - server/src/mcpDiagnostics.ts (AsyncLocalStorage refactor)
   - server/src/startupValidation.ts (cleanup)
   - server/deno.lock (@types/node addition)
   - server/tests/mcp-diagnostics.test.ts (new concurrent-context test)

   **What to review:**
   - AsyncLocalStorage usage is thread-safe and correctly isolates 
     per-request context
   - runWithMcpRequestContext(fn) correctly wraps handler execution
   - No context leakage between concurrent requests
   - ensureRecallQueriesTable removal does not break startup
   - New test adequately validates concurrent isolation
   - Dependencies (@types/node) are appropriate and minimal

   **Test evidence:**
   - New test "embedding lane context: concurrent requests..." PASS
   - Full suite 131/131 pass
   - Lint clean

   ### ST-042: Migration Framework

   **Files:**
   - server/src/migrate.ts (migration runner)
   - server/db/001_initial.sql (version marker)
   - server/tests/migrations.test.ts (runner tests)
   - docs/plans/2026-06-13-001-feat-migration-framework-plan.md (ce-plan)

   **What to review:**
   - runMigrations() correctly detects existing schema state
   - detectBootstrapVersions() probes correctly (thoughts table → v1, 
     needs_embedding → v2, search_text + normalizer_version + recall_queries → v3)
   - repairMissingMigration003Artifacts() safely re-applies v3 if recorded 
     but artifacts missing
   - applyAndRecordVersion() transactionally applies migrations and 
     records version
   - Error handling: Deno.exit(1) on failure is appropriate for startup context
   - Test coverage is complete (temp-migration, broken-migration, normal flow)
   - Schema path note: Implementation uses server/db/ directly, not 
     server/db/migrations/; acceptable for initial release; flag if 
     future refactor needed

   **Test evidence:**
   - migrations.test.ts tests pass
   - Full suite 131/131 pass

   ## Review Checklist

   - [ ] ST-056 AsyncLocalStorage correctly isolates concurrent requests
   - [ ] ST-056 new test validates the fix (no false pass)
   - [ ] ST-056 no regressions in other MCP diagnostics
   - [ ] ST-042 migration detection is sound (all bootstrap paths covered)
   - [ ] ST-042 migration application is atomic (transaction safety)
   - [ ] ST-042 error handling is appropriate for startup context
   - [ ] ST-042 schema path discrepancy flagged (ok for now, document future work)
   - [ ] Both stories have no security, performance, or maintainability gaps
   - [ ] Board and ExecPlan updates are accurate and consistent

   ## Approval Criteria

   ✅ **PASS** if:
   - All checklist items confirmed and signed off
   - No blocker-level issues identified (gaps, regressions, design flaws)
   - Reviewer confident work is production-ready

   ❌ **FAIL** if:
   - Security vulnerability in context isolation or migration safety
   - Test coverage inadequate or tests written incorrectly
   - Regressions in existing functionality
   - Schema path discrepancy is unacceptable (escalate design decision)

   ## Reviewer Instructions

   1. Clone/pull the feat/ST-058-sync-alignment branch
   2. Review code changes in the two work-streams above
   3. Check test execution: `docker compose --profile test exec mcp-test deno test ...`
   4. Sign off below with model name, date, and checklist result
   5. File review summary in this document or as a separate PR comment

   ---

   ## Review Results

   (Completed by independent reviewer)

   **Reviewer Model:** [e.g., Claude Opus, GPT-4, etc.]
   **Date:** [ISO date]
   **Result:** ✅ PASS / ❌ FAIL

   **Findings:**
   [Summary of any issues, design notes, or sign-offs]

   **Signature:**
   [Reviewer confirmation or escalation]
   ```

   Save this file to `.github/reviews/ST-058-cross-model-review-request.md`.

2. **Display the review request for human reviewer to act upon.**
   ```powershell
   Get-Content .github/reviews/ST-058-cross-model-review-request.md
   ```
   Output should show the full review request template.

3. **Wait for independent reviewer to complete the cross-model review.**
   
   (This step requires human/external intervention. The executor pauses here 
   and waits for an independent LLM code review completion.)
   
   Expected: Reviewer fills in §Review Results with:
   - Model name (e.g., gpt-4-turbo, claude-opus)
   - Date
   - ✅ PASS or ❌ FAIL result
   - Summary of findings

4. **Once review is signed off, proceed to Task 4.14 (PR creation).**

**Expected output:** 
- Review request document created and visible
- Cross-model review completed and signed
- Result recorded in `.github/reviews/ST-058-cross-model-review-request.md`

**Requirement mapping:** 
- §2d row 10 (cross-model review gate satisfied)

**Verification:**
```powershell
Select-String -Path .github/reviews/ST-058-cross-model-review-request.md "Result: ✅ PASS"
```
Expected result: Pattern found in review file (reviewer has signed off).

**Failure handling:** 
- If review finds issues, address them:
  1. Note the issue and reviewer recommendation in the request file
  2. Return to the relevant task (e.g., Task 4.3 for ST-056, Task 4.4 for ST-042)
  3. Fix the code, re-commit, and re-run Task 4.12 validation
  4. Re-submit for cross-model review
- If reviewer requests schema path refactor for ST-042 before merge, escalate to PO (design decision).

---

### Task 4.14: Create PR and merge to origin/main

**Objective:** Push the wrap-up branch to GitHub, open a PR, gate on CI and review, then merge.

**Input:** 
- Branch `feat/ST-058-sync-alignment` with all commits
- Tests pass, lint clean, cross-model review ✅ PASS
- GitHub CLI (`gh`) authenticated

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Push the branch to origin.**
   ```powershell
   git push -u origin feat/ST-058-sync-alignment
   ```
   Expected: Output shows branch tracking set and commits uploaded.

2. **Create a PR using GitHub CLI.**
   ```powershell
   gh pr create `
     --title "ST-058: Governance Alignment & Work-Stream Sync Wrap-Up" `
     --body @'
# ST-058: Governance Alignment & Work-Stream Sync Wrap-Up

## Summary

This PR wraps up three concurrent work-streams (ST-056, ST-042, ST-041) 
and aligns their code, plans, and governance artifacts.

### ST-056: Embedding Request Timeout Resilience

- AsyncLocalStorage refactor in mcpDiagnostics.ts fixes concurrent 
  request context contamination
- Startup validation cleanup (ensureRecallQueriesTable moved to migrate.ts)
- New test validates concurrent request isolation
- All 131 tests pass; lint clean

**Review:** ✅ Cross-model review PASS 
[Link to: `.github/reviews/ST-058-cross-model-review-request.md`]

### ST-042: Migration Framework

- Migration runner (migrate.ts) with bootstrap detection
- Version marker (001_initial.sql) and comprehensive tests
- CE plan committed for future reference
- Schema path note: implementation uses server/db/ directly; 
  acceptable for initial release; future refactor may relocate
- All 131 tests pass; lint clean

**Review:** ✅ Cross-model review PASS
[Link to: `.github/reviews/ST-058-cross-model-review-request.md`]

### ST-041: Cypher Injection Hardening

- stripCypherComments() already merged in PR #6 (56a492c)
- ExecPlan updated to reflect completion
- Board marked Done

### Governance Sync

- STRATEGY.md, .opencode/, opencode-mcp.json committed
- .worktrees/ added to .gitignore
- Board updated: ST-056, ST-042, ST-041 marked Done; ST-058 added
- ExecPlans updated: ST-056 created, ST-042 & ST-041 marked Ready/Completed
- Session handoff (FollowUpSessionLog.txt) refreshed

## Acceptance

- ✅ All 131 tests pass
- ✅ Lint clean (0 errors)
- ✅ Cross-model review approved for ST-056 & ST-042
- ✅ No regressions in existing functionality
- ✅ ExecPlans and board consistent with delivered work
- ✅ Ready to merge and unblock downstream stories (ST-045, ST-048)

## Testing

Full server test suite:
```
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/
# Result: 131 tests passed, 0 failed
```

Lint:
```
docker compose --profile test exec mcp-test deno lint
# Result: 0 linting errors detected
```

## Related

- Closes / Related to: ST-056, ST-042, ST-041
- ExecPlan: `.github/planning/execplans/exec-plan-ST-058.md`
'@ `
     --base main
   ```
   Expected: Output shows PR number and URL.

3. **Wait for CI pipeline to run and complete.**
   
   Expected: GitHub Actions CI runs (lint, tests, security checks, etc.).
   Expected result: All checks pass (green status).

4. **Verify PR status.**
   ```powershell
   gh pr view feat/ST-058-sync-alignment --json state,checks
   ```
   Expected: Output shows state: "OPEN" and all checks in "PASS" status.

5. **Merge the PR.**
   ```powershell
   gh pr merge feat/ST-058-sync-alignment --merge
   ```
   Expected: Output shows PR merged successfully. GitHub displays "Pull request 
   successfully merged and closed".

6. **Delete the feature branch (optional, clean housekeeping).**
   ```powershell
   git push origin --delete feat/ST-058-sync-alignment
   git branch -d feat/ST-058-sync-alignment
   ```
   Expected: Branch deleted locally and on origin.

7. **Fetch latest and verify local main is up to date.**
   ```powershell
   git fetch origin
   git checkout main
   git log --oneline -3
   ```
   Expected: Local main now matches origin/main; new commits visible.

**Expected output:** 
- PR created and merged to origin/main
- All CI checks pass
- Branch deleted

**Requirement mapping:** 
- §2d row 11 (merge gated on CI + cross-model review)

**Verification:**
```powershell
git log origin/main --oneline | Select-Object -First 1  # Should show the merge commit
gh pr view feat/ST-058-sync-alignment  # PR is closed/merged
```
Expected result: PR merged; merge commit visible on origin/main.

**Failure handling:** 
- If CI fails, wait for logs, fix issues, and re-push:
  ```powershell
  # Fix the code based on CI failure
  git add <fixed-files>
  git commit -m "fix(st-058): resolve CI failure in <component>"
  git push
  ```
- If PR cannot merge (merge conflict), rebase:
  ```powershell
  git fetch origin
  git rebase origin/main
  git push --force-with-lease
  ```
- If cross-model review is not yet signed off, **do not merge**; return to Task 4.13.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b Recovery Ledger to resume.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — Create wrap-up branch |
| **Known blockers** | None |
| **Last updated** | — |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-06-17T00:00Z | Preconditions | ✅ Complete | Tools verified, branch ready, all input files present | Task 4.1 |
| — | Task 4.1 | — | — | — |

### Avoidance

(Append dated entries here documenting any rollback decisions or approach changes.)

---

## §5c. Approach Ledger

### Approach Registry

| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Primary: Single wrap-up branch (ST-058) merges all work to origin/main after cross-model review | Task 4.1 (new branch) | 🟢 Active |
| 2 | Alternative: If critical issue found in code review, revert commit and fix on current branch | Task 4.3 or 4.4 (rollback commit) | ⬜ Reserve |

### Approach Failure Log

(Empty — no failures yet)

**Rollback triggers:**
- Cross-model review returns ❌ FAIL with blocker issues → return to offending task, fix, re-test, re-review
- CI pipeline fails 2+ times on same check → propose reverting and debugging before re-merge
- Test suite fails after Task 4.12 verification → investigate and fix before proceeding to PR

---

## §6. Execution Log

(Populated during execution — timestamped entries of significant actions)

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

- Observation: [placeholder]
  Evidence: [placeholder]
  Impact: [placeholder]

---

## §6c. Decision Log

(Document decisions made during execution that deviate from the plan or require PO approval retroactively.)

- **Decision:** [placeholder]
  **Rationale:** [placeholder]
  **Impact:** [placeholder]
  **Approved by:** [placeholder]

---

## §7b. Outcomes & Retrospective

(Populated at session end)

---
