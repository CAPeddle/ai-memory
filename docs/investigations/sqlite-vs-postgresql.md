# Investigation: SQLite vs PostgreSQL for ai-memory Storage

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Complete |
| **Scope** | Database engine selection for ai-memory service |
| **Decision** | **SQLite** (start), with migration path to PostgreSQL if needed |

---

## Read This When

Reviewing the database selection rationale; evaluating FTS5, vector search, concurrency, and operational trade-offs between SQLite and PostgreSQL.

---

## Fragment Map

| # | Section | Fragment |
|---|---|---|
| 1 | 1. Executive Summary | [1. Executive Summary](./01-executive-summary.md) |
| 2 | 2. Comparison Matrix | [2. Comparison Matrix](./02-comparison-matrix.md) |
| 3 | 3. Full-Text Search Deep Dive | [3. Full-Text Search Deep Dive](./03-full-text-search-deep-dive.md) |
| 4 | 4. Growth Projections | [4. Growth Projections](./04-growth-projections.md) |
| 5 | 5. Concurrency Analysis | [5. Concurrency Analysis](./05-concurrency-analysis.md) |
| 6 | 6. Vector Search Readiness | [6. Vector Search Readiness](./06-vector-search-readiness.md) |
| 7 | 7. Deployment & Operations | [7. Deployment & Operations](./07-deployment-operations.md) |
| 8 | 8. Backup & Portability | [8. Backup & Portability](./08-backup-portability.md) |
| 9 | 9. .NET Driver Quality | [9. .NET Driver Quality](./09-net-driver-quality.md) |
| 10 | 10. Hybrid Architecture Consideration | [10. Hybrid Architecture Consideration](./10-hybrid-architecture-consideration.md) |
| 11 | 11. Recommendation | [11. Recommendation](./11-recommendation.md) |
| 12 | 12. References | [12. References](./12-references.md) |

## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale behind approved decisions.
Binding requirements and architecture decisions live in the Tier 1 documents:
- [SRS v1.1](../../requirements/SRS.md)
- [ADRs](../../design/adr/)
- [SystemDesign.md](../../design/SystemDesign.md)
- [delivery-plan.md](../../planning/delivery-plan.md)
