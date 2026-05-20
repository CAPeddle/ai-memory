### 2.4 Execution Loop (`/continue`)

1. Read board fresh — find stories with Ready ExecPlans
2. Check §2b Definition of Ready (all checks must be `[x]`)
3. Check §5b Recovery Ledger for Avoidance instructions from prior failures
4. Present execution plan to PO with artifact links
5. On PO approval, execute tasks sequentially from §4
6. After each task: update recovery ledger, atomic commit, log Tier 1 compound detections
7. If unexpected: **STOP → document in §2c → set blocked_by: plan-review → notify PO**
8. On story completion: move to Review, present acceptance criteria

