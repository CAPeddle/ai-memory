# Investigation: AI Memory Service Architecture

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Draft |
| **Scope** | Full system architecture for ai-memory service |
| **Stakeholders** | BIMcollab development team |

---

## Read This When

Implementing memory schemas, retrieval strategies, consolidation pipelines, or recall tracking. The primary technical design reference for the memory service.

---

## Fragment Map

| # | Section | Fragment |
|---|---|---|
| 1 | 1. Executive Summary | [1. Executive Summary](./01-executive-summary.md) |
| 2 | 2. High-Level Architecture | [2. High-Level Architecture](./02-high-level-architecture.md) |
| 3 | 3. Memory Types and Schemas | [3. Memory Types and Schemas](./03-memory-types-and-schemas.md) |
| 4 | 4. Consolidation Pipeline (Pattern Promotion) | [4. Consolidation Pipeline (Pattern Promotion)](./04-consolidation-pipeline-pattern-promotion.md) |
| 5 | 5. Recall Tracking and Promotion Scoring | [5. Recall Tracking and Promotion Scoring](./05-recall-tracking-and-promotion-scoring.md) |
| 6 | 6. Search / Retrieval Strategy | [6. Search / Retrieval Strategy](./06-search-retrieval-strategy.md) |
| 7 | 7. Source Mixing Across Projects | [7. Source Mixing Across Projects](./07-source-mixing-across-projects.md) |
| 8 | 8. The "No Forgetting" Philosophy | [8. The "No Forgetting" Philosophy](./08-the-no-forgetting-philosophy.md) |
| 9 | 9. API Surface | [9. API Surface](./09-api-surface.md) |
| 10 | 10. Technology Choices | [10. Technology Choices](./10-technology-choices.md) |
| 11 | 11. Data Flow Examples | [11. Data Flow Examples](./11-data-flow-examples.md) |
| 12 | 12. Open Questions and Trade-offs | [12. Open Questions and Trade-offs](./12-open-questions-and-trade-offs.md) |
| 13 | 13. Next Steps for ExecPlan | [13. Next Steps for ExecPlan](./13-next-steps-for-execplan.md) |

## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale behind approved decisions.
Binding requirements and architecture decisions live in the Tier 1 documents:
- [SRS v1.1](../../requirements/SRS.md)
- [ADRs](../../design/adr/)
- [SystemDesign.md](../../design/SystemDesign.md)
- [delivery-plan.md](../../planning/delivery-plan.md)
