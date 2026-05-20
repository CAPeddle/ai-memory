## Problem Statement

The hybrid retrieval system initially considers:

```

Hybrid Search = BM25 + Vector + Structural (via RRF)

```

However, introducing structural similarity as a ranking signal raises complexity in:

- Ranking normalization
- Graph modeling
- Cross-index consistency
- Latency

The key question:

> Should structural similarity participate in ranking, or constrain the candidate set before ranking?

---

