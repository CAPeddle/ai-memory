### 4.4 Growth Verdict

Both engines handle these sizes trivially:
- **SQLite**: A 1GB database file is well within comfortable operating range. SQLite has been tested to 281TB. The FTS5 index will remain fast at these scales.
- **PostgreSQL**: These numbers wouldn't even register as a small database.

The "unbounded growth" constraint sounds alarming, but in practice a local dev tool generates modest data. Even at heavy usage for 5 years, we're looking at ~1GB — a rounding error for either database.

**Concern point**: If vector embeddings are stored inline (1536-dim float32 = 6KB per record), the database grows faster. At 300K records with embeddings: ~1.8GB of vector data alone. This is still manageable for both engines but makes vacuum/compaction relevant for SQLite.

---

