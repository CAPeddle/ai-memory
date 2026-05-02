# Investigation: Workflow & Prompt Design

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Complete |
| **Scope** | Planning, intake, execution, and recovery prompt workflow for ai-memory |
| **Sources** | `copilot_config/.github/prompts/`, `story-app/docs/investigations/AgenticWorkflow_PortabilityManual.md`, Cursor "Scaling long-running autonomous coding" (Jan 2026), OpenAI Codex ExecPlans / PLANS.md |

---

## 1. Executive Summary

This document defines the **board-driven, PO-gated workflow** for developing the ai-memory service. It adapts the continuous-flow kanban system from `copilot_config` and `story-app` into a self-contained workflow within this repository.

The workflow uses three primary prompts plus one intake prompt:

| Prompt | Model Tier | Purpose |
|--------|-----------|---------|
| `/plan-new` | Strong (Opus) | Add a story, perform targeted research, and scope impact/priority with the PO |
| `/plan` | Strong (Opus) | Collaborative scoping, story creation, ExecPlan authoring, plan-review resolution |
| `/continue` | Cost-efficient (Sonnet) | Task execution from Ready ExecPlans, atomic commits, board maintenance |
| `/recover` | Strong (Opus) | Session forensics, ExecPlan annotation after failures |

**Key principle:** The ExecPlan is the handoff artifact between tiers. `/plan-new` creates the intake artifact, `/plan` writes the recipe, and `/continue` follows it mechanically.

---

## 2. Two-Tier Model Workflow

### 2.1 Why Two Tiers?

| Concern | Solution |
|---------|----------|
| Strong models are expensive | Reserve them for decisions that need deep reasoning (planning, recovery) |
| Cheap models hallucinate plans | Don't let them plan — give them a recipe to follow |
| Context loss between sessions | ExecPlan + Recovery Ledger + FollowUpSessionLog bridge the gap |
| Scope creep | Cheap model can't improvise — it escalates instead |

### 2.2 Prompt Set

`/plan-new` is an intake helper, not a replacement for `/plan`. It adds a story, creates a seed query packet, and stops. Full planning still happens in `/plan` after additional PO back-and-forth.

```
┌──────────────────────────────────────────────────────────────────┐
│                        PO (Human)                                 │
│                                                                    │
│  Decides what to build, adds stories, approves plans, gates execution│
└──────────────┬────────────────────────────┬───────────────────────┘
               │                            │
    ┌──────────▼──────────┐
    │ /plan-new (Opus)    │
    │                     │
    │ • Story intake      │
    │ • Targeted research │
    │ • PO priority scope │
    │ • Seed query packet │
    └──────────┬──────────┘
           │ Creates story + query packet
           ▼
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

**Non-negotiable rule:** planning is collaborative. No query packet, story shaping, or ExecPlan direction may be produced unilaterally without back-and-forth with the PO using `vscode_askQuestions`.

**Phase 1 — Query Packet (collaborative scoping)**
1. PO runs `/plan` with a strong model
2. LE determines planning mode: user-directed, plan-review resolution, or board scan
3. LE runs interactive scoping rounds with PO using `vscode_askQuestions`:
   - Intent check — confirm understanding
   - Direction exploration — surface trade-offs with bounded options
   - Scope lock — confirm in/out scope and key decisions
4. LE captures all decisions in a **query packet** under `.github/planning/query-packets/`
5. Signal PO to compact context

### 2.3b New Story Intake (`/plan-new`)

`/plan-new` exists to add a story before full planning begins.

1. Read the board and gather the PO's initial intent through `vscode_askQuestions`
2. Perform targeted research to identify likely impact, touched areas, blockers, and related docs
3. Ask the PO bounded follow-up questions to scope impact, priority, and placement
4. Create the board entry with the next `ST-N` ID
5. Create a seed query packet under `.github/planning/query-packets/`
6. Reserve the future ExecPlan path in the board entry
7. Stop and direct the PO to `/plan` for full collaborative planning

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
## §6b. Surprises & Discoveries
## §6c. Decision Log
## §7. Compound Step / Closeout
## §7b. Outcomes & Retrospective
```

### 4.1b Living Document Sections (from OpenAI Codex PLANS.md)

The following four sections are **mandatory** and must be kept current throughout execution. They are adapted from the Codex PLANS.md pattern, which has been validated for multi-hour autonomous agent work.

**§6b. Surprises & Discoveries** — Document unexpected behaviours, performance tradeoffs, bugs, or insights discovered during implementation. Provide concise evidence (test output is ideal).

```markdown
## §6b. Surprises & Discoveries

- Observation: SQLite FTS5 tokenizer strips hyphens from ULIDs
  Evidence: `SELECT * FROM memories_fts WHERE content MATCH '01HXY-...'` returns 0 rows
  Impact: Must use rowid lookup for ID-based queries, not FTS
```

**§6c. Decision Log** — Record every design decision made during execution with rationale and date.

```markdown
## §6c. Decision Log

- Decision: Use content-based hashing (SHA-256 of normalized text) for deduplication
  Rationale: Simpler than embedding-distance threshold; deterministic; zero-cost at query time
  Date: 2025-05-15
```

**§7b. Outcomes & Retrospective** — At completion, summarise what was achieved, what remains, and lessons learned. Compare result against original purpose.

```markdown
## §7b. Outcomes & Retrospective

Achieved: REST API serves 12 endpoints, all passing integration tests.
Remains: MCP facade (ST-007) not started.
Lesson: FTS5 trigger-based sync is fragile during batch inserts — bulk-insert path
should disable triggers and rebuild the FTS index afterwards.
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
- Never plan unilaterally — planning requires PO back-and-forth via `vscode_askQuestions`
- Never skip collaborative scoping
- Always use `vscode_askQuestions` for PO-facing questions, approvals, clarifications, and confirmations
- Always post a context message with clickable artifact links immediately before each questions-tool interaction
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
- Always use `vscode_askQuestions` for PO-facing questions, approvals, clarifications, and confirmations
- Always post a context message with clickable artifact links immediately before each questions-tool interaction
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

All PO-facing interactions that require a response, approval, clarification, or confirmation must use `vscode_askQuestions`.

Before every `vscode_askQuestions` call, post a context message with clickable links to:
- The story entry in the board
- The ExecPlan being discussed
- Investigation/design docs referenced
- Specific files, directories, or outputs under discussion

When the question is about a specific story, include the relevant story line or section link so the PO can answer with local context.

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

## 12. External Validation: Multi-Agent Coordination (Cursor Research)

**Source:** Cursor "Scaling long-running autonomous coding" (Jan 2026) — running hundreds of concurrent agents for weeks on single projects (1M+ LoC).

### 12.1 Coordination Approaches Tested

| Approach | Result | Lesson for ai-memory |
|----------|--------|----------------------|
| **Flat self-coordination** (shared file + locks) | Failed — agents held locks too long, forgot to release, throughput collapsed to 2-3 effective agents from 20 | Validates our single-LE model with explicit lock table |
| **Optimistic concurrency** (read freely, fail on write conflict) | Better but agents became risk-averse — avoided hard problems, no ownership | Validates PO-gated story assignment over self-selection |
| **Planner/Worker separation** | Worked — planners explore and create tasks, workers execute without coordinating with each other | **Directly validates our `/plan` (Opus) + `/continue` (Sonnet) split** |
| **Integrator role** (quality control agent) | Removed — created more bottlenecks than it solved | Validates not adding a separate QA/review agent |
| **Judge agent** (end-of-cycle evaluation) | Useful — determines whether to continue or restart | Maps to our PO review gate at story completion |

### 12.2 Key Findings

**"Prompts matter more than harness or models."** Getting agents to coordinate well, avoid pathological behaviours, and maintain focus over long periods required extensive prompt experimentation. This validates our investment in detailed prompt contracts (§5) and ExecPlan explicitness (§4).

**"The right amount of structure is somewhere in the middle."** Too little → conflicts, duplication, drift. Too much → fragility. Our approach (structured ExecPlans + flexible scoping rounds) sits in this middle ground.

**Different models for different roles.** Cursor found GPT-5.2 is a better planner than GPT-5.1-Codex (which is trained specifically for coding). This validates our two-tier model approach — strong model for planning, cost-efficient model for execution — rather than using one model for everything.

**Periodic fresh starts combat drift.** Long-running agents accumulate stale assumptions. Our session-based architecture with FollowUpSessionLog + Recovery Ledger provides natural restart points that Cursor's system had to engineer separately.

**Workers don't need to coordinate with each other.** Cursor eliminated inter-worker coordination. Our WIP-1 limit achieves the same effect — only one story executes at a time, so there are no coordination concerns.

### 12.3 Implications for ai-memory Workflow

| Cursor Finding | ai-memory Response |
|---------------|--------------------|
| Planner/Worker is the right split | Already our architecture — `/plan` plans, `/continue` executes |
| Remove unnecessary roles | Keep PO + LE + SA + Explorer. No integrator or QA agent |
| Prompts > harness | Invest in prompt quality for §5 contracts; iterate based on failures |
| Fresh starts needed | FollowUpSessionLog.txt + Recovery Ledger provide these |
| Model selection per role | Opus for `/plan` + `/recover`, Sonnet for `/continue` |

---

## 13. External Validation: ExecPlan Design (OpenAI Codex PLANS.md)

**Source:** OpenAI Codex ExecPlans cookbook — PLANS.md pattern validated for multi-hour (7+ hour) autonomous agent work from a single prompt.

### 13.1 Core Philosophy

The Codex ExecPlan pattern centres on four requirements that the document calls **non-negotiable**:

> **SELF-CONTAINED, SELF-SUFFICIENT, NOVICE-GUIDING, OUTCOME-FOCUSED**

| Requirement | Meaning | Our Status |
|-------------|---------|------------|
| **Self-contained** | All knowledge needed is in the plan itself. No external references, no "as discussed" | Our §1 Background covers this; strengthen with self-containment rule |
| **Self-sufficient** | A stateless agent with no prior memory can execute from only this document | Our §2b Definition of Ready enforces this |
| **Novice-guiding** | Define every term; spell out every file path; show expected outputs | Our task format (§4.3) does this; add expected-output requirement |
| **Outcome-focused** | Describe user-visible behaviour, not internal attributes | Add outcome framing to §2 Definition of Done |

### 13.2 Writing Style Requirements

The PLANS.md codifies writing rules that improve agent comprehension:

| Rule | Rationale | Adoption |
|------|-----------|----------|
| **Prose-first** — prefer sentences over lists; narrative over checklists | Agents follow narrative better than fragmented bullets | Adopt for §1, §3; keep checklists for §2b and Progress |
| **Define every term immediately** | Agents can't infer jargon from prior context | Already in our ExecPlan template |
| **Show working directory and exact commands** | Removes ambiguity about where to execute | Add to task format |
| **Include expected output/transcript** | Agent can verify success without human | Strengthen in §4.3 |
| **Anchor with observable outcomes** | "After starting the server, GET /health returns 200" not "added HealthCheck struct" | Adopt for acceptance criteria style |

### 13.3 Living Document Pattern

PLANS.md mandates four living sections (adapted into our §6b, §6c, §7b above):

1. **Progress** — granular checkboxes with timestamps. Our Recovery Ledger (§5b) serves this role but should add timestamps.
2. **Surprises & Discoveries** — captured observations with evidence. New section §6b.
3. **Decision Log** — every decision with rationale. New section §6c.
4. **Outcomes & Retrospective** — completion summary. New section §7b.

### 13.4 Prototyping and Validation Rules

| PLANS.md Rule | ai-memory Adaptation |
|---------------|---------------------|
| **Prototyping milestones are encouraged** for de-risking | Map to spike stories with board impact docs |
| **Parallel implementations acceptable** during migration | Use §5c Approach Ledger — reserve approaches for fallback |
| **Validation is not optional** — include test commands and expected results | Strengthen task format: every task must have a verification step |
| **Idempotent and safe** — steps can be re-run without damage | Aligns with our atomic commit cadence |
| **Capture evidence** — terminal output, diffs, logs as indented examples | Add to Execution Log (§6) requirements |

### 13.5 Key Additions to Adopt

1. **Timestamp progress entries** — `- [x] (2025-05-15 14:00Z) Implemented FTS5 schema` in Recovery Ledger
2. **Mandatory verification step per task** — every §4 task must end with a command or assertion the executor can run
3. **Observable acceptance criteria** — phrase as behaviour ("GET /memories returns 200 with JSON array") not implementation ("added GetMemories method")
4. **Self-containment rule** — ExecPlans must not reference external blogs or docs; embed the needed knowledge directly
5. **Revision notes** — when updating an ExecPlan, append a note at the bottom explaining what changed and why

---

## 14. Open Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | Should the board live in `.github/planning/` or `docs/`? | `.github/planning/` (co-located with prompts) vs `docs/board.md` (tradition) | Navigation convenience |
| 2 | Should query packets be committed or ephemeral? | Committed (auditable) vs deleted after Phase 2 | Storage vs traceability |
| 3 | Should we dogfood ai-memory during its own development? | Yes (circular but useful) vs No (too early) | Needs bootstrap |
| 4 | Compound engineering skill — how detailed initially? | Full (copy from source repos) vs Minimal (grow from use) | Initial overhead |

---

## 15. Recommendations

1. **Board in `.github/planning/story-board.md`** — co-located with prompts and ExecPlans for coherent governance.
2. **Commit query packets** — small cost, high traceability value.
3. **Dogfood after ST-006** — once REST API exists, start logging episodes during development.
4. **Start with minimal compound engineering** — Tier 1 detection list + Tier 2 session-end review. Grow the skill file from actual detections.
5. **ST-009 first** — create governance files before writing code, so the first real ExecPlan (ST-001) already has the full workflow supporting it.
6. **Adopt OpenAI PLANS.md living sections** — add §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective to the ExecPlan template.
7. **Timestamp Recovery Ledger entries** — per PLANS.md pattern, include ISO timestamps on progress entries to measure velocity.
8. **Every task must have a verification step** — per PLANS.md validation mandate, no task is complete without an observable proof of success.
