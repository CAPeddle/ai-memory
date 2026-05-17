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

