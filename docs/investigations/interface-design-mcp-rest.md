# Investigation: Interface Design — MCP + REST

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Complete |
| **Scope** | API interface design for ai-memory service |
| **Decision** | MCP facade over REST API core; C# / .NET 8+ with ASP.NET Core |

---

## Read This When

Implementing or reviewing REST API or MCP server design; checking endpoint contracts, transport configuration, or service layer interfaces.

---

## Fragment Map

| # | Section | Fragment |
|---|---|---|
| 1 | 1. Executive Summary | [1. Executive Summary](./01-executive-summary.md) |
| 2 | 2. Architecture: Layered Interface Pattern | [2. Architecture: Layered Interface Pattern](./02-architecture-layered-interface-pattern.md) |
| 3 | 3. REST API Design (Core Interface) | [3. REST API Design (Core Interface)](./03-rest-api-design-core-interface.md) |
| 4 | 4. MCP Server Design (Facade Layer) | [4. MCP Server Design (Facade Layer)](./04-mcp-server-design-facade-layer.md) |
| 5 | 5. Transport Configuration | [5. Transport Configuration](./05-transport-configuration.md) |
| 6 | 6. Service Layer Interface Contracts | [6. Service Layer Interface Contracts](./06-service-layer-interface-contracts.md) |
| 7 | 7. Error Handling Strategy | [7. Error Handling Strategy](./07-error-handling-strategy.md) |
| 8 | 8. Configuration & Extensibility | [8. Configuration & Extensibility](./08-configuration-extensibility.md) |
| 9 | 9. Security Considerations | [9. Security Considerations](./09-security-considerations.md) |
| 10 | 10. Testing Strategy for Interfaces | [10. Testing Strategy for Interfaces](./10-testing-strategy-for-interfaces.md) |
| 11 | 11. Project Structure | [11. Project Structure](./11-project-structure.md) |
| 12 | 12. Open Questions | [12. Open Questions](./12-open-questions.md) |
| 13 | 13. Recommendations | [13. Recommendations](./13-recommendations.md) |
| 14 | 14. Next Steps | [14. Next Steps](./14-next-steps.md) |

## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale behind approved decisions.
Binding requirements and architecture decisions live in the Tier 1 documents:
- [SRS v1.1](../../requirements/SRS.md)
- [ADRs](../../design/adr/)
- [SystemDesign.md](../../design/SystemDesign.md)
- [delivery-plan.md](../../planning/delivery-plan.md)
