### 6.4 Context Quality Metrics

Track these to ensure the system delivers good context, not just any context:

| Metric | Target | Alarm |
|--------|--------|-------|
| Helpful/Total recall ratio | >60% | <30% suggests noise |
| Average result diversity (inter-result cosine) | <0.7 | >0.85 suggests near-duplication |
| Mean results used by agent | >3 of 10 | <1 of 10 suggests poor relevance |
| Context tokens per useful fact | <200 | >500 suggests verbose formatting |

---

