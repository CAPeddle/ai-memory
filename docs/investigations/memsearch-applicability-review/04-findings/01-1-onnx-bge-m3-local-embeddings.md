### 4.1 ONNX bge-m3 local embeddings

**Current ai-memory position:** `docs/investigations/memory-architecture-design.md` keeps embeddings behind an abstraction and currently names OpenAI `text-embedding-3-small` as the default choice, while `.github/planning/story-board.md` defines ST-004 as `Implement embedding service (OpenAI)` with an OpenAI implementation and configurable model.

**memsearch published-doc evidence:** memsearch's README and evaluation docs present ONNX `bge-m3` int8 as the zero-config path for plugin users: local CPU execution, no API key, roughly 558 MB model size, and benchmark claims that it is within about 1 percent of OpenAI `text-embedding-3-small` while outperforming it on Chinese retrieval.

**memsearch code evidence:** `src/memsearch/embeddings/onnx.py` implements a dedicated ONNX provider with default model `gpahal/bge-m3-onnx-int8`. At the same time, `src/memsearch/core.py` still defaults the core API to `embedding_provider="openai"`, which shows that ONNX is an integration choice layered on top of a provider abstraction rather than a hard architectural requirement.

**Validation gap:** the WSL2 retry installed `memsearch[onnx]`, but the local index attempt failed before any embedding-backed search outputs were emitted. This means there is no local ai-memory-side evidence here for cold-start latency, CPU throughput, or result quality under this workstation setup.

**Trade-offs:** ONNX `bge-m3` clearly improves offline capability, removes API-key friction, and lowers recurring cost. The counterweight is local model download size, runtime dependency complexity, dimension mismatch and re-index concerns, and the absence of a completed local validation run in this repo. The upstream code split between plugin defaults and core defaults also suggests that provider abstraction matters more than immediately switching ai-memory's default provider.

**Recommendation label:** Adapt later

