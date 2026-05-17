## The Core Brain (Canonical Memory)

The **Core Brain** stores all episodic and semantic memory.

### What the Brain Contains
- **Shards**: raw, timestamped events
  - chat transcripts
  - build errors and fixes
  - design discussions
  - agent actions
- embeddings (semantic representations)
- metadata (project, repo, source, agent, time)
- structural relationships (project → repo → module → file)
- provenance (who/what created the memory)

### What the Brain Supports
- hybrid retrieval:
  - BM25 (lexical)
  - vector similarity (semantic)
- structural filtering (scope/context)
- long‑term recall and synthesis

The brain is **append‑heavy, retrieval‑heavy**, and intentionally noisy.  
Noise is managed through **views**, not deletion.

---

