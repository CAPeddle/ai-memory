# Investigation: Language & Runtime Stack for ai-memory

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Complete |
| **Scope** | Language/runtime selection for ai-memory service |
| **Decision** | **C# / .NET 8+** (recommended) |

---

## Read This When

Reviewing why C#/.NET 8 was chosen; evaluating SDK maturity, language trade-offs, or migration paths.

---

## Fragment Map

| # | Section | Fragment |
|---|---|---|
| 1 | 1. Executive Summary | [1. Executive Summary](./01-executive-summary.md) |
| 2 | 2. Comparison Matrix | [2. Comparison Matrix](./02-comparison-matrix.md) |
| 3 | 3. MCP SDK Maturity Assessment | [3. MCP SDK Maturity Assessment](./03-mcp-sdk-maturity-assessment.md) |
| 4 | 4. Language-by-Language Analysis | [4. Language-by-Language Analysis](./04-language-by-language-analysis.md) |
| 5 | 5. Deep Dive: Key Decision Factors | [5. Deep Dive: Key Decision Factors](./05-deep-dive-key-decision-factors.md) |
| 6 | 6. Final Recommendation | [6. Final Recommendation](./06-final-recommendation.md) |
| 7 | 7. Risk Assessment | [7. Risk Assessment](./07-risk-assessment.md) |
| 8 | 8. Migration Path (If C# Proves Wrong) | [8. Migration Path (If C# Proves Wrong)](./08-migration-path-if-c-proves-wrong.md) |
| 9 | 9. What About a Hybrid Approach? | [9. What About a Hybrid Approach?](./09-what-about-a-hybrid-approach.md) |
| 10 | 10. Quick-Start Path | [10. Quick-Start Path](./10-quick-start-path.md) |
| 11 | 11. Decision Log | [11. Decision Log](./11-decision-log.md) |

## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale behind approved decisions.
Binding requirements and architecture decisions live in the Tier 1 documents:
- [SRS v1.1](../../requirements/SRS.md)
- [ADRs](../../design/adr/)
- [SystemDesign.md](../../design/SystemDesign.md)
- [delivery-plan.md](../../planning/delivery-plan.md)
