# 4. Findings

This section is split into focused sub-fragments.

See the [section index](./04-findings/_index.md) for navigation.

## 4. Findings

### 4.1 ONNX bge-m3 local embeddings

**Current ai-memory position:** `docs/investigations/memory-architecture-design.md` keeps embeddings behind an abstraction and currently names OpenAI `text-embedding-3-small` as the default choice, while `.github/planning/story-board.md` defines ST-004 as `Implement embedding service (OpenAI)` with an OpenAI implementation and configurable model.
