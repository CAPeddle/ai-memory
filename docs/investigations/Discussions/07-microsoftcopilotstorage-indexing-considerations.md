## Indexing Considerations

### Multi-Index Ingestion

Each write operation must update:

```

→ BM25 index
→ Vector index
→ Structural index

```

**Implication:**
- Requires ingestion pipeline
- Eventual consistency is likely

---

### Ranking Fusion Constraints

RRF requires:
- Comparable top-K outputs
- Stable ranking sizes

**Implication:**
- Normalize retrieval sizes across lanes

---

