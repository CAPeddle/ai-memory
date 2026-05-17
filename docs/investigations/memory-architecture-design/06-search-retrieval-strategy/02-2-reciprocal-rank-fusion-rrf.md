### 6.2 Reciprocal Rank Fusion (RRF)

Combines FTS5 and vector search rankings without needing score normalization:

```
RRF_score(d) = Σ  1 / (k + rank_i(d))
               i∈{fts, vector}

k = 60 (standard constant)
```

