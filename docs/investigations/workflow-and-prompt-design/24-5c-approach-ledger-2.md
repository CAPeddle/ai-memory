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

