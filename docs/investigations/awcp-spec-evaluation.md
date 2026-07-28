# AWCP Requirements Spec — Critical Evaluation & Overlap Analysis

**Type:** Investigation / spec evaluation (Tier 2 reference)
**Date:** 2026-07-27
**Revision:** 1.1 — revised per PO review on PR #31: the remedy is **consolidation, not partition** — one deployable product/runtime with modular operational-control, source/wiki, and memory capabilities, and one authoritative work-state model. Prism and ai-memory capabilities may survive as modules, schemas, or migrated components, but not as three separately operated workflow products. Also corrected: the tags-isolation overlap is partial (vocabulary shipped, enforcement not yet), and scope-drift observability is repo-state-derivable, not Claude-only. The overlap diagnosis (§4–§5) is unchanged.
**Subject:** `agentic_workflow_control_plane_requirements.docx` v1.0 (draft baseline, 27 July 2026) — the "Agentic Workflow Control Plane" (AWCP)
**Question posed:** Evaluate the AWCP spec critically, establish feasibility, and identify functional overlap with ai-memory (and the Prism LLM wiki project, which targets Confluence and Azure DevOps).
**Verdict:** The spec is well-written but **over-scoped by roughly 3× for its stated problem** (supervising 2–3 concurrent agent sessions). Its operational core — run supervision, checkpoints, handoffs, verification contracts, approval-gated writes — is genuinely novel and **does not overlap** ai-memory. But two whole subsystems (**§9.11 Knowledge, most of §9.4 Context assembly**) re-specify what ai-memory already is, and one ai-memory feature (**SRS §5.6 Storyboard**) collides head-on with AWCP's work board. The biggest defect is that the spec defers the three-system boundary decision (AWCP / ai-memory / Prism) to an "open implementation decision" (OD-01) when it is actually a **requirements-scoping decision that must be made first**.

---

## TL;DR

- **Build-worthy core (no overlap):** agent-run registration and lifecycle events, attention-queue dashboard, checkpoints/handoffs, verification contracts with evidence freshness, approval ledger for Jira/Confluence/ADO writes. Nothing in ai-memory or (per the spec's own description) Prism does this. This is AWCP's legitimate identity.
- **Overlapping subsystems that should be served by one shared engine, not rebuilt:**
  - **FR-KNOW (§9.11)** ≈ ai-memory's platform + the deferred Developer Memory product: decisions with rationale/provenance, rejected approaches, full-text search, domain isolation, promotion gates. ai-memory already ships hybrid search (BM25+vector, RRF k=60, MMR), append-only versioned shards, tags (ADR-012), and context scoping (ADR-008).
  - **FR-CTX (§9.4, partially)** — bounded, provenance-aware, relevance-limited retrieval is ai-memory's core competency; building a second ranking/relevance engine inside AWCP duplicates it.
  - **ExternalSnapshot / Confluence capture (FR-INT-003)** — likely overlaps Prism's Confluence/ADO ingestion (unverifiable from this repo; see §6 caveat).
- **Reverse overlap:** ai-memory SRS §5.6 **Storyboard** (FR-B-001..009 — stateful task board, agent story claiming, WIP limits, status state machine) is a WorkPacket-lite. If AWCP is built, the Storyboard tier is largely superseded; running both means two competing task boards.
- **Feasibility:** Stage 1 is feasible and high-value. Stage 2 hinges entirely on corporate API auth (OD-05) — currently unverified. Stage 3's evidence/drift machinery is feasible **agent-agnostically** via repository-state observability (git, worktrees, commits, PRs, ADO builds); what stays weak for Copilot without Agent Mode is *lifecycle* observability — checkpoints and decision narration, where the human becomes the event bus. Full spec as written: 6–12+ months of part-time effort even agent-assisted.
- **Recommendation (revised per PO review):** **consolidate before any schema is designed** — one local deployable product with modular operational-control, source/wiki, and memory capabilities, and **one authoritative work-state model**. Choose a host product (§7), define module boundaries, and write a supersession/migration plan for the other two systems' concepts. ai-memory's OpenRouter dependency is a replaceable adapter, not a boundary. Ten clarifying questions in §8.

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

- **FR-VER-005 (scope drift)** conflates two observability channels. *Agent lifecycle* events (file-change notifications from hooks) are strong for Claude Code and absent for Copilot — but *repository-state* observability (git status, worktree/branch ownership, commit and PR diffs, ADO evidence) is agent-agnostic and sufficient to detect out-of-scope changes regardless of which agent made them. The spec should require repo-state-based drift detection as the baseline, with lifecycle events as enrichment (attribution, earlier warning). As written, the requirement implies event-driven detection and thereby understates what's achievable for Copilot runs.
- **FR-VER-004** ("ingest **or execute** approved test, build, lint… commands") quietly makes AWCP a build runner — a large scope increase with sandboxing, environment, and credential implications. For corporate ADO repos the builds already run in ADO; FR-VER-012 (ingest ADO PR/build results — currently only Should) is the right mechanism and should be promoted to Must, with local execution demoted or cut.
- **Staleness semantics are underspecified:** FR-VER-009 invalidates evidence "when the verified branch changes". For a multi-repo WorkPacket, does *any* bound repo changing invalidate *all* evidence? Do rebases/squash-merges (which rewrite commits without changing content) trip it? As written this will generate false-stale noise, and noise kills attention queues.

### 3.5 Attention classification is asserted, not specified

FR-SUP-003/004 require classifying runs as "potential scope drift", "repeated failure", "decision required" and suppressing "low-consequence implementation questions permitted by the WorkPacket". These classifications are the product's core value, and there is no requirement describing how they are derived, tuned, or corrected when wrong. A misclassifying attention queue is worse than terminals side-by-side: it trains the operator to ignore it. At minimum there should be requirements for (a) explainability per event (§15.2 gestures at this), (b) operator feedback/correction, and (c) precision over recall as an explicit design bias.

### 3.6 The boundary decision is misfiled

OD-01 ("extend Prism vs separate backend, later integration") is framed as an implementation choice to defer. It is not — it determines whether §9.11, half of §9.4, and the ExternalSnapshot entity are *requirements of this system at all*. Deferring it means Stage 1 schema design bakes in KnowledgeItem, ExternalSnapshot, and context-assembly tables that a later integration decision would orphan — in direct tension with the spec's own §17.1 rule against parallel representations. The three-way ownership question (AWCP / ai-memory / Prism) must be decided **before** Stage 1; §4–§5 are the input and §7 is the proposed resolution (consolidation into a single host product).

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
| FR-KNOW-010 / FR-CTX-010 / NFR-SEC-005 (professional/personal domain isolation) | ADR-012 tags + ADR-008 context scoping | **Partial / planned** | The *classification vocabulary* is shipped (tag grammar, reserved tags, GIN-indexed column), but enforcement is not: `parseContext` parses `tags` into scope, yet `searchQuality.ts` never consumes `scope.tags` as a retrieval filter, and free-form tags are not a security boundary. AWCP's NFR-SEC-005 demands *enforced* isolation — a gap the consolidated product must close (enforced filters or separate scopes), not inherit. Two isolation vocabularies would still be a bug factory; the fix is one vocabulary *plus* enforcement. |
| §9.4 FR-CTX-001..005 (bounded, provenance-aware, relevance-limited context) | `search_thoughts` scoping, MMR diversity, planned `get_project_context` | **Substantial** | The retrieval/ranking half of context assembly duplicates ai-memory. The *assembly* half (packet binding, freshness markers, phase awareness) is legitimately AWCP. |
| FR-INT-005/009 (provenance, source vs interpretation vs generated) | Shard `source`/provenance fields; append-only versioning | **Moderate** | Same data-modelling philosophy; reusable rather than conflicting. |
| Domain model: WorkItem/WorkPacket/work board (§8, §15.1) | **SRS §5.6 Storyboard** (FR-B-001..009): stateful task board, agent story claiming, WIP=1 limit, `todo→in-progress→review→done` state machine, story↔memory links, context pull at pickup | **Head-on collision (reverse direction)** | AWCP's work board is a superset of the Storyboard. Running both = two task boards with divergent state. One must yield. |
| §9.3 runs/events, §9.6 attention, §9.7 handoffs, §9.9 verification, §9.10 approvals | — nothing | **None** | AWCP's legitimate, novel core. |

**Provider dependency is an adapter, not a boundary (revised per PO review):** ai-memory's platform currently calls OpenRouter for embeddings and entity extraction, and its reference deployment is cloud-hosted — but neither is structural, and neither justifies running corporate knowledge in a *second, separately operated* ai-memory instance. The external-LLM surface is narrow (embedding generation + entity extraction) and should be restated as a **replaceable-adapter requirement** of the consolidated product with three implementations: a local model (Ollama/ONNX-class), a corporate-approved provider, or a **lexical-only degraded mode** — the RRF fusion pipeline already degrades naturally to the BM25 lane when the vector lane is absent, and the entity worker is an optional enrichment. AWCP's NFR-SEC-006 is then satisfied by provider configuration inside one product, not by system boundaries.

**Maturity caveat in the other direction:** the Developer Memory layer AWCP's knowledge needs would call (`search_decisions`, `get_project_context`) is *deferred* in ai-memory's own roadmap. The platform primitives (`capture_thought` + tags + `search_thoughts`) are live and sufficient for decisions/lessons storage now; in a consolidated product, AWCP's knowledge requirements effectively *become* the Developer Memory module's spec — which is arguably healthy, but should be a conscious choice.

---

## 5. Functional overlap with Prism (inferred)

**Caveat:** there are zero references to Prism anywhere in this repository; this section works only from the AWCP spec's own three mentions (FR-KNOW-008, the risk register, OD-01) and the user's description ("LLM wiki, focused on Atlassian Confluence and Azure DevOps"). Verification against Prism's actual capabilities is Question 1 in §7.

Inferred overlap surface:

- **FR-INT-003 (capture and version Confluence page content as source snapshots)** and the ADO read integration (§11) are presumably Prism's home turf. Whatever the consolidation outcome, page content should be stored and versioned **once** — in the consolidated product's source/wiki module — with ExternalSnapshot reduced to references + hashes into that single store, never a second or third copy.
- **§10.1 (one-pager → epic/story decomposition)** needs exactly the Confluence understanding a wiki-focused LLM project builds. The decomposition *workflow* (draft gating, omission diffing FR-PLAN-006, approval-controlled Jira writes) is AWCP; the *source comprehension and retrieval* is Prism-shaped.
- **FR-KNOW-008** already concedes the point ("integrate with or reuse the existing Prism knowledge service where doing so does not couple operational state to wiki page structure") — the right instinct, wrongly demoted to a Should while §9.11 simultaneously specifies a full native knowledge service as Must. These cannot both stand.

The resulting **three-system problem**: knowledge storage, search, provenance, and promotion are currently specified/implemented in *three places* — ai-memory (shipping), Prism (per description), and AWCP §9.11 (specified). The remedy (per PO direction) is **consolidation, not partition**: the end state shall be **one deployable control plane and one authoritative work model**. Prism and ai-memory capabilities may survive as modules, schemas, or migrated components inside that product — but not as three separately operated workflow products. This should be captured as an explicit requirement in the AWCP spec's next revision (a strengthened §17.1: no parallel entity representations *and* no parallel running systems for the same workflow).

---

## 6. Feasibility assessment

| Stage | Verdict | Notes |
|---|---|---|
| **Stage 1** — session control (packets, Claude run registration, checkpoints, attention dashboard, MCP core, CLI, current-work artefact) | **Feasible, high value** | Claude Code's hook system (SessionStart/PostToolUse/Stop etc.) gives real lifecycle events; a CLI event poster + SQLite/WAL + small web dashboard is weeks, not months, of agent-assisted work. This stage alone delivers most of OBJ-01/02. Copilot runs are manual-registration-only here, which is honest. |
| **Stage 2** — Jira/Confluence/ADO reads, decomposition, approved Jira writes | **Conditional — gated on OD-05** | Everything hinges on corporate policy permitting API tokens (§18.3 lists it as a dependency; nothing verifies it). If auth is denied, Stage 2's headline feature collapses to copy-paste import, and the spec has no stated fallback. Resolve OD-05 *before* committing to Stage 2 scope. Also where Prism overlap bites hardest. |
| **Stage 3** — verification contracts, evidence freshness, scope drift, independent review, knowledge promotion | **Feasible agent-agnostically for the evidence/drift core; Copilot weakness is confined to lifecycle narration** | Two observability channels must be kept distinct. *Repository-state observability* — git status, worktree/branch ownership, commits, PR diffs, ADO build/PR evidence — is agent-agnostic and carries evidence freshness, completion gating, and scope-drift detection regardless of which agent did the work. *Agent lifecycle observability* — checkpoints, decisions, blockers — is strong for Claude Code (hooks) and weak for Copilot without Agent Mode; that degrades semantic narration and attribution, not drift detection. FR-KNOW-007 contradiction detection is not feasible as specified. Knowledge promotion lands in the consolidated product's memory module (§4, §7). |
| **Stage 4** — VS Code extension, notifications, briefs, backup hardening | **Feasible, routine** | Thin-client discipline (FR-IF-006) keeps this cheap if the API is clean. |
| **Stage 5** — Ubuntu client, Tailscale, spooling, personal domain | **Feasible, low risk** | Correctly last and mostly Could. |

**Whole-spec effort:** as written, a realistic 6–12+ months of sustained part-time effort even with agent assistance — for a tool whose purpose is saving supervision minutes per day. The payback math only works if the Must-list shrinks to the operational core and the knowledge/context layers are served by the consolidated product's shared modules rather than rebuilt. The spec's own "maintenance burden" risk is the one most likely to kill it.

---

## 7. Consolidation-first end state and host assessment (revised per PO review)

**End-state requirement:** one local deployable product/runtime containing three modules — **operational control** (packets, runs, attention, approvals, verification), **source/wiki** (Confluence/ADO ingestion, snapshots, comprehension), and **memory** (shards, decisions, hybrid search, promotion) — over **one authoritative work-state model**. The other two systems' concepts are absorbed via supersession/migration, not federated via integration contracts.

**Host candidates**, assessed on: schema proximity to the work-state model, enterprise auth/ingestion maturity, UI maturity, search/storage engine maturity, Windows/WSL2 deployability, and provider independence.

| Candidate | For | Against |
|---|---|---|
| **A — ai-memory as host** | The hardest engineering is already shipped and tested: Postgres + pgvector + AGE, hybrid search (RRF/MMR), append-only versioned shards, tag grammar, MCP server plumbing, Deno/TS stack that runs today in WSL2 Docker Compose. Its Storyboard (SRS §5.6) is an embryonic work-state model — absorbing AWCP's WorkPacket model *replaces* it, resolving that collision by design. OpenRouter is a removable adapter (§4). | Identity shift from memory platform to workflow product; no web dashboard yet; no enterprise adapters yet; tags-isolation enforcement gap must be closed; cloud-deployment assumptions re-pointed local. |
| **B — Prism as host** | Per its description it holds the enterprise high ground: Confluence/ADO auth, ingestion, and comprehension — the hardest *organisational* dependency (corporate API access) may already be solved there. | Unverifiable from this repo: store, search maturity, schema, and stack are unknown. If it lacks a real storage/search engine, hosting means rebuilding what ai-memory already has. |
| **C — new AWCP codebase absorbing both** | Cleanest domain model, no legacy identity. | Highest migration cost, and it *creates a third system* unless the other two are retired on a real schedule — the exact failure mode the PO's direction forbids. Only defensible with a dated decommission plan for both donors. |
| **D — three federated systems** (this doc's v1.0 recommendation) | Least migration. | **Rejected by PO direction:** three independently operated systems coordinating one workflow formalises the maintenance problem. Retained here only for the record. |

**Provisional lean:** Candidate A, *pending the Prism inventory (Q1)*. On everything verifiable from this repository, ai-memory holds the deep engineering (storage, search, versioning, MCP) while AWCP's spec contributes the domain model and Prism contributes enterprise ingestion — and porting adapters/UI onto a proven engine is cheaper than porting an engine under someone else's UI. If the Prism inventory reveals a mature store *plus* working corporate auth, the balance could shift to B. Either way the decision needs: (1) the chosen host, (2) module boundaries, (3) one authoritative work-state model schema, (4) a supersession/migration plan with dates for the two non-hosts, and (5) the provider-adapter requirement (local / corporate-approved / lexical-only) as a Must.

---

## 8. Clarifying questions (blocking, in priority order)

1. **Prism ground truth:** What does Prism actually do *today* — Confluence/ADO ingestion? snapshotting? search? wiki generation? What store, stack, and interfaces? The host decision (§7) cannot be finalised without this inventory — it is the one input that could shift the lean from Candidate A to B.
2. **Host choice:** Do you accept the consolidation frame in §7, and — pending Q1 — the provisional lean toward ai-memory as host, with AWCP's spec becoming the operational-control module's requirements and Prism's capabilities migrating in as the source/wiki module?
3. **Corporate policy (OD-05, plus providers):** Is API-token auth for Jira/Confluence/ADO actually obtainable? And which provider-adapter implementations are permitted for corporate content — a corporate-approved LLM provider, local models only, or lexical-only fallback?
4. **Storyboard's fate:** Under one authoritative work-state model, ai-memory's Storyboard (SRS §5.6, FR-B-001..009, UC-3) is absorbed/superseded by the WorkItem/WorkPacket model rather than coexisting. Confirm, so the supersession lands in the consolidation ADR.
5. **MVP appetite:** Is Stage 1 alone shippable and worth validating for 4–6 weeks before any Stage 2/3 commitment? (Recommended — it also generates the run/event data needed to design attention heuristics empirically rather than speculatively.)
6. **Copilot posture:** Is manual/prompt-assisted Copilot supervision acceptable for v1 (downgrading FR-RUN-002 and AC-02's Copilot leg to Should), or is the no-Agent-Mode constraint (§18.2) actually negotiable? What justifies it currently — policy, licensing, or preference?
7. **Event sourcing:** Will you accept transactional store + append-only audit table as satisfying NFR-AUD, demoting "rebuildable from events" (FR-DATA-002/NFR-REL-004) to Could?
8. **Verification execution:** Should AWCP ever *execute* test/build commands (FR-VER-004), or only *ingest* results from agent runs and ADO builds (promoting FR-VER-012 to Must)?
9. **Isolation enforcement:** ADR-012's tag vocabulary should be the single classification scheme, but classification is not isolation (§4): `scope.tags` is not yet enforced in retrieval. Does the consolidated product close this with enforced tag filters, or with harder separation (per-domain scopes/schemas) beneath the shared vocabulary?
10. **Developer Memory's place:** In a consolidated product, AWCP's knowledge requirements effectively *are* the deferred Developer Memory module's spec (`record_decision`/`search_decisions`/`get_project_context`). Should that module be specified as part of the consolidation decision, or should the operational module use raw platform primitives (`capture_thought` + tags) until it is?

---

## 9. Recommended next step

Do not begin AWCP Stage 1 schema design until Questions 1–4 are answered. Then make **one consolidation decision** (a single ADR in the host product's repo, with supersession notes in the other two): choose the host (§7), define the three module boundaries, specify the single authoritative work-state model, and write a dated supersession/migration plan for the non-host systems' overlapping concepts — including ai-memory's Storyboard and Prism's knowledge projection, whichever way the host choice falls. Then cut the AWCP Must-list to the operational core (§9.2, §9.3, §9.6, §9.7, §9.9 minus local execution, §9.10) and restate §9.11 and the retrieval half of §9.4 as the memory module's responsibilities. Deliberately *not* recommended: parallel ADRs that preserve three running systems — that would formalise the maintenance problem rather than solve it. AWCP is a good idea wearing a spec two sizes too big; consolidation is the tailor.
