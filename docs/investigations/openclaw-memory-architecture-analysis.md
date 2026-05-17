# OpenClaw Memory Architecture — Research Analysis

**Repository:** https://github.com/coolmanns/openclaw-memory-architecture
**Author:** coolmanns (Sascha Kuhlmann)
**Stars:** 52 | **Forks:** 7 | **License:** MIT
**Last updated:** ~March 2026 (v2.4)
**Languages:** Python 60.5%, HTML 31.1%, JavaScript 8.2%, Shell 0.2%

---

## Read This When

Learning from openclaw's C#/SQLite implementation; reviewing retrieval strategies, schema patterns, and lessons applicable to ai-memory.

---

## Fragment Map

| # | Section | Fragment |
|---|---|---|
| 1 | 1. Overall Architecture Pattern | [1. Overall Architecture Pattern](./01-overall-architecture-pattern.md) |
| 2 | 2. Technology Stack | [2. Technology Stack](./02-technology-stack.md) |
| 3 | 3. Memory Data Models / Schemas | [3. Memory Data Models / Schemas](./03-memory-data-models-schemas.md) |
| 4 | 4. Tradeoffs Made | [4. Tradeoffs Made](./04-tradeoffs-made.md) |
| 5 | 5. Retrieval Strategies | [5. Retrieval Strategies](./05-retrieval-strategies.md) |
| 6 | 6. Memory Consolidation / Summarization | [6. Memory Consolidation / Summarization](./06-memory-consolidation-summarization.md) |
| 7 | 7. API Endpoints / Tool Interfaces | [7. API Endpoints / Tool Interfaces](./07-api-endpoints-tool-interfaces.md) |
| 8 | 8. Testing Strategies | [8. Testing Strategies](./08-testing-strategies.md) |
| 9 | 9. Performance Considerations | [9. Performance Considerations](./09-performance-considerations.md) |
| 10 | 10. Lessons for C# .NET 8+ / SQLite + FTS5 Implementation | [10. Lessons for C# .NET 8+ / SQLite + FTS5 Implementation](./10-lessons-for-c-net-8-sqlite-fts5-implementation.md) |
| 11 | Summary Verdict | [Summary Verdict](./11-summary-verdict.md) |

## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale behind approved decisions.
Binding requirements and architecture decisions live in the Tier 1 documents:
- [SRS v1.1](../../requirements/SRS.md)
- [ADRs](../../design/adr/)
- [SystemDesign.md](../../design/SystemDesign.md)
- [delivery-plan.md](../../planning/delivery-plan.md)
