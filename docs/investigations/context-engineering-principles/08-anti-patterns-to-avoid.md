## 7. Anti-Patterns to Avoid

### 7.1 The Seven Context Engineering Anti-Patterns

| # | Anti-Pattern | Description | Mitigation |
|---|-------------|-------------|------------|
| 1 | **Context dumping** | Injecting all known facts at session start | Use Resources (Layer 0) — curated, compact |
| 2 | **Eager retrieval** | Searching memory before knowing what's needed | Let the agent pull when it has a question |
| 3 | **Stale context** | Injecting deprecated facts alongside current ones | `active = 0` soft-delete; supersession chain |
| 4 | **Mono-source** | Only surfacing same-project facts | Source mixing with cross-project visibility |
| 5 | **Duplicate flooding** | Near-identical facts crowding results | MMR diversity ranking (λ = 0.7) |
| 6 | **Unbounded results** | Returning 50 results when 5 suffice | Hard limit default (10), let agent ask for more |
| 7 | **Opaque context** | Injecting facts without provenance or scores | Always include source, project, confidence, score |

### 7.2 The "Dump Detector" Rule

If a context injection exceeds 1000 tokens, ask: **Could this be a pointer instead?**

- Instead of injecting 20 facts: inject top 3 + "use `memory_search` for more about X"
- Instead of full episode history: inject "last session worked on X; search for details"
- Instead of full ExecPlan: inject §5b recovery ledger + task count remaining

---

