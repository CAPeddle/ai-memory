---
phase: "05"
slug: "policy-scope-foundation"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-03"
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| MCP caller (`MEMORY_API_KEY`) → `capture_thought` → `thoughts.policy_scope` | First write of the value every later phase trusts for isolation. Hardcoded interim `'corporate'` (D-05); caller-declared scope is CAPTURE-01 (v2). | Thought content + scope label (personal/corporate) |
| `consolidationWorker.ts` → `thoughts.policy_scope` (promote) | Internal write path; carries the source shard's scope forward. | Scope label |
| `migrate.ts` → `public.thoughts` DDL | Runs at server boot against whatever `DATABASE_URL` resolves to. | Schema + irreversible backfill |
| Pooled `postgres.js` connection (`max: 10`) → `app.policy_scope` GUC | A transaction-local session variable must never leak to the next request on the same connection. | Declared scope |
| `ai_memory` role (superuser, table owner) → Postgres RLS | Superusers bypass RLS unconditionally; `FORCE` closes only the owner exemption. | All rows |
| db-test spike → production `public.thoughts` | Phase boundary: the mechanism is proven, not enabled. | — |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01-01 | Information Disclosure | `thoughts.policy_scope` column | high | mitigate | `NOT NULL` + `CHECK` with no `DEFAULT` in both `server/db/007_policy_scope.sql` and `server/db/schema.sql:32-35` | closed |
| T-05-01-02 | Tampering | `capture_thought` `ON CONFLICT ... DO UPDATE` SET list | high | mitigate | `policy_scope` absent from the SET list (`server/index.ts:549-560`); the existing row's scope is never overwritten. See carried-forward note on the conflict key | closed |
| T-05-01-03 | Information Disclosure | capture + promote INSERT sites | high | mitigate | Both INSERTs state `policy_scope` explicitly: `'corporate'` at `server/index.ts:533,545`; carried forward at `server/src/consolidationWorker.ts:124,127`. No other production `INSERT INTO thoughts` exists | closed |
| T-05-01-04 | Denial of Service | 007 `ADD CONSTRAINT` re-applied | medium | mitigate | `DO $$ IF NOT EXISTS (... pg_constraint ...)` guard in 007. Name-only lookup noted as review WR-01 (non-blocking) | closed |
| T-05-01-05 | Denial of Service / Repudiation | `seed` corpus load into db-test | medium | mitigate | `psql -v ON_ERROR_STOP=1` on marker and corpus loads (`docker-compose.yml:114`) | closed |
| T-05-01-SC | Tampering | package installs | n/a | accept | No installs in this plan | closed |
| T-05-02-01 | Elevation of Privilege | RLS predicate (spike, db-test) | critical | mitigate | Spike runs as `ai_memory_rls_spike`, asserted `rolsuper = false` / `rolbypassrls = false` (`server/tests/policy-scope-rls-spike.test.ts:96-101`); `FORCE ROW LEVEL SECURITY` (`:122`) | closed |
| T-05-02-01b | Elevation of Privilege | Production RLS enablement | critical | accept (transferred to Phase 6) | ADR-018 Non-Goals states a non-superuser application role is a precondition of Phase 6 enablement | closed |
| T-05-02-02 | Elevation of Privilege / Information Disclosure | RLS `USING` fail-closed guard | critical | mitigate | Allow-list `current_setting('app.policy_scope', true) IN (...)` (`rls-spike.test.ts:128`), proven by spike case (d) | closed |
| T-05-02-03 | Information Disclosure | pooled connection GUC scoping | high | mitigate | `set_config('app.policy_scope', scope, true)` inside `client.begin()` (`server/src/policyScope.ts`) | closed |
| T-05-02-04 | Denial of Service / Elevation of Privilege | production `public.thoughts` | critical | accept (deferred to Phase 6) | No `ROW LEVEL SECURITY` DDL or `withPolicyScope` call in production code (`server/db`, `server/index.ts`, `server/src`); RLS applied only inside the spike's `try/finally` | closed |
| T-05-02-SC | Tampering | package installs | n/a | accept | No installs in this plan | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Carried forward (not in the plan-time register)

- **Cross-scope merge through the global conflict key** (code review WR-02). `UNIQUE (content_fingerprint)` makes identical content in two scopes collapse into one row. Latent in v1.1 because every capture writes `'corporate'`; becomes a cross-scope write once CAPTURE-01 lands, or an existence oracle under RLS. Recorded as **open, precondition of capture-side scope and Phase 6** in ADR-018's threat table (2026-11-03). Phase 6 planning must take it up.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-02-01b | Enabling RLS while the app connects as superuser would be a silent no-op; deferred to Phase 6 with the non-superuser role as a stated precondition (ADR-018) | Plan 05-02 (PO accepted ADR-018 at UAT) | 2026-11-03 |
| AR-05-02 | T-05-02-04 | Deliberate phase boundary: enabling RLS before every path is scoped would fail every unscoped path closed (RESEARCH Pitfall 1) | Plan 05-02 (PO accepted ADR-018 at UAT) | 2026-11-03 |
| AR-05-03 | T-05-01-SC, T-05-02-SC | No package installs occurred | Plans 05-01, 05-02 | 2026-11-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-03 | 12 | 12 | 0 | gsd-secure-phase orchestrator (ASVS L1 grep-depth; auditor short-circuited per register-at-plan-time rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-03
