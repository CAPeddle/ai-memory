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

