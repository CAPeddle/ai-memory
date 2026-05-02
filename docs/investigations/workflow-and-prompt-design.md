# Investigation: Workflow & Prompt Design

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Complete |
| **Scope** | Three-prompt workflow cadence, board design, and ExecPlan pattern for ai-memory |
| **Sources** | `copilot_config/.github/prompts/`, `story-app/docs/investigations/AgenticWorkflow_PortabilityManual.md` |

---

## 1. Executive Summary

This document defines the **board-driven, PO-gated workflow** for developing the ai-memory service. It adapts the continuous-flow kanban system from `copilot_config` and `story-app` into a self-contained workflow within this repository.

The workflow uses three prompts with deliberate model-tier separation:

| Prompt | Model Tier | Purpose |
|--------|-----------|---------|
| `/plan` | Strong (Opus) | Collaborative scoping, story creation, ExecPlan authoring, plan-review resolution |
| `/continue` | Cost-efficient (Sonnet) | Task execution from Ready ExecPlans, atomic commits, board maintenance |
| `/recover` | Strong (Opus) | Session forensics, ExecPlan annotation after failures |

**Key principle:** The ExecPlan is the handoff artifact between tiers. `/plan` writes the recipe; `/continue` follows it mechanically.

---

## 2. Two-Tier Model Workflow

### 2.1 Why Two Tiers?

| Concern | Solution |
|---------|----------|
| Strong models are expensive | Reserve them for decisions that need deep reasoning (planning, recovery) |
| Cheap models hallucinate plans | Don't let them plan — give them a recipe to follow |
| Context loss between sessions | ExecPlan + Recovery Ledger + FollowUpSessionLog bridge the gap |
| Scope creep | Cheap model can't improvise — it escalates instead |

### 2.2 The Three Prompts

```
┌──────────────────────────────────────────────────────────────────┐
│                        PO (Human)                                 │
│                                                                    │
│  Decides what to build, approves plans, gates execution            │
└──────────────┬────────────────────────────┬───────────────────────┘
               │                            │
    ┌──────────▼──────────┐     ┌───────────▼──────────────┐
    │  /plan (Opus)       │     │  /recover (Opus)         │
    │                     │     │                          │
    │  • Scoping rounds   │     │  • Session forensics     │
    │  • Story creation   │     │  • Timeline construction │
    │  • ExecPlan writing │     │  • Avoidance rules       │
    │  • Plan-review fix  │     │  • Recovery annotation   │
    └──────────┬──────────┘     └──────────────────────────┘
               │ Produces ExecPlan
               ▼
    ┌────────────────────────┐
    │  /continue (Sonnet)    │
    │                        │
    │  • Find Ready plans    │
    │  • Execute tasks       │
    │  • Atomic commits      │
    │  • Plan-review escal.  │
    └────────────────────────┘
```

### 2.3 Planning Loop (`/plan`)

Two-phase planning model with a context compact between phases:

**Phase 1 — Query Packet (collaborative scoping)**
1. PO runs `/plan` with a strong model
2. LE determines planning mode: user-directed, plan-review resolution, or board scan
3. LE runs interactive scoping rounds with PO using `vscode_askQuestions`:
   - Intent check — confirm understanding
   - Direction exploration — surface trade-offs with bounded options
   - Scope lock — confirm in/out scope and key decisions
4. LE captures all decisions in a **query packet** under `.github/planning/query-packets/`
5. Signal PO to compact context

**Phase 2 — ExecPlan Authoring (fresh context)**
1. Read the query packet (sole input)
2. Write full ExecPlan with §2b Definition of Ready
3. Walk PO through plan in iterative review rounds
4. On approval, commit

### 2.4 Execution Loop (`/continue`)

1. Read board fresh — find stories with Ready ExecPlans
2. Check §2b Definition of Ready (all checks must be `[x]`)
3. Check §5b Recovery Ledger for Avoidance instructions from prior failures
4. Present execution plan to PO with artifact links
5. On PO approval, execute tasks sequentially from §4
6. After each task: update recovery ledger, atomic commit, log Tier 1 compound detections
7. If unexpected: **STOP → document in §2c → set blocked_by: plan-review → notify PO**
8. On story completion: move to Review, present acceptance criteria

### 2.5 Recovery (`/recover`)

1. Gather evidence: git state, ExecPlans, artifact existence checks
2. Build timeline: classify each action as LANDED / PARTIAL / MISSING / INTERRUPTED / NEVER STARTED
3. Identify failure mode (context overflow, retry loop, plan gap, etc.)
4. Annotate §5b Recovery Ledger with concrete Avoidance instructions
5. Update FollowUpSessionLog.txt
6. Commit annotations only — never re-execute

### 2.6 Plan-Review Escalation

The bridge between `/continue` and `/plan`:

```
/continue encounters unanticipated situation
  │
  ▼
Document in §2c Plan Review Notes
  │
  ▼
Set blocked_by: plan-review on story
  │
  ▼
Notify PO, STOP execution
  │
  ▼
PO runs /plan → reads §2c → resolves → removes blocker
  │
  ▼
PO runs /continue → resumes from Recovery Ledger
```

---

## 3. Board Design

### 3.1 Board Location and Structure

**File:** `.github/planning/story-board.md`

```markdown
> System: Continuous-flow kanban · WIP limit: 1 In Progress · 1 in Review
> Cadence: No sprint boundaries. /plan (Opus) creates plans; /continue (Sonnet) executes them.
> Prioritisation: WSJF (value ÷ effort). Value: 1-5. Effort: XS=1, S=2, M=3, L=5.
> Last updated: YYYY-MM-DD
```

### 3.2 Columns

| Column | Entry Criteria | Exit Criteria |
|--------|---------------|---------------|
| **Backlog** | PO or agent proposes work | Story is refined (acceptance criteria approved) |
| **Refined** | PO-approved acceptance criteria; ExecPlan exists | ExecPlan §2b Ready; no unresolved blockers |
| **In Progress** | Ready ExecPlan; PO approval to start; WIP < limit | All tasks complete; acceptance criteria met |
| **Review** | Agent-complete work presented to PO | PO approves deliverables |
| **Done** | PO approval | — |

### 3.3 Story Schema

```markdown
### ST-N: Title
- Type: feature | spike | infrastructure | debt
- Source: PO | agent-proposed
- Value: 1-5 · Effort: XS/S/M/L · WSJF: computed
- Blocked by: ST-N, plan-review, or none
- Touches: files, modules, projects affected
- Acceptance criteria:
  - [ ] Criterion 1
  - [ ] Criterion 2
- ExecPlan: link to exec plan file
- Docs: linked investigation/design docs
- Notes: key context
```

### 3.4 Shared Module Locks

| Module | Lock Holder | Reason |
|--------|-------------|--------|
| `src/AiMemory.Core/` | — | Domain models and interfaces |
| `src/AiMemory.Server/Program.cs` | — | Application root |
| `.github/planning/` | — | Governance files |
| `.github/planning/story-board.md` | — | Board (LE only) |

Rule: Only one story may hold a lock at a time. Only the LE edits the board.

### 3.5 Prioritization

Use WSJF (Weighted Shortest Job First):
- Value: 1–5 (business/user impact)
- Effort: XS=1, S=2, M=3, L=5
- WSJF = Value ÷ Effort

Higher WSJF = higher priority. `/plan` in board-scan mode uses this to recommend what to plan next.

---

## 4. ExecPlan Pattern

### 4.1 Required Sections

```markdown
# ExecPlan — ST-N: Story Title

> Status: ⬜ Not Ready | ✅ Ready for /continue
> Story: ST-N
> Created: YYYY-MM-DD
> Parent: linked investigation or design doc

## §1. Background & Context
## §2. Definition of Done
## §2b. Definition of Ready
## §2c. Plan Review Notes
## §3. Preconditions
## §4. Task Definitions
## §5. State Recovery Protocol
## §5b. Recovery Ledger
## §5c. Approach Ledger
## §6. Execution Log
## §7. Compound Step / Closeout
```

### 4.2 Definition of Ready (§2b)

All checks must pass before `/continue` can execute:

```markdown
## §2b. Definition of Ready

- [ ] All tasks have step-by-step instructions (no "figure out" tasks)
- [ ] Architecture and design decisions documented (not left to executor)
- [ ] Input and expected output specified for each task
- [ ] Error handling strategy noted for external interactions
- [ ] No tasks require judgment calls needing broad project context
- [ ] Script templates or boilerplate provided in §3 where applicable

Status: ⬜ Not ready — requires /plan
```

### 4.3 Task Definition Format

Each task in §4 must include:

```markdown
### Task 4.N: Title

**Objective:** What this task achieves
**Input:** What files/state are needed
**Steps:**
1. Specific instruction
2. Specific instruction
3. ...

**Expected output:** Files created/modified, tests passing, etc.
**Acceptance criteria:** How to verify success
**Failure handling:** What to do if something goes wrong
```

### 4.4 Recovery Ledger (§5b)

```markdown
## §5b. Recovery Ledger

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — [first task title] |
| **Known blockers** | None |
| **Last updated** | — |
```

### 4.5 Approach Ledger (§5c)

Tracks alternative approaches when one fails:

```markdown
## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Primary approach | commit-hash | 🟢 Active |
| 2 | Alternative if #1 fails | — | ⬜ Reserve |

### Approach Failure Log
(Empty — no failures yet)
```

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

**Additive bias self-check:**
1. Am I adding code/workarounds rather than simplifying?
2. Has the diff grown beyond what the task originally scoped?
3. Am I fixing my fix rather than the original problem?

---

## 5. Prompt Contracts for ai-memory

### 5.1 `/plan` Contract

**File:** `.github/prompts/plan.prompt.md`

**Modes:**
- User-directed (PO specifies story or need)
- Plan-review resolution (highest priority)
- Board scan (recommend what to plan next)
- Phase 2 resume (query packet path provided)

**Rules:**
- Never execute ExecPlan tasks
- Never skip collaborative scoping
- Always link artifacts before asking questions
- Always verify §2b before marking Ready
- Keep scoping rounds focused: 1–3 questions per round
- Produce plans explicit enough for a cost-efficient model to follow mechanically

### 5.2 `/continue` Contract

**File:** `.github/prompts/continue.prompt.md`

**Priority order for finding work:**
1. In Progress stories with Ready ExecPlans
2. Refined stories with Ready ExecPlans (if WIP < limit)
3. Stories with `blocked_by: plan-review` → report, recommend `/plan`

**Rules:**
- Never create ExecPlans or make design decisions
- Never improvise around plan gaps — escalate via plan-review
- Always check §2b before executing
- Always check §5b Avoidance before executing
- Always atomic commit after each task
- Follow instructions exactly as written

### 5.3 `/recover` Contract

**File:** `.github/prompts/recover.prompt.md`

**Process:**
1. Gather evidence (git state, ExecPlans, artifacts)
2. Build timeline (LANDED/PARTIAL/MISSING/INTERRUPTED/NEVER STARTED)
3. Identify failure mode
4. Annotate §5b and §6 only
5. Add Avoidance subsection
6. Commit annotations, never re-execute

**Rules:**
- Never re-execute failed work
- Never modify §2 or §5 resume point
- Never move stories between columns
- Never delete artifacts

---

## 6. Session Resilience

### 6.1 Atomic Commit Cadence

After every ExecPlan task completion:
1. Stage changed files
2. Commit with Conventional Commit format including story ID
3. Update Recovery Ledger §5b
4. Log Tier 1 compound detections

**Commit format:**
```
type(scope): description

Story: ST-N
Task: §4.X
```

### 6.2 FollowUpSessionLog

**File:** `FollowUpSessionLog.txt`

Purpose: Concise delta between sessions for fast context recovery. Max 40 lines. Replaced (not appended) each session.

Contents:
- What was accomplished last session
- Where the next session should resume
- Any avoidance rules from `/recover`
- Board state snapshot

### 6.3 Context Conservation

Rules for minimising context consumption:
- Read board fresh every time — never rely on cached state
- Read only targeted slices of large files
- Do not load entire governance docs when a specific section suffices
- Use sub-agents (Explorer) for read-only research
- Prefer `grep_search` over reading entire files

---

## 7. Role Model

| Role | Responsibilities | Write Scope |
|------|------------------|-------------|
| **PO** (Human) | Approves, rejects, redirects, clarifies scope | None required |
| **LE** (Top-level agent) | Runs prompts; manages board; acquires locks; conducts PO scoping | Board, governance, shared files |
| **SA** (Sub-agent) | Executes one story's ExecPlan tasks | Only the story's touch-set |
| **Explorer** | Read-only research and discovery | None |

**Escalation chain:** Explorer → SA → LE → PO

---

## 8. PO Review Experience

### 8.1 Mandatory Artifact Linking

Before every `vscode_askQuestions` call, post a context message with clickable links to:
- The story entry in the board
- The ExecPlan being discussed
- Investigation/design docs referenced
- Specific files, directories, or outputs under discussion

### 8.2 Approval Gate Format

```
Context message with links:
- [Story ST-N](link)
- [ExecPlan](link)
- [Design doc](link)

Then vscode_askQuestions:
  Header: "Execution Plan" (or "Scope Confirmation", etc.)
  Question: One-sentence summary
  Options:
    - Approve
    - Approve with changes
    - Reject
    - Ask question
    - Switch to /plan
```

---

## 9. Adaptations for ai-memory

### 9.1 Simplifications from Source Repos

| Source Feature | ai-memory Adaptation |
|---------------|---------------------|
| Multiple SAs for parallel stories | Single SA — WIP limit 1 |
| TDD Agent role | Inline in SA — TDD is a task pattern, not a role |
| Complex lock table (12+ modules) | Simplified lock table (4 modules) |
| Spike Board Impact section | Keep — useful for investigation stories |
| Multiple VS Code sessions | Single session only |

### 9.2 Additions Specific to ai-memory

| Addition | Rationale |
|----------|-----------|
| MCP integration testing tasks | Memory service is consumed via MCP — test the protocol |
| Database migration tracking | SQLite schema evolves — migrations must be ExecPlan tasks |
| Embedding model versioning | Track which model generated which embeddings |
| Memory service dogfooding | Use ai-memory's own `memory_log_episode` during development |

---

## 10. Artifact Layout for ai-memory

```
.github/
├── prompts/
│   ├── plan.prompt.md
│   ├── continue.prompt.md
│   └── recover.prompt.md
├── planning/
│   ├── story-board.md
│   ├── query-packets/
│   │   └── QP-001-scaffold-project.md (example)
│   └── execplans/
│       ├── _TEMPLATE.md
│       └── exec-plan-ST-001.md (example)
├── instructions/
│   ├── session-resilience.instructions.md
│   └── coding-standards.instructions.md
└── skills/
    └── compound-engineering/
        └── SKILL.md

docs/
├── investigations/           # Research and design docs
├── board-impact/             # Spike outputs
└── architecture/             # Stable architecture docs

FollowUpSessionLog.txt        # Session delta (root)
```

---

## 11. Initial Story Backlog (Seed)

These stories should populate the board when the workflow is first activated:

| ID | Title | Type | Value | Effort | WSJF |
|----|-------|------|-------|--------|------|
| ST-001 | Scaffold .NET solution and project structure | infrastructure | 5 | S(2) | 2.5 |
| ST-002 | Implement SQLite schema + FTS5 + migrations | infrastructure | 5 | M(3) | 1.7 |
| ST-003 | Implement IMemoryRepository (SQLite) | feature | 4 | M(3) | 1.3 |
| ST-004 | Implement embedding service (OpenAI) | feature | 4 | S(2) | 2.0 |
| ST-005 | Implement hybrid search (FTS5 + vector + RRF + MMR) | feature | 5 | L(5) | 1.0 |
| ST-006 | Implement REST API endpoints | feature | 4 | M(3) | 1.3 |
| ST-007 | Implement MCP server (facade over service layer) | feature | 5 | M(3) | 1.7 |
| ST-008 | Implement consolidation pipeline | feature | 3 | L(5) | 0.6 |
| ST-009 | Create workflow governance files (.github/) | infrastructure | 5 | S(2) | 2.5 |
| ST-010 | Integration testing (E2E round-trip) | debt | 4 | M(3) | 1.3 |

**Recommended execution order (by WSJF + dependencies):**
1. ST-009 (governance) — enables all other stories
2. ST-001 (scaffold) — enables all implementation
3. ST-002 (schema) — enables repository
4. ST-004 (embeddings) — enables search
5. ST-003 (repository) — enables service layer
6. ST-005 (search) — core value
7. ST-006 (REST) — first usable interface
8. ST-007 (MCP) — agent integration
9. ST-010 (E2E tests) — confidence
10. ST-008 (consolidation) — advanced feature

---

## 12. Open Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | Should the board live in `.github/planning/` or `docs/`? | `.github/planning/` (co-located with prompts) vs `docs/board.md` (tradition) | Navigation convenience |
| 2 | Should query packets be committed or ephemeral? | Committed (auditable) vs deleted after Phase 2 | Storage vs traceability |
| 3 | Should we dogfood ai-memory during its own development? | Yes (circular but useful) vs No (too early) | Needs bootstrap |
| 4 | Compound engineering skill — how detailed initially? | Full (copy from source repos) vs Minimal (grow from use) | Initial overhead |

---

## 13. Recommendations

1. **Board in `.github/planning/story-board.md`** — co-located with prompts and ExecPlans for coherent governance.
2. **Commit query packets** — small cost, high traceability value.
3. **Dogfood after ST-006** — once REST API exists, start logging episodes during development.
4. **Start with minimal compound engineering** — Tier 1 detection list + Tier 2 session-end review. Grow the skill file from actual detections.
5. **ST-009 first** — create governance files before writing code, so the first real ExecPlan (ST-001) already has the full workflow supporting it.
