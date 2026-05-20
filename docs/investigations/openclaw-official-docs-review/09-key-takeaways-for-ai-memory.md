## 9. Key Takeaways for ai-memory

### Validate Our Existing Decisions

| Our Decision | OpenClaw Confirms |
|--------------|-------------------|
| SQLite + FTS5 for primary storage | Their default backend; works at 3K+ facts scale |
| Hybrid search (keyword + vector) | 100% recall with hybrid vs 46.7% BM25-only |
| MMR diversity in results | They use it for redundancy reduction |
| Consolidation pipeline | Their "dreaming" validates the bio-inspired approach |
| No decay/forgetting (initially) | They have decay but the ranking integration is still a stub |
| MCP tools as interface | Aligns with their plugin tool model |

### New Patterns to Consider

| Pattern | Description | Priority for ai-memory |
|---------|-------------|------------------------|
| **Active Memory (proactive recall)** | Pre-reply context injection without explicit search | Medium — future enhancement |
| **Memory Flush before compaction** | Save context before it's lost to summarization | Low — we don't manage compaction |
| **Importance tagging** (`i=0.9`) | Explicit importance scores on observations | High — map to our `confidence` field |
| **Eagerness profiles** | Per-agent recall aggressiveness tuning | Low — future sophistication |
| **File-as-truth Layer 0** | Keep curated Markdown alongside DB knowledge | Medium — aligns with Resource design |
| **Debounced reindex** (1.5s) | Don't re-index on every write | High — practical performance pattern |
| **Chunking strategy** (400 tok / 80 overlap) | Proven chunking parameters | Medium — reference for our embedding design |

### Warnings from Their Experience

1. **Decay is hard** — They have the schema but ranking integration is still incomplete after months
2. **Fact quality is the bottleneck** — LLM extraction produces noise; 13+ guardrails needed
3. **Single DB vs Multiple** — They tried consolidation, backed away. Design for later separation
4. **220-char limit on Active Memory** — Even proactive recall must be brutally concise
5. **Temporal decay half-life** — 30 days default; `MEMORY.md` must be exempt from decay
