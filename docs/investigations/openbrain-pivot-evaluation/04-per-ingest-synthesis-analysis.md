# §4 Per-Ingest Synthesis Analysis

This section is split into focused sub-fragments.

See the [section index](./04-per-ingest-synthesis-analysis/_index.md) for navigation.

## §4 Per-Ingest Synthesis Analysis

Per-ingest synthesis means: when a new thought/memory is stored, the system automatically generates or updates one or more compiled Markdown files representing synthesised views. The synthesis requires calling an LLM with the new content in context of existing related memories, then writing Obsidian-compatible Markdown to a configurable output. For cloud-hosted options, that output can be represented remotely first (database table or object storage) and then synchronised into a local Obsidian vault; direct local file writes are not mandatory at synthesis time.

The four aspects evaluated per option:
