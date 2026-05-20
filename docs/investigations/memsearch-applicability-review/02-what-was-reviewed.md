## 2. What Was Reviewed

| Category | Artifacts reviewed | Why they mattered |
|----------|--------------------|-------------------|
| **Local design authority** | `.github/planning/query-packets/QP-014-memsearch-investigation.md`, `docs/investigations/memory-architecture-design.md`, `docs/investigations/sqlite-vs-postgresql.md`, `.github/planning/story-board.md` | Established ai-memory's current positions for ST-004, ST-005, SQLite-first storage, hybrid search, and provider flexibility |
| **Upstream docs** | `README.md`, `docs/design-philosophy.md`, `docs/getting-started.md`, `docs/architecture.md`, `evaluation/README.md` at upstream commit `ca94a43ac83db02f171ea366ca99ee888628d590` | Provided memsearch's published claims about ONNX defaults, Milvus Lite, progressive disclosure, Markdown-as-source-of-truth, and benchmark framing |
| **Upstream code** | `src/memsearch/core.py`, `src/memsearch/store.py`, `src/memsearch/cli.py`, `src/memsearch/embeddings/onnx.py`, `src/memsearch/chunker.py`, `src/memsearch/watcher.py` | Confirmed which claims were architectural reality versus documentation positioning |
| **Plugin integration layer** | `plugins/openclaw/index.ts`, `plugins/claude-code/README.md`, `plugins/opencode/README.md`, `plugins/opencode/skills/memory-recall/SKILL.md` | Showed how memsearch's staged recall flow is actually consumed by agent/plugin surfaces |
| **Local validation artifacts** | `.tmp/st-014-memsearch/fixture/`, `.tmp/st-014-memsearch/logs/runtime-failure.txt`, `.tmp/st-014-memsearch/logs/docs-evidence.txt`, `.tmp/st-014-memsearch/logs/code-evidence.txt`, `.tmp/st-014-memsearch/logs/plugin-evidence.txt` | Bounded what could be claimed from local execution versus doc-and-code evidence |

---

