### 13.2 Model Selection as Context Engineering

Cursor found that different models excel at different roles:
- Planning models (GPT-5.2) are better at maintaining big-picture focus
- Coding models (Codex) are better at precise implementation
- Planning models "tend to stop earlier and take shortcuts" when used for execution

**Context engineering implication:** The model itself is a context engineering variable. A planning model processes context differently than an execution model. Our two-tier architecture (Opus for `/plan`, Sonnet for `/continue`) isn't just about cost — it's about matching context processing style to the task.

| Model Tier | Context Processing Style | Task Match |
|-----------|------------------------|------------|
| Strong (Opus) | Broad context synthesis, trade-off evaluation | Planning, recovery, scoping |
| Efficient (Sonnet) | Narrow context following, precise execution | Task execution from explicit plans |

