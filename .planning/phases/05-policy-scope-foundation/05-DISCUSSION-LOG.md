# Phase 5: Policy-Scope Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-28
**Phase:** 5-Policy-Scope Foundation
**Areas discussed:** Trust boundary, Legacy backfill value, Cross-scope visibility matrix, RLS-vs-WHERE resolution approach

---

## Trust boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Caller-declared, single-key trust | Same trust model as the existing `project:X,tags:Y` context string and the single `MEMORY_API_KEY` — any authenticated caller can request any scope by naming it. No per-scope credential. | ✓ |
| Caller-declared, but scoped by a second credential | Introduce a second key/role (e.g. `AWCP_AGENT_API_KEY` pattern) that limits which scopes a given credential may request. | |

**User's choice:** Caller-declared, single-key trust (recommended option).
**Notes:** No additional rationale given beyond accepting the recommendation.

---

## Legacy backfill value

| Option | Description | Selected |
|--------|-------------|----------|
| personal | Most restrictive default — old thoughts visible only to personal-scope requests until re-tagged. | |
| corporate | Chosen because most captured thoughts to date are work/dev content; `personal` would wrongly hide the bulk of existing memory. | ✓ |
| Derive per-row from existing tags/project | Heuristic backfill using ADR-012 tags. More accurate but adds scope and misclassification risk. | |

**User's choice:** corporate — a deliberate deviation from the recommended `personal` default.
**Notes:** User's implicit reasoning matches the `corporate` option's stated rationale (bulk of existing content is work-related); captured as D-02's rationale in CONTEXT.md, flagged `one-way` reversibility since REQUIREMENTS.md excludes legacy-backfill reclassification tooling from this milestone.

---

## Cross-scope visibility matrix

| Option | Description | Selected |
|--------|-------------|----------|
| Strict isolation, public universally visible | `personal`→{personal,public}; `corporate`→{corporate,public}; `mixed`→{mixed,public} only (own bucket, not a union). `public` visible to all automatically. | ✓ |
| mixed is a union bucket | `mixed`→{personal,corporate,mixed,public} — mixed-scope requests see everything. | |
| No implicit public visibility | Every scope sees only its own exact value, including `public` — must be explicitly requested. | |

**User's choice:** Strict isolation, public universally visible (recommended option).
**Notes:** None.

---

## RLS-vs-WHERE resolution approach

| Option | Description | Selected |
|--------|-------------|----------|
| Build the real spike | Prototype `withPolicyScope()` + `FORCE ROW LEVEL SECURITY` against `list_thoughts`; let observed pooled-connection behavior settle DECISION-01. | ✓ |
| Decide now from the research write-up, skip the spike | Pick the mechanism by judgment from STACK.md/ARCHITECTURE.md's existing analysis; spend phase time on migration/vocabulary work instead. | |

**User's choice:** Build the real spike (recommended option).
**Notes:** Matches Phase 5's success criterion #2 wording ("validated by a technical spike") literally.

---

## Claude's Discretion

- Migration mechanics for adding `thoughts.policy_scope` (three-step add-nullable/backfill/set-NOT-NULL vs. faster path).
- Exact spike scaffolding/teardown shape beyond targeting `list_thoughts` and prototyping `withPolicyScope()` + forced RLS.
- Whether `recall_events`/`recall_queries` gain scope columns in this phase or later — deferred to planning since not in this phase's REQUIREMENTS.md scope.

## Deferred Ideas

None — the scoped-credential trust model and the union-bucket `mixed` interpretation were considered as explicit alternatives and rejected, not deferred.
