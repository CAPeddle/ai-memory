# ExecPlan — ST-N: Story Title

> Status: ⬜ Not Ready | ✅ Ready for /continue
> Story: ST-N
> Created: YYYY-MM-DD
> Parent: linked investigation or design doc
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. The sections §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective must be kept up to date as work proceeds.

---

## §1. Background & Context

Explain in prose what someone gains after this change and how they can see it working. State the user-visible behaviour you will enable. Describe the current state relevant to this task as if the reader knows nothing. Name key files and modules by full repository-relative path. Define any non-obvious term you will use.

Do not refer to prior plans or external docs — embed all needed knowledge here.

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:
- After [action], [observable outcome] (e.g. "After running `dotnet test`, all tests pass with 0 failures")

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [ ] All tasks have step-by-step instructions (no "figure out" tasks)
- [ ] Architecture and design decisions documented (not left to executor)
- [ ] Input and expected output specified for each task
- [ ] Error handling strategy noted for external interactions
- [ ] No tasks require judgment calls needing broad project context
- [ ] Script templates or boilerplate provided in §3 where applicable
- [ ] Every task ends with a verification step (command or assertion)
- [ ] Acceptance criteria phrased as observable behaviour

Status: ⬜ Not ready — requires /plan

---

## §2c. Plan Review Notes

(Empty — populated by /continue when escalating issues)

---

## §3. Preconditions

List any prerequisites:
- Tools installed (with versions)
- Environment variables set
- Prior stories that must be Done
- Files that must exist

Include boilerplate or script templates the executor will need.

---

## §4. Task Definitions

### Task 4.1: Title

**Objective:** What this task achieves in one sentence.

**Input:** What files/state are needed before starting.

**Working directory:** `c:\projects\ai-memory\` (or subdirectory)

**Steps:**
1. Specific instruction with exact file paths
2. Specific instruction with exact commands
3. ...

**Expected output:** Files created/modified, observable state change.

**Verification:**
```
exact command to run
```
Expected result: description of what success looks like.

**Failure handling:** What to do if verification fails.

---

### Task 4.2: Title

(Same format as above — repeat for each task)

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger must always reflect the current state of progress.

---

## §5b. Recovery Ledger

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — [first task title] |
| **Known blockers** | None |
| **Last updated** | — |

### Avoidance

(Empty — populated by /recover after failures)

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Primary approach | — | 🟢 Active |
| 2 | Alternative if #1 fails | — | ⬜ Reserve |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

---

## §6. Execution Log

(Populated during execution — timestamped entries of significant actions)

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

- Observation: ...
  Evidence: ...
  Impact: ...

---

## §6c. Decision Log

(Record every decision made during execution with rationale.)

- Decision: ...
  Rationale: ...
  Date: ...

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

(Summarise at completion: what was achieved, what remains, lessons learned.)

Achieved: ...
Remains: ...
Lesson: ...

---

## Revision Notes

(Append a note here whenever this ExecPlan is modified, explaining what changed and why.)
