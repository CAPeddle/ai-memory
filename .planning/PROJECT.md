# ai-memory

## What This Is

ai-memory is a self-hosted, persistent memory platform for AI coding agents and the person working alongside them. It provides an authenticated MCP surface for capturing append-only knowledge shards, retrieving them through hybrid lexical/vector search and graph traversal, and supporting product-specific experiences such as Developer Memory, Contact Memory, and Workflow Operations.

The active platform is a Deno 2.0 / TypeScript service backed by PostgreSQL 15, pgvector, and Apache AGE. A local .NET synthesis companion remains planned but is not part of the active cloud server.

## Core Value

Knowledge worth retaining must remain accurately recallable across tools, sessions, projects, and time without leaking across policy boundaries.

## Requirements

### Validated

- ✓ Authenticated MCP clients can capture and fetch persistent thoughts — existing platform server
- ✓ Hybrid retrieval combines PostgreSQL full-text ranking and pgvector similarity through RRF, then applies MMR diversity — existing platform server
- ✓ Retrieval can be scoped and boosted by project context — existing platform server
- ✓ Background embedding, entity-extraction, and consolidation workers enrich captured thoughts without blocking capture — existing platform server
- ✓ Apache AGE graph traversal supports bounded parameterized searches and validated read-only openCypher — existing platform server
- ✓ Search quality is measured against a seeded golden corpus with repeatable integration tests — existing test suite
- ✓ Workflow Operations exposes opt-in packet, decision, checkpoint, dashboard, and CLI flows — ST-086/ST-087
- ✓ Contact Memory can parse WhatsApp exports, review proposed facts, and commit approved shards through the platform MCP — existing `contact-memory/` slice

### Active

- [x] Complete ST-088 Stage 2 evidence: price policy-scope enforcement, exercise a remote Ubuntu execution node, audit execution blocking, and finalize ADR-016's host recommendation — **done 2026-08-26**; ADR-016 Accepted, Candidate A rejected
- [ ] Enforce default-deny policy scope across every memory retrieval and provider-egress path ~~before accepting co-tenancy as safe~~ — **rationale corrected 2026-08-26: this is required on ai-memory's own merits, not to make co-tenancy safe.** Co-tenancy was rejected and the obligation is unchanged and topology-neutral (ST-082). The read side carries no `PolicyScope` at all, which is also a precondition of the AWCP adapter contract
- [ ] **Score the standalone peer-service topology** against the six host criteria (ST-100) — the decision directed this and did not conclude it
- [ ] Preserve reliable, idempotent remote execution reporting across disconnection, replay, duplicate delivery, and invalid authentication
- [ ] Keep the existing MCP memory slice operable with observable health, migration safety, and deterministic test isolation
- [ ] Deliver product-specific APIs and curation rules without moving product policy into the shard-storage platform
- [ ] Implement the local Obsidian synthesis companion only when ST-019 is prioritized and its product contract is current

### Out of Scope

- Multi-user collaboration and sharing — the product remains single-user-first until an explicit multi-user milestone
- General-purpose remote shell access — remote execution nodes report and accept only narrowly allow-listed controls
- Platform-level wiki or universal consolidation semantics — curation belongs to Developer Memory or Contact Memory
- Replacing tags with a binary personal/professional profile — ADR-012 established multi-domain tags
- Treating the skeletal .NET solution as the cloud MCP server — it is reserved for the future local synthesis companion
- Reintroducing SQLite/FTS5 as the active cloud storage architecture — ADR-009 and ADR-011 bind the platform to Deno and PostgreSQL

## Context

The repository is mature brownfield work with a functional cloud MCP server, extensive integration coverage, governance tooling, and a continuous-flow story board. Canonical delivery plans currently live in `docs/plans/` and execution state in `.github/planning/story-board.md`; `.planning/` adds GSD-compatible project memory without superseding those artifacts.

Architecture evolved from an early C# / SQLite design to the active Deno / PostgreSQL platform. For Contact Memory work, `docs/architecture/ai_memory_architecture_decisions.md` and ADR-012 supersede conflicting platform-era assumptions. The platform stores append-only shards; product layers own review, promotion, and domain-specific tools.

**Updated 2026-08-26 — ST-088's units are all delivered and the host decision is taken.** ADR-016 is **Accepted** (rev 1.5): **Candidate A is rejected**, and AWCP becomes a **standalone peer service** with its own codebase and runtime, consuming ai-memory as an *optional, replaceable* context provider. It is explicitly **not** Candidate C — ai-memory stays live and is not retired. **ST-088 is Done as of 2026-08-27** — the sign-off PR ([#60](https://github.com/CAPeddle/ai-memory/pull/60)) merged as `86473ac`; the milestone is finished, not in flight, and both WIP slots are free. *(This read "sits in **Review** pending its sign-off PR" until that merge.)* The next boundary is the Horizon B–D milestone, which this closure unblocks.

**A resumed session must not re-plan against the rejected host.** Follow-on work is **ST-100** (score the peer-service topology, which the decision deliberately left unscored) and **ST-082**, whose framing changed: policy-scope enforcement is **ai-memory's own isolation obligation**, topology-neutral and required whether or not AWCP had ever shared this codebase — no longer gated on the host being settled, and no longer a co-tenancy tax. Threading `PolicyScope` through the read side, default-deny, is additionally a precondition of the AWCP adapter contract.

Retained as the record of what was current while the milestone ran: Current work is ST-088. Its first unit priced the policy-scope enforcement surface; the remaining units prove remote-node behavior, assess actual execution blocking, and produce the final ADR-016 host recommendation. ST-082 implements enforcement only after the host decision is settled.

The Docker test stack is isolated from development data but accumulates state during a container lifetime. Provider-dependent tests may fail locally when only placeholder OpenRouter credentials are present, while CI injects real credentials.

## Constraints

- **Architecture**: The active cloud server remains Deno 2.0 / TypeScript / Hono / MCP SDK on PostgreSQL 15 with pgvector and Apache AGE — binding ADR-009/ADR-011 decisions
- **Product boundary**: Platform MCP exposes shard primitives; product MCPs own domain semantics and curation — avoids coupling every product to one promotion model
- **Security**: Policy scope is default-deny for retrieval and model-provider routing — missing scope must never silently broaden access
- **Workflow**: Existing story-board WIP limits remain authoritative: one In Progress story and one in Review
- **Planning interoperability**: Existing `docs/plans/*.md` and story links remain canonical; GSD artifacts summarize and route work rather than silently replacing them
- **Testing**: Integration tests must be idempotent and must not mutate the seeded search corpus
- **Dependencies**: `server/deno.lock` stays frozen during routine work; dependency changes update and commit the lock explicitly
- **Deployment**: Docker is the current platform deployment path; Contact Memory may use its separately approved Supabase deployment model
- **Privacy**: Secrets remain outside version control, and external model-provider egress must be policy-aware and observable

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use Deno 2.0 and PostgreSQL 15 for the cloud MCP server | Matches deployed architecture and supports pgvector plus Apache AGE | ✓ Good |
| Keep the platform append-only and shard-only | Product-specific curation models differ and must not be forced into storage primitives | ✓ Good |
| Use tags rather than a binary profile field | Memories and entities can belong to several products and personas simultaneously | ✓ Good |
| Expose per-product MCP servers over shared platform primitives | Keeps Contact and Developer domain behavior independent | — Pending |
| Require human review for Contact Memory imports | Incorrect facts about real people have meaningful consequences | ✓ Good |
| Treat policy-scope pricing as an ADR-016 acceptance gate | Co-tenancy is unsafe until all retrieval and egress paths have a defended enforcement cost | ✓ Good — **gate discharged 2026-08-26.** Priced at 64+ hrs (findings §13), and the pricing did its job: it fed the decision that **rejected** co-tenancy. Enforcement itself is still unbuilt and stays with ST-082, topology-neutral |
| Keep remote nodes outbound-only with no general-purpose shell | Minimizes attack surface while preserving execution evidence | — Pending |
| Preserve existing board and unified plans alongside GSD tracking | Migration must not discard current delivery history or violate active WIP | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone**:
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-05 after GSD brownfield initialization*
