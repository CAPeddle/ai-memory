# Phase 5: Policy-Scope Foundation - Context

**Gathered:** 2026-08-28
**Status:** Ready for planning

<domain>
## Phase Boundary

A closed-vocabulary `policy_scope` field (`personal` | `corporate` | `mixed` | `public`) exists on every thought — new and pre-existing, no default-allow gap — and the primary SQL enforcement mechanism for every later phase (6-9) is chosen, prototyped against one real path, and documented in a written threat-model/trust-boundary statement plus a cross-scope visibility matrix. This phase does not implement retrieval filtering itself (Phase 6), graph identity (Phase 7), egress gating (Phase 8), or the port contract/test suite (Phase 9) — it hands each of those phases a settled mechanism and vocabulary to build against.

</domain>

<decisions>
## Implementation Decisions

### Trust boundary (threat-model input)

- **D-01:** Scope is caller-declared under the existing single-key trust model — the same trust boundary as today's `project:X,tags:Y` context string and the single `MEMORY_API_KEY`. Any authenticated caller may request any scope by naming it; there is no second credential or per-scope role in this milestone. — **Reversibility:** costly — introducing a scoped credential later (e.g. an `AWCP_AGENT_API_KEY`-style second key limiting which scopes a caller may request) means retrofitting an authorization layer on top of every path built against the single-key assumption in Phases 6-9.

### Legacy backfill value (POLICY-02)

- **D-02:** Pre-existing thoughts are backfilled to `corporate`, not `personal`. Rationale given: the bulk of thoughts captured to date are work/dev content — backfilling to `personal` would wrongly hide most existing memory from normal (corporate-scope) retrieval once default-deny is enforced. — **Reversibility:** one-way — REQUIREMENTS.md's Out of Scope explicitly excludes "legacy-row backfill tooling beyond the interim default," so there is no planned reclassification path; reversing this choice later means a manual data migration outside this milestone's delivered tooling.

### Cross-scope visibility matrix (DECISION-01, SC #3)

- **D-03:** Strict isolation, with `public` universally visible: `personal` sees `{personal, public}`; `corporate` sees `{corporate, public}`; `mixed` sees `{mixed, public}` only — `mixed` is its own bucket, not a union of `personal`+`corporate`. `public` is visible to every scope automatically (no separate opt-in required). — **Reversibility:** costly — this matrix is the shape every WHERE-clause/RLS predicate in Phases 6-9 is written against; widening or narrowing it later means revisiting every enforcement site and its negative-isolation tests.

### RLS vs. explicit WHERE resolution approach (DECISION-01, SC #2)

- **D-04:** Resolve DECISION-01 by building the real technical spike this phase — prototype `withPolicyScope()` + `FORCE ROW LEVEL SECURITY` against one real path (`list_thoughts`, per SUMMARY.md's suggestion) and let the pooled-connection/`SET LOCAL` behavior observed in that spike settle the choice, rather than deciding from the research write-up alone. This directly satisfies SC #2's "validated by a technical spike" wording. Both STACK.md and ARCHITECTURE.md are HIGH-confidence and disagree; the spike is the tiebreaker.

### Claude's Discretion

- Migration mechanics for adding `thoughts.policy_scope` (three-step add-nullable / backfill / set-NOT-NULL-and-CHECK vs. any faster path Postgres 15 supports) — implementation detail, not raised as a gray area.
- Exact spike scaffolding/teardown shape for D-04, beyond targeting `list_thoughts` and prototyping `withPolicyScope()` + forced RLS.
- Whether `recall_events`/`recall_queries` gain scope columns in this phase or a later one — SUMMARY.md's Phase-1 sketch mentions this but it is not in this phase's REQUIREMENTS.md (POLICY-01/POLICY-02/DECISION-01 only); left to planning to scope correctly against VERIFY-03 (Phase 9).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vocabulary precedent
- `server/db/workflow/001_workflow_schema.sql` (lines 32-49) — the shipped `policy_scope text NOT NULL CHECK (policy_scope IN ('personal','corporate','mixed','public'))`, no DEFAULT, pattern this phase's `thoughts.policy_scope` column must mirror. Comment block explains why no default is deliberate (a permissive default silently mints permissive rows at any INSERT site that forgets the column).
- `shared/tagGrammar.ts` — existing precedent for a `shared/*.ts` module backing a closed vocabulary + Zod schema; `shared/policyScope.ts` should follow this shape.

### Research and requirements
- `.planning/research/SUMMARY.md` — full synthesis; §"Open Decision: RLS vs. Explicit WHERE-Clause Enforcement" is the primary input to D-04; §"Implications for Roadmap" Phase 0/1 sketches map to this phase.
- `.planning/REQUIREMENTS.md` — POLICY-01, POLICY-02, DECISION-01 (this phase's scope); Out of Scope table (legacy-backfill-tooling exclusion informs D-02's reversibility rating).
- `.planning/ROADMAP.md` — Phase 5 section (goal, success criteria, requirement mapping).
- `docs/investigations/ST-084-awcp-host-spike-findings.md` §6.1, §6.3, §7.2, §13, §16, §18.8 — original policy-scope pricing investigation; source for the caller-declared-scope trust framing (Pitfall 6) behind D-01.

### Architecture context
- `server/db/schema.sql` — existing `thoughts` table shape (`project`, `tags` columns) the new `policy_scope` column is added alongside.
- `server/src/parseContext.ts` — existing context-string parsing pattern (`project:X,tags:Y,strict`) that D-01's caller-declared trust model extends by analogy.
- PostgreSQL Row Security Policies docs (postgresql.org/docs/current/ddl-rowsecurity.html) — reference for the D-04 spike's `FORCE ROW LEVEL SECURITY` prototype.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shared/tagGrammar.ts` pattern → clone for `shared/policyScope.ts` (closed-vocabulary union type + Zod `z.enum`).
- `workflow.work_packets.policy_scope` column definition → clone the exact `text NOT NULL CHECK (...)` shape for `thoughts.policy_scope` (different schema/table, same pattern).

### Established Patterns
- Migrations are numbered, sequential, applied once, tracked in `schema_migrations`, no down migrations (`server/db/00N_*.sql`) — the new column's migration follows this numbering (next: `007_*.sql`).
- Pooled connection hazard is already documented and previously hit: `server/db/workflow/001_workflow_schema.sql` header explains a sticky `search_path` bug from AGE queries on a pooled `postgres.js` connection (`max: 10`). D-04's spike must account for the same pooling behavior with `SET LOCAL`.

### Integration Points
- `server/src/db.ts` — shared Postgres pool; the spike's `withPolicyScope()` helper (if RLS wins) or WHERE-clause helper (if not) will live alongside or be exported from here for Phase 6+ to consume.

</code_context>

<specifics>
## Specific Ideas

No specific UI/behavior examples given — this is a backend security-mechanism phase, and the discussion stayed at the decision level (trust model, backfill value, visibility matrix, resolution approach) rather than surfacing implementation-detail preferences.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The scoped-credential trust model (alternative to D-01) and the union-bucket interpretation of `mixed` (alternative to D-03) were considered and explicitly rejected in favor of the recommended options, not deferred to a later phase.

</deferred>

---

*Phase: 5-Policy-Scope Foundation*
*Context gathered: 2026-08-28*
