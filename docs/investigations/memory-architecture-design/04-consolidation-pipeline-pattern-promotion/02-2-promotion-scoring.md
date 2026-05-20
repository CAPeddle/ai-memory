### 4.2 Promotion Scoring

Each candidate receives a composite score based on three factors:

| Factor | Weight | Description | Measurement |
|--------|--------|-------------|-------------|
| **Frequency** | 0.40 | How often a pattern surfaces in episodic memory | Count of similar episodes (cosine similarity > 0.85) |
| **Diversity** | 0.35 | Appears across different projects or contexts | Count of distinct projects/sessions where observed |
| **Relevance** | 0.25 | How useful the fact was when recalled | Recall count + positive feedback ratio |

**Composite Score Formula:**

```
score = (0.40 × normalized_frequency) +
        (0.35 × normalized_diversity) +
        (0.25 × normalized_relevance)
```

- All factors normalized to [0.0, 1.0]
- Promotion threshold: `score ≥ 0.7`
- Near-threshold candidates (0.5–0.7) are flagged for optional user confirmation

