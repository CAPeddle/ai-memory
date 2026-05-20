### 13.2 Writing Style Requirements

The PLANS.md codifies writing rules that improve agent comprehension:

| Rule | Rationale | Adoption |
|------|-----------|----------|
| **Prose-first** — prefer sentences over lists; narrative over checklists | Agents follow narrative better than fragmented bullets | Adopt for §1, §3; keep checklists for §2b and Progress |
| **Define every term immediately** | Agents can't infer jargon from prior context | Already in our ExecPlan template |
| **Show working directory and exact commands** | Removes ambiguity about where to execute | Add to task format |
| **Include expected output/transcript** | Agent can verify success without human | Strengthen in §4.3 |
| **Anchor with observable outcomes** | "After starting the server, GET /health returns 200" not "added HealthCheck struct" | Adopt for acceptance criteria style |

