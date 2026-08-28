# Feature Research

**Domain:** Default-deny, policy-scope-based retrieval isolation for a single-user, two-domain (personal / corporate) memory store
**Researched:** 2026-08-28
**Confidence:** MEDIUM (cross-verified web patterns for the general architecture; HIGH for claims grounded directly in this repo's own code — `server/src/parseContext.ts`, `server/src/searchQuality.ts`, `shared/tagGrammar.ts`, `server/tests/provider-egress.test.ts`)

## Feature Landscape

This is not a user-facing feature domain in the usual sense — it's an internal security/governance capability. "Table stakes" here means *the minimum a system with this scope claim must do to honestly call itself isolated*, drawn from how RAG-with-permissions systems, Postgres row-level security (RLS), and ABAC literature converge on the same shape: filter at the query layer, deny on missing/ambiguous attributes, never widen on inheritance, and prove it with negative tests. Source pattern: [Postgres RLS multi-tenant default-deny](https://dev.to/software_mvp-factory/postgresql-row-level-security-for-multi-tenant-saas-1lgp) — `USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` returns NULL (→ false) when the session variable is unset, so an un-scoped query matches zero rows rather than all rows; [Supabase RAG-with-permissions](https://supabase.com/docs/guides/ai/rag-with-permissions) applies the same predicate to pgvector similarity queries directly, not as a post-filter; [OWASP RAG Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html) generalizes this to "deny-by-default retrieval filters... unless a document is explicitly labeled and authorized, access is denied by default," and explicitly states chunks must inherit — never loosen — their parent's restriction; ABAC literature converges on the same rule for missing attributes: ["default to fail closed if [attributes/tags] are missing"](https://arxiv.org/pdf/2505.01873).

### Table Stakes (Users Expect These)

For this milestone, "users" is really "the isolation claim itself" — ADR-016's own acceptance gate treats missing enforcement as a co-tenancy blocker, so these are non-negotiable for the milestone to be honestly closeable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Closed-vocabulary `policy_scope` field on observations/sources, distinct from `tags` | Free-form descriptive `tags` (ADR-012, `shared/tagGrammar.ts`) are multi-valued, open-namespace, capped at 16 — designed for description, not for a binary security decision. A security boundary needs a small closed enum a query planner can index and a validator can exhaustively check | MEDIUM | Schema addition + a `validatePolicyScope()` sibling to `validateTag()`. The hard part isn't the enum, it's deciding what existing rows (captured before this field existed) get on migration — see Anti-Features and Dependency Notes below |
| Default-deny filter applied **at the query layer**, not as a post-fetch filter | Every source examined (RLS, Supabase RAG, OWASP) converges on filtering inside the SQL/vector query itself. Post-filtering after retrieval means the ranking, MMR diversity computation, and result-count logic have already been computed against rows the caller was never entitled to see — the leak surface is bigger than the visible response, and RRF/MMR positions shift when denied rows are dropped, so filter-after silently corrupts the fusion math too | MEDIUM | Must land inside `server/db/search.sql`'s lanes (BM25 + vector) and inside `searchQuality.ts`'s candidate assembly *before* `rrfFuse`/`mmrRerank` run, not after. Those two functions are pure and score whatever candidate list they're handed — they have no scope awareness today and shouldn't gain any; the caller must hand them an already-filtered list |
| Enforcement across *every* retrieval and egress path uniformly | An isolation claim covering `search_thoughts` but not `list_thoughts`, `graph_traverse`, or exports isn't an isolation claim — it's a false sense of one. PROJECT.md names exactly this risk: lexical search, vector search, graph traversal, context assembly, exports | HIGH | Six known call sites today: `search`/`fetch`, `search_thoughts`, `list_thoughts`, `graph_traverse`, `graph_search`, plus whatever "context assembly" and "exports" resolve to (not yet code-mapped in this research pass — flag as a roadmap gap, see Gaps) |
| Fail-closed on missing scope **on the request** | Per PROJECT.md's own constraint: "missing scope must never silently broaden access." An MCP call with no `policy` key in its context string must not become "search everything, unscoped" | LOW–MEDIUM | `parseContext.ts` already has this shape solved once for `scope.tags` (parsed but currently unconsumed) — the new field is a straightforward sibling addition to `VALID_KEYS`/`ContextScope`, but the *policy decision* of what "no scope requested" resolves to (same-domain-only? nothing at all?) is a design question this research surfaces, not answers — see Dependency Notes |
| Fail-closed on missing/ambiguous scope **on content** | The harder of the two "missing scope" cases, and the one every source is emphatic about: an unscoped or ambiguously-scoped row must never act as a joker that satisfies every scoped query. It must be excluded from *every* domain-filtered read until explicitly classified | MEDIUM | This is where "write-side capture-time scoping deferred to ST-101" collides with this milestone's read-side default-deny: rows captured before the field exists, or captured without an explicit scope, need a defined fate (excluded-by-default is the only answer consistent with default-deny; the alternative — an "unscoped bucket visible to both domains" — is a scope decision for the PO, not an engineering default) |
| Provider-egress gating keyed by content policy scope, not just a global on/off switch | PROJECT.md: "Default-deny semantics for retrieval **and** model-provider routing." The existing `provider-egress.test.ts` proves a coarse `MODEL_PROVIDER_ENABLED=false` kill switch works, but that's process-wide, not scope-aware — it can't answer "should *this* corporately-scoped thought be sent to the external embedding provider under *this* routing policy" | MEDIUM–HIGH | Multiple call sites carry content to a provider today: `embeddings.ts` (`getEmbedding`), the entity-extraction worker, and the consolidation worker. Each is a separate interception point; the existing test's pattern (env-var gate + a sentinel HTTP server that counts hits) is the right verification shape to reuse, extended to assert *which* scope of content reached vs. didn't reach the sentinel |
| Scope propagation into the graph (Apache AGE) | Filtering `search_thoughts` and `list_thoughts` covers the relational tables, but `graph_traverse`/`graph_search` read a separately-populated graph (`memory_graph`) built by the background entity worker. A relational-only fix leaves an unfiltered side door | HIGH | Requires the entity worker to either tag graph nodes/edges with policy scope at write time, or `graph_traverse`/`graph_search` to join back to `thoughts.policy_scope` per matched node before returning results — either way this is a second, independent enforcement mechanism, not a reuse of the relational filter |
| Negative isolation test suite across every egress path | Every source on this topic treats testing as part of the feature, not an afterthought: "testing broken access control means proving each identity can perform only the allowed action... in the allowed tenant," reinforced by the canary-token pattern (plant content in one scope, assert it never surfaces from a query scoped to the other) | MEDIUM | Breadth-driven effort: the assertion pattern per path is simple (assert absence), but there are ≥5 independent paths to cover (lexical, vector, graph traversal, context assembly, exports) and each needs its own seeded fixture data in both scopes plus a real negative assertion, not just an absence-of-error check |

### Differentiators (Competitive Advantage)

Not "compete for users" differentiators — these are places where the single-user, two-domain constraint (vs. general multi-tenant SaaS) is a genuine simplification opportunity, and where doing the boring thing thoroughly is itself the differentiator.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Two-value closed enum instead of a general policy engine | Every general ABAC/OPA/Cedar-style solution exists to handle N tenants × M resource types × K roles. This system has exactly one person and (for now) two domains. A `policy_scope: 'personal' \| 'corporate'` column with a `WHERE` predicate delivers the same default-deny guarantee as a full policy engine at a fraction of the surface area and audit burden | LOW | Directly matches the discount-effort instinct already in this repo's own decisions (ADR-012 rejected a binary field for *descriptive* tags — but that's a different axis; a security boundary and a description taxonomy don't have to use the same data model, and conflating them is exactly the anti-feature below) |
| Uniform enforcement parity across all egress paths, verified in one pass | Most real-world RAG permission failures come from securing the "main" search endpoint and forgetting graph traversal, exports, or an admin/debug tool ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html) calls this out directly — "most RAG implementations do not enforce access control at the retrieval layer" at all, let alone consistently). Building and testing all paths together, in one milestone, is unusual rigor for a project this size and is exactly what ADR-016's acceptance gate demanded | MEDIUM | This is the milestone's actual differentiator versus "just gate the primary search tool and call it done" |
| Denial is observable, not silent | A default-deny filter that just returns fewer rows with no signal is hard to distinguish from "no matches." Logging *why* rows were excluded (scope mismatch vs. genuinely no relevant content) makes the isolation boundary auditable rather than just assumed | LOW–MEDIUM | `searchQuality.ts` already has a logging precedent (`logRecall`, `logRecallQuery` — fire-and-forget, non-blocking); a `logScopeDenial`-shaped sibling is a small, well-precedented addition |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Reusing `tags` as the enforcement boundary instead of adding a new field | Looks like less schema churn — `scope.tags` is already parsed in `parseContext.ts`, seemingly "ready to consume" | `tags` is open-vocabulary, multi-valued (up to 16), and explicitly a description taxonomy under ADR-012 ("tags rather than a binary profile field... memories can belong to several products and personas simultaneously"). A security predicate needs one closed, exhaustive, single-valued field — using `tags` for both means a future descriptive tag addition or omission can silently change security posture | A distinct closed-vocabulary `policy_scope` field, validated the way `tagGrammar.ts` validates tags but with a fixed enum, not a pattern regex — exactly what PROJECT.md's target features already specify |
| A general policy engine (OPA/Cedar/custom rule DSL) | Feels "future proof" for more domains, more users, more rules later | Massive complexity and audit-surface increase for a single-user, two-domain system; also invites deferring the actual default-deny predicate behind an abstraction layer that itself needs testing for correctness | The two-value closed enum above; revisit only if/when the product actually goes multi-user (explicitly out of scope in PROJECT.md) or gains a third domain |
| Post-retrieval / application-layer filtering ("filter before showing the LLM, but after the DB query runs") | Simplest to bolt on — one filter step wrapping the existing tool handlers, no `search.sql` changes | Rows the caller isn't entitled to still leave the database, get scored, get ranked, and participate in RRF/MMR fusion and MMR's diversity math before being dropped — the leak surface (query planner stats, timing side channels, ranking-position shifts on denied rows changing the fusion output for allowed rows) is strictly larger, and it's the exact anti-pattern OWASP's RAG cheat sheet calls out: "pre-filtered vector search... is generally safer... because restricted chunks never enter the candidate list" | Query-layer filtering — `WHERE`/Cypher-parameter predicates before the candidate list forms, matching the Postgres RLS and Supabase RAG pattern already cited above |
| Automatic LLM-based scope inference as the *sole* mechanism ("just have the model guess personal vs. corporate from content") | Removes user/caller burden entirely; feels like it "just works" | Non-deterministic, unauditable, and creates silent false negatives — exactly the failure mode default-deny exists to prevent. An LLM misclassifying a corporate thought as personal doesn't fail loudly, it fails by leaking | If automatic classification is wanted at all, treat it as an advisory suggestion at capture time (ST-101's territory) requiring explicit confirmation — never as retrieval-time authority |
| Defaulting missing/legacy scope to "personal" (or any single value) because it's the statistically common case | Minimizes migration friction — old rows "just work" without a backfill decision | Directly violates PROJECT.md's stated constraint: "missing scope must never silently broaden access." Defaulting unscoped content into visibility for *any* domain-scoped query is exactly the silent broadening this milestone exists to prevent | Exclude unscoped/legacy content from every domain-scoped query until it is explicitly (re)classified; treat the backfill/reclassification of legacy rows as its own deliberate, tracked decision — not a default |

## Feature Dependencies

```
Closed-vocabulary policy_scope field (schema + validator)
    └──requires──> nothing new (schema-only; parallels shared/tagGrammar.ts's existing pattern)

parseContext.ts: parse policy-scope from request context
    └──requires──> Closed-vocabulary policy_scope field (need the same vocabulary on both sides of the comparison)

Default-deny retrieval filter (search_thoughts, list_thoughts)
    └──requires──> Closed-vocabulary policy_scope field on content
    └──requires──> parseContext.ts parsing policy-scope from the request
    └──must precede──> rrfFuse() / mmrRerank() in searchQuality.ts (filter is a pre-step, not a post-step)

Default-deny filter for graph_traverse / graph_search
    └──requires──> Closed-vocabulary policy_scope field on content
    └──requires (separately)──> entity worker propagating scope onto AGE graph nodes/edges
        (independent of the relational filter above — same field, second enforcement mechanism)

Provider-egress scope-aware gating
    └──requires──> Closed-vocabulary policy_scope field on content
    └──enhances──> the existing MODEL_PROVIDER_ENABLED global kill switch (provider-egress.test.ts) —
                    narrows a process-wide gate to a content-scope-aware one, doesn't replace it

Negative isolation test suite
    └──requires──> Default-deny retrieval filter (relational)
    └──requires──> Default-deny filter for graph_traverse/graph_search
    └──requires──> Provider-egress scope-aware gating
        (tests validate the above three; can be scaffolded TDD-style first, but a "passing" negative
        test with no enforcement behind it proves nothing)

Write-side capture-time policy scoping (ST-101) ──deferred, but implicitly relies on──> Closed-vocabulary
    policy_scope field existing (this milestone lands the field + a safe default-deny read behavior;
    ST-101 later builds the ergonomics for assigning it at capture time)
```

### Dependency Notes

- **Retrieval filtering requires the closed-vocabulary field to exist before it can filter on anything** — this is the true root dependency; every other item in this milestone is either building that field, consuming it, or testing that consumption.
- **The filter must precede `rrfFuse`/`mmrRerank`, not follow them:** both functions in `searchQuality.ts` are pure and scope-blind by design (they operate on whatever candidate list they receive). Keeping them pure is good — but it means the *caller* (the tool handler assembling candidates from `search.sql`'s lanes) is where the default-deny predicate must live, not inside `searchQuality.ts` itself.
- **Graph enforcement is a genuinely separate dependency chain, not a downstream consumer of the relational filter:** `graph_traverse`/`graph_search` read Apache AGE, populated asynchronously by `entityWorker.ts`. Fixing the relational tables' filtering does nothing for the graph unless the entity worker also propagates scope, or the graph tools join back to `thoughts.policy_scope` per node. Treat this as its own line of work in the roadmap, not a "same fix, different table" checkbox.
- **An open design question this research surfaces but does not resolve:** what does "no scope on the *request*" mean operationally? Two defensible-sounding options exist and they're not equivalent: (a) an unscoped request sees only unscoped content (symmetric with content-side default-deny), or (b) an unscoped request is refused outright, requiring the caller to always be explicit. PROJECT.md's constraint ("missing scope must never silently broaden access") rules out a third option — an unscoped request seeing *everything* — but doesn't by itself decide between (a) and (b). This is a PO-level decision the roadmap should surface explicitly rather than let an implementer default silently.
- **ST-101 (write-side capture-time scoping) is deferred, but this milestone cannot be scope-blind at the schema level** — the field itself, and a safe (excluded-by-default) behavior for content that has no scope assigned yet, has to exist now for read-side default-deny to have anything to enforce against. What's deferred is the *tooling/UX* for assigning scope well at capture time, not the field's existence.

## MVP Definition

### Launch With (v1 — this milestone, ST-082)

- [ ] Closed-vocabulary `policy_scope` field on observations/sources, distinct from `tags` — nothing else in this milestone has anything to filter on without it
- [ ] Default-deny retrieval filter in `search_thoughts` and `list_thoughts`, applied at the query layer ahead of RRF/MMR — the milestone's headline ask
- [ ] Default-deny filter for `graph_traverse`/`graph_search` — explicitly named in PROJECT.md as a required egress path, and architecturally independent of the relational filter (see Dependency Notes)
- [ ] Provider-egress gating made scope-aware (extending, not replacing, the existing `MODEL_PROVIDER_ENABLED` kill switch) — explicitly named in PROJECT.md ("retrieval **and** model-provider routing")
- [ ] Negative isolation tests covering every enforced egress path — PROJECT.md names this as required acceptance evidence, not optional polish
- [ ] An explicit, documented decision (not a silent default) for what happens to content captured before `policy_scope` existed

### Add After Validation (v1.x)

- [ ] Write-side capture-time policy-scope assignment UX/automation — trigger: once read-side default-deny is proven safe and stable (this is ST-101's territory, already deferred by PROJECT.md)
- [ ] Scope enforcement for "context assembly" and "exports" if these resolve to code paths distinct from the six known tool handlers — trigger: once those paths are identified (see Gaps below); PROJECT.md names them but this research pass didn't map them to source
- [ ] Legacy-row backfill/reclassification tooling — trigger: once it's observable in practice how much unscoped legacy content exists and whether default-exclusion is causing real recall pain

### Future Consideration (v2+)

- [ ] Scopes beyond a single personal/corporate binary (e.g., per-employer or per-client scoping) — defer until there's an actual second corporate context to isolate; PROJECT.md's current framing is a two-domain boundary
- [ ] Any move toward a general policy engine — defer indefinitely unless the product goes multi-user (explicitly out of scope) or the domain count grows past what a closed enum comfortably expresses
- [ ] Automatic LLM-assisted scope classification at capture time — defer until the manual/explicit closed-vocab path is proven reliable in production; treat as advisory-only even then (see Anti-Features)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Closed-vocabulary `policy_scope` field | HIGH | LOW–MEDIUM | P1 |
| Default-deny relational retrieval filter (search_thoughts, list_thoughts) | HIGH | MEDIUM | P1 |
| Default-deny graph filter (graph_traverse, graph_search) | HIGH | HIGH | P1 |
| Provider-egress scope-aware gating | HIGH | MEDIUM–HIGH | P1 |
| Negative isolation test suite | HIGH | MEDIUM | P1 |
| Explicit legacy-content default-deny decision | MEDIUM (avoids silent broadening) | LOW | P1 |
| Denial observability/logging | MEDIUM | LOW–MEDIUM | P2 |
| Write-side capture-time scoping UX | HIGH (longer-term) | MEDIUM–HIGH | P2 (ST-101) |
| Legacy-row backfill tooling | MEDIUM | MEDIUM | P2 |
| Multi-domain (beyond 2) scoping | LOW (no current need) | MEDIUM | P3 |
| General policy engine | LOW (over-engineered for scale) | HIGH | P3 (avoid) |
| LLM-based automatic scope inference | LOW–MEDIUM (risk-laden) | MEDIUM | P3 |

## Competitor / Reference-Pattern Analysis

Not literal competitors — reference architectures for the same enforcement shape, since this is an internal capability rather than a market-facing feature set.

| Concern | Postgres RLS multi-tenant pattern | Enterprise permission-aware RAG (OWASP / Supabase pattern) | Our Approach |
|---------|-----------------------------------|--------------------------------------------------------------|--------------|
| Default-deny on missing scope key | Session variable unset → `current_setting(..., true)` returns NULL → predicate evaluates false → zero rows matched, not all rows | Query-time metadata filter injected before ANN search; unlabeled/missing-label content is excluded from the filtered candidate set by construction | New `policy_scope` predicate applied inside `search.sql`'s lanes and AGE Cypher parameters, ahead of RRF/MMR fusion — same "filter before candidates form" shape |
| Inheritance / never-widen rule | Not directly addressed — RLS assumes `tenant_id` is always set at insert time | Chunks must inherit the parent document's tightest restriction; a child must never become more accessible than its parent | Directly relevant to the AGE graph: entity nodes derived from a corporately-scoped thought must not surface as unscoped or personally-scoped in `graph_traverse`/`graph_search` |
| Handling legacy/unset values | Requires an explicit migration decision — RLS itself doesn't retrofit historical rows | Same gap — permission metadata is assumed to exist at ingest, not backfilled | This milestone must make the legacy-row decision explicit rather than inherit the gap silently (see MVP "Launch With") |
| Egress/provider-routing boundary | Out of scope for a DB-only pattern | OWASP: "break-glass flows with mandatory approvals and full audit trails" for any cross-boundary access | Extend the existing `MODEL_PROVIDER_ENABLED` kill-switch pattern (already proven in `provider-egress.test.ts`) to be scope-aware rather than process-wide |

## Sources

- [Postgres Row-Level Security for Multi-Tenant SaaS — DEV Community](https://dev.to/software_mvp-factory/postgresql-row-level-security-for-multi-tenant-saas-1lgp) — default-deny-on-missing-key mechanism (`current_setting(..., true)` → NULL → false)
- [RAG with Permissions — Supabase Docs](https://supabase.com/docs/guides/ai/rag-with-permissions) — pre-filtered pgvector query pattern applying authorization inside the similarity query itself
- [RAG Security Cheat Sheet — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html) — deny-by-default retrieval filters, chunk-inherits-parent-restriction rule, pre-filter vs. post-filter tradeoff, break-glass/audit-trail pattern for cross-boundary access
- [Permission-Aware Retrieval: Why Access Control in Enterprise RAG Must Live in the Vector Layer — TianPan.co](https://tianpan.co/blog/2026-05-04-permission-aware-retrieval-enterprise-rag-access-control) — corroborates query-layer (not post-fetch) enforcement as the safer default
- [An Approach for Handling Missing Attribute Values in Attribute-Based Access Control Policy Mining (arXiv)](https://arxiv.org/pdf/2505.01873) — "default to fail closed if attributes are missing" as the ABAC-literature convergence point
- [Testing broken access control: A QA Guide — QAJobFit](https://qajobfit.com/resources/testing-broken-access-control) — negative-test shape for proving isolation ("each identity can perform only the allowed action... in the allowed tenant")
- Repo-internal (HIGH confidence, read directly): `server/src/parseContext.ts`, `server/src/searchQuality.ts`, `shared/tagGrammar.ts`, `server/tests/provider-egress.test.ts`, `.planning/PROJECT.md`

---
*Feature research for: default-deny policy-scope isolation (ai-memory v1.1 milestone)*
*Researched: 2026-08-28*
