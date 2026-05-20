### 3.4 Prompt Design (Layer 1.5 — Structured Retrieval)

MCP Prompts (`recall_context`) provide **guided retrieval patterns** so agents don't have to figure out how to query:

```
Agent thinks: "I'm about to work on CMake configuration for zoom"
Agent uses: recall_context(topic="CMake configuration", project="zoom")
Memory returns: Top relevant facts + recent episodes, pre-formatted for context injection
```

This is the "point" in "point, don't dump" — the prompt tells the memory system what domain to surface, and the system returns only what's relevant.

---

