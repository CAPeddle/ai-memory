### 13.4 The Right Amount of Structure

Cursor's coordination spectrum:

```
Too little structure          Right amount           Too much structure
────────────────────┼───────────────────────┼────────────────────
Conflicts, duplication,        Structured plans +     Fragility, bottlenecks,
drift, no ownership            flexible execution      lock contention

                            ▲ Our approach sits here
```

For ai-memory's context delivery, the same principle applies:

| Too little context structure | Right amount | Too much context structure |
|------------------------------|-------------|----------------------------|
| Raw search dump, no scores | Scored results with provenance, layered access | Elaborate metadata, explanatory wrapping, context-about-context |
| No project scoping | Project-boosted results with cross-project visibility | Rigid project isolation |
| No feedback loop | Optional helpfulness feedback | Mandatory feedback blocking recall |

---

