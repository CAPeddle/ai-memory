### 5.4 Concurrency Verdict

SQLite's WAL mode handles 5 concurrent sessions without any observable latency. PostgreSQL's MVCC is irrelevant at this scale. **SQLite wins on simplicity** — no connection pooling to configure, no max_connections to tune.

---

