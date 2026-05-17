## §1 Executive Summary

This spike evaluates whether the ai-memory project should pivot its foundational platform from the current C#/.NET 8 + SQLite architecture to Open Brain (OB1) — an open-source TypeScript/Supabase AI memory system. The PO identified two specific capabilities that must be built regardless of platform: per-ingest synthesis (write-time compiled Markdown views) and graph/structural similarity search.

**Recommendation: Stay Current (Option C) — continue building on C#/.NET 8 + SQLite.**

The revised analysis confirms that OB1 still does not provide either target capability out of the box, but it can support a remote per-ingest synthesis workflow through its existing trigger pattern, a queue-processing Edge Function worker, remote compiled-view storage, and a Markdown sync bridge back to a local Obsidian vault. That means the limiting factor is not whether OB1 can perform extraction-time synthesis at all; it is that the workflow stays cloud-shaped and adds more moving parts than the current local-first design. Supabase Free also narrows the hobby-scale cost gap. The earlier $25+/month framing applies to the full stated 100K-memory or always-on baseline, not the hobby-scale entry point. Even with those adjustments, both target capabilities still require substantial custom development, and the decisive factors remain stack fit, direct filesystem access, operational simplicity, and codebase continuity — all of which still favour Option C. The OB1 codebase remains a valuable reference: its entity-extraction schema's trigger pattern, relation sidecars, and schema-based extension model are design inspirations worth borrowing.

**Scores (1–5 scale):**

| Option | Weighted Score | Rank |
|--------|---------------|------|
| A — Adopt OB1 | 2.10 | 4 |
| B — Fork OB1 | 2.55 | 3 |
| C — Stay Current | **4.50** | **1** |
| D — Adopt Approach, Build Fresh | 3.55 | 2 |

---

