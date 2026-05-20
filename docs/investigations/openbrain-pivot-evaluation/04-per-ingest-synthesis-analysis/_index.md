# §4 Per-Ingest Synthesis Analysis

> Part of: [openbrain-pivot-evaluation](../04-per-ingest-synthesis-analysis.md.md)

## §4 Per-Ingest Synthesis Analysis

Per-ingest synthesis means: when a new thought/memory is stored, the system automatically generates or updates one or more compiled Markdown files representing synthesised views. The synthesis requires calling an LLM with the new content in context of existing related memories, then writing Obsidian-compatible Markdown to a configurable output. For cloud-hosted options, that output can be represented remotely first (database table or object storage) and then synchronised into a local Obsidian vault; direct local file writes are not mandatory at synthesis time.

The four aspects evaluated per option:
- **Hook mechanism**: how the ingest event triggers synthesis
- **LLM integration path**: how the synthesis service calls an LLM
- **Output format**: how Obsidian-compatible Markdown is produced
- **Incremental update**: how views are updated without full regeneration


## Sub-sections

- [Option A — Adopt OB1](01-option-a-adopt-ob1.md)
- [Option B — Fork OB1](02-option-b-fork-ob1.md)
- [Option C — Stay Current (C# + SQLite)](03-option-c-stay-current-c-sqlite.md)
- [Option D — Adopt Approach, Build Fresh](04-option-d-adopt-approach-build-fresh.md)
