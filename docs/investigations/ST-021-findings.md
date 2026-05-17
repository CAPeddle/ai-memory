---
name: "ST-021 Spike Findings: Fork OB1 and extend with memory tiers, context scoping, BM25, and openCypher"
asset_type: "investigation"
status: "complete"
story: "ST-021"
created: "2026-05-16"
owners:
  - "ai-memory-maintainers"
source_path: "docs/investigations/ST-021-findings.md"
---

# ST-021 Spike Findings

**Story:** ST-021 — Spike: Fork OB1 and extend with memory tiers, context scoping, BM25, and openCypher structural search
**Date:** 2026-05-16
**Status:** Complete

---

## Read This When

Reviewing the Docker/AGE spike outcomes; understanding BM25+RRF validation, openCypher traversal results, context scoping design, and downstream story inputs.

---

## Fragment Map

| # | Section | Fragment |
|---|---|---|
| 1 | Executive Summary | [Executive Summary](./01-executive-summary.md) |
| 2 | §R1 — Memory Tier Schema Recommendation | [§R1 — Memory Tier Schema Recommendation](./02-memory-tier-schema-recommendation.md) |
| 3 | §R2 — BM25 + pgvector RRF Integration | [§R2 — BM25 + pgvector RRF Integration](./03-bm25-pgvector-rrf-integration.md) |
| 4 | §R3 — Structural Search: PostgreSQL CTE Ceiling vs. openCypher | [§R3 — Structural Search: PostgreSQL CTE Ceiling vs. openCypher](./04-structural-search-postgresql-cte-ceiling-vs-opency.md) |
| 5 | §R4 — Docker Image: PostgreSQL 15 + pgvector + AGE v1.6.0-rc0 | [§R4 — Docker Image: PostgreSQL 15 + pgvector + AGE v1.6.0-rc0](./05-docker-image-postgresql-15-pgvector-age-v1-6-0-rc0.md) |
| 6 | §R5 — openCypher Multi-hop Traversal (Coding Agent Debugging) | [§R5 — openCypher Multi-hop Traversal (Coding Agent Debugging)](./06-opencypher-multi-hop-traversal-coding-agent-debugg.md) |
| 7 | §R6 — openCypher Fact Inference | [§R6 — openCypher Fact Inference](./07-opencypher-fact-inference.md) |
| 8 | §R7 — Context Scoping in Forked MCP Tools | [§R7 — Context Scoping in Forked MCP Tools](./08-context-scoping-in-forked-mcp-tools.md) |
| 9 | §R8 — Entity Extraction Worker Design | [§R8 — Entity Extraction Worker Design](./09-entity-extraction-worker-design.md) |
| 10 | §6b — Surprises & Discoveries | [§6b — Surprises & Discoveries](./10-6b-surprises-discoveries.md) |
| 11 | §6c — Decision Log | [§6c — Decision Log](./11-6c-decision-log.md) |
| 12 | Downstream Changes Required | [Downstream Changes Required](./12-downstream-changes-required.md) |

## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale behind approved decisions.
Binding requirements and architecture decisions live in the Tier 1 documents:
- [SRS v1.1](../../requirements/SRS.md)
- [ADRs](../../design/adr/)
- [SystemDesign.md](../../design/SystemDesign.md)
- [delivery-plan.md](../../planning/delivery-plan.md)
