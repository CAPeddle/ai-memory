### 2.1 Why Two Tiers?

| Concern | Solution |
|---------|----------|
| Strong models are expensive | Reserve them for decisions that need deep reasoning (planning, recovery) |
| Cheap models hallucinate plans | Don't let them plan — give them a recipe to follow |
| Context loss between sessions | ExecPlan + Recovery Ledger + FollowUpSessionLog bridge the gap |
| Scope creep | Cheap model can't improvise — it escalates instead |

