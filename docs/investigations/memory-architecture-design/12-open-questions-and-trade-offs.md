## 12. Open Questions and Trade-offs

### 12.1 Open Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | **Implementation language?** | C# (.NET 8) vs Python vs TypeScript | Affects team velocity, MCP SDK choice, deployment |
| 2 | **Embedding model hosting?** | Cloud API (OpenAI) vs local (ONNX) vs hybrid | Cost, latency, offline capability |
| 3 | **Consolidation trigger?** | Scheduled (cron) vs event-driven (every N episodes) vs manual-only | Automation vs control |
| 4 | **Multi-user?** | Single-user local vs shared team service | Schema changes, auth requirements |
| 5 | **Where does the DB live?** | User home dir vs project-adjacent vs cloud-synced | Portability, backup, sharing |
| 6 | **Embedding drift?** | Re-embed everything when model changes vs dual-index | Migration complexity, quality |
| 7 | **Confidence scoring for observations?** | Agent self-reported vs inferred from context | Accuracy of auto-promoted facts |
| 8 | **Session boundary detection?** | Explicit start/stop vs inferred from time gaps | Episodic grouping accuracy |

### 12.2 Trade-offs

| Trade-off | Choice A | Choice B | Recommendation |
|-----------|----------|----------|----------------|
| **Storage vs Precision** | Store everything raw | Deduplicate aggressively | Moderate dedup (0.95 threshold) — preserve nuance |
| **Search speed vs Quality** | FTS only (fast) | Always include vector search (slower) | Hybrid with RRF — quality wins for our scale |
| **Promotion automation** | Fully automatic | Always require user confirmation | Auto with threshold; flag borderline cases |
| **Embedding dimension** | 1536 (higher quality) | 256 (faster, smaller) | 1536 — storage is cheap, quality matters |
| **Cross-project visibility** | Strict project isolation | Everything visible always | Visible with project boosting — knowledge should flow |

### 12.3 Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Embedding model deprecation | Medium | Abstract embedding behind interface; store model version per memory |
| SQLite concurrency limits | Low | Single-writer is fine for our use case; WAL mode for concurrent reads |
| False promotions (garbage in semantic) | Medium | Require minimum recall count before promotion; user can demote |
| Storage growth over years | Low | Archival pipeline + cold storage for zero-recall aged memories |
| Search quality degrades at scale | Medium | Monitor recall feedback; periodic re-indexing; tune MMR λ |

---

