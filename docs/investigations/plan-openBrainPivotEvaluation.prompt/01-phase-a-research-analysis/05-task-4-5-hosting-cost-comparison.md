### Task 4.5: Hosting Cost Comparison

**Objective:** Compare hosting costs for a personal-use memory service across options at ≤100K memories, ~50 queries/day scale.

**Dimensions:**
- Supabase free tier (limits: rows, bandwidth, storage, edge function invocations)
- Supabase Pro tier (first paid tier for growth)
- OpenRouter API costs (for LLM calls in OB1 ecosystem)
- Self-hosted PostgreSQL + local LLM (Ollama) costs (hardware only)
- Current architecture: SQLite local-first (zero ongoing cost)
- Hybrid: self-hosted Postgres + cloud LLM API

**Output:** Cost table with monthly estimates for personal-use scale

**Verification:** Each option has a monthly cost estimate (or "zero" / "hardware-only" where applicable)

---

