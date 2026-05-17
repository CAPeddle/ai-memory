## 4. Search Strategy — Hybrid Architecture

```
Query → [Embedding] + [Tokenize]
         ↓                ↓
   Vector Search     BM25 Search (FTS5)
         ↓                ↓
       Weighted Merge → Top Results
```

| Feature | Detail |
|---------|--------|
| Vector search | Semantically similar notes (e.g. "gateway host" matches "the machine running OpenClaw") |
| BM25 (FTS5) | Exact matches — IDs, error strings, config keys |
| Graceful degradation | If embeddings unavailable, lexical ranking via FTS still works |
| Temporal decay | Configurable half-life (30d default); evergreen files exempt |
| MMR diversity | Reduces redundant results |
| Multimodal | Images/audio indexable alongside Markdown (Gemini Embedding 2) |
| sqlite-vec | Optional in-database vector acceleration |

**Supported embedding providers:** OpenAI, Gemini, Voyage, Mistral, DeepInfra, Ollama, Local (GGUF), GitHub Copilot, Bedrock.

---

