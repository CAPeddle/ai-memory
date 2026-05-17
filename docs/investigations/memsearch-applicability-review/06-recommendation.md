## 6. Recommendation

Use memsearch as a reference for future provider flexibility and staged recall UX, not as a replacement architecture.

- Keep SQLite-first storage, FTS5-first text search, and the existing hybrid retrieval direction.
- Keep ST-004 OpenAI-first, but preserve the provider abstraction so ONNX can be evaluated later with a cleaner local benchmark or a dedicated provider-broadening story.
- Keep ST-005 focused on core hybrid retrieval. Revisit progressive disclosure only after the base recall path exists and transcript provenance can be modelled cleanly.
- Treat Markdown-as-source-of-truth and Milvus Lite as informative alternatives, not as stronger defaults for this repo today.

Current ai-memory architectural defaults remain authoritative unless a later approved story changes them.

---

