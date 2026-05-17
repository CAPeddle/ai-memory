## §7 Hosting Cost Comparison

Workload baseline: ≤100K memories, ~50 queries/day, ~10 ingests/day, personal-use.

### Storage sizing

100K thoughts at ~10KB each (content + 1536-float32 embedding + metadata) ≈ 1 GB total. That exceeds the Supabase Free tier's 500 MB database limit, but remains well within the Pro tier's 8 GB allowance. Smaller hobby-scale deployments can still fit on Free. SQLite file size would be approximately 1 GB on disk.

### Monthly cost estimates (as of May 2026)

| Configuration | Option | Monthly Cost | Notes |
|---------------|--------|-------------|-------|
| Supabase Free + OpenRouter | A, B (Supabase) | ~$2–5 | Viable for hobby-scale usage: 500 MB database, 1 GB file storage, and 500,000 Edge Function invocations are included. Free projects pause after 1 week of inactivity, so this is low-cost but not always-on. |
| Supabase Pro + OpenRouter | A, B (Supabase) | ~$27–30 | $25 plan + $2–5 OpenRouter. Avoids pause; 8 GB DB limit; sufficient for full workload. |
| Self-hosted Postgres VPS + OpenRouter | B (self-host), D | ~$8–11 | $6/month Hetzner CX11 or similar for Postgres + $2–5 OpenRouter. Unlocks AGE. Adds operational overhead. |
| SQLite local + Ollama | C, D-C# (local) | **$0** | SQLite file on local machine; Ollama runs LLMs locally on existing hardware. Battery + electricity negligible. Zero cloud dependency. |
| SQLite local + OpenRouter | C, D-C# (hybrid) | ~$1–3 | Small OpenRouter cost for quality synthesis; no hosting cost. |

### Key insight

The earlier $25+/month figure should be read as the Pro-tier or full-baseline case, not as the minimum viable entry point. Options A and B have a real hobby-scale floor of roughly $2–5/month because Supabase Free includes enough database, storage, and Edge Function capacity for a small active knowledge base plus a synthesis worker. The tradeoff is reliability and headroom: the Free tier pauses after 1 week of inactivity and cannot hold the full 100K-memory upper-bound workload. Options C and D-C# with SQLite still have the strongest cost profile at the full stated baseline because they can operate at $0/month with Ollama, or $1–3/month with OpenRouter, with no pause behavior and no cloud dependency. This section isolates direct infrastructure + token spend; OpenRouter's strategic upside from routing, fallback, and model switching is evaluated in §6 rather than treated as cost savings.

---

