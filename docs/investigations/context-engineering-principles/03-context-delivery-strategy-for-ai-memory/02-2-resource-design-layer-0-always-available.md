### 3.2 Resource Design (Layer 0 — Always Available)

MCP Resources are read-only context that agents can request at any time. Design them as **summaries, not dumps**:

```
memory://facts/{project}
```

Returns a **curated, compact** representation:
- Maximum 20 most-recalled facts per project
- Formatted as bullet points (token-efficient)
- Sorted by recall frequency (most useful first)
- Includes fact IDs for drill-down via `memory_inspect`

```
memory://recent-episodes
```

Returns:
- Last 10 episodes across all projects
- One-line summaries (not full content)
- Grouped by session for context

**Design rule:** Resources should fit in ~500 tokens. If an agent needs more, it should use a Tool.

