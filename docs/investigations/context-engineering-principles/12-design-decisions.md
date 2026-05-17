## 11. Design Decisions

| Decision | Rationale |
|----------|-----------|
| Resources max 500 tokens | Forces curation; prevents Layer 0 bloat |
| Search default limit 10 | Balances coverage with context cost |
| MMR λ = 0.7 | Slight diversity bias; avoids duplicate flooding |
| Results formatted as one-liners | Token-efficient; agent can drill deeper if needed |
| Feedback is optional, not blocking | Don't add friction to the recall path |
| Provenance always shown | Agent can judge relevance by source + project |
| No auto-injection beyond Resources | Agent controls its own context budget |

---

