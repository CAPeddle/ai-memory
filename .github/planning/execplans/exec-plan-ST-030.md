# ExecPlan — ST-030: Add `.gitattributes` and Normalize Line Endings

> Status: ✅ Ready for /continue
> Story: ST-030
> Created: 2026-05-19
> Approved: 2026-05-19 (PO, /plan review)
> Parent: `.github/planning/query-packets/QP-030-gitattributes-line-endings.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

The ai-memory repository today has no `.gitattributes` file and runs with `core.autocrlf=false`. Windows-based development sessions periodically leave the working tree with CRLF line endings on files committed with LF, producing a recurring `git status` false-positive: files appear "modified" with diffs that are pure line-ending swap (every line replaced by an identical line, zero semantic change).

This story creates a `.gitattributes` policy at the repo root and runs a one-time renormalization to put the working tree in the canonical state and prevent future drift.

**Current observable state (verified 2026-05-19):**

```
$ git diff --stat
 server/Dockerfile          |  12 +-
 server/db/graph.sql        | 252 ++++++++++++++++++++--------------------
 server/db/schema.sql       | 284 ++++++++++++++++++++++-----------------------
 server/src/parseContext.ts |  82 ++++++-------
 4 files changed, 315 insertions(+), 315 deletions(-)

$ git ls-files --eol server/Dockerfile server/db/graph.sql server/db/schema.sql server/src/parseContext.ts
i/lf    w/crlf  attr/                   server/Dockerfile
i/lf    w/crlf  attr/                   server/db/graph.sql
i/lf    w/crlf  attr/                   server/db/schema.sql
i/lf    w/crlf  attr/                   server/src/parseContext.ts

$ git config --get core.autocrlf
false
```

The 315/315 symmetric insertion/deletion count and the side-by-side diff (identical content with different line terminators) confirm the diagnosis. No `.gitattributes` exists at the repo root (verified by `Glob` for `.gitattributes`).

**After this story is complete:**

1. A new `.gitattributes` exists at the repo root encoding the policy: LF for source files, CRLF for Windows scripts (`.bat`/`.cmd`/`.ps1`), binary detection via Git's heuristic.
2. The current 4 false-positive "modified" server files are gone — `git status` is clean.
3. All 8 tracked `.ps1` files are CRLF in both the index and the working tree.
4. The Deno test suite under `server/tests/` still passes — proving no semantic regression.

**Key files:**

- `.gitattributes` — does not exist today; will be created at repo root (`c:\projects\ai-memory\.gitattributes`)
- `server/Dockerfile`, `server/db/graph.sql`, `server/db/schema.sql`, `server/src/parseContext.ts` — currently drifted to CRLF in working tree; renormalize will fix
- `analyze-file-types.ps1`, `.github/planning/scripts/build-governance-catalog.ps1`, `.github/planning/scripts/validate-governance-catalog.ps1`, `tools/split-investigations.ps1`, `tools/repair-landing-pages.ps1`, `tools/fix-crlf.ps1`, `tools/normalize-nested-trees.ps1`, `tools/fix-matrix-paths.ps1` — 8 tracked `.ps1` files; will be normalized to CRLF if not already
- `tools/fix-crlf.ps1` — misnamed (actually a blank-line stripper); explicitly **not** touched by this story

**Key terms:**

- **Line-ending normalization** — Git's process of converting between LF (Unix) and CRLF (Windows) when staging or checking out files, controlled by `.gitattributes` rules.
- **`text=auto`** — Git inspects the first 8000 bytes of a file; if it sees a NUL byte the file is treated as binary (no normalization); otherwise as text.
- **`eol=lf` / `eol=crlf`** — Forces the working-tree line ending regardless of the index state. Overrides any `core.autocrlf` setting.
- **Renormalize** — `git add --renormalize .` rewrites each text blob in the index by re-reading it from the working tree under current `.gitattributes` rules.
- **False positive in `git status`** — `git status` reports a file as modified because the working-tree line endings differ from the index, even though the byte sequences match line-by-line after normalization.

---

## §1b. Outcomes & Conclusions

(To be populated by /continue at story completion. Use the template structure: completion status, key findings, requirements met/unmet, architectural impact, supporting evidence, downstream changes.)

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

1. After `git status` runs from a clean checkout, no files are reported as modified.
2. After `git ls-files --eol -- server/Dockerfile server/db/graph.sql server/db/schema.sql server/src/parseContext.ts` runs, every line shows `i/lf` and `w/lf`.
3. After `git ls-files --eol -- '*.ps1'` runs, every line shows `i/crlf` and `w/crlf`.
4. After `cd server && deno test --allow-net --allow-env --allow-read` runs, all tests pass with the same outcome as the most recent green run prior to this story.
5. The file `.gitattributes` exists at the repo root and contains the exact content specified in Task 4.1.

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ✅ Ready for /continue (PO-approved 2026-05-19).

---

## §2c. Plan Review Notes

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| "LF for source files" (QP-030 Decision 1) | `.gitattributes` line `* text=auto eol=lf` | Task 4.1 | Task 4.1 verification: `Select-String -Path .gitattributes -Pattern '\* text=auto eol=lf'` returns one match |
| "CRLF for Windows scripts" (QP-030 Decision 1) | `.gitattributes` lines `*.bat text eol=crlf`, `*.cmd text eol=crlf`, `*.ps1 text eol=crlf` | Task 4.1 | Task 4.1 verification: `Select-String -Path .gitattributes -Pattern 'eol=crlf'` returns three matches |
| "Binary auto-detect" (QP-030 Decision 1) | `.gitattributes` uses `text=auto` (no explicit `binary` lines required) | Task 4.1 | Inspection: `.gitattributes` contains no `binary` keyword; `text=auto` present in baseline |
| "Repo-wide scope" (QP-030 Decision 2) | `.gitattributes` rules use `*` baseline at repo root | Task 4.1 | File location is `c:\projects\ai-memory\.gitattributes` (not nested) |
| "Renormalize and single commit" (QP-030 Decision 3) | One commit on `main` adding `.gitattributes` + renormalized files | Task 4.2 | Task 4.2 verification: `git log -1 --stat` shows `.gitattributes` plus renormalized files in one commit; commit message matches `build: add .gitattributes and normalize line endings` |
| "`git status` clean" (QP-030 AC 1) | Empty `git status` output post-commit | Task 4.3 | Task 4.3 verification: `git status --porcelain` produces zero lines |
| "Server `.ts`/`.sql`/Dockerfile are LF" (QP-030 AC 2) | Index + working tree both LF for the 4 paths | Task 4.3 | Task 4.3 verification: `git ls-files --eol -- server/Dockerfile server/db/graph.sql server/db/schema.sql server/src/parseContext.ts` shows `i/lf w/lf` for each |
| "Tracked `.ps1` are CRLF" (QP-030 AC 3) | Index + working tree both CRLF for every tracked `.ps1` | Task 4.3 | Task 4.3 verification: `git ls-files --eol -- '*.ps1'` shows `i/crlf w/crlf` for each line |
| "Tests still pass" (QP-030 AC 4) | Deno test suite green | Task 4.4 | Task 4.4 verification: `deno test --allow-net --allow-env --allow-read` exits 0 |

---

## §3. Preconditions

Tools and environment:
- Git ≥ 2.30 (any modern Git supports `text=auto eol=lf`)
- PowerShell 7+ (the tool is invoked from `c:\projects\ai-memory\` on Windows)
- Docker Desktop running (so the `mcp` and `db` services can come up for Task 4.4)
- `.venv/` (Python virtual env) is already gitignored — no special handling needed

Prior stories that must be Done:
- None (ST-005 and ST-022 are in Done as of 2026-05-19; ST-030 has no blocker)

Files that must exist before starting:
- None — `.gitattributes` is created in Task 4.1

Repository assumptions (verified during /plan 2026-05-19):
- No `.gitattributes` exists at any level (verified via `Glob` pattern `.gitattributes`)
- `core.autocrlf` is `false` (verified via `git config --get core.autocrlf`)
- The 4 server/ files listed in §1 currently have `i/lf w/crlf` (verified via `git ls-files --eol`)
- 8 tracked `.ps1` files exist (paths listed in §1 Key files)

Boilerplate — `.gitattributes` content to be written by Task 4.1 (exact bytes, LF-terminated):

```
# Default: detect binary vs text automatically; text files use LF in working tree
* text=auto eol=lf

# Windows scripts must remain CRLF
*.bat text eol=crlf
*.cmd text eol=crlf
*.ps1 text eol=crlf
```

---

## §4. Task Definitions

### Task 4.1: Create `.gitattributes` at repo root

**Objective:** Write the policy file that Git will use for line-ending normalization on every future checkout, commit, and `--renormalize` operation.

**Input:** None — the file does not exist today.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `c:\projects\ai-memory\.gitattributes` with exactly the content shown in §3 (the six-line block beginning with `# Default: detect binary vs text automatically;`). The file must end with a final LF — write it with LF line endings (not CRLF) to model the policy the file itself enforces.

**Expected output:**

- New file `c:\projects\ai-memory\.gitattributes` containing the §3 content.
- File is untracked at this point (`git status` lists it under "Untracked files").

**Requirement mapping:**

Satisfies §2d rows: "LF for source files", "CRLF for Windows scripts", "Binary auto-detect", "Repo-wide scope".

**Verification:**

Run all three from `c:\projects\ai-memory\`:

```powershell
Test-Path .gitattributes
Select-String -Path .gitattributes -Pattern '\* text=auto eol=lf'
Select-String -Path .gitattributes -Pattern 'eol=crlf' | Measure-Object | Select-Object -ExpandProperty Count
```

Expected results:
- Line 1: `True`
- Line 2: one match line printed (the baseline rule)
- Line 3: `3` (the three `eol=crlf` rules for `.bat`, `.cmd`, `.ps1`)

**Failure handling:**

- If `Test-Path` returns `False`: file write failed; re-attempt the write and re-verify.
- If `Select-String` returns no matches or wrong counts: file content is malformed; delete `.gitattributes` and rewrite from §3 verbatim.

---

### Task 4.2: Renormalize the working tree and commit

**Objective:** Apply the new policy to all currently tracked text files in a single atomic commit.

**Input:** `.gitattributes` exists at repo root (from Task 4.1). Working tree may have the 4 server/ files with CRLF; tracked `.ps1` files may be LF or CRLF.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Stage the new `.gitattributes`:
   ```
   git add .gitattributes
   ```
2. Renormalize all tracked text files using the new rules:
   ```
   git add --renormalize .
   ```
   This rewrites each text blob in the index by re-reading from the working tree under the new policy. Files whose stored form already matches will be no-ops; the 4 server/ files and any LF-stored `.ps1` will be re-staged.
3. Inspect what will be committed (sanity check; do not modify):
   ```
   git status --short
   git diff --cached --stat
   ```
   Expected: `.gitattributes` listed as a new file; some number of staged modifications (whitespace-only).
4. Commit:
   ```powershell
   git commit -m "build: add .gitattributes and normalize line endings"
   ```

**Expected output:**

- One new commit on `main` (or current branch) whose patch contains `.gitattributes` plus the renormalized files.
- `git log -1 --oneline` shows the commit subject `build: add .gitattributes and normalize line endings`.

**Requirement mapping:**

Satisfies §2d row: "Renormalize and single commit".

**Verification:**

Run from `c:\projects\ai-memory\`:

```powershell
git log -1 --pretty=format:'%s'
git log -1 --name-only --pretty=format: | Select-String '\.gitattributes'
```

Expected results:
- Line 1: `build: add .gitattributes and normalize line endings`
- Line 2: one match line (`.gitattributes` appears in the commit's file list)

**Failure handling:**

- If pre-commit hooks block the commit: read the hook output, fix the underlying issue, re-stage if necessary, and create a new commit (do not `--amend`). The renormalize is idempotent — running `git add --renormalize .` again is safe.
- If `git add --renormalize .` exits non-zero: capture the error and stop. Likely cause is a permission issue on a file; resolve and retry.

---

### Task 4.3: Verify clean state and per-extension EOL

**Objective:** Confirm the policy took effect and the false-positive churn is gone.

**Input:** Commit from Task 4.2 exists on `main`.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Confirm `git status` is clean:
   ```
   git status --porcelain
   ```
2. Confirm the 4 server/ files are now LF in both index and working tree:
   ```
   git ls-files --eol -- server/Dockerfile server/db/graph.sql server/db/schema.sql server/src/parseContext.ts
   ```
3. Confirm all tracked `.ps1` files are CRLF in both index and working tree:
   ```
   git ls-files --eol -- '*.ps1'
   ```

**Expected output:**

- Step 1: zero lines of output (clean tree).
- Step 2: four lines, each beginning with `i/lf    w/lf`.
- Step 3: 8 lines (one per tracked `.ps1`), each beginning with `i/crlf   w/crlf`.

**Requirement mapping:**

Satisfies §2d rows: "`git status` clean", "Server `.ts`/`.sql`/Dockerfile are LF", "Tracked `.ps1` are CRLF".

**Verification:**

The three commands above ARE the verification. Capture their output verbatim and paste into §6 (Execution Log) on completion.

**Failure handling:**

- If step 1 reports files modified: this means renormalize missed something. Run `git add --renormalize .` again and create an amendment commit (a second commit titled `build: complete line-ending renormalization`, not an `--amend`).
- If step 2 shows `w/crlf` for any of the 4 paths: the working tree still has CRLF. Run `git checkout -- <path>` for that file (the index is correct; this re-extracts under current rules), then re-run step 1.
- If step 3 shows `w/lf` for any `.ps1`: same remedy — `git checkout -- <path>`.

---

### Task 4.4: Confirm no semantic regression

**Objective:** Prove that the renormalization changed no code behaviour by running the existing Deno test suite.

**Input:** Commit from Task 4.2 on `main`; Docker Desktop running.

**Working directory:** `c:\projects\ai-memory\server`

**Steps:**

1. Bring up the database service (if not already running):
   ```powershell
   docker compose up -d db
   ```
   Wait for the `db` container to report healthy:
   ```powershell
   docker compose ps db
   ```
   The `STATUS` column should show `Up ... (healthy)`.
2. Run the Deno test suite:
   ```
   deno test --allow-net --allow-env --allow-read
   ```

**Expected output:**

- All tests pass. The summary line ends with `ok`.
- Exit code 0 (in PowerShell: `$LASTEXITCODE` is `0` immediately after the command returns).

**Requirement mapping:**

Satisfies §2d row: "Tests still pass".

**Verification:**

```powershell
deno test --allow-net --allow-env --allow-read
$LASTEXITCODE
```

Expected: the final printed line is `0`. If the test command produced its own pass/fail summary line, capture it into §6.

**Failure handling:**

- If any test fails: STOP. This is unexpected — renormalization should not change behaviour. Investigate the specific failure; do not "fix" the test by reverting the renormalization without first proving the renormalization is the cause. Capture the failure output into §6c (Decision Log) before deciding next step.
- If `db` container fails to come up: check `docker compose logs db`; this is independent of ST-030 (an environment issue, not a normalization issue).

---

## §5. State Recovery Protocol

If the executor session is interrupted, read §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that is append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — Create `.gitattributes` at repo root |
| **Known blockers** | None |
| **Last updated** | 2026-05-19 (created by /plan; not yet executed) |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| — | — | — | — | — |

### Avoidance

(Append dated entries here. Do not delete prior guidance.)

---

## §5c. Approach Ledger

### Approach Registry

| # | Description | Rollback Point | Status |
|---|---|---|---|
| 1 | Single-commit renormalize: `.gitattributes` + renormalized files together | Pre-Task 4.1 (no commit yet); `git reset --hard HEAD~1` after Task 4.2 to revert | 🟢 Active |
| 2 | Two-commit split: commit `.gitattributes` first, then renormalize separately | Pre-Task 4.2 | ⬜ Reserve (only if Approach 1 produces a commit too large to review) |

### Approach Failure Log

(Empty — no failures yet)

**Rollback triggers:**
- Task 4.4 test failure attributable to renormalize → propose rollback (`git reset --hard HEAD~1`) and re-plan with smaller scope
- 3 failed attempts at Task 4.2 commit → MUST propose rollback (hard cap)

---

## §6. Execution Log

(Populated during execution — timestamped entries of significant actions)

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

---

## §6c. Decision Log

(Record every decision made during execution with rationale.)

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (Tasks 4.3 and 4.4 commands re-run with output captured)
2. Update board: move story from Backlog → In Progress → Review
3. Present results to PO with artifact links: `.gitattributes`, the commit SHA, the §6 execution log
4. Log any Tier 1 compound detections (none anticipated for this story)

---

## §7b. Outcomes & Retrospective

(Use this section for retrospective depth only. The primary at-a-glance outcomes summary belongs in §1b.)

Achieved: ...
Remains: ...
Lesson: ...

---

## Revision Notes

- 2026-05-19 — Initial draft created by /plan after PO scope-lock during ST-008 planning kickoff. Diagnosis: 4 server/ files with `i/lf w/crlf` drift; no `.gitattributes` at repo root.
