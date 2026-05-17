### 8.1 Comparison with Alfred

| Aspect | Alfred (Forgetting Curve) | ai-memory (No Forgetting) |
|--------|--------------------------|---------------------------|
| **Temporal decay** | Memories lose strength over time | No decay — all memories retain full weight |
| **Recall refresh** | Recalling a memory resets its decay | Recall only logs events for analytics |
| **Old memories** | Gradually become unreachable | Always equally accessible |
| **Storage growth** | Self-pruning via decay | Grows monotonically (managed by dedup + archival) |
| **Search weight** | Recency heavily weighted | Recency only as tiebreaker |
| **Philosophy** | "Forgetting is healthy" | "Nothing learned should be lost" |

