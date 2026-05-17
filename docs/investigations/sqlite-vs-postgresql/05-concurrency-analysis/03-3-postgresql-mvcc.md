### 5.3 PostgreSQL MVCC

- True multi-version concurrency control
- Multiple simultaneous writers
- Row-level locking
- Connection pooling (PgBouncer, Npgsql built-in pooling)
- No write queue — all writers proceed in parallel

**For ai-memory's workload**: Complete overkill, but zero issues. Like using a fire hose to fill a cup.

