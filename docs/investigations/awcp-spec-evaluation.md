# AWCP Requirements Spec — Critical Evaluation & Overlap Analysis

**Type:** Investigation / spec evaluation (Tier 2 reference)
**Date:** 2026-07-27
**Subject:** `agentic_workflow_control_plane_requirements.docx` v1.0 (draft baseline, 27 July 2026) — the "Agentic Workflow Control Plane" (AWCP)
**Question posed:** Evaluate the AWCP spec critically, establish feasibility, and identify functional overlap with ai-memory (and the Prism LLM wiki project, which targets Confluence and Azure DevOps).
**Verdict:** The spec is well-written but **over-scoped by roughly 3× for its stated problem** (supervising 2–3 concurrent agent sessions). Its operational core — run supervision, checkpoints, handoffs, verification contracts, approval-gated writes — is genuinely novel and **does not overlap** ai-memory. But two whole subsystems (**§9.11 Knowledge, most of §9.4 Context assembly**) re-specify what ai-memory already is, and one ai-memory feature (**SRS §5.6 Storyboard**) collides head-on with AWCP's work board. The biggest defect is that the spec defers the three-system boundary decision (AWCP / ai-memory / Prism) to an "open implementation decision" (OD-01) when it is actually a **requirements-scoping decision that must be made first**.

---

## TL;DR

- **Build-worthy core (no overlap):** agent-run registration and lifecycle events, attention-queue dashboard, checkpoints/handoffs, verification contracts with evidence freshness, approval ledger for Jira/Confluence/ADO writes. Nothing in ai-memory or (per the spec's own description) Prism does this. This is AWCP's legitimate identity.
- **Overlapping subsystems that should become integration contracts, not build items:**
  - **FR-KNOW (§9.11)** ≈ ai-memory's platform + the deferred Developer Memory product: decisions with rationale/provenance, rejected approaches, full-text search, domain isolation, promotion gates. ai-memory already ships hybrid search (BM25+vector, RRF k=60, MMR), append-only versioned shards, tags (ADR-012), and context scoping (ADR-008).
  - **FR-CTX (§9.4, partially)** — bounded, provenance-aware, relevance-limited retrieval is ai-memory's core competency; building a second ranking/relevance engine inside AWCP duplicates it.
  - **ExternalSnapshot / Confluence capture (FR-INT-003)** — likely overlaps Prism's Confluence/ADO ingestion (unverifiable from this repo; see §6 caveat).
- **Reverse overlap:** ai-memory SRS §5.6 **Storyboard** (FR-B-001..009 — stateful task board, agent story claiming, WIP limits, status state machine) is a WorkPacket-lite. If AWCP is built, the Storyboard tier is largely superseded; running both means two competing task boards.
- **Feasibility:** Stage 1 is feasible and high-value. Stage 2 hinges entirely on corporate API auth (OD-05) — currently unverified. Stage 3 is feasible for Claude Code, **structurally weak for Copilot** (no Agent Mode ⇒ no reliable events ⇒ the human becomes the event bus, reintroducing the supervision cost the system exists to remove). Full spec as written: 6–12+ months of part-time effort even agent-assisted.
- **Recommendation:** re-partition before any schema is designed — AWCP owns *operational* state; ai-memory owns *knowledge* state (as a local deployment for corporate content); Prism owns *source-document* knowledge. Ten clarifying questions in §7.

---

## 1. What AWCP is

A local-first, single-user (Windows/WSL2) control plane wrapping Claude Code (PowerShell) and Copilot Chat (VS Code multi-root, explicitly *not* Agent Mode). It models WorkItems → WorkPackets → AgentRuns, ingests lifecycle events via hooks/CLI, assembles bounded context packages, gates completion on VerificationContracts with evidence-freshness tracking, gates all Jira/Confluence/ADO writes behind an approval ledger, and promotes reusable learning into KnowledgeItems. ~120 requirements (the large majority Must), 10 acceptance scenarios, 5 delivery stages, a trust-progression model (Levels 1–5), and event-sourced storage with rebuildable state.

---

## 2. Spec quality — strengths

Credit where due; this is an unusually disciplined requirements document:

- **Testable acceptance scenarios** (AC-01..AC-10) that map cleanly to objectives; AC-04 (completion gate) and AC-07 (stale evidence) are genuinely well-chosen falsifiable tests.
- **Boundary discipline:** P-05 (wrap, don't reimplement native workflow artefacts), explicit non-goals (§3.2), and FR-WF-009 (no modification of Claude Code/Copilot/GSD/CE source) prevent the most common failure mode of meta-tooling.
- **FR-VER-011** ("an agent's natural-language claim of completion shall never by itself satisfy completion") is the single best requirement in the document and the heart of its value proposition.
- **Honest risk register** — it names its own two biggest risks ("dashboard becoming another maintenance burden", "existing Prism overlap") even if it under-mitigates them.
- The **trust-progression model** (§14.1) and stage-acceptance rule (§17.1, no parallel entity representations) show real architectural maturity.

---

## 3. Spec quality — critical defects

### 3.1 Scale/value mismatch (the structural problem)

The stated problem is the mental cost of supervising **two or three** concurrent sessions for **one operator**. The specified solution is an enterprise-grade system: event sourcing with rebuildable projections (FR-DATA-002, NFR-REL-004), an immutable approval/audit ledger with rollback (FR-APP, NFR-AUD), WCAG 2.1 AA web app, a CLI, an MCP server, a VS Code extension, three enterprise integration adapters, a delivery graph, contradiction detection over knowledge (FR-KNOW-007), and daily automated backups. Roughly 90 of ~120 requirements are Must. The spec's own risk row ("dashboard becoming another maintenance burden") is the correct diagnosis, but "single-user scope, adapter boundaries" is not a sufficient mitigation for a Must-list this size — the mitigation is **cutting Musts**. Stage 1 alone covers most of OBJ-01/OBJ-02; Stages 2 and 3 are each a product in their own right.

### 3.2 The Copilot assumption is load-bearing and weak

Without Agent Mode, Copilot Chat cannot autonomously call MCP tools or emit lifecycle events. The spec's answer is "manual or prompt-assisted registration" (FR-RUN-002) and prompt-assisted checkpoints (OD-07, risk row). That means **the operator is the event bus for one of the two agent products** — manually prompting for checkpoints, manually registering runs, manually relaying evidence. This directly re-imports the supervision cost the system exists to eliminate, yet AC-01 and AC-02 (both acceptance-blocking) depend on Copilot observability. Either Copilot support should be downgraded to a Should with degraded-mode semantics spelled out, or the Agent Mode prohibition (constraint §18.2) deserves re-examination — it is listed as a constraint but never justified.

### 3.3 Event sourcing is architectural romance for this scale

FR-DATA-001/002 + NFR-REL-004 commit to append-only events *plus* rebuildable derived state *plus* versioned migrations for both. For one user and ~100k events, a conventional transactional schema with an append-only audit table satisfies every actual need expressed in NFR-AUD at perhaps a third of the implementation and migration cost. "Current state shall be rebuildable from the event log" is the kind of requirement that costs months and is exercised approximately never. It should be a Could, or reworded to "auditably reconstructable" (which an audit table gives you).

### 3.4 Verification is only as strong as evidence capture

- **FR-VER-005 (scope drift)** requires file-change events. Claude Code hooks can supply these; Copilot cannot. Scope-drift detection is therefore effectively Claude-only, but the requirement (and AC-05) doesn't say so.
- **FR-VER-004** ("ingest **or execute** approved test, build, lint… commands") quietly makes AWCP a build runner — a large scope increase with sandboxing, environment, and credential implications. For corporate ADO repos the builds already run in ADO; FR-VER-012 (ingest ADO PR/build results — currently only Should) is the right mechanism and should be promoted to Must, with local execution demoted or cut.
- **Staleness semantics are underspecified:** FR-VER-009 invalidates evidence "when the verified branch changes". For a multi-repo WorkPacket, does *any* bound repo changing invalidate *all* evidence? Do rebases/squash-merges (which rewrite commits without changing content) trip it? As written this will generate false-stale noise, and noise kills attention queues.

### 3.5 Attention classification is asserted, not specified

FR-SUP-003/004 require classifying runs as "potential scope drift", "repeated failure", "decision required" and suppressing "low-consequence implementation questions permitted by the WorkPacket". These classifications are the product's core value, and there is no requirement describing how they are derived, tuned, or corrected when wrong. A misclassifying attention queue is worse than terminals side-by-side: it trains the operator to ignore it. At minimum there should be requirements for (a) explainability per event (§15.2 gestures at this), (b) operator feedback/correction, and (c) precision over recall as an explicit design bias.

### 3.6 The boundary decision is misfiled

OD-01 ("extend Prism vs separate backend, later integration") is framed as an implementation choice to defer. It is not — it determines whether §9.11, half of §9.4, and the ExternalSnapshot entity are *requirements of this system at all*. Deferring it means Stage 1 schema design bakes in KnowledgeItem, ExternalSnapshot, and context-assembly tables that a later integration decision would orphan — in direct tension with the spec's own §17.1 rule against parallel representations. The three-way split (AWCP / ai-memory / Prism) must be decided **before** Stage 1, and §4–§5 below is the input to that decision.

### 3.7 Smaller issues

- **FR-WF-007** (Compound phase must yield a KnowledgeItem or a written N/A rationale) is process discipline that reliably degenerates into "N/A" spam. Should, not Must.
- **FR-KNOW-007** (detect contradictory approved decisions) casually specifies a hard open problem as a Must. Semantic contradiction detection doesn't exist in ai-memory, Prism, or anywhere else on this stack; as a Must it will either be vacuous (string matching) or block acceptance.
- **NFR-PERF numbers** (2 s dashboard at 100k events, 500 ms p95 event ack) are reasonable but arbitrary — fine, but they imply load-test tooling nobody will build for a single-user tool; treat as design targets, not acceptance gates.
- **Windows/WSL2 split:** hooks fire in PowerShell, backend lives in WSL2. Cross-boundary localhost and path mapping (NFR-COMP-004) is exactly the class of friction this repo already documents (`docs/wsl2-setup.md` — `127.0.0.1` vs `localhost`). Feasible, but budget real time for it.

---

## 4. Functional overlap with ai-memory

ai-memory today (per SRS v1.1, ADR-001..012, and the Contact Memory architecture decisions record): an append-only, versioned shard store with tags (ADR-012), hybrid BM25+vector search fused by RRF with MMR re-ranking (ADR-003), AGE graph traversal, provenance fields, context scoping (ADR-008), a platform MCP (`capture_thought`, `search_thoughts`, `list_thoughts`, `fetch`, graph tools), and per-product MCPs (Contact live-track; **Developer Memory deferred**).

| AWCP area | ai-memory counterpart | Overlap | Assessment |
|---|---|---|---|
| §9.11 FR-KNOW-001/002 (decisions, rejected approaches, provenance) | Shards with `decision`/`constraint` tags + provenance; Developer MCP's planned `search_decisions`, `log_constraint` | **High** | This *is* the Developer Memory product. Building it inside AWCP forks the roadmap. |
| FR-KNOW-005 (full-text search over knowledge) | Hybrid search (BM25+vector+RRF+MMR) — ai-memory's core | **Total** | AWCP would rebuild a strictly worse search engine. |
| FR-KNOW-004 (proposed → approved promotion) | Contact Memory's human review gate pattern; platform stays append-only, curation is product-layer | **High (pattern)** | The promotion-gate pattern already exists; AWCP is just another product-layer curator. |
| FR-KNOW-010 / FR-CTX-010 / NFR-SEC-005 (professional/personal domain isolation) | ADR-012 tags + ADR-008 context scoping | **High** | Same problem, already solved once. Two isolation vocabularies is a security bug factory. |
| §9.4 FR-CTX-001..005 (bounded, provenance-aware, relevance-limited context) | `search_thoughts` scoping, MMR diversity, planned `get_project_context` | **Substantial** | The retrieval/ranking half of context assembly duplicates ai-memory. The *assembly* half (packet binding, freshness markers, phase awareness) is legitimately AWCP. |
| FR-INT-005/009 (provenance, source vs interpretation vs generated) | Shard `source`/provenance fields; append-only versioning | **Moderate** | Same data-modelling philosophy; reusable rather than conflicting. |
| Domain model: WorkItem/WorkPacket/work board (§8, §15.1) | **SRS §5.6 Storyboard** (FR-B-001..009): stateful task board, agent story claiming, WIP=1 limit, `todo→in-progress→review→done` state machine, story↔memory links, context pull at pickup | **Head-on collision (reverse direction)** | AWCP's work board is a superset of the Storyboard. Running both = two task boards with divergent state. One must yield. |
| §9.3 runs/events, §9.6 attention, §9.7 handoffs, §9.9 verification, §9.10 approvals | — nothing | **None** | AWCP's legitimate, novel core. |

**Deployment tension:** ai-memory's platform MCP is cloud-hosted (CLAUDE.md), and Contact Memory targets Supabase cloud. AWCP's NFR-SEC-006 forbids transmitting corporate content to external cloud services by default. So "delegate knowledge to ai-memory" concretely means **a second, local ai-memory deployment** (the existing Docker Compose stack inside WSL2 is precisely this — feasible today) with corporate content isolated to it. That is a real operational consideration, not a blocker.

**Maturity caveat in the other direction:** the Developer Memory product layer that AWCP would ideally call (`search_decisions`, `get_project_context`) is *deferred* in ai-memory's own roadmap. The platform primitives (`capture_thought` + tags + `search_thoughts`) are live and sufficient for decisions/lessons storage now, but AWCP integrating with ai-memory would effectively *become the forcing function* for Developer Memory — which is arguably healthy, but should be a conscious choice.

---

## 5. Functional overlap with Prism (inferred)

**Caveat:** there are zero references to Prism anywhere in this repository; this section works only from the AWCP spec's own three mentions (FR-KNOW-008, the risk register, OD-01) and the user's description ("LLM wiki, focused on Atlassian Confluence and Azure DevOps"). Verification against Prism's actual capabilities is Question 1 in §7.

Inferred overlap surface:

- **FR-INT-003 (capture and version Confluence page content as source snapshots)** and the ADO read integration (§11) are presumably Prism's home turf. If Prism already snapshots/indexes Confluence pages and ADO artefacts, AWCP's ExternalSnapshot entity should store *references + hashes into Prism*, not a third copy of page content.
- **§10.1 (one-pager → epic/story decomposition)** needs exactly the Confluence understanding a wiki-focused LLM project builds. The decomposition *workflow* (draft gating, omission diffing FR-PLAN-006, approval-controlled Jira writes) is AWCP; the *source comprehension and retrieval* is Prism-shaped.
- **FR-KNOW-008** already concedes the point ("integrate with or reuse the existing Prism knowledge service where doing so does not couple operational state to wiki page structure") — the right instinct, wrongly demoted to a Should while §9.11 simultaneously specifies a full native knowledge service as Must. These cannot both stand.

The resulting **three-system problem**: knowledge storage, search, provenance, and promotion are currently specified/implemented in *three places* — ai-memory (shipping), Prism (per description), and AWCP §9.11 (specified). Without an explicit partition, the end state is three overlapping knowledge stores with three promotion models and three search implementations, maintained by one person.

---

## 6. Feasibility assessment

| Stage | Verdict | Notes |
|---|---|---|
| **Stage 1** — session control (packets, Claude run registration, checkpoints, attention dashboard, MCP core, CLI, current-work artefact) | **Feasible, high value** | Claude Code's hook system (SessionStart/PostToolUse/Stop etc.) gives real lifecycle events; a CLI event poster + SQLite/WAL + small web dashboard is weeks, not months, of agent-assisted work. This stage alone delivers most of OBJ-01/02. Copilot runs are manual-registration-only here, which is honest. |
| **Stage 2** — Jira/Confluence/ADO reads, decomposition, approved Jira writes | **Conditional — gated on OD-05** | Everything hinges on corporate policy permitting API tokens (§18.3 lists it as a dependency; nothing verifies it). If auth is denied, Stage 2's headline feature collapses to copy-paste import, and the spec has no stated fallback. Resolve OD-05 *before* committing to Stage 2 scope. Also where Prism overlap bites hardest. |
| **Stage 3** — verification contracts, evidence freshness, scope drift, independent review, knowledge promotion | **Feasible for Claude Code; structurally weak for Copilot** | Evidence freshness and completion gating are straightforward given Stage 1 events + ADO build ingestion. Scope drift needs file-change events → Claude-only in practice. FR-KNOW-007 contradiction detection is not feasible as specified. Knowledge promotion should be delegated to ai-memory (§4). |
| **Stage 4** — VS Code extension, notifications, briefs, backup hardening | **Feasible, routine** | Thin-client discipline (FR-IF-006) keeps this cheap if the API is clean. |
| **Stage 5** — Ubuntu client, Tailscale, spooling, personal domain | **Feasible, low risk** | Correctly last and mostly Could. |

**Whole-spec effort:** as written, a realistic 6–12+ months of sustained part-time effort even with agent assistance — for a tool whose purpose is saving supervision minutes per day. The payback math only works if the Must-list shrinks to the operational core and the knowledge/context layers are delegated. The spec's own "maintenance burden" risk is the one most likely to kill it.

---

## 7. Clarifying questions (blocking, in priority order)

1. **Prism ground truth:** What does Prism actually do *today* — Confluence/ADO ingestion? snapshotting? search? wiki generation? What store and interfaces? The three-way partition (and OD-01) cannot be decided without this inventory.
2. **Where does the knowledge plane live?** Recommend: decisions/lessons/rejected approaches → ai-memory (local deployment, tags per ADR-012); source-document knowledge (Confluence/ADO) → Prism; AWCP stores only links + provenance references. Do you accept that partition, and should §9.11 be rewritten as an integration contract accordingly?
3. **Corporate policy (OD-05, and the ai-memory variant):** Is API-token auth for Jira/Confluence/ADO actually obtainable? And is storing corporate-derived summaries/decisions in a *local* ai-memory instance acceptable to company policy (given the cloud instance presumably is not)?
4. **Storyboard's fate:** If AWCP owns WorkItems/WorkPackets, does ai-memory's Storyboard (SRS §5.6, FR-B-001..009, UC-3) get superseded/retired? Two task boards is the worst outcome. (This would need an ADR in this repo.)
5. **MVP appetite:** Is Stage 1 alone shippable and worth validating for 4–6 weeks before any Stage 2/3 commitment? (Recommended — it also generates the run/event data needed to design attention heuristics empirically rather than speculatively.)
6. **Copilot posture:** Is manual/prompt-assisted Copilot supervision acceptable for v1 (downgrading FR-RUN-002 and AC-02's Copilot leg to Should), or is the no-Agent-Mode constraint (§18.2) actually negotiable? What justifies it currently — policy, licensing, or preference?
7. **Event sourcing:** Will you accept transactional store + append-only audit table as satisfying NFR-AUD, demoting "rebuildable from events" (FR-DATA-002/NFR-REL-004) to Could?
8. **Verification execution:** Should AWCP ever *execute* test/build commands (FR-VER-004), or only *ingest* results from agent runs and ADO builds (promoting FR-VER-012 to Must)?
9. **Shared isolation vocabulary:** Should ADR-012's tag model (`professional`, `personal`, `project:*`) be adopted as the single domain-isolation vocabulary across all three systems, so FR-KNOW-010/FR-CTX-010/NFR-SEC-005 inherit one implementation?
10. **Developer Memory forcing function:** If AWCP delegates knowledge to ai-memory, it becomes the first real consumer of the deferred Developer Memory product layer. Do you want AWCP requirements to explicitly drive that spec (tool contract for `record_decision`/`search_decisions`), or should AWCP use raw platform primitives (`capture_thought` + tags) until Developer Memory is designed?

---

## 8. Recommended next step

Do not begin AWCP Stage 1 schema design until Questions 1–4 are answered. Then: cut the Must-list to the operational core (§9.2, §9.3, §9.6, §9.7, §9.9 minus local execution, §9.10), rewrite §9.11 and the retrieval half of §9.4 as integration requirements against ai-memory and Prism, and record the three-system partition as an ADR in each affected repo (in ai-memory, it would also resolve the Storyboard question). AWCP is a good idea wearing a spec two sizes too big; the overlap analysis is the tailor.
