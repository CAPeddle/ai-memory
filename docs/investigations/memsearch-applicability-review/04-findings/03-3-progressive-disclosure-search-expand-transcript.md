### 4.3 Progressive disclosure (search → expand → transcript)

**Current ai-memory position:** ai-memory already plans hybrid retrieval in `docs/investigations/memory-architecture-design.md` and ST-005, but the current design stops at ranked result generation plus RRF/MMR re-ranking. There is no approved staged `expand` or transcript-deepening surface yet.

**memsearch published-doc evidence:** `docs/design-philosophy.md` makes progressive disclosure a first-class design choice: cheap chunk snippets first, then full markdown sections, then raw transcript when needed. The plugin docs describe this as a context-control mechanism rather than just a CLI convenience.

**memsearch code evidence:** `src/memsearch/cli.py` exposes `search` and `expand`, and explicitly documents `expand` as L2 in the progressive-disclosure workflow. `plugins/openclaw/index.ts` adds `memory_search`, `memory_get`, and `memory_transcript` surfaces plus cold-start and end-of-turn hooks, which shows that the three-layer pattern mainly lives at the retrieval surface and plugin boundary. Separately, `src/memsearch/store.py` shows that memsearch's search core is already hybrid BM25 + dense + RRF, which means the novel part is the staged drill-down, not the base ranking strategy.

**Validation gap:** because indexing never completed locally, this repo did not produce a successful `search` -> `expand` -> `transcript` run against the synthetic corpus. The value judgment here therefore comes from upstream docs and code, not from verified local transcript retrieval.

**Trade-offs:** the staged flow is attractive because it controls context cost and allows deeper retrieval only when needed. The downside is added API and UI surface area, more state transitions to test, and a likely need for stable anchors or transcript provenance in ai-memory's storage model. That makes it a promising retrieval-surface enhancement, but not a reason to widen ST-005 before the base hybrid engine exists.

**Recommendation label:** Adapt later

