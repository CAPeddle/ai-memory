### 4.2 Milvus Lite vs SQLite-first

**Current ai-memory position:** `docs/investigations/memory-architecture-design.md` places SQLite at the center of the storage layer, with SQLite FTS5 plus `sqlite-vec` or in-process HNSW as the planned vector path. `docs/investigations/sqlite-vs-postgresql.md` explicitly chooses SQLite first because it is single-file, zero-config, Windows-friendly, and sufficient for the expected 1-5 local concurrent sessions.

**memsearch published-doc evidence:** memsearch's design docs argue for Milvus because it provides dense search, BM25 sparse search, and RRF fusion in one backend, plus a scale path from Milvus Lite to server or cloud. The docs present Milvus Lite as zero-config and emphasize that sparse vectors are auto-generated rather than merged manually in application code.

**memsearch code evidence:** `src/memsearch/store.py` uses Milvus `hybrid_search()` with a dense request, a BM25 request, and `RRFRanker(k=60)`. `src/memsearch/core.py` treats a local `*.db` path as Milvus Lite, and the store layer has explicit cleanup code to release Milvus Lite's file lock on close.

**Validation gap:** the native Windows local-file path failed deterministically because `milvus-lite` is unsupported on Windows, and the WSL2 retry did not progress to successful indexing or query execution. So the strongest local signal about Milvus Lite in this repo is negative operational friction, not successful retrieval behaviour.

**Trade-offs:** Milvus reduces application-side hybrid-search plumbing and offers a cleaner scale-up story than `sqlite-vec`. In exchange, it introduces a second datastore surface, Python/Milvus client operational complexity, platform friction on Windows, and a retrieval model tied to Milvus-specific capabilities. For ai-memory's approved local-first deployment target, those costs are not offset by enough demonstrated benefit.

**Recommendation label:** Keep current

