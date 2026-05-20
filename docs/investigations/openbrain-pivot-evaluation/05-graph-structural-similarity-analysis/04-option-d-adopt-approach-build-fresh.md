### Option D — Adopt Approach, Build Fresh

**Variant D-C# + Postgres + AGE:** Self-hosted Postgres with AGE installed. C# queries via Npgsql with openCypher executed as raw SQL (`SELECT * FROM cypher(...)`). Full graph traversal. Entity extraction built as a background service (IHostedService in ASP.NET). This is the strongest graph option — AGE provides production-grade graph support.  
**Feasibility: Moderate** — requires building entity extraction service and Npgsql+AGE integration, but openCypher becomes available.

**Variant D-TypeScript + Postgres:** Same as D-C# for graph; TypeScript with pg client + AGE.  
**Feasibility: Moderate** — same capability, different stack.

| Option | Rating | Key capability |
|--------|--------|----------------|
| A | **Significant** | No AGE on Supabase; recursive CTEs only; entity extraction worker missing |
| B | **Moderate** | Self-host unlocks AGE; entity extraction worker still needed |
| C | **Significant** | No AGE on SQLite; structural fingerprints viable; clear Postgres migration path |
| D-C# + AGE | **Moderate** | Best graph option; self-hosted Postgres + AGE + Npgsql; entity extraction from scratch |
| D-TS | **Moderate** | Same as D-C# for graph; different stack |

---

