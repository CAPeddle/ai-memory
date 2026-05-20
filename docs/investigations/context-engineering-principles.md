# Investigation: Context Engineering Principles

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Complete |
| **Scope** | Context engineering strategy for ai-memory — how to feed agents the right information at the right time |
| **Guiding Principle** | **Point, don't dump** — layered, targeted context injection |
| **Sources** | Alfred blog (cognitive memory), Cursor "Scaling Agents" (Jan 2026), OpenAI Codex ExecPlans / PLANS.md |

---

## Read This When

Designing prompts, context delivery strategies, or agent workflows; deciding what to include in agent context windows and how to avoid context bloat.

---

## Fragment Map

| # | Section | Fragment |
|---|---|---|
| 1 | 1. Executive Summary | [1. Executive Summary](./01-executive-summary.md) |
| 2 | 2. What Context Engineering Means | [2. What Context Engineering Means](./02-what-context-engineering-means.md) |
| 3 | 3. Context Delivery Strategy for ai-memory | [3. Context Delivery Strategy for ai-memory](./03-context-delivery-strategy-for-ai-memory.md) |
| 4 | 4. Context Budget Management | [4. Context Budget Management](./04-context-budget-management.md) |
| 5 | 5. Source Mixing as Context Engineering | [5. Source Mixing as Context Engineering](./05-source-mixing-as-context-engineering.md) |
| 6 | Memory Context (zoom, CMake task) | [Memory Context (zoom, CMake task)](./06-memory-context-zoom-cmake-task.md) |
| 7 | 6. Feedback Loops and Context Quality | [6. Feedback Loops and Context Quality](./07-feedback-loops-and-context-quality.md) |
| 8 | 7. Anti-Patterns to Avoid | [7. Anti-Patterns to Avoid](./08-anti-patterns-to-avoid.md) |
| 9 | 8. Context Engineering in the Workflow | [8. Context Engineering in the Workflow](./09-context-engineering-in-the-workflow.md) |
| 10 | 9. Compound Engineering as Context Engineering | [9. Compound Engineering as Context Engineering](./10-compound-engineering-as-context-engineering.md) |
| 11 | 10. Implementation Priorities for ai-memory | [10. Implementation Priorities for ai-memory](./11-implementation-priorities-for-ai-memory.md) |
| 12 | 11. Design Decisions | [11. Design Decisions](./12-design-decisions.md) |
| 13 | 12. External Validation: Self-Containment as Context Engineering (OpenAI Codex PLANS.md) | [12. External Validation: Self-Containment as Context Engineering (OpenAI Codex PLANS.md)](./13-external-validation-self-containment-as-context-en.md) |
| 14 | 13. External Validation: Prompts as Context Engineering (Cursor Research) | [13. External Validation: Prompts as Context Engineering (Cursor Research)](./14-external-validation-prompts-as-context-engineering.md) |
| 15 | 14. Open Questions | [14. Open Questions](./15-open-questions.md) |

## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale behind approved decisions.
Binding requirements and architecture decisions live in the Tier 1 documents:
- [SRS v1.1](../../requirements/SRS.md)
- [ADRs](../../design/adr/)
- [SystemDesign.md](../../design/SystemDesign.md)
- [delivery-plan.md](../../planning/delivery-plan.md)
