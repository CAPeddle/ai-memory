## 8. Testing Strategies

### 60-Query Benchmark Suite

Categories: PEOPLE, TOOLS, PROJECTS, FACTS, OPERATIONAL, IDENTITY, DAILY

| Strategy | Accuracy |
|----------|----------|
| BM25 only (QMD) | 46.7% |
| Graph only | 96.7% |
| Hybrid (Graph + BM25) | **100%** (60/60) |

### Script: `memory-benchmark.py`
- Runs search queries against all backends
- Compares results against expected ground truth
- Used to validate search pipeline after changes

### Guardrails Testing (Metabolism)
- 13 guardrails enforced on fact insertion
- Blocked keys: `gateway_status`, `node_status`, `model_setting`, etc.
- Entity minimum length enforcement
- Numeric value filter
- 16 explicitly blocked key patterns

---

