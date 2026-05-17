### 4.4 Markdown as source of truth vs SQLite-first

**Current ai-memory position:** ai-memory's architecture assumes structured records in SQLite for semantic memories, episodic memories, recall events, and consolidation logs, with vector search attached to that database-centric model. The current storage decision is explicit: SQLite is the starting database and remains the authoritative core until scale requirements justify a different backend.

**memsearch published-doc evidence:** memsearch's design philosophy is unambiguous that markdown files are the canonical store and Milvus is only a rebuildable acceleration index. The docs frame this as human-readable, git-friendly, portable, and resistant to vendor lock-in.

**memsearch code evidence:** `src/memsearch/watcher.py` watches markdown files directly, `src/memsearch/chunker.py` builds chunk identities from markdown file positions plus content hashes, and `src/memsearch/core.py` appends compaction output back into daily markdown files before re-indexing them. This confirms that the code really treats markdown as authoritative state, not merely as an export format.

**Validation gap:** the local fixture proved that a markdown-shaped corpus could be created for the smoke test, but indexing did not complete, so this repo did not locally validate a full rebuild-from-markdown flow.

**Trade-offs:** markdown-as-source-of-truth is excellent for transparency, manual editing, and git workflows. It is much weaker for ai-memory's planned structured query patterns, atomic updates, recall-event logging, promotion pipelines, and repository-backed abstractions. Adopting it as the primary source of truth would invert too much of the approved design for too little demonstrated gain.

**Recommendation label:** Keep current

---

