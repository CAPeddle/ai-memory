# Pitfalls Research

**Domain:** Retrofitting default-deny policy-scope enforcement onto an already-built, multi-lane retrieval system (lexical + vector + graph) with background workers and external provider egress
**Researched:** 2026-08-28
**Confidence:** HIGH for codebase-grounded findings (read directly from `server/index.ts`, `server/src/*.ts` at current HEAD); MEDIUM for general RAG/vector multi-tenancy literature cited for cross-validation

**Scope note:** Every pitfall below is grounded in the actual `ai-memory` codebase as it stands today, not a generic RAG system. File:line references point at the exact code the ST-082 work will touch. General web research on multi-tenant RAG isolation is cited only to confirm these are known failure classes, not to substitute for the codebase read.

## Critical Pitfalls

### Pitfall 1: The existing project filter is fail-open by construction — the new policy-scope filter must not copy its shape

**What goes wrong:**
`search_thoughts`, `list_thoughts`, and the vector lane all use the identical SQL idiom: `AND (${project}::text IS NULL OR project = ${project})` (`server/index.ts:342`, `server/index.ts:360`, `server/index.ts:639`). This is deliberately permissive — "no project given" means "search everything" — which is exactly correct for `project` scoping (a convenience/relevance boost) and exactly wrong for policy scope (a security boundary). If the new `PolicyScope` filter is implemented by literally cloning this pattern (`AND (${policyScope}::text IS NULL OR policy_scope = ${policyScope})`), the result is default-**allow**, not default-deny: an unscoped or malformed request returns everything, including personal content, to a corporate-context caller.

**Why it happens:**
The pattern already exists, is well-tested for `project`, and is the path of least resistance to copy when a second filter needs to be added to the same three SQL statements. Retrofits gravitate toward the shape already in the file.

**How to avoid:**
Treat policy-scope filtering as structurally distinct from project filtering, not a second instance of the same clause. The policy-scope predicate must reject (return zero rows, or a validation error) rather than pass through when scope is absent, unparseable, or the caller's identity/context can't establish an authorized scope. Write the SQL as `AND policy_scope = ANY(${allowedScopes}::text[])` with `allowedScopes` computed and validated *before* the query is built — never as an `IS NULL OR` short-circuit.

**Warning signs:**
Any new WHERE clause that reads `(${x} IS NULL OR ...)` for the policy-scope column. Any code path where a missing/malformed `context` string still reaches a database query rather than being rejected at `parseContextOrError` (`server/src/parseContext.ts:141`).

**Phase to address:**
Read-path lexical/vector scope enforcement phase (the `search_thoughts`/`list_thoughts`/vector-lane work explicitly listed in PROJECT.md's target features).

---

### Pitfall 2: `fetch` and the ChatGPT-compatible `search` tool bypass the lane that gets fixed

**What goes wrong:**
`fetch` (`server/index.ts:259-294`) retrieves a thought by raw UUID with **no scope predicate of any kind** — `SELECT ... FROM thoughts WHERE id = ${id} AND active = true`. If a caller (or an agent chaining tool calls) has, or can guess/enumerate, a thought's UUID — including one it saw in a `search_thoughts` result *before* scope enforcement existed, or one leaked via `search`'s citation URL (`server/index.ts:239`, built from the same unscoped id) — `fetch` returns the full content regardless of any policy-scope filter added to `search_thoughts`. The ChatGPT-compatible `search` tool (`server/index.ts` around 200-256) has its own independent vector-only query path and its own `logRecallQuery` call with `project: null` hardcoded (`server/index.ts:246`) — it is not a thin wrapper around `search_thoughts`, so a scope fix applied only to `search_thoughts` does not touch it.

**Why it happens:**
This is the single most common retrofit mistake in multi-lane systems: fixing the lane you're looking at (the "main" hybrid search tool) while forgetting the ID-lookup lane and the parallel ChatGPT-compatible tool pair, because they don't obviously look like "search" and are easy to treat as internal plumbing rather than a second enforcement point. The general RAG literature confirms this is a known failure class: "if application logic has a single crack — perhaps a raw SQL query or misconfigured repository — the entire isolation layer crumbles" and post-hoc ID-based access is a classic authorization gap distinct from search filtering.

**How to avoid:**
Enumerate every code path that reads from `thoughts` by any key (id, project, full-text, vector) as a single inventory before writing any filter code — not just the tools named "search". Add the scope predicate to `fetch`'s WHERE clause too, even though it takes an id rather than a query. Route `search`/`fetch` through the same scope-resolution helper used by `search_thoughts`/`list_thoughts` rather than duplicating logic per tool.

**Warning signs:**
Any `SELECT ... FROM thoughts WHERE id = ${id}` with no scope join/predicate. Any tool registration block that doesn't call the same `parseContextOrError`/scope-resolution helper as the others.

**Phase to address:**
Same read-path phase as Pitfall 1 — must include an explicit inventory step ("every tool and code path that reads `thoughts`") before the filter is written, not just the two named tools.

---

### Pitfall 3: The graph lane (`graph_traverse`, `graph_search`) has zero scope awareness, and it accepts arbitrary read queries

**What goes wrong:**
Both graph tools query the Apache AGE `memory_graph` with **no project or scope predicate whatsoever** (`server/index.ts:972-1043`, `server/index.ts:1045-1102`). `graph_traverse` accepts caller-supplied openCypher (constrained only to `MATCH`, no mutation keywords, no dollar-quote breakout) — an agent can `MATCH (n) RETURN n LIMIT 5` and see every node in the graph regardless of what scope any caller ever intended. `graph_search` builds `MATCH (start {name: '...'})-[*1..hops]-(connected) RETURN DISTINCT connected` with no scope join. If lexical/vector lanes get a policy-scope filter and the graph lane doesn't, the graph becomes the residual bypass: content that is denied through `search_thoughts` may still be discoverable by asking the same question through `graph_traverse`/`graph_search`, because entities and relationships extracted from that content are graph-reachable independent of the source thought's scope.

**Why it happens:**
The graph lane is a structurally different retrieval mechanism (openCypher over AGE, not SQL over `thoughts`), so a scope filter designed for the two SQL lanes doesn't naturally extend to it — it requires separate design work, and "fix the two obvious search tools" retrofits often stop before reaching graph tools that don't share code with `search_thoughts`.

**How to avoid:**
Treat the graph lane as a required, not optional, target for this milestone (PROJECT.md explicitly lists "graph traversal" as one of the egress paths negative isolation tests must cover). This requires two things, not one: (a) a scope predicate in the Cypher (e.g., `WHERE n.policy_scope IN [...]`) enforced server-side and not caller-suppliable, and (b) scope actually being a property on graph nodes/edges in the first place — see Pitfall 4, because today it is not.

**Warning signs:**
Any `cypher(...)` call built without a `WHERE`/property-match constraint tied to the resolved scope. `graph_traverse` remaining fully general-purpose (any `MATCH`) after the SQL lanes are locked down — that asymmetry is itself the bug.

**Phase to address:**
A dedicated graph-lane enforcement phase, sequenced *after* node/edge scope attribution exists (Pitfall 4) — enforcing a filter on a property that isn't populated yet only produces the illusion of coverage.

---

### Pitfall 4: Graph nodes carry no scope attribution, and `MERGE`-by-name silently fuses entities across scope boundaries

**What goes wrong:**
`entityWorker.ts` extracts entities and relationships from thought content via an LLM call and writes them with `MERGE (:${node.label} {name: '${escapeForCypher(node.name)}'})` (`server/src/entityWorker.ts:117`) and `MERGE (a)-[:${edge.rel}]->(b)` (`entityWorker.ts:128`) — keyed **only on label + name**, with no project or scope property recorded anywhere on the node. `MERGE` means: if a personal-scoped thought and a corporate-scoped thought both mention an entity with the same name (a person's first name, a company also referenced personally, "Alice", "TypeScript", "the migration project"), AGE fuses them into **one graph node** that both scopes' relationships attach to. Even a perfectly correct scope filter added later on `graph_traverse`/`graph_search` cannot separate what is already merged — the node itself is the union of both scopes' information, and any edge from a corporate context now connects, via that shared node, to a personal-scoped neighbor and vice versa. This is not a filtering bug; it is data already stored without the distinction the filter is supposed to enforce.

**Why it happens:**
`MERGE`-by-name is an intentional idempotency mechanism (repeated mentions of "TypeScript" across many thoughts should be one node, not thousands), designed before cross-scope isolation was a requirement. Retrofits typically look for missing WHERE clauses in read paths and miss that the write path already destroyed the information a read-path filter would need.

**How to avoid:**
This cannot be fixed by adding a read-side filter alone. The node/edge identity key must include scope (e.g., `MERGE (:Person {name: $name, policy_scope: $scope})` so that "Alice" in a personal context and "Alice" in a corporate context are distinct nodes), and existing merged nodes in any populated graph need either a migration/rebuild or an explicit decision to treat pre-existing graph data as unscoped/quarantined until re-extracted. Because this is a genuinely hard retrofit (rewriting graph identity semantics on live data), flag it early rather than discovering it during graph-lane test writing.

**Warning signs:**
Any node/edge write in `entityWorker.ts` (or wherever the eventual scope-aware version lives) that keys `MERGE` on `name` alone. A negative isolation test that traverses from a corporate-scoped entity and reaches a personal-scoped thought's extracted facts through a shared node — this is the concrete proof this pitfall has occurred, not a hypothetical.

**Phase to address:**
Must precede the graph-lane read-side enforcement phase (Pitfall 3). Likely needs its own phase: "scope-aware entity/relationship identity" — this is the one item in this list most likely to need deeper research/design before implementation, given PROJECT.md's note that write-side capture-time scoping is explicitly deferred to ST-101, yet the graph write path is arguably part of "retrieval," not "capture," and needs a scoping decision now regardless.

---

### Pitfall 5: Background workers egress raw thought content to OpenRouter with no scope gate at all

**What goes wrong:**
Two independent background workers send full, untruncated (beyond a char cap) thought content to the external OpenRouter API on every poll cycle, with zero scope check before the network call: `entityWorker.ts`'s `callLLM` (`entityWorker.ts:59-90`, entity/relationship extraction, `openai/gpt-4o-mini`) and `consolidationLLM.ts`'s call (`consolidationLLM.ts:37`, content normalization for the consolidation/promotion pipeline). Both simply `fetch()` to `https://openrouter.ai/...` for whatever content the poll loop pulled off the queue table, regardless of what policy scope that content should carry. PROJECT.md is explicit that default-deny must apply to "retrieval **and** model-provider routing," and these two workers are model-provider routing — but they are polling background loops, not request-scoped tool handlers, so there is no caller `context` string to key a scope decision off. The scope has to come from the stored row itself, and the workers currently have no scope-aware query to select rows by.

**Why it happens:**
"Provider egress" naturally reads as "the embedding call" (`embeddings.ts`) because that's the one on the interactive request path with an obvious global kill switch already present. The two background-worker LLM calls are easy to miss because they're asynchronous, unrelated in code location to the search tools, and were built (like the graph MERGE issue) before cross-scope isolation was a design constraint.

**How to avoid:**
Enumerate all `fetch("https://openrouter.ai/...")` call sites as a single list before scoping the egress-gating work — there are at least three (`embeddings.ts`, `entityWorker.ts`, `consolidationLLM.ts`), not one. Each worker's row-selection query (`entityWorker.ts` queue read, `consolidationWorker.ts:47-49`'s `consolidation_queue` read) needs a scope predicate mirroring the read-path fix, and rows whose scope resolves to "deny" for provider egress must be skipped (or routed to a scope-appropriate/no-egress path) rather than processed identically to allowed rows.

**Warning signs:**
`grep -rn 'openrouter.ai' server/src server/index.ts` returning more hits than the ones actually scope-gated. A worker's batch-selection SQL (`WHERE status = 'pending' ...`) with no scope join.

**Phase to address:**
A dedicated provider-egress phase, distinct from the read-path filter phase — these are different call sites, different trust surfaces (background/async vs. request/sync), and plausibly need different mechanisms (skip-and-requeue vs. reject-the-tool-call).

---

### Pitfall 6: The existing `MODEL_PROVIDER_ENABLED` switch is global, not scope-aware — don't mistake it for the egress control this milestone needs

**What goes wrong:**
`embeddings.ts:49-57` checks a single environment variable, `MODEL_PROVIDER_ENABLED`, and throws `ModelProviderDisabledError` for *every* call if it's `"false"` — a deployment-wide on/off toggle with no per-request or per-scope granularity. It is easy to look at this existing mechanism, see that "provider egress" already has a kill switch, and conclude the default-deny requirement is already partially satisfied. It is not: a global switch can only produce "no embeddings for anyone" or "embeddings for everyone," never "no embeddings for personal-scoped content, embeddings for corporate-scoped content" — which is what default-deny-by-scope actually requires.

**Why it happens:**
Confusing "there is an off switch" with "there is scope-aware gating." The existing switch was built to satisfy a different requirement (disable the provider entirely, e.g., for offline dev or cost control), and its name (`MODEL_PROVIDER_ENABLED`) doesn't signal that it's global — a reader skimming for "is egress already gated?" can reasonably answer yes and move on.

**How to avoid:**
Treat `getEmbedding` and the two LLM callers as needing a **new parameter** (resolved scope, or an explicit allow/deny decision made by the caller before invoking them) — not a repurposing of the existing global flag. Keep `MODEL_PROVIDER_ENABLED` as the deployment-wide kill switch it already is; add scope-awareness as an orthogonal, additional check at each call site.

**Warning signs:**
Any design note that says "reuse `MODEL_PROVIDER_ENABLED`" for per-scope egress control. Any call site that still computes an embedding/LLM call without first resolving what scope the content belongs to.

**Phase to address:**
Same provider-egress phase as Pitfall 5 — call out explicitly in that phase's plan that the global switch is out of scope for the per-scope mechanism, to prevent the two being conflated during implementation.

---

### Pitfall 7: Scope is a caller-supplied free-text string, not a server-verified identity — the trust boundary needs an explicit decision, not an implicit one

**What goes wrong:**
`server/src/auth.ts` authenticates every MCP request with a single shared Bearer key (`MEMORY_API_KEY`) — there is no per-caller identity, session, or role. Policy scope, as parsed by `parseContext.ts`, arrives entirely through the free-text `context` parameter the *caller* supplies on each tool call (e.g., `"project:x,tags:developer"`). Nothing about the current architecture distinguishes "an agent working in a corporate repo" from "an agent working in a personal context" except what string that agent's tool call happens to include. If default-deny scope enforcement is implemented purely as "filter by whatever scope the `context` argument says," the isolation boundary is only as strong as whichever client-side code constructs that string — a misconfigured, compromised, or simply differently-prompted agent can request a different scope on the very next call and receive it, because the server has no independent signal to contradict the claim.

**Why it happens:**
This is the deepest and least obviously "code" pitfall in the list: it's an architectural gap the existing system was never asked to close (single-user-first, single shared key was an acceptable trust model when there was no policy boundary to enforce). Retrofitting default-deny at the query-filter level can be done correctly and still leave this gap open, because filter correctness and identity-to-scope binding are two different problems that look like one from inside the SQL.

**How to avoid:**
Make the trust-boundary decision explicit and written down before implementing filters: is "caller-declared scope" the accepted model for this milestone (single-user-first, PROJECT.md's stated posture, so the boundary is "don't let one honest declaration silently see more than it declared" rather than "defend against an adversarial caller")? If so, say so in the phase plan, and make sure negative isolation tests match that threat model (prove an *honest* omission or malformed scope denies rather than allows) rather than accidentally testing for a stronger guarantee (adversarial-caller resistance) the architecture doesn't provide. If a stronger guarantee is actually wanted, that's a materially different, larger piece of work (per-caller identity, credential-bound scope) than filter retrofitting, and should be scoped/flagged separately rather than assumed to fall out of "add a WHERE clause."

**Warning signs:**
A PR description or test suite that claims "policy scope is now enforced" without a one-line statement of what threat model that claim covers. Negative isolation tests that only vary the `context` argument's *value*, never its *absence* or *malformed* forms, and never test what happens when the same caller sends two different scope claims back-to-back.

**Phase to address:**
Should be resolved as a design decision at the start of the milestone (likely belongs in the plan/discussion phase before any lane-specific implementation phase), because it determines what "default-deny" is allowed to mean for every other phase's tests.

---

### Pitfall 8: Testing only the positive path ("scoped query returns scoped results") instead of writing negative isolation proofs

**What goes wrong:**
It is easy to demonstrate a filter "works" by writing a test that requests scope A and asserts the results all carry scope A. This proves nothing about isolation — it doesn't prove scope B content was *excluded*, doesn't prove an *unscoped* request is denied rather than defaulting to "everything," doesn't prove a near-miss/partial-match row from scope B didn't leak through a lane that fuses results differently (RRF fusion, MMR re-rank, or the ANN index's approximate-nearest-neighbor candidate set — see the general vector-DB literature note below), and doesn't prove the `fetch`-by-id lane, the graph lane, or the background-worker egress path enforce the same boundary the tested lane does. PROJECT.md is explicit that this milestone's target is "negative isolation tests across every egress path" — a specific, harder bar than the tests this codebase's existing search-quality suite is built for (it currently proves relevance/ranking quality against a golden corpus, not the absence of cross-scope leakage).

**Why it happens:**
Positive-path tests are the natural first thing to write and the natural thing "search filter added, test passes" retrofits stop at, because a green test that returns the right rows *feels* like proof of isolation. Negative proofs require deliberately constructing a scenario where leakage *would* be visible if the fix were wrong, which is a different (and easy to skip) authoring step. The pgvector/ANN literature specifically calls out that approximate-nearest-neighbor index structures (HNSW-style graphs) are built across the *entire* dataset, not per-scope, so a filter applied as a post-ANN `WHERE` clause can still be influenced by which neighbors the index found *before* filtering — worth a specific negative test (does a personal-scoped near-duplicate of a corporate query ever appear in `EXPLAIN`-level candidate sets, even if excluded from final output) rather than assuming vector search is inherently safe once BM25/SQL filtering looks correct.

**How to avoid:**
For every lane (lexical, vector, graph, fetch-by-id, background-worker egress), write at minimum: (a) a positive test (scoped request returns scoped content), (b) a negative test (a request scoped to A, executed against a corpus containing both A and B content, returns zero B rows — checked by content/id, not just by count), (c) an absent/malformed-scope test (no `context`, or a `context` with no policy-scope token, is denied rather than defaulting to unfiltered), and (d) a cross-lane consistency test (the same underlying content, denied via `search_thoughts`, is also denied via `fetch`, `graph_search`, and any other lane that can reach it). Treat this four-part shape as the acceptance bar per lane, not "one test per lane."

**Warning signs:**
A test suite where every assertion is `expect(results.every(r => r.scope === requestedScope))` and none is `expect(results).not.toContainEqual(expect.objectContaining({ id: knownDeniedId }))`. Zero tests that pass an empty or garbage `context` string and assert denial.

**Phase to address:**
Should be a cross-cutting requirement of every lane-specific phase (not a separate "testing phase" bolted on at the end) — each phase's own acceptance criteria should require the four-part test shape above before that lane is considered done.

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Filter only `search_thoughts`/`list_thoughts`, leave `fetch`/`search` for "later" | Ships the visible/obvious lanes fast | `fetch`-by-id remains a standing bypass any agent can use to retrieve denied content once it has (or guesses) an id | Never — PROJECT.md requires every egress path in this milestone |
| Reuse `MODEL_PROVIDER_ENABLED` as the scope-gate mechanism | No new plumbing needed | Produces all-or-nothing egress, not per-scope egress; looks done, isn't (Pitfall 6) | Never for this milestone's requirement; acceptable only as the pre-existing deployment-wide kill switch it already is |
| Leave graph nodes unscoped and filter only at the traversal query layer | Avoids touching `entityWorker.ts`'s write path and any existing graph data | Filter sits on top of already-fused nodes (Pitfall 4); enforcement is cosmetic | Never — must fix identity before filtering is meaningful |
| Ship the read-path filter without the identity/trust-boundary decision (Pitfall 7) written down | Faster to start coding | Tests and reviewers can't agree what "isolated" means; scope creep or false confidence either direction | Only as an explicit, time-boxed placeholder with the open question tracked, not silently assumed |
| Positive-path-only test coverage | Green CI quickly | False confidence; the milestone's actual deliverable (negative isolation proof) is unmet even though something called "tests" exists | Never for this milestone |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenRouter embeddings (`embeddings.ts`) | Assuming the existing `MODEL_PROVIDER_ENABLED` global flag already satisfies "default-deny for provider routing" | Add scope resolution as a distinct, additional gate at each call site; keep the global flag as the separate deployment-wide switch it is |
| OpenRouter entity extraction (`entityWorker.ts`) | Gating only the interactive tool calls and forgetting the poll-loop LLM call sends content externally unconditionally | Add a scope predicate to the worker's row-selection query so denied-scope content is never dequeued for LLM extraction in the first place |
| OpenRouter consolidation normalization (`consolidationLLM.ts` / `consolidationWorker.ts`) | Same as above — a second, independently-implemented worker with its own poll loop and its own unconditional external call | Same fix pattern as `entityWorker.ts`, applied separately since it's a separate code path, not shared logic |
| Apache AGE / openCypher (`graph_traverse`, `graph_search`) | Treating "read-only, MATCH-only, injection-hardened" (which it already is) as equivalent to "scope-safe" | Injection-safety and scope-safety are orthogonal; the existing hardening (`CYPHER_DENIED_KEYWORDS`, dollar-quote stripping) says nothing about whether a well-formed, safe `MATCH` query can still return cross-scope nodes |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Post-ANN filtering on the vector lane (filter applied to results *after* the pgvector similarity search rather than as an index-aware predicate) | Vector lane silently returns fewer than `limit` results when a scope has few in-scope rows, because the ANN candidate set was drawn from the whole table then filtered down | Confirm whether the vector query already pushes the scope predicate into the same query as the `<=>` similarity clause (as the existing `project` filter does at `server/index.ts:360`) rather than filtering an already-fetched candidate set in application code | Grows worse as the corpus grows and as scoped content becomes a smaller fraction of the whole — exactly the shape of "personal vs. corporate" content over time |
| Graph traversal with no per-node scope index | `graph_search`'s bounded traversal (`server/index.ts:1085`) walks `-[*1..hops]-` with no property index on the new scope column | Add an index on the graph node scope property alongside the write-path fix (Pitfall 4), not as an afterthought once traversal latency is already a problem | Noticeable once the graph has enough nodes that unindexed property filtering on every hop adds up — not urgent at current scale, but the index should land with the schema change, not be a later migration |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Treating "the filter compiles and the happy-path test is green" as proof of isolation | Cross-scope data leakage indistinguishable from correct behavior until someone deliberately probes for it (Pitfall 8) | Require the four-part test shape (positive/negative/absent-scope/cross-lane) as an explicit acceptance gate per lane |
| Believing openCypher injection-hardening (`graph_traverse`'s keyword/comment/dollar-quote stripping) provides scope isolation as a side effect | A caller can send a perfectly safe, fully allowed `MATCH` query and still retrieve cross-scope nodes, because injection-safety and authorization are unrelated properties | Add an explicit, separate scope predicate; do not fold this into the existing injection allow-list review |
| Assuming a global provider kill switch discharges the "default-deny for model-provider routing" requirement | Ships a milestone that reads as complete against PROJECT.md's text but isn't (Pitfall 6) | Explicitly test that corporate-scoped content still reaches the provider (when appropriate) while personal-scoped content does not, in the same test run — proves the switch is scope-aware, not just present |
| Fixing graph traversal reads without fixing graph writes (entity `MERGE`) | Read-side filter enforced on top of data that already fused two scopes into one node — enforcement without effect (Pitfall 4) | Sequence the write-path identity fix before, or atomically with, the read-path graph filter; do not ship one without the other |
| Leaving `fetch`/`search` (ChatGPT-compatible tools) out of the enforcement inventory | Standing bypass reachable by id (Pitfall 2) | Build the tool inventory before writing any filter code, explicitly including tools that don't have "search" behavior obviously visible in their name |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Default-deny returns a generic "no results" indistinguishable from "you asked a bad question" | An agent (or the person behind it) can't tell whether memory genuinely has nothing relevant or whether it was denied by scope — silently degrades trust in the memory system over time | Consider a distinct, non-content-leaking signal (e.g., a count of scope-denied matches without exposing them) so callers can tell "empty" from "denied" without the response itself becoming a leak vector |
| Requiring every tool call to carry an explicit, correct scope string with no forgiving default | High friction for the common single-scope case; encourages copy-pasted `context` strings that drift out of sync with actual intent | Establish a sane, explicit default scope per deployment/session context (not a fail-open default at the query layer) so most calls don't need to reconstruct the full `context` string by hand, while an *absent* string still resolves to deny-unless-configured rather than allow-everything |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **`search_thoughts`/`list_thoughts` scope filter added:** Often missing the `fetch` and `search` (ChatGPT-compatible) tools entirely — verify every `SELECT ... FROM thoughts` in `server/index.ts`, not just the two named search tools, carries the same scope predicate.
- [ ] **Vector lane scope filter added:** Often applies the filter after the ANN candidate set is drawn (post-filter) rather than as part of the similarity query itself — verify the scope predicate is in the same SQL statement as the `<=>` operator, mirroring how the existing project filter is placed (`server/index.ts:360`).
- [ ] **Graph traversal scope filter added:** Often filters `graph_search`'s parameterized traversal but not `graph_traverse`'s free-form Cypher — verify both, and verify the scope property actually exists on the nodes being filtered (see next item).
- [ ] **Graph node scope attribution:** Often assumed to already exist because "the filter is written" — verify `entityWorker.ts`'s `MERGE` statements were changed to key on scope as well as name, and verify (or explicitly quarantine) any graph data written before that change.
- [ ] **Provider egress gating:** Often covers only `embeddings.ts` (the one call site with an existing kill switch) — verify `entityWorker.ts`'s `callLLM` and `consolidationLLM.ts`'s call are also scope-gated, and verify the gate is per-scope, not the existing global `MODEL_PROVIDER_ENABLED` flag repurposed.
- [ ] **Negative isolation tests:** Often only prove the positive case — verify there are tests that seed both allowed and denied content in the same corpus and assert denied content never appears in results, by id/content, across every lane in this checklist.
- [ ] **Absent/malformed scope handling:** Often untested — verify a tool call with no `context`, or a `context` with no policy-scope token, is denied (or resolves to a documented default), not treated as "no filter."
- [ ] **Cross-lane consistency:** Often each lane is tested in isolation — verify the same underlying denied content is unreachable via `search_thoughts`, `list_thoughts`, `search`, `fetch`, `graph_traverse`, and `graph_search` alike, not just the lane a given test happens to target.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|-----------------|
| Fail-open filter shipped (Pitfall 1) | LOW | Straightforward SQL fix once caught; the risk is in *not* catching it before merge — add the negative test first, then fix |
| `fetch`/`search` bypass discovered post-ship (Pitfall 2) | LOW–MEDIUM | Same-shape fix as the primary lanes; audit logs/`recall_queries` for any actual cross-scope `fetch` calls that occurred during the exposure window |
| Cross-scope entity fusion in the graph (Pitfall 4) discovered after data has accumulated | HIGH | Cannot be fixed by a query change alone; requires either a full graph rebuild from source thoughts with scope-aware identity keys, or a targeted de-duplication pass splitting fused nodes by re-deriving scope from originating thoughts — budget this as a data migration, not a code fix |
| Background-worker egress leak discovered after some personal content was already sent to OpenRouter (Pitfall 5) | HIGH (external, irreversible) | This is not recoverable in the technical sense (the provider already received the content) — treat as an incident: identify affected rows via worker logs/queue history, document exposure, and fix the gate going forward; cannot be undone |
| Trust-boundary ambiguity discovered mid-milestone (Pitfall 7) | MEDIUM | Requires pausing lane-specific work to make and document the decision explicitly, then re-validating any already-shipped lane's tests against the now-explicit threat model |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|---------------|
| 1. Fail-open filter shape copied from `project` | Read-path lexical/vector enforcement phase | Negative test: unscoped request denied, not unfiltered |
| 2. `fetch`/`search` bypass | Read-path phase — explicit tool inventory step first | Cross-lane test: denied content unreachable via `fetch` and `search`, not just `search_thoughts` |
| 3. Graph lane has no scope filter | Graph-lane enforcement phase (sequenced after Pitfall 4's fix) | Negative test on both `graph_traverse` and `graph_search` |
| 4. Graph nodes unscoped / `MERGE`-by-name fusion | Scope-aware entity/relationship identity phase (precedes Pitfall 3's phase) | Test that same-named entities in different scopes produce distinct nodes; audit/quarantine plan for pre-existing graph data |
| 5. Background workers egress unconditionally | Provider-egress gating phase | Test that a worker's queue read excludes denied-scope rows before any network call is made |
| 6. Global kill switch mistaken for scope gate | Same provider-egress phase, called out explicitly | Test that corporate- and personal-scoped content receive different egress outcomes in the same run, with the global switch left on |
| 7. Scope is caller-declared, not identity-bound | Design/decision step at milestone start, before lane phases | A written statement of the threat model this milestone defends against, referenced by every phase's test plan |
| 8. Positive-path-only testing | Cross-cutting acceptance criterion on every lane phase | Each phase's Definition of Done requires the four-part test shape (positive/negative/absent-scope/cross-lane) before the phase is marked complete |

## Sources

- Direct codebase read at current HEAD (2026-08-28): `server/index.ts`, `server/src/searchQuality.ts`, `server/src/parseContext.ts`, `server/src/entityWorker.ts`, `server/src/embeddings.ts`, `server/src/auth.ts`, `server/src/consolidationWorker.ts`, `server/src/consolidationLLM.ts` — HIGH confidence, primary source, exact file:line citations throughout this document.
- `.planning/PROJECT.md` — milestone scope, target features, and explicit "default-deny for retrieval and model-provider routing" requirement.
- [The Right Approach to Authorization in RAG](https://www.osohq.com/post/right-approach-to-authorization-in-rag) — MEDIUM confidence; corroborates the post-filter-vs-pre-filter and "single crack" application-logic risk described in Pitfall 1/8.
- [The Multi-Tenant RAG Nightmare: Securing pgvector with PostgreSQL RLS](https://kawshik.dev/blog/multi-tenant-rag-pgvector-postgres-rls.html) — MEDIUM confidence; corroborates ANN index candidate-set behavior cited in Pitfall 8 and the Performance Traps table.
- [Why your vector index breaks under multi-tenancy](https://www.andela.com/publication/why-your-vector-index-breaks-under-multi-tenancy) — MEDIUM confidence; general confirmation that ANN structures are built across the full dataset, not per-tenant/per-scope.
- [Multi-Tenant RAG Data Isolation: The 2026 Enterprise Architecture Guide](https://truto.one/blog/how-to-architect-strict-data-isolation-in-multi-tenant-rag-pipelines/) — MEDIUM confidence; general pattern confirmation for pre-search vs. post-search filtering.

---
*Pitfalls research for: default-deny policy-scope retrofit onto ai-memory's multi-lane retrieval system*
*Researched: 2026-08-28*
