# Investigation: memsearch applicability to ai-memory

| Field | Value |
|-------|-------|
| **Created** | 2026-05-04 |
| **Status** | Complete |
| **Scope** | Applicability of `zilliztech/memsearch` patterns to ai-memory's current embedding, storage, retrieval, and source-of-truth decisions |
| **Method** | Published upstream docs, upstream code inspection, and a bounded local smoke test with explicit fallback logging |
| **Decision** | Keep current architectural defaults; adapt only selective memsearch ideas later where they fit the existing design authority |

---

## 1. Executive Summary

memsearch is a useful reference implementation for agent-memory ergonomics, but it does not justify overturning ai-memory's approved architecture. The strongest takeaways are selective rather than wholesale:

1. ONNX `bge-m3` is a credible future provider option, but not strong enough here to replace the current OpenAI-first ST-004 direction.
2. Milvus Lite does not beat the current SQLite-first path strongly enough to justify replacing it as ai-memory's primary storage and retrieval foundation.
3. The `search` -> `expand` -> `transcript` progressive disclosure pattern is the most interesting memsearch idea for ai-memory, but it is a later UX/retrieval-surface concern rather than a reason to widen ST-005 now.
4. Markdown as the source of truth improves portability and human inspection, but it conflicts with ai-memory's current design around SQLite-backed structured state, recall logging, and repository-oriented storage abstractions.

Current ai-memory architectural defaults remain authoritative unless a later approved story changes them.

---

## 2. What Was Reviewed

| Category | Artifacts reviewed | Why they mattered |
|----------|--------------------|-------------------|
| **Local design authority** | `.github/planning/query-packets/QP-014-memsearch-investigation.md`, `docs/investigations/memory-architecture-design.md`, `docs/investigations/sqlite-vs-postgresql.md`, `.github/planning/story-board.md` | Established ai-memory's current positions for ST-004, ST-005, SQLite-first storage, hybrid search, and provider flexibility |
| **Upstream docs** | `README.md`, `docs/design-philosophy.md`, `docs/getting-started.md`, `docs/architecture.md`, `evaluation/README.md` at upstream commit `ca94a43ac83db02f171ea366ca99ee888628d590` | Provided memsearch's published claims about ONNX defaults, Milvus Lite, progressive disclosure, Markdown-as-source-of-truth, and benchmark framing |
| **Upstream code** | `src/memsearch/core.py`, `src/memsearch/store.py`, `src/memsearch/cli.py`, `src/memsearch/embeddings/onnx.py`, `src/memsearch/chunker.py`, `src/memsearch/watcher.py` | Confirmed which claims were architectural reality versus documentation positioning |
| **Plugin integration layer** | `plugins/openclaw/index.ts`, `plugins/claude-code/README.md`, `plugins/opencode/README.md`, `plugins/opencode/skills/memory-recall/SKILL.md` | Showed how memsearch's staged recall flow is actually consumed by agent/plugin surfaces |
| **Local validation artifacts** | `.tmp/st-014-memsearch/fixture/`, `.tmp/st-014-memsearch/logs/runtime-failure.txt`, `.tmp/st-014-memsearch/logs/docs-evidence.txt`, `.tmp/st-014-memsearch/logs/code-evidence.txt`, `.tmp/st-014-memsearch/logs/plugin-evidence.txt` | Bounded what could be claimed from local execution versus doc-and-code evidence |

---

## 3. Lightweight Local Validation

The local smoke test followed the ExecPlan's revised WSL2 path and then fell back to docs+code mode when runtime validation still did not complete.

| Check | Result |
|-------|--------|
| Synthetic corpus creation | Succeeded: created `2026-05-04.md`, `session-st014.jsonl`, and `ai-memory-doc-sample.md` |
| WSL2 availability | Succeeded: default distro `Ubuntu`, default version `2` |
| Linux Python check | Succeeded: `Python 3.12.3` |
| Linux-side editable install | Succeeded: `memsearch[onnx]` installed into `.tmp/st-014-memsearch/venv-linux/` |
| Local indexing/search flow | Failed before validation outputs were produced |

Observed runtime outcome:

- Native Windows Milvus Lite validation was not viable because upstream `milvus-lite` does not provide Windows wheels for the local-file path used by the plan.
- The revised WSL2 retry installed successfully but the index attempt stopped in the `pymilvus` / `google.protobuf` import chain before any `search`, `expand`, or `transcript` output files were produced.
- Because of that gap, this review treats runtime-backed claims as unvalidated locally and relies on upstream docs and code for architecture conclusions.

This bounded runtime result is still useful: it confirms that memsearch's local story is more operationally fragile on this Windows-first workstation than ai-memory's current SQLite-first design target.

---

## 4. Findings

### 4.1 ONNX bge-m3 local embeddings

**Current ai-memory position:** `docs/investigations/memory-architecture-design.md` keeps embeddings behind an abstraction and currently names OpenAI `text-embedding-3-small` as the default choice, while `.github/planning/story-board.md` defines ST-004 as `Implement embedding service (OpenAI)` with an OpenAI implementation and configurable model.

**memsearch published-doc evidence:** memsearch's README and evaluation docs present ONNX `bge-m3` int8 as the zero-config path for plugin users: local CPU execution, no API key, roughly 558 MB model size, and benchmark claims that it is within about 1 percent of OpenAI `text-embedding-3-small` while outperforming it on Chinese retrieval.

**memsearch code evidence:** `src/memsearch/embeddings/onnx.py` implements a dedicated ONNX provider with default model `gpahal/bge-m3-onnx-int8`. At the same time, `src/memsearch/core.py` still defaults the core API to `embedding_provider="openai"`, which shows that ONNX is an integration choice layered on top of a provider abstraction rather than a hard architectural requirement.

**Validation gap:** the WSL2 retry installed `memsearch[onnx]`, but the local index attempt failed before any embedding-backed search outputs were emitted. This means there is no local ai-memory-side evidence here for cold-start latency, CPU throughput, or result quality under this workstation setup.

**Trade-offs:** ONNX `bge-m3` clearly improves offline capability, removes API-key friction, and lowers recurring cost. The counterweight is local model download size, runtime dependency complexity, dimension mismatch and re-index concerns, and the absence of a completed local validation run in this repo. The upstream code split between plugin defaults and core defaults also suggests that provider abstraction matters more than immediately switching ai-memory's default provider.

**Recommendation label:** Adapt later

### 4.2 Milvus Lite vs SQLite-first

**Current ai-memory position:** `docs/investigations/memory-architecture-design.md` places SQLite at the center of the storage layer, with SQLite FTS5 plus `sqlite-vec` or in-process HNSW as the planned vector path. `docs/investigations/sqlite-vs-postgresql.md` explicitly chooses SQLite first because it is single-file, zero-config, Windows-friendly, and sufficient for the expected 1-5 local concurrent sessions.

**memsearch published-doc evidence:** memsearch's design docs argue for Milvus because it provides dense search, BM25 sparse search, and RRF fusion in one backend, plus a scale path from Milvus Lite to server or cloud. The docs present Milvus Lite as zero-config and emphasize that sparse vectors are auto-generated rather than merged manually in application code.

**memsearch code evidence:** `src/memsearch/store.py` uses Milvus `hybrid_search()` with a dense request, a BM25 request, and `RRFRanker(k=60)`. `src/memsearch/core.py` treats a local `*.db` path as Milvus Lite, and the store layer has explicit cleanup code to release Milvus Lite's file lock on close.

**Validation gap:** the native Windows local-file path failed deterministically because `milvus-lite` is unsupported on Windows, and the WSL2 retry did not progress to successful indexing or query execution. So the strongest local signal about Milvus Lite in this repo is negative operational friction, not successful retrieval behaviour.

**Trade-offs:** Milvus reduces application-side hybrid-search plumbing and offers a cleaner scale-up story than `sqlite-vec`. In exchange, it introduces a second datastore surface, Python/Milvus client operational complexity, platform friction on Windows, and a retrieval model tied to Milvus-specific capabilities. For ai-memory's approved local-first deployment target, those costs are not offset by enough demonstrated benefit.

**Recommendation label:** Keep current

### 4.3 Progressive disclosure (search → expand → transcript)

**Current ai-memory position:** ai-memory already plans hybrid retrieval in `docs/investigations/memory-architecture-design.md` and ST-005, but the current design stops at ranked result generation plus RRF/MMR re-ranking. There is no approved staged `expand` or transcript-deepening surface yet.

**memsearch published-doc evidence:** `docs/design-philosophy.md` makes progressive disclosure a first-class design choice: cheap chunk snippets first, then full markdown sections, then raw transcript when needed. The plugin docs describe this as a context-control mechanism rather than just a CLI convenience.

**memsearch code evidence:** `src/memsearch/cli.py` exposes `search` and `expand`, and explicitly documents `expand` as L2 in the progressive-disclosure workflow. `plugins/openclaw/index.ts` adds `memory_search`, `memory_get`, and `memory_transcript` surfaces plus cold-start and end-of-turn hooks, which shows that the three-layer pattern mainly lives at the retrieval surface and plugin boundary. Separately, `src/memsearch/store.py` shows that memsearch's search core is already hybrid BM25 + dense + RRF, which means the novel part is the staged drill-down, not the base ranking strategy.

**Validation gap:** because indexing never completed locally, this repo did not produce a successful `search` -> `expand` -> `transcript` run against the synthetic corpus. The value judgment here therefore comes from upstream docs and code, not from verified local transcript retrieval.

**Trade-offs:** the staged flow is attractive because it controls context cost and allows deeper retrieval only when needed. The downside is added API and UI surface area, more state transitions to test, and a likely need for stable anchors or transcript provenance in ai-memory's storage model. That makes it a promising retrieval-surface enhancement, but not a reason to widen ST-005 before the base hybrid engine exists.

**Recommendation label:** Adapt later

### 4.4 Markdown as source of truth vs SQLite-first

**Current ai-memory position:** ai-memory's architecture assumes structured records in SQLite for semantic memories, episodic memories, recall events, and consolidation logs, with vector search attached to that database-centric model. The current storage decision is explicit: SQLite is the starting database and remains the authoritative core until scale requirements justify a different backend.

**memsearch published-doc evidence:** memsearch's design philosophy is unambiguous that markdown files are the canonical store and Milvus is only a rebuildable acceleration index. The docs frame this as human-readable, git-friendly, portable, and resistant to vendor lock-in.

**memsearch code evidence:** `src/memsearch/watcher.py` watches markdown files directly, `src/memsearch/chunker.py` builds chunk identities from markdown file positions plus content hashes, and `src/memsearch/core.py` appends compaction output back into daily markdown files before re-indexing them. This confirms that the code really treats markdown as authoritative state, not merely as an export format.

**Validation gap:** the local fixture proved that a markdown-shaped corpus could be created for the smoke test, but indexing did not complete, so this repo did not locally validate a full rebuild-from-markdown flow.

**Trade-offs:** markdown-as-source-of-truth is excellent for transparency, manual editing, and git workflows. It is much weaker for ai-memory's planned structured query patterns, atomic updates, recall-event logging, promotion pipelines, and repository-backed abstractions. Adopting it as the primary source of truth would invert too much of the approved design for too little demonstrated gain.

**Recommendation label:** Keep current

---

## 5. Story Impact Decisions

| Story | Recommendation | Board edit required | Edit type | Rationale |
|-------|----------------|---------------------|-----------|-----------|
| ST-004 | Adapt later | no | None | ONNX `bge-m3` is a credible future provider option, but this story produced docs+code evidence only because local validation did not complete. ST-004 should stay OpenAI-first for now and revisit provider broadening in a later approved plan. |
| ST-005 | Adapt later | no | None | memsearch's progressive disclosure pattern is promising, but the strongest evidence is architectural and plugin-level rather than locally validated in this repo. ST-005 should stay focused on base hybrid retrieval mechanics. |

---

## 6. Recommendation

Use memsearch as a reference for future provider flexibility and staged recall UX, not as a replacement architecture.

- Keep SQLite-first storage, FTS5-first text search, and the existing hybrid retrieval direction.
- Keep ST-004 OpenAI-first, but preserve the provider abstraction so ONNX can be evaluated later with a cleaner local benchmark or a dedicated provider-broadening story.
- Keep ST-005 focused on core hybrid retrieval. Revisit progressive disclosure only after the base recall path exists and transcript provenance can be modelled cleanly.
- Treat Markdown-as-source-of-truth and Milvus Lite as informative alternatives, not as stronger defaults for this repo today.

Current ai-memory architectural defaults remain authoritative unless a later approved story changes them.

---

## 7. Evidence Appendix

### 7.1 Upstream revision reviewed

- Upstream commit: `ca94a43ac83db02f171ea366ca99ee888628d590`

### 7.2 Upstream docs reviewed

- `README.md`
- `docs/design-philosophy.md`
- `docs/getting-started.md`
- `docs/architecture.md`
- `evaluation/README.md`

### 7.3 Upstream code files inspected

- `src/memsearch/core.py`
- `src/memsearch/store.py`
- `src/memsearch/cli.py`
- `src/memsearch/embeddings/onnx.py`
- `src/memsearch/chunker.py`
- `src/memsearch/watcher.py`
- `plugins/openclaw/index.ts`

### 7.4 Runtime commands run or skipped

- Ran WSL environment checks for status and Linux `python3` availability.
- Ran the Linux-side editable install for `memsearch[onnx]` inside `.tmp/st-014-memsearch/venv-linux/`.
- Attempted the WSL-side index run against the synthetic fixture and tiny ai-memory sample.
- Skipped the planned `search`, `expand`, and `transcript` output validation commands after indexing did not complete.

### 7.5 Temp logs used for conclusions

- `.tmp/st-014-memsearch/logs/upstream-commit.txt`
- `.tmp/st-014-memsearch/logs/wsl-status.txt`
- `.tmp/st-014-memsearch/logs/wsl-python.txt`
- `.tmp/st-014-memsearch/logs/pip-install-linux-attempt-.txt`
- `.tmp/st-014-memsearch/logs/index-attempt-.txt`
- `.tmp/st-014-memsearch/logs/runtime-failure.txt`
- `.tmp/st-014-memsearch/logs/docs-evidence.txt`
- `.tmp/st-014-memsearch/logs/code-evidence.txt`
- `.tmp/st-014-memsearch/logs/plugin-evidence.txt`
- `.tmp/st-014-memsearch/logs/task-4.2-verification.txt`
- `.tmp/st-014-memsearch/logs/task-4.3-verification.txt`