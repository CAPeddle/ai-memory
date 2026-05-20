### Unified Search (`memory_search`) — One Tool, Four Backends

```
memory_search("what did we decide about the database?")
        │
        ├── continuity  — semantic vector search (384d/768d embeddings)
        ├── facts       — structured entity/key/value lookup + FTS5
        ├── files       — workspace document vector search
        └── lcm         — full-text search over lossless messages + summaries
        │
        ▼
    Combined results — all backends in parallel
```

