## 11. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-05-02 | Select C# / .NET 8+ | Highest weighted score. Team expertise is the dominant factor for a side project. Official SDK with Microsoft co-maintenance eliminates sustainability risk. |
| 2025-05-02 | Designate TypeScript as fallback | Largest MCP ecosystem. Clear migration path if C# SDK proves insufficient. |
| 2025-05-02 | Reject Python | Wrong team. Deployment friction on Windows. No compelling advantage over C# for this use case. |
| 2025-05-02 | Reject Rust | Development cost far exceeds performance benefits for a local single-user service. Immature MCP SDK. |
