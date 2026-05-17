## 1. Executive Summary

The ai-memory service exposes two interfaces sharing one underlying engine:

1. **REST API** — The core HTTP interface implementing all memory operations. Portable, testable, usable by any client.
2. **MCP Server** — A thin facade that translates MCP tool calls into REST-like operations on the same service layer. Native integration with GitHub Copilot and other MCP-aware agents.

This "MCP facade over REST core" architecture means:
- The REST API can be developed, tested, and used independently
- The MCP layer is a thin adapter, not a reimplementation
- New clients (CLI, web UI, other agents) only need HTTP
- The MCP SDK handles protocol complexity while our code stays simple

---

