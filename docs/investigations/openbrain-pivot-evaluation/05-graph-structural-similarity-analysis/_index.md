# §5 Graph/Structural Similarity Analysis

> Part of: [openbrain-pivot-evaluation](../05-graph-structural-similarity-analysis.md.md)

## §5 Graph/Structural Similarity Analysis

Graph/structural similarity search means: querying memories based on structural relationships between concepts, not just text or semantic vectors. Includes entity extraction, relationship mapping, subgraph matching, and multi-hop traversal.

The four aspects evaluated per option:
- **Graph schema**: how entities and relationships are stored
- **Query mechanism**: how structural queries are executed
- **Entity extraction**: how entities and relations are discovered from free text
- **Scalability**: behaviour at 100K+ memories

**Key infrastructure fact confirmed:** Apache AGE is **not available** on Supabase's managed service. The full Supabase extensions list (50+ extensions) does not include AGE. This blocks full graph traversal on Options A (Adopt OB1, Supabase-hosted) without self-hosting.


## Sub-sections

- [Option A — Adopt OB1](01-option-a-adopt-ob1.md)
- [Option B — Fork OB1](02-option-b-fork-ob1.md)
- [Option C — Stay Current (C# + SQLite)](03-option-c-stay-current-c-sqlite.md)
- [Option D — Adopt Approach, Build Fresh](04-option-d-adopt-approach-build-fresh.md)
