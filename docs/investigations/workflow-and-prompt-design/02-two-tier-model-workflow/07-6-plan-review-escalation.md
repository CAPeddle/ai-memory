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

