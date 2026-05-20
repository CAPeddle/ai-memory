### 4.1 Pipeline Stages

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. CANDIDATE   │────▶│  2. SCORING     │────▶│  3. PROMOTION   │
│     DETECTION   │     │                 │     │                 │
│                 │     │  • Frequency    │     │  • Deduplicate  │
│  • Cluster      │     │  • Diversity    │     │  • Merge facts  │
│    episodic     │     │  • Relevance    │     │  • Create       │
│    embeddings   │     │  • Recency tie  │     │    semantic     │
│  • Find themes  │     │                 │     │  • Link source  │
│  • Extract facts│     │  Score ≥ 0.7?   │     │    episodes     │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │ No
                                 ▼
                        ┌─────────────────┐
                        │  SKIP           │
                        │  (re-evaluate   │
                        │   next cycle)   │
                        └─────────────────┘
```

