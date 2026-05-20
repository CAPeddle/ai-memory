## §R7 — Context Scoping in Forked MCP Tools

**Status: Implemented in `server/index.ts` and `server/src/parseContext.ts`.**

`parseContext()` parses the `context` string parameter into a `ContextScope` object:

```typescript
// Input:  "project:zoom,profile:professional"
// Output: { projects: ['zoom'], profile: 'professional' }
parseContext("project:zoom,profile:professional")
```

The `context` parameter is wired into `capture_thought`, `search_thoughts`, and `list_thoughts`. The `fetch`, `search`, `thought_stats`, and `graph_traverse` tools do not accept `context` — `fetch` and `search` are ChatGPT compatibility shims (lookup by ID/embedding), and `thought_stats` and `graph_traverse` are global views by design. Both `capture_thought` and `search_thoughts` were validated with context scoping.

**Verification query for capture_thought with context:**
```
capture_thought("test thought", { memory_type: "shard", context: "project:test" })
→ Returns: "Captured as shard / project:test (id: <uuid>)"
→ DB row: memory_type='shard', project='test'
```

---

