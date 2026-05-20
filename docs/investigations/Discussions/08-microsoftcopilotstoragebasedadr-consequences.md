## Consequences

### ✅ Positive

- Reduced architectural complexity
- Lower latency (no structural ranking phase)
- Simpler ranking model (2 signals only)
- Compatible with SQLite-first constraint
- Faster delivery and iteration

---

### ⚠️ Negative / Trade-offs

- Structural importance cannot influence ranking
- Potential loss of nuanced relevance (structure-aware ranking)
- Requires careful **chunk ↔ entity mapping**
- May require refactoring if structural queries become more complex

---

