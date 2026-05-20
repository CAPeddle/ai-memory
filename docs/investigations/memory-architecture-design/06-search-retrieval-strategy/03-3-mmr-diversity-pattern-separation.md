### 6.3 MMR Diversity (Pattern Separation)

Maximal Marginal Relevance prevents near-duplicate results from dominating:

```
MMR = argmax[λ · sim(d, q) - (1-λ) · max(sim(d, d_selected))]

λ = 0.7 (tunable — higher favors relevance over diversity)
```

At each step, the next result chosen maximizes a balance between:
- Relevance to the query (first term)
- Dissimilarity to already-selected results (second term)

