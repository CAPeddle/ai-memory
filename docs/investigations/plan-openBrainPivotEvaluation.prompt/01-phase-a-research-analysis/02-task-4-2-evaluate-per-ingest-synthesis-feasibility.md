### Task 4.2: Evaluate Per-Ingest Synthesis Feasibility (4 options)

**Objective:** For each platform option, assess how "per-ingest synthesis" (auto-generate compiled Markdown views on write) could be implemented. Rate each: trivial / moderate / significant / impractical.

**Steps:**
1. **OB1 Adopt:** Can Supabase triggers/edge functions call LLMs on insert and write to a views table/file? What pg functions exist already?
2. **OB1 Fork:** Same as adopt but with freedom to modify core. What changes would be needed?
3. **Stay Current (C#/.NET):** Design sketch — repository event → service → LLM call → Markdown file/table. How hard?
4. **Adopt Approach, Build Fresh:** Postgres + pgvector + custom service. What's the delta from current?

**Output:** Per-option feasibility rating (trivial/moderate/significant/impractical) with rationale

**Verification:** Each option addresses: hook mechanism, LLM integration path, output format (Obsidian-compatible MD), incremental update strategy

---

