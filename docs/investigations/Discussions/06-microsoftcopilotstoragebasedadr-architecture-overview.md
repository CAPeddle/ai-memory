## Architecture Overview

### Retrieval System (for coding + conversation memory)

```

                ┌──────────────────────┐
                │   Structural Layer   │
                │ (relational tables)  │
                └──────────┬───────────┘
                           ↓
                    Candidate Filter

Query → BM25 index ─┐
├─→ RRF → Results
Query → Vector idx ─┘

```

---

### State System (for Agile board)

- Separate from hybrid retrieval
- Uses:
  - relational schema
  - filtering queries
  - event/state tracking

---

