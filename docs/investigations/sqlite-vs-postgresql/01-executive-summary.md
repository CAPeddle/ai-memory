## 1. Executive Summary

For an AI agent memory service running locally on a Windows dev laptop with 1–5 concurrent agent sessions, **SQLite is the correct starting choice**. It eliminates deployment friction, delivers competitive FTS performance at projected scale (≤500K records in 3 years), and keeps the service self-contained. PostgreSQL becomes the right choice **only** if the service moves to a shared server, requires high write concurrency (>5 simultaneous writers), or needs production-grade vector search at scale (>1M embeddings).

The recommended approach is **phased**: start with SQLite + FTS5, abstract the storage layer behind a repository interface from day one, and add PostgreSQL as a backend option when the scale/deployment model demands it.

See also: `docs/investigations/memsearch-applicability-review.md` for the ST-014 comparison against memsearch's Milvus Lite + Markdown model; that review keeps SQLite-first as the current default.

---

