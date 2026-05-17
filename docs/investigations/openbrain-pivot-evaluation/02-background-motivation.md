## §2 Background & Motivation

The PO is planning two capabilities beyond core memory retrieval:

1. **Per-ingest synthesis** — When a thought or episode is stored, an automated process generates or updates compiled Markdown views (Obsidian-compatible) representing synthesised perspectives. Example: a Kanban-style personal storyboard that auto-updates when a relevant thought is captured. This mirrors the "write-time wiki" pattern described in `docs/investigations/Youtube/Nate B Jones on Open Brain vs LLM Wiki.md`.

2. **Graph/structural similarity search** — Query memories not just by keyword or semantic embedding, but by structural relationships between concepts (entity–relationship graph, multi-hop traversal, subgraph matching).

The trigger for this spike was the PO learning about OB1 and considering whether it could serve as a better foundation than the current scaffold. The current ai-memory repo is in scaffold phase: `IMemoryService` interface defined, governance tooling complete, 9 investigation documents written, no production implementation yet. This is the lowest-cost moment to evaluate a platform switch.

The investigation is organised around the question: **which base platform makes building both extensions easier and cheaper to maintain?**

---

