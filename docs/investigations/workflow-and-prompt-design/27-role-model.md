## 7. Role Model

| Role | Responsibilities | Write Scope |
|------|------------------|-------------|
| **PO** (Human) | Approves, rejects, redirects, clarifies scope | None required |
| **LE** (Top-level agent) | Runs prompts; manages board; acquires locks; conducts PO scoping | Board, governance, shared files |
| **SA** (Sub-agent) | Executes one story's ExecPlan tasks | Only the story's touch-set |
| **Explorer** | Read-only research and discovery | None |

**Escalation chain:** Explorer → SA → LE → PO

---

