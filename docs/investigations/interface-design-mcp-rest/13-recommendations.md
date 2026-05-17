## 13. Recommendations

1. **Same process for MCP + REST** — Simpler deployment, shared DI container, no inter-process communication needed at our scale.
2. **MCP tools return formatted text** — Agents interpret natural language better than raw JSON. Include IDs for follow-up operations.
3. **Include recall_event_id in search results** — Essential for the feedback loop that drives consolidation quality.
4. **Enable Swagger in dev, disable in service mode** — Useful during development, unnecessary overhead in background service.
5. **Start with HTTP transport** — stdio requires careful lifecycle management; HTTP is easier to debug and supports multiple simultaneous clients.

---

