### Philosophy: coverage as signal, not target
High coverage of low-quality tests (tests that assert nothing meaningful, or test only the happy path) provides false confidence. A targeted 40% with high-signal tests on critical paths is preferable to 90% that includes trivial property getter tests.

**For ai-memory**, the critical paths requiring test coverage are:
1. SQLite FTS5 search (correctness of ranked results)
2. Vector similarity search (cosine distance, RRF fusion)
3. API input validation (RFC 7807 error responses)
4. Consolidation scoring (deduplication, promotion logic)

