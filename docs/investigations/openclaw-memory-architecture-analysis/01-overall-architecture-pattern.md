## 1. Overall Architecture Pattern

**Multi-layered cognitive memory system** — 12+ discrete layers, each optimized for a different query pattern and lifetime. The core philosophy is:

> "Don't rely on one approach. Use the right memory layer for each type of recall."

The architecture draws from cognitive science (Hebbian learning, working memory vs. long-term memory):

```
┌─────────────────────────────────────────────────────────┐
│ Lossless Context Engine (lcm.db)                         │
│ Stores all messages → builds summary DAG → assembles     │
│ context window from DAG + live messages                  │
├─────────────────────────────────────────────────────────┤
│ CONTEXT WINDOW (~200K tokens, assembled by LCM)          │
│                                                          │
│ • Workspace files (always loaded): MEMORY.md, USER.md,  │
│   SOUL.md, AGENTS.md                                     │
│ • Plugin context (injected at runtime): Continuity,     │
│   Stability, Metabolism                                  │
│ • Conversation (managed by LCM): Live msgs + DAG        │
│   summaries of older ones                                │
├─────────────────────────────────────────────────────────┤
│ PERSISTENT STORAGE                                       │
│                                                          │
│ • lcm.db — Messages, summaries, FTS index, DAG nodes    │
│ • facts.db — Entities, relations, aliases, decay tiers  │
│ • continuity.db — Archives, embeddings, topics, anchors │
│ • LightRAG — PostgreSQL + pgvector (domain knowledge)   │
│ • Daily files — memory/*.md (journal)                   │
├─────────────────────────────────────────────────────────┤
│ METACOGNITIVE PIPELINE                                   │
│ Metabolism → Gaps → Contemplation → Growth Vectors       │
└─────────────────────────────────────────────────────────┘
```

**Key insight: Layers serve different timescales and query patterns.**

| Layer | Purpose | Latency | Query Pattern |
|-------|---------|---------|---------------|
| 0. LCM | Lossless within-session context (DAG + FTS) | Runtime | "What did I just say?" |
| 1. Always-loaded files | Identity, working memory | 0ms | Always present |
| 2. MEMORY.md | Curated long-term wisdom | 0ms | Always present |
| 3. PROJECT.md | Institutional knowledge per project | 0ms | Per-project boot |
| 4. facts.db | Structured entity/key/value | <1ms | "What's X's birthday?" |
| 5. Continuity | Cross-session conversation recall | 7ms | "What did we discuss?" |
| 5a. File-vec | Workspace document search | 7ms | "Where did I document X?" |
| 5b. LightRAG | Domain GraphRAG | ~200ms | Deep domain queries |
| 6. Daily logs | Raw session history | On demand | Full history |
| 10-12. Plugins | Context budgeting, monitoring, extraction | Runtime | Automatic |

---

