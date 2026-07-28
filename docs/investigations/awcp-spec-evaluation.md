# AWCP Requirements Spec — Critical Evaluation & Overlap Analysis

**Type:** Investigation / spec evaluation (Tier 2 reference)
**Date:** 2026-07-27
**Revision:** 1.3 — delivery re-cut as an **incremental capability ladder** (§6.1) per PO direction: usable from week one with manual seams, automation replacing manual effort increment by increment; completion gating pulled forward, enterprise writes pushed behind the auth question. *(1.2)* — per review feedback on PR #31 (agent-assisted requirements conversation, PO-filtered). *(1.1)* Remedy reframed from partition to consolidation; tags-isolation overlap corrected to partial (vocabulary shipped, enforcement not yet); scope-drift observability corrected to repo-state-derivable, not Claude-only. *(1.2 — decision-neutrality restored)* What is settled is **logical** consolidation only: no three separately **managed workflow products**, and one authoritative work-state model. Runtime count, host product, storage layout, and source-of-truth boundaries remain **open** until the Prism inventory (Q1) — this doc records candidate inputs, not a host recommendation. The overlap diagnosis (§4–§5) is unchanged.
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
- **Feasibility:** Stage 1 is feasible and high-value. Stage 2 hinges entirely on corporate API auth (OD-05) — currently unverified. Stage 3's evidence/drift machinery is feasible **agent-agnostically** via repository-state observability (git, worktrees, commits, PRs, ADO builds); what stays weak for Copilot without Agent Mode is *lifecycle* observability — checkpoints and decision narration, where the human becomes the event bus. Full spec as written: 6–12+ months of part-time effort even agent-assisted — but **§6.1 re-cuts delivery as an incremental capability ladder**: daily-usable from increment 1 (days-to-weeks), manual seams standing in for later automation, the completion gate pulled forward in manual-evidence form, and enterprise integration pushed behind the auth question it always depended on.
- **Recommendation (revised per PO reviews):** consolidate **logical ownership** before any schema is designed — one workflow product with **one authoritative work-state model**; never three separately managed workflow products. Deployment topology, host product, storage layout, and source-of-truth boundaries are deliberately **left open** until the Prism inventory (Q1); §7 records the candidate inputs without deciding them. ai-memory's OpenRouter dependency is a replaceable adapter, not a boundary. Ten clarifying questions in §8.

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
| §9.11 FR-KNOW-001/002 (decisions, rejected approaches, provenance) | Shards with `decision`/`constraint` tags + provenance; Developer MCP's planned `search_decisions`, `log_constraint` | **High — for the *promoted* layer only** | Split transactional from promoted. A *current-work* decision is first-class operational state — it can block a run, constrain scope, satisfy an approval, or gate verification — and must be authoritative in the operational model, optionally projected/indexed into the memory module afterwards. *Promoted, reusable* decisions and lessons are the Developer Memory shape, and building that layer inside AWCP forks the roadmap. Treating all decisions as memory would reduce control-plane state to unstructured thoughts. |
| FR-KNOW-005 (full-text search over knowledge) | Hybrid search (BM25+vector+RRF+MMR) — ai-memory's core | **Total** | AWCP would rebuild a strictly worse search engine. |
| FR-KNOW-004 (proposed → approved promotion) | Contact Memory's human review gate pattern; platform stays append-only, curation is product-layer | **High (pattern)** | The promotion-gate pattern already exists; AWCP is just another product-layer curator. |
| FR-KNOW-010 / FR-CTX-010 / NFR-SEC-005 (professional/personal domain isolation) | ADR-012 tags + ADR-008 context scoping | **Partial / planned** | The *classification vocabulary* is shipped (tag grammar, reserved tags, GIN-indexed column), but enforcement is not: `parseContext` parses `tags` into scope, yet `searchQuality.ts` never consumes `scope.tags` as a retrieval filter, and free-form tags are not a security boundary. AWCP's NFR-SEC-005 demands *enforced* isolation — a gap the consolidated product must close (enforced filters or separate scopes), not inherit. Two isolation vocabularies would still be a bug factory; the fix is one vocabulary *plus* enforcement. |
| §9.4 FR-CTX-001..005 (bounded, provenance-aware, relevance-limited context) | `search_thoughts` scoping, MMR diversity, planned `get_project_context` | **Substantial** | The retrieval/ranking half of context assembly duplicates ai-memory. The *assembly* half (packet binding, freshness markers, phase awareness) is legitimately AWCP. |
| FR-INT-005/009 (provenance, source vs interpretation vs generated) | Shard `source`/provenance fields; append-only versioning | **Moderate** | Same data-modelling philosophy; reusable rather than conflicting. |
| Domain model: WorkItem/WorkPacket/work board (§8, §15.1) | **SRS §5.6 Storyboard** (FR-B-001..009): stateful task board, agent story claiming, WIP=1 limit, `todo→in-progress→review→done` state machine, story↔memory links, context pull at pickup | **Head-on collision (reverse direction)** | AWCP's work board is a superset of the Storyboard. Running both = two task boards with divergent state. One must yield. |
| §9.3 runs/events, §9.6 attention, §9.7 handoffs, §9.9 verification, §9.10 approvals | — nothing | **None** | AWCP's legitimate, novel core. |

**Model-provider dependency is an adapter concern — but a product-wide one (revised per PO reviews):** ai-memory's external-LLM surface is narrow *today* (embedding generation + entity extraction via OpenRouter), and neither it nor the cloud-hosted reference deployment is structural — they don't justify running corporate knowledge in a second, separately operated ai-memory instance. But in the consolidated target the model surface is much wider: source comprehension, one-pager decomposition, context assembly, summarisation, and possibly attention classification all consume models. The requirement is therefore a **product-wide model-provider abstraction** (local model, corporate-approved provider, or none — per capability) plus an explicit **degraded-capability matrix**: lexical-only operation preserves basic memory search (the RRF pipeline degrades naturally to its BM25 lane) and the evidence/approval mechanics, but *not* decomposition, comprehension, or semantic context assembly. Removing embeddings alone does not make the combined product corporate-compliant; compliance is a per-capability provider decision recorded in that matrix.

**Maturity caveat in the other direction:** the Developer Memory layer AWCP's knowledge needs would call (`search_decisions`, `get_project_context`) is *deferred* in ai-memory's own roadmap. The platform primitives (`capture_thought` + tags + `search_thoughts`) are live and sufficient for decisions/lessons storage now; in a consolidated product, AWCP's knowledge requirements effectively *become* the Developer Memory module's spec — which is arguably healthy, but should be a conscious choice.

---

## 5. Functional overlap with Prism (inferred)

**Caveat:** there are zero references to Prism anywhere in this repository; this section works only from the AWCP spec's own three mentions (FR-KNOW-008, the risk register, OD-01) and the user's description ("LLM wiki, focused on Atlassian Confluence and Azure DevOps"). Verification against Prism's actual capabilities is Question 1 in §7.

Inferred overlap surface:

- **FR-INT-003 (capture and version Confluence page content as source snapshots)** and the ADO read integration (§11) are presumably Prism's home turf. Whatever the consolidation outcome, the requirement is **one authoritative source lineage with no competing authoritative copies** — raw immutable snapshots, curated wiki projections, search indexes, and caches may all legitimately hold derived or duplicated representations, connected to the lineage by hashes and provenance. ExternalSnapshot should reference that lineage rather than found a rival authoritative store; it need not mean one physical copy.
- **§10.1 (one-pager → epic/story decomposition)** needs exactly the Confluence understanding a wiki-focused LLM project builds. The decomposition *workflow* (draft gating, omission diffing FR-PLAN-006, approval-controlled Jira writes) is AWCP; the *source comprehension and retrieval* is Prism-shaped.
- **FR-KNOW-008** already concedes the point ("integrate with or reuse the existing Prism knowledge service where doing so does not couple operational state to wiki page structure") — the right instinct, wrongly demoted to a Should while §9.11 simultaneously specifies a full native knowledge service as Must. These cannot both stand.

The resulting **three-system problem**: knowledge storage, search, provenance, and promotion are currently specified/implemented in *three places* — ai-memory (shipping), Prism (per description), and AWCP §9.11 (specified). The remedy (per PO direction) is **consolidation of ownership, not partition**: the end state shall have **one user-facing workflow product and one operational model** — workflow state owned once. Prism and ai-memory capabilities may survive as modules, schemas, migrated components, *or separately deployed services consumed by that product*; what is excluded is three separately **managed workflow products**. Process topology and deployment count remain architecture decisions (§7). This should be captured as an explicit requirement in the AWCP spec's next revision (a strengthened §17.1: no parallel authoritative representations of workflow state, and no second workflow product).

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

### 6.1 Re-evaluated delivery: incremental capability ladder (revision 1.3, PO direction)

The spec's Stages 1–5 bundle work **by subsystem** — all of supervision, then all of integrations, then all of verification — so nothing is usable until a whole stage lands. Re-cut **by first usable moment**: every increment ships something used daily from the day it lands, with a **manual seam** standing in for automation that arrives later. Two rules govern the ladder:

1. **Manual is a feature, not a gap.** Each increment's manual path is retained permanently as the degraded mode — which is exactly the integration-outage fallback the spec's §11.1 demands anyway. Automation replaces effort, never removes a path.
2. **Contract-first, storage-disposable.** The packet/checkpoint/event schemas are versioned from increment 1 and are the only artefacts guaranteed to survive the host decision; storage stays throwaway (a SQLite file, no migration promises) until the §7 host/topology axes are decided. Increments 0–4 are host-independent and do not prejudice that decision.

| # | Capability shipped (usable that week) | Automated | Still manual (acceptable) | Unlocks / notes |
|---|---|---|---|---|
| **0** (~days) | **Paper AWCP:** packet + checkpoint + handoff Markdown/YAML templates in a conventions directory; a Claude Code skill and a Copilot prompt file that fill them | Nothing — pure convention | Everything | Structured cross-agent handoffs immediately; incubates the real schemas from use, not speculation |
| **1** | **Capture:** `awcp` CLI + local store; Claude Code hooks post session start/stop/checkpoint events; packets registered by CLI | Claude Code lifecycle capture | Copilot events (pasted/prompt-assisted); packet authoring | `awcp status` answers "what sessions exist, what was each last doing" — the first daily-use win |
| **2** | **Attention v0 + current-work artefact:** rules-only attention (stale timer, explicit `blocker`/`decision` events, ended-without-checkpoint); gitignored current-work.md generated for the VS Code workspace | Attention from timers + explicit events; artefact generation | No inference; no approvals; dashboard is terminal output or one static localhost page | Supervision-by-exception in crude form — the three-terminals problem addressed; capture-rate and false-alert metrics (Q5 gate) start accumulating free |
| **3** | **Handoff automation + completion gate (manual evidence):** handoff generated from latest checkpoint + git state; verification contract as per-packet YAML checklist; `awcp packet complete` refuses with unmet criteria; evidence attached by CLI (`awcp evidence add --cmd "deno test" --exit 0`) | Handoff assembly, staleness warning (commit mismatch), gate enforcement | Running the checks; attaching evidence; waivers | AC-02 and AC-04 achieved in manual-evidence form — evidence-based completion arrives *months* earlier than the spec's Stage 3 |
| **4** | **Repo-state observability:** git polling across bound repos (plumbing on the side where repos live — not cross-WSL2-boundary file watching); auto-stale evidence/handoffs; scope-drift v0 (changed repo/path outside packet) | Freshness + drift detection, agent-agnostically | ADO build/PR evidence by paste/link if API auth still unresolved | The §4 observability split realised; Copilot runs now supervised via repo state |
| **5** (auth-gated) | **Enterprise reads + planning queue:** Jira/Confluence sync, snapshots, readiness assessment | Sync + snapshot lineage | Decomposition review; anything auth denies stays on the increment-0–4 paste path | Gated on OD-05 — but failure degrades to already-working manual paths instead of blocking |
| **6** | **Approval-controlled writes + agent-routed decomposition:** batch Jira draft → preview → approve → execute; one-pager decomposition performed *by the coding agents as tasks* with AWCP storing structured results | Draft/preview/execute ledger | The approval itself (permanently, by design) | Agent-routed model use keeps AWCP without its own LLM surface for comprehension work — smaller compliance footprint |
| **7+** | Polish: real web dashboard, VS Code thin extension, notifications, knowledge promotion into the memory module, remote spooling (Ubuntu/Tailscale) | — | — | Continuous; sequenced by observed friction, not upfront |

**What this deliberately defers or drops early:** the web dashboard (terminal + Markdown suffice for one operator until increment 7), event sourcing (plain tables + append-only audit), the MCP server (files + CLI serve agents fine through increment 3; add a small read/record MCP toolset when programmatic consumption earns it), and all external writes before increment 6.

**Relation to the spec's stages:** Stage 1 spreads across increments 1–3; Stage 3's completion gate is *pulled forward* to increment 3 in manual-evidence form (it's the highest-value behaviour in the spec and doesn't need automation to be real); Stage 2 is *pushed back* behind the auth question it always secretly depended on; Stage 4 polish becomes continuous. The host decision (§7) gates only increments 5+ integration placement — daily use starts at increment 1 regardless.

---

## 7. Consolidation: what is decided vs deliberately open (revised per PO reviews)

**Decided — logical consolidation.** There shall be **one user-facing workflow product and one operational model**. Agent-operational state is owned once: no three separately managed workflow products, and no second product owning a competing authoritative copy of packets, runs, or approvals. Concepts that would duplicate workflow ownership (ai-memory's Storyboard; AWCP §9.11 as a build item) are superseded into that single model rather than federated.

**What "one authoritative work-state model" means — and does not mean.** It is authority over *agent-operational execution state*, not a database that supersedes external authorities:

| State | Authority |
|---|---|
| Requested work, hierarchy, status, priority, labels, fix versions | **Jira** (unchanged) |
| Commits, branches, pull requests, builds, release evidence | **Azure DevOps** (unchanged) |
| Source documents (one-pagers, requirements pages) | **Confluence** (unchanged), with a local source lineage per §5 |
| Agent-operational execution state: packets, runs, checkpoints, attention, approvals, verification mapping, transactional decisions (§4) | **The consolidated workflow product** — the new, singular authority |
| Promoted reusable knowledge | Memory module/store — a projection target, not a transactional authority (§4) |

**Deliberately open — architecture decisions in their own right, not consequences of "consolidation":**

- **Process topology and deployment count.** One user-facing product may be composed of separately deployed components — including separate work/personal deployments, e.g. corporate data remaining on the laptop while personal agents run against the Ubuntu server. "One product" constrains ownership and the control surface, not process count.
- **Host codebase.** Extend ai-memory, extend Prism, or a new umbrella codebase — candidate inputs below; undecided until the Prism inventory (Q1).
- **Storage layout.** One schema vs multiple stores behind module interfaces.
- **Source-of-truth placement for source/wiki and memory data.** No wholesale migration into one schema is assumed. The workflow product owns *operational* state only; knowledge and source stores may remain where they are, linked by provenance and the §5 lineage rule.

**Candidate inputs for the later host decision** — recorded as inputs, not a selection. Evaluation criteria: **domain fit, security model, code maturity, migration effort, operational simplicity, and retirement path** — not repository count or legacy reuse alone.

| Candidate | Inputs for | Inputs against |
|---|---|---|
| **A — extend ai-memory** | Verified reusable capabilities exist: Postgres + pgvector + AGE storage, hybrid search (RRF/MMR), append-only versioned shards, tag grammar, MCP plumbing, WSL2-ready stack. Absorbing the WorkPacket model retires the Storyboard cleanly. | "The hardest engineering is already shipped" is **not established** for this domain: AWCP's hardest risks are session instrumentation, attention precision, corporate integration, approval semantics, and multi-repo evidence freshness — none of which ai-memory has shipped. ai-memory is explicitly early-development, lacks the operational domain, UI, and enterprise adapters entirely, and its graph/vector machinery may be unnecessary weight for a control plane. Hosting here may also maximise conceptual coupling and migration effort in the memory schema. |
| **B — extend Prism** | Per its description, may already hold corporate auth and Confluence/ADO ingestion — the hardest *organisational* dependency. | Unverifiable from this repository: store, search, schema, stack, and maturity unknown (Q1). |
| **C — new umbrella codebase** | Cleanest domain model for the operational core. **Not inherently a third lasting system:** it can be the *replacement product*, importing selected packages/data from both donors and retiring them on a dated plan. May minimise conceptual coupling. | Highest up-front assembly cost; defensible only with an explicit retirement path for both donors — without one it degenerates into a third managed system. |
| **D — three separately managed workflow products** (this doc's v1.0 partition recommendation) | Least migration. | **Rejected by PO direction.** The rejection is of three workflow *products*; separately deployed *components/services* under one product remain an open topology option above. |

**No host lean is expressed.** This investigation can inspect ai-memory but not Prism; treating the inspected system's strengths as decisive would be structural bias. Candidate A's entry above is a list of *verified reusable capabilities*, not a host-selection argument. The host decision waits for the Prism inventory (Q1) and, when taken, needs: (1) the host, (2) module boundaries, (3) the operational-state schema, (4) a supersession plan for duplicated *concepts* (not a data-migration mandate), and (5) the product-wide model-provider abstraction and degraded-capability matrix (§4) as a Must.

---

## 8. Clarifying questions (blocking, in priority order)

1. **Prism ground truth:** What does Prism actually do *today* — Confluence/ADO ingestion? snapshotting? search? wiki generation? What store, stack, and interfaces? The host decision (§7) cannot be finalised without this inventory — it is the one input that could shift the lean from Candidate A to B.
2. **Consolidation frame:** Does §7's decided-vs-open split match your intent — one user-facing workflow product and one operational model settled now (with the §7 source-of-truth matrix), while process topology, deployment count, host codebase, storage layout, and source-of-truth placement remain architecture decisions taken after the Prism inventory?
3. **Corporate policy (OD-05, plus providers):** Is API-token auth for Jira/Confluence/ADO actually obtainable? And which provider-adapter implementations are permitted for corporate content — a corporate-approved LLM provider, local models only, or lexical-only fallback?
4. **Storyboard's fate:** Under one authoritative work-state model, ai-memory's Storyboard (SRS §5.6, FR-B-001..009, UC-3) is absorbed/superseded by the WorkItem/WorkPacket model rather than coexisting. Confirm, so the supersession lands in the consolidation ADR.
5. **Stage 1 decision gate:** Is Stage 1 alone shippable behind an **outcome-based gate** rather than a fixed calendar period — e.g. measured reduction in session-reconstruction time, reliable event/checkpoint capture rate, attention precision (acceptably low false-alert rate), handoff success rate, and acceptable operator overhead — with duration set by how quickly enough representative sessions accumulate? (Recommended — Stage 1 also generates the run/event data needed to design attention heuristics empirically rather than speculatively.)
6. **Copilot posture:** Is manual/prompt-assisted Copilot supervision acceptable for v1 (downgrading FR-RUN-002 and AC-02's Copilot leg to Should), or is the no-Agent-Mode constraint (§18.2) actually negotiable? What justifies it currently — policy, licensing, or preference?
7. **Event sourcing:** Will you accept transactional store + append-only audit table as satisfying NFR-AUD, demoting "rebuildable from events" (FR-DATA-002/NFR-REL-004) to Could?
8. **Verification execution:** Should AWCP ever *execute* test/build commands (FR-VER-004), or only *ingest* results from agent runs and ADO builds (promoting FR-VER-012 to Must)?
9. **Isolation enforcement:** ADR-012's tag vocabulary should be the single classification scheme, but classification is not isolation (§4): `scope.tags` is not yet enforced in retrieval. Does the consolidated product close this with enforced tag filters, or with harder separation (per-domain scopes/schemas) beneath the shared vocabulary?
10. **Developer Memory's place:** In a consolidated product, AWCP's knowledge requirements effectively *are* the deferred Developer Memory module's spec (`record_decision`/`search_decisions`/`get_project_context`). Should that module be specified as part of the consolidation decision, or should the operational module use raw platform primitives (`capture_thought` + tags) until it is?

---

## 9. Recommended next step

Sequence the decisions by what they actually block — only the *irreversible host choice* waits for the Prism inventory:

1. **Now, host-independent:** record the logical consolidation decision — one user-facing workflow product, one operational model, the §7 source-of-truth matrix, and supersession of duplicated workflow concepts (the Storyboard; AWCP §9.11 as a build item). In parallel, design the artefacts that no host choice invalidates: the operational bounded context, event contracts (run lifecycle, checkpoint, evidence), Stage 1 acceptance metrics (the outcome gate from Q5), and optionally a **disposable Stage 1 vertical slice** to start generating real session data.
2. **Next:** the Prism inventory (Q1) and the source-of-truth placement questions (Q3).
3. **Then:** the host/topology/storage decision (§7's open axes), evaluated on domain fit, security model, code maturity, migration effort, operational simplicity, and retirement path — with a dated supersession plan for duplicated *concepts*, not a data-migration mandate. At that point, cut the AWCP Must-list to the operational core (§9.2, §9.3, §9.6, §9.7, §9.9 minus local execution, §9.10) and restate §9.11's *promoted-knowledge* layer and the retrieval half of §9.4 as the memory module's responsibilities — keeping transactional decisions in the operational model (§4).

Governance shape: **one canonical consolidation decision of record**, with referenced ADRs or supersession records in each affected repo as needed — the constraint is a single decision, not a documentation-topology rule of "exactly one ADR". What remains not recommended: three separately managed workflow products — that formalises the maintenance problem rather than solving it. AWCP is a good idea wearing a spec two sizes too big; logical consolidation is the tailor.
