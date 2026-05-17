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
