# Query Packet — QP-014: Investigate memsearch (zilliztech) for architectural learnings

| Field | Value |
|-------|-------|
| Story | ST-014 |
| Created | 2026-05-03 |
| Status | Scoped — ready for ExecPlan authoring |
| Source URL | https://github.com/zilliztech/memsearch |

---

## PO Intent

The PO wants to investigate memsearch (zilliztech/memsearch v0.4.1, MIT, ~1.6k stars) as a reference point for several open design questions in ai-memory. The goal is **not** to adopt or replace anything — it is to compare memsearch's approach against current design decisions and produce documented, decision-quality findings. The output is a new investigation doc.

---

## What memsearch is

memsearch is a cross-platform semantic memory layer for AI coding agents, backed by Python + Milvus. Plugins hook into Claude Code, Codex CLI, OpenClaw, and OpenCode to capture conversation turns, summarise them into Markdown files, and index them into Milvus for hybrid search. It is actively maintained by Zilliz (the company behind Milvus).

**Architecture summary:**
- Source of truth: Markdown `.md` files (one per day, human-editable, git-friendly)
- Shadow index: Milvus (local = Milvus Lite single file; cloud = Zilliz Cloud)
- Embeddings: ONNX `bge-m3` by default (local CPU, ~558 MB, no API key); OpenAI and Ollama supported
- Hybrid search: BM25 sparse + dense vector + RRF reranking
- Content dedup: SHA-256 per chunk, skip unchanged content on re-index
- 3-layer recall: L1 `search` (ranked chunks) → L2 `expand` (full .md section) → L3 raw transcript (session `.jsonl`)
- Plugin capture: stop hooks fire after each turn, LLM summarises and appends to daily `.md`, then re-indexes

---

## Confirmed PO-Scoped Focus Areas

The PO confirmed all four investigation angles:

1. **ONNX bge-m3 local embeddings** — is this a viable alternative to OpenAI (`text-embedding-3-small`) for ST-004? What are the trade-offs (model size, CPU perf, quality, offline capability)?
2. **Milvus Lite as vector store** — how does it compare to ai-memory's current SQLite + pgvector plan? Is it worth adopting as the primary vector backend, or only as a future option?
3. **3-layer progressive recall** — is the search → expand → transcript pattern worth adopting or adapting for ai-memory's retrieval design (currently flat)?
4. **Markdown-as-source-of-truth** — does memsearch's approach of treating `.md` files as the authoritative record and the vector index as a rebuildable shadow challenge ai-memory's SQLite-first model? What are the implications for backup, human editing, and durability guarantees?

---

## Research Findings (gathered during intake)

### memsearch repo facts
- Python 62.7%, Shell 25%, TypeScript 12.3%
- 13 contributors, 147 forks, v0.4.1 released 4 days ago (2026-04-29)
- Inspired by OpenClaw (which ai-memory has already analysed — see `docs/investigations/openclaw-memory-architecture-analysis.md`)
- Full docs at https://zilliztech.github.io/memsearch/

### Relevant ai-memory investigation docs
- `docs/investigations/memory-architecture-design.md` — current retrieval design (FTS5 + vector + RRF + MMR)
- `docs/investigations/sqlite-vs-postgresql.md` — current storage decision (SQLite → pgvector path)
- `docs/investigations/openclaw-memory-architecture-analysis.md` — prior analysis of the upstream project memsearch was inspired by
- `docs/investigations/language-stack-recommendation.md` — C# decision; Python stack differences are noted

### Design tension points to explore
| memsearch approach | ai-memory current approach | Open question |
|---|---|---|
| ONNX bge-m3, no API key | OpenAI text-embedding-3-small (ST-004) | Is local embedding quality good enough? What is the cold-start cost? |
| Milvus Lite (single file) | SQLite FTS5 + future pgvector | Does Milvus Lite offer meaningfully better vector search for the complexity cost? |
| 3-layer progressive recall | Single-pass hybrid search (planned) | Would L2 expand + L3 transcript improve recall quality for real workloads? |
| Markdown source of truth | SQLite as source of truth | Trade-offs: human editability, git history, durability, query flexibility |

---

## Story Metadata (PO-confirmed)

| Field | Value |
|-------|-------|
| Type | spike |
| Placement | Refined |
| Value | 4 |
| Blocked by | none |

---

## Known Dependencies and Blockers

- No blockers. Can be planned and executed independently.
- ST-004 (embedding service) is not yet started; findings from this spike should inform its design before it is executed.
- ST-005 (hybrid search) is not yet started; 3-layer recall findings may influence its acceptance criteria.
- ST-002 and ST-003 (schema + repository) are not yet started; markdown-vs-SQLite findings are unlikely to reverse those decisions but should be documented.

---

## Open Questions for `/plan` Session

Resolved during `/plan` scoping:

1. **Evidence level**: include **lightweight local validation**, not document-only analysis and not a benchmark-heavy experiment.
2. **Research depth**: include **code-level inspection** of selected upstream implementation files in addition to the published docs.
3. **Output integration**: findings may **directly propose story-scope mutations** where the evidence supports them.
4. **Smoke-test corpus**: use **both** a small synthetic markdown fixture created for ST-014 and a tiny sample from ai-memory docs.
5. **Artifact update scope**: only **ST-004** and **ST-005** story metadata may be updated by the investigation if justified; storage stories stay advisory-only.
6. **Cross-link policy**: the new investigation doc remains **standalone**, but the work may make **targeted updates to cited investigation docs** where that improves traceability.

Remaining planning note:

- The ExecPlan should make the local validation repeatable and low-risk, with explicit cleanup guidance and no broad repo-side implementation work beyond documentation and approved story metadata updates.

---

## Scoped Decisions From `/plan`

| Decision | PO direction |
|---|---|
| Planning target | ST-014 |
| Planning outcome | Full Ready ExecPlan |
| Evidence level | Lightweight local validation |
| Research depth | Published docs + code-level inspection |
| Smoke-test corpus | Synthetic fixture + tiny ai-memory doc sample |
| Direct downstream edits allowed | Yes, but only to ST-004 and ST-005 story metadata |
| Investigation doc linkage | Standalone doc + targeted updates to cited investigation docs |

---

## Plan-Review Addendum (2026-05-04)

The first `/continue` attempt exposed a platform gap in the original local-validation design: upstream memsearch rejects Milvus Lite local-file mode on native Windows because `milvus-lite` has no Windows wheels on PyPI.

The PO locked the following plan-review decisions to revise the ExecPlan:

1. **Validation path:** use **existing WSL2** for the runtime smoke test instead of native Windows-local Milvus Lite execution.
2. **Fallback rule:** if WSL2 is unavailable or the Linux-side runtime still fails, continue the story in **docs-and-code-only mode** with the runtime gap documented explicitly in the investigation doc.
3. **WSL setup scope:** the revised plan may **detect and use** an existing WSL2 environment, but it must **not** include OS-level WSL installation/bootstrap steps.
4. **Workspace reuse:** the revised plan should **reuse** the existing `.tmp/st-014-memsearch` workspace through `/mnt/c/...` paths rather than creating a second Linux-local clone.

These decisions resolve the `blocked_by: plan-review` issue for ExecPlan authoring; the board should only be unblocked after the revised ExecPlan is reviewed and approved.

---

## Implications For ExecPlan Authoring

- The plan must include explicit steps to install or run memsearch in an isolated way for a smoke test.
- The plan must define exactly which upstream docs and code files are inspected.
- The plan must produce a new investigation doc at `docs/investigations/memsearch-applicability-review.md`.
- The plan may update `docs/investigations/memory-architecture-design.md` and/or `docs/investigations/sqlite-vs-postgresql.md`, but only in targeted, traceability-oriented ways.
- The plan may update story metadata for ST-004 and ST-005 if the evidence supports it; it must not mutate storage-story scope without escalation.
- The plan must preserve the current architectural defaults unless the investigation evidence only justifies documenting alternatives or future options.

---

## Recommended Next Step

Produce a fully Ready ExecPlan at `.github/planning/execplans/exec-plan-ST-014.md` using this query packet as the sole planning input.
