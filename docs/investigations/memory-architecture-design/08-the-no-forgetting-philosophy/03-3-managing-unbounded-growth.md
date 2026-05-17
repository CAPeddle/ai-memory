### 8.3 Managing Unbounded Growth

Without decay, storage grows indefinitely. Mitigations:

1. **Deduplication at ingest** — Reject semantically identical new memories (cosine similarity > 0.95 to existing)
2. **Supersession** — When a fact is corrected, the old version is soft-deleted (`active = 0`) but retained for audit
3. **Archival threshold** — After configurable period (e.g., 2 years) with zero recalls, memories are moved to cold storage (still searchable but not in primary index)
4. **Explicit pruning** — Users can delete memories they know are obsolete
5. **Embedding compaction** — Periodic re-embedding with latest model to maintain quality

