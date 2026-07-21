# TurboPuffer vs. Hand-Crafted Storage — Build-vs-Buy Evaluation

**Type:** Investigation / applicability review (Tier 2 reference)
**Date:** 2026-07-21
**Question posed:** Would adopting [TurboPuffer](https://turbopuffer.com/docs) instead of our own Postgres-based storage system solve a real problem — and if so, *which requirement* does it address?
**Verdict:** **No, not at the current design point.** TurboPuffer is a well-built product solving a problem we do not have, while leaving untouched the one thing that actually makes our storage "hand-crafted." Recommend **do not adopt now**; revisit only if two specific, currently-absent conditions become true (see §7).

---

## TL;DR

- TurboPuffer's entire value proposition is **object-storage economics for very large, multi-tenant vector corpora** (100M–billions of vectors, many namespaces, elastic cost). Our system is explicitly designed for **single-user, ~100K memories, ~350 MB total, 1–5 concurrent sessions, sub-100 ms p95** (`SRS.md` NFR-P1/D2, `ADR-011`). These are opposite ends of the design space.
- It would replace **only the vector + lexical search lanes** — roughly **~530 LOC** of small, clean, well-isolated code. It does **not** replace the Apache AGE graph, the relational `thoughts` store, or the queue/trigger/consolidation machinery — which is the **larger** hand-maintained surface and **the actual reason we self-host Postgres** (`ADR-011:27,124,133`).
- It is **SaaS-only** (BYOC/single-tenancy are Enterprise-tier). That directly conflicts with the self-hosted deployment model in ADR-009/011 and adds a hard external dependency plus a **dual-write consistency problem** to a system that is currently a single, transactional store.
- Its **hybrid search is client-side RRF** — the same pattern we already implement. So the "clever" part of our search (RRF + MMR + in-project boost + quality bands) **stays in our app code regardless**. We would not delete our fusion logic; we would just move where the two lanes execute.
- For our traffic profile, its object-storage-first design is a **latency regression, not an improvement**: cold namespaces cost **~444 ms p90** (1M vectors); a resident pgvector HNSW index in the Postgres we already run answers in **single-digit to ~18 ms** at our scale and never goes cold.

---

## 1. What TurboPuffer actually is (established facts)

Sourced from turbopuffer.com/docs, its engineering blog, and third-party analysis (see Sources).

- **Object-storage-first search engine.** Data lives durably in S3/GCS/Azure Blob and is pulled into NVMe SSD / RAM cache only when queried — the "pufferfish effect." Cost of storage is ~$0.02/GB vs. ~$0.60/GB for redundant SSD.
- **Capabilities:** approximate vector search, **native BM25** full-text search, rich filtering (equality, comparison, nested AND/OR, glob, regex), and namespaces for multi-tenancy. **No graph traversal / no openCypher / no relationship queries.**
- **Hybrid search is *not* fused server-side.** You issue separate vector and BM25 queries (batchable in one multi-query call) and **combine client-side with reciprocal-rank fusion** — the same approach we already use.
- **Latency:** warm ~10 ms p90 (vector) / ~18 ms p90 (BM25); **cold ~444 ms p90** for 1M 768-dim vectors, ~285 ms for 1M-doc BM25. Cold hits occur whenever a namespace hasn't been queried recently. Cache-warming hints exist but must be driven by the client.
- **Consistency:** strong by default — a write is visible to the next query (unindexed data is searched exhaustively until indexed).
- **Deployment:** **SaaS-only.** No open-source / self-hostable build. BYOC (into your own K8s on AWS/GCP/Azure) and single-tenant dedicated clusters are **Enterprise-tier** only.
- **Pricing (post-Feb 2026):** ~$0.02/GB storage; queries ~$1/PB scanned but with a **1.28 GB minimum billable per query**; writes billed per GB. Cheap at scale; the per-query floor means tiny corpora don't get proportionally cheaper.

**Who it's for:** teams with large or fast-growing vector corpora and many tenants, where keeping everything hot in RAM is the dominant cost (Atlassian, Cursor-class workloads). Its cost curve only bends in your favour once you have far more data than fits economically in memory.

---

## 2. What our storage system actually is (established facts)

The cloud MCP server (`server/`, Deno/TS) uses **one PostgreSQL 15 instance** doing four jobs: relational rows, vector search (pgvector HNSW), lexical search (tsvector/tsquery), and graph traversal (Apache AGE, compiled from source).

| Sub-system | Where | Size | Would TurboPuffer replace it? |
|---|---|---|---|
| Vector lane | `schema.sql:63` HNSW `vector(512)` cosine; `embeddings.ts` (63 LOC) | small | **Yes** (this is its core) |
| Lexical lane | `schema.sql:43` generated `tsvector` + GIN; `ts_rank_cd` | small | **Yes** (native BM25 — actually an *upgrade*, see §5) |
| Fusion / re-rank | `searchQuality.ts` (150 LOC): RRF k=60, MMR λ=0.7, quality bands, recall logging | ~150 LOC | **No** — stays client-side either way |
| `search_thoughts` handler | `index.ts:236-413` | ~177 LOC | Partially — lanes move out, orchestration stays |
| Graph subsystem | `graph.sql` (145) + `entityWorker.ts` (336) + Cypher guard `index.ts:738-880` (~142) + graph tools (~130) | **~750 LOC** | **No — no equivalent exists** |
| Capture / dedup | `index.ts:415-515` fingerprint upsert, fire-and-forget embed | ~100 LOC | **No** — stays in Postgres |
| Queues / triggers / consolidation | `schema.sql` triggers, `pg_notify` LISTEN/NOTIFY, `FOR UPDATE SKIP LOCKED` | ~part of ~560 LOC DDL | **No** — Postgres-native |

**The search/ranking logic you'd actually retire is small and clean — ~530 LOC, of which RRF+MMR is ~50.** The larger hand-maintained surface (the AGE graph + the queue/trigger/consolidation machinery) does not move.

**Critically:** ADR-011 names "graph traversal requirement" as one of the four triggers that forced Postgres over SQLite, and the explicit reason managed Postgres (Supabase) was rejected — Apache AGE is **why the custom Docker image exists and why we self-host at all** (`ADR-011:27,124,133`). TurboPuffer does nothing for this.

---

## 3. The core mismatch — it solves a problem we don't have

TurboPuffer optimises three things: **storage cost at scale**, **elastic multi-tenancy**, and **not paying to keep cold data in RAM**. Map each against our actual requirements:

| TurboPuffer optimises… | Our requirement (source) | Relevant? |
|---|---|---|
| $/GB at 100M–billions of vectors | ~100K memories, ~350 MB total, fits a **$6/mo VPS** (`ADR-011:91-95`) | **No** — our whole corpus is ~200 MB of vectors |
| Many namespaces / multi-tenant elasticity | **Single-user**; 1–5 concurrent sessions (`SRS.md` NFR-D2) | **No** — one tenant |
| Avoid RAM cost for cold data | Index is ~200 MB and permanently resident; **sub-10 ms** vector search stated (`ADR-011:112`) | **No** — it's already always warm and free |
| Cold-start acceptable (~444 ms p90) for rarely-touched data | **< 100 ms p95** hard target (`SRS.md` NFR-P1) | **Backwards** — low traffic ⇒ frequently cold ⇒ *fails the SLO* |

The object-storage-first design is genuinely brilliant **for its target workload** and actively counterproductive for ours. A low-traffic personal memory service is the pathological case for cold-cache latency: with sporadic queries, the namespace is *often* cold, so the ~444 ms p90 cold path becomes the common path rather than the exception — worse than a resident local index that never evicts.

---

## 4. Challenging questions — what requirement would this actually address?

The user asked to establish *which requirement, if any,* TurboPuffer addresses. Put bluntly, before anyone adopts this they must answer:

1. **What is failing today?** Is there a *measured* latency, cost, or scale problem with the current pgvector setup — or is this "hosted service looks tidier than DDL I maintain"? There is **no evidence** in `SRS.md`, ADRs, or investigations of a real latency/cost/scale pain point. All budget numbers are comfortably met on paper. **If nothing is failing, this is a solution in search of a problem.**

2. **What happens to the graph?** TurboPuffer has no graph. Adopting it means either (a) keeping Postgres+AGE anyway — so you now run **two** stores and have *added* complexity, or (b) deleting graph mode entirely. Which is it, and who signed off on losing Mode-2 retrieval?

3. **How do you keep two stores consistent?** Today a `capture_thought` is one transactional upsert (fingerprint dedup, tags merge, trigger enqueue). Split into Postgres-row + TurboPuffer-vector and you own a **dual-write problem**: partial failures, reconciliation, backfill, orphan detection. What's the consistency budget, and is that *less* code than the ~530 LOC it replaces?

4. **Does it actually delete our search cleverness?** No. RRF, MMR (λ=0.7), in-project boost, and quality bands are app-side and portable — TurboPuffer's hybrid is *also* client-side RRF. So the "hand-crafted" part we're supposedly buying our way out of **stays hand-crafted**. What exactly are we deleting beyond an HNSW index declaration and a tsvector column?

5. **Is a SaaS dependency acceptable for this product?** ADR-009/011 chose self-hosted specifically. TurboPuffer is SaaS-only below Enterprise. For a **personal memory service holding a user's private thoughts**, does routing all memory content and queries through a third-party control plane meet the privacy posture? (BYOC exists but is Enterprise-tier — wrong cost bracket for a $6/mo-VPS product.)

6. **Where does embedding generation live?** We already call OpenRouter for embeddings and pass vectors in. TurboPuffer doesn't remove that; it just receives the vectors. No saving there.

7. **What's the exit cost?** Postgres+pgvector is portable and open. Once dedup, recall logging, consolidation triggers, and graph all assume a split store, unwinding a SaaS dependency later is a migration, not a config change.

If the honest answers are "nothing is failing," "we'd keep Postgres for the graph anyway," and "we'd still write the fusion ourselves," then TurboPuffer addresses **no current requirement**.

---

## 5. Steelman — where it *would* genuinely help

To be fair, not everything is negative:

- **Native BM25 > our `ts_rank_cd`.** `ts_rank_cd` is a BM25 *approximation* with no real IDF term (ADR-003 acknowledges this: "acceptable at personal scale"). TurboPuffer's from-scratch BM25 is a genuine relevance upgrade for the lexical lane. But this is an argument for *better BM25*, achievable other ways (e.g. `pg_search`/ParadeDB, or a BM25 extension) without leaving Postgres.
- **Ops relief on the vector lane.** It removes HNSW index tuning (`m`, `ef_construction`, `ef_search`) and the resident-memory concern. Real, but small — our index is 200 MB and static.
- **The Contact Memory track is the better fit.** That track has **already dropped AGE** and targets plain Postgres+pgvector+tsvector on Supabase (`CLAUDE.md:32`). Its retrieval is exactly vector+lexical-no-graph — the shape TurboPuffer replaces cleanly, with no graph to strand. **If** Contact Memory grows to many contacts × many users (true multi-tenancy) and hits Supabase pgvector cost/scale limits, TurboPuffer becomes a *legitimate* candidate *there* — not on the platform MCP.

The steelman still doesn't clear the bar today: better BM25 and marginal ops relief don't justify a SaaS dependency, a dual-write, and (for the platform track) still keeping Postgres for the graph.

---

## 6. Cost sanity check

- **Current:** ~350 MB on a ~$6/mo VPS you already run; vector search effectively free (resident index, no per-query charge).
- **TurboPuffer:** storage for ~200 MB of vectors is trivially cheap (~$0.004/mo), but the **1.28 GB per-query minimum billable** means a tiny corpus never gets proportionally cheaper, and you're now paying (in dollars *and* a network hop *and* cold latency) for something Postgres does for free in-process. Plus you **still pay for the VPS** to run Postgres for the graph + relational data.

There is no cost win. At our size the current approach is at or near the cost floor already.

---

## 7. Recommendation

**Do not adopt TurboPuffer for the platform MCP now.** It does not address a demonstrated requirement, does not remove the load-bearing hand-crafted subsystem (AGE graph), introduces a SaaS dependency that conflicts with ADR-009/011, and would be a latency regression for our low-traffic profile.

**Concrete next actions instead:**
1. If lexical relevance is the real itch, scope a *smaller* change: evaluate a true-BM25 Postgres extension (ParadeDB `pg_search`) — stays in one store, no dual-write, no SaaS.
2. Fix the doc/impl drift surfaced during this review: Dockerfile ships **AGE v1.6.0-rc0**; ADR-011 text says **v1.7.0**. Reconcile.

**Revisit TurboPuffer only if BOTH become true:**
- (a) A track needs vector+lexical search with **no graph dependency** — i.e., **Contact Memory**, not the platform MCP; **and**
- (b) It reaches genuine **multi-tenant scale** (many users × many contacts) where Supabase pgvector demonstrably strains on cost or latency — a condition that does not exist today and isn't on the near roadmap.

Until (a) and (b) hold, this is buying a jet engine for a bicycle.

---

## Sources

- [TurboPuffer docs](https://turbopuffer.com/docs) · [Architecture blog](https://turbopuffer.com/blog/turbopuffer) · [BYOC](https://turbopuffer.com/docs/byoc) · [Hybrid search](https://turbopuffer.com/docs/hybrid) · [Pricing changelog](https://turbopuffer.com/docs/pricing-log)
- [Modern DataTools — TurboPuffer Review 2026](https://www.modern-datatools.com/tools/turbopuffer)
- [Jason Liu / 567-labs — Object-Storage-First Architecture](https://567-labs.github.io/systematically-improving-rag/talks/turbopuffer-engine/)
- [Sacra — TurboPuffer company profile](https://sacra.com/c/turbopuffer/)
- [Instaclustr — pgvector performance benchmarks](https://www.instaclustr.com/education/vector-database/pgvector-performance-benchmark-results-and-5-ways-to-boost-performance/)
- Internal: `docs/requirements/SRS.md` (NFR-P1/P2/P5, D2), `docs/design/adr/ADR-003`, `ADR-009`, `ADR-011-storage-strategy.md`, `CLAUDE.md`, `server/db/schema.sql`, `server/src/searchQuality.ts`, `server/src/entityWorker.ts`
