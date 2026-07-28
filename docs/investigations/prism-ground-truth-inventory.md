# Prism Ground Truth — Inventory & AWCP Fit Assessment

**Type:** Investigation (inventory + fit assessment) (Tier 2 reference)
**Date:** 2026-07-28
**Question posed:** [`awcp-spec-evaluation.md`](awcp-spec-evaluation.md) §8 Q1 — "What does Prism actually do today — Confluence/ADO ingestion? snapshotting? search? wiki generation? What store, stack, and interfaces?" — the input that document names as the one that could shift the §7 host-decision lean from Candidate A (extend ai-memory) to Candidate B (extend Prism).
**Verdict:** Prism is a pure product with no platform beneath it — no store, no search engine, no vector capability; git and the filesystem are its only "platform." Candidate B ("extend Prism" as AWCP's host) is rejected: hosting AWCP's authoritative operational state inside Prism would build a platform from scratch while registering, on day one, the exact product-hosts-product boundary violation ADR-013 exists to prevent. Prism's real contribution is as donor — of a retirable source/wiki product, and of three working mechanisms (Confluence source lineage, drift detection, Jira↔git evidence correlation) the AWCP capability ladder needs at increments 4–6. **Partially superseded — see the note immediately below before reading §3/§6.**

**Provenance and correction note (added on mirroring into ai-memory).** This is a mirror of `.github/investigations/awcp-prism-inventory.md` in the `prism-llm-wiki` repository (commit `ec3b5fe`), written by an agent session working directly against Prism's own code on 2026-07-28. The source document itself names this file as its citable counterpart (its own §6 item 5: *"mirrored into ai-memory as an investigation... `docs/investigations/prism-ground-truth-inventory.md` in ai-memory is the citable one"*).

A same-day follow-on planning document in that repository, `docs/plans/2026-07-28-001-docs-developer-memory-prism-boundary-plan.md` (requirements-only artifact; not yet executed in either repo), **supersedes one conclusion below**: §3 and §6 item 2's suggestion that ADR-013's product register might "gain a Prism row" is superseded by that plan's R3/R4 — Prism's correlation capability (the drift harness + traceability harvester) is instead recorded as an early partial implementation of AWCP's evidence layer, i.e. a donor to the eventual Workflow/Operations product, not a fourth product row of its own. That plan also freezes Prism's wiki-synthesis function going forward (no new Confluence ingest; comprehension shifts to query-time Rovo/Atlassian MCP) — a change to Prism's own roadmap, not an AWCP-side fact, but relevant context for a reader of §1.3(a)/§5 below expecting the 63-page wiki to keep growing. Everything else below is unedited from the source. Two decisions in the boundary plan are explicitly still open ("resolve before planning": whether correlation becomes a module inside the consolidated workflow product or a standalone capability it consumes, and what the wiki-freeze review date/signal is) — this mirror does not resolve them; it only flags that the register-row question here is settled.

---

## TL;DR

- **Prism is a product, not a platform** — under ADR-013's own criteria it hits all four product tests, and holds **none** of the seven listed platform capabilities. There is no store, no search engine, and no server-side persistence beneath it: git and the filesystem are its platform.
- **Therefore Candidate B ("extend Prism") is the weakest of the three hosts** — not because Prism is immature (in its own domain it is tested, reviewed and in daily production use), but because hosting AWCP's authoritative operational state inside Prism means building a platform from scratch *and* registering, on day one, exactly the boundary violation ADR-013 was written to stop.
- **Prism's real role is donor of the source/wiki product and of three shipped mechanisms** the AWCP ladder needs at increments 4–5: external source lineage with content hashing (increment 5, built), hash-baseline drift detection with a solved false-stale problem (increment 4, mechanism built), and Jira↔git evidence correlation (increment 4/6, mechanism built). Different *semantics* in each case — see §5.
- **Three §5 inferences in the evaluation are wrong and one is half-right.** Retrieval overlap with Prism is **zero**. Confluence capture overlap is **total**. Corporate auth: **reads proven, writes never attempted** — which is the sharpest available partial answer to OD-05/Q3.
- **The evaluation's §5 caveat ("zero references to Prism anywhere in this repository") is symmetrically true here**: this repo contains no reference to ai-memory, AWCP, or the AWCP spec. The two systems have never touched.

---

## 1. What Prism actually is today

### 1.1 Identity

A persistent, compounding knowledge base for the **Prism team** (BIMcollab Zoom app + BCF Manager plugins), following the Karpathy LLM Wiki pattern. The LLM writes and maintains all wiki pages; the team curates sources and asks questions. Three-layer architecture: `sources/` (immutable, team-owned) → `knowledge/` (LLM-owned wiki) → schema/convention files.

**Solo tool, corporate content.** Positioned in its own README as a team knowledge base, it is in practice a **single-user tool**: the Prism team has not adopted it and (per the owner, 2026-07-28) will not. Every commit is the owner's. Its *content*, however, is corporate — kubusinfo Confluence, the PRI Jira project, Azure DevOps repos. That split matters and is easy to get backwards: on the **user** axis Prism is as single-user as ai-memory (so ADR-013's "second human user" revisit trigger is *not* tripped, and no multi-user persona work is implied); on the **data** axis it is corporate, which is what bears on Q9/NFR-SEC-005 isolation (see §6).

### 1.2 Stack and store

| Concern | Implementation |
|---|---|
| Knowledge store | **Flat Markdown in git.** 63 pages in `knowledge/`, YAML frontmatter (`tags`, `domain`, `description`, `sources`, `last-updated`, `related-pages` with typed relations), `index.md` (86 lines, catalog by domain), `log.md` (162 lines, append-only operations log), `_archive/` (empty — archive rule defined, not yet exercised) |
| Operational state | **JSON files in `.agent/`** — `confluence-registry.json` (177 KB, 350 pages), `traceability/snapshot.json` (406 tickets), `drift-baseline.json` (generated) |
| Database | **None.** No SQL, no vector store, no embeddings, no queue, no server-side persistence of any kind |
| Search / retrieval | **None as a component.** Retrieval is the agent reading `index.md` and grepping Markdown. The dashboard's `wiki-reader.ts` parses frontmatter into a graph for display only |
| UI | Next.js 14 (App Router) + TypeScript + Tailwind, **localhost-only** (port 3010), 6 pages, 7 API routes. Mutation routes guarded by `validateRequest()` — per-session CSRF token + loopback-origin check |
| Scripts | PowerShell 7 (`confluence-registry.ps1`, `digest.ps1`, `wiki-drift-check.ps1`) and Node ESM (`traceability-harvest.mjs`, `traceability-core.mjs`) |
| Agent surface | VS Code + Copilot Chat. `apm.yml` registers 5 agents, 7 skills, 2 instruction files, 11 prompts. Claude Code also used interactively |
| MCP consumed | `ado-remote-mcp`, `atlassian`, `github` |

> **Correction to a likely misreading:** `confluence-registry.json` has a top-level key named `search_vectors`. These are **not embeddings**. They are the crawl frontier — `keywords`, `people`, `discovered_terms` used to drive Confluence CQL discovery. Prism has no vector capability whatsoever.

### 1.3 What it does — the four shipped capabilities

**(a) Confluence source ingestion and lineage.** `.agent/confluence-registry.json` tracks 350 Confluence pages with, per page: `title`, `space`, `status` (registered/pending/ingested), `relevance_reason`, `last_modified`, `last_scraped`, `version`, `content_hash` (SHA-256), `summary`, `wiki_page` (the projection target), `tags`, `discovered_keywords`, `discovered_people`. Bootstrap crawl is complete (35 keywords, 9 people, hop-1 and hop-2 done). `confluence-registry.ps1` is a deliberately dumb data-access CLI (`vectors`, `stale`, `pending`, `stats`, `run-state`, `run-transition`, `emit-manifest`, `emit-weekly-metrics`); all intelligence lives in the skill/agent. A formal **M8 run-state machine** with validated transitions and terminal states gates sync operations. *(As of the boundary-plan correction above, this ingestion path is now frozen — see the provenance note.)*

**(b) Delivery traceability.** `traceability-harvest.mjs` correlates Jira PRI issues (two JQL sweeps: fix-versioned updated ≤180d, resolved-without-fix-version ≤90d) against git evidence harvested from local clones of `bimcollab-zoom` and `bimcollab-managers`. Output: `snapshot.json` — currently **406 tickets, 112 gap flags** across 5 active gap codes (`missing-code-evidence` 57, `resolved-without-fix-version` 41, `done-with-placeholder-version` 8, `not-on-release-branch` 5, `no-release-branch` 1; `released-but-unresolved` also defined). Per ticket: every referencing commit with release/master/development **reachability**, PR links, feature branches. Rendered at `/traceability`, served raw at `GET /api/traceability`.

**(c) Wiki drift detection (shadow mode).** `wiki-drift-check.ps1` — read-only measurement instrument, never mutates `knowledge/`, never commits, never opens a PR. Compares each (page, source) relation against a persisted baseline keyed by `SHA-256(page ∥ U+001F ∥ sourceRef)`, emits deterministic structured findings + report + metrics, versioned by a `rulesVersion` parameter so rule changes don't masquerade as drift. Shipped 2026-07-10 (PR #7) after two rounds of 8-reviewer code review.

**(d) Agent workflow conventions.** 5 agent roles with explicit tiering (`wiki-maintainer` = Opus planner/orchestrator, `implementor` = Sonnet worker that "executes specs exactly, invents nothing", `research` = read-only, `housekeeping`, `quick`); enforced **instruction budgets** (SKILL.md ≤40 instructions, prompts ≤25, agent bodies ≤80 lines); an **ExecPlan** template with defined trigger rules; an **execution-spec handoff template** for planner→implementor delegation; `.agent/plans/progress.md` as the living checklist read at the start of every fresh context; `docs/plans/` (6 feature plans) and `docs/solutions/`.

### 1.4 Auth — what is proven and what is not

This is the part the evaluation could not see, and it splits cleanly:

| Direction | System | Mechanism | Status |
|---|---|---|---|
| **Read** | Confluence | Atlassian MCP, interactive OAuth | **Proven** — 350 pages ingested; MCP connected in the session that produced this document |
| **Read** | Jira | REST + API token (`JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN`) against `kubusinfo.atlassian.net`; MCP path also available | **Proven** — 406 PRI issues harvested |
| **Read** | Azure DevOps | `ado-remote-mcp`, plus local clones of the two product repos | **Proven** for repo/commit evidence |
| **Write** | Confluence / Jira / ADO | — | **Never attempted.** A grep of every agent, skill, prompt and instruction file finds zero page-create/update, issue-create/edit, or transition calls |
| **Write** | Local git | `git-runner.ts` — allowlisted paths (`knowledge/`, `.github/prompts/`, `.github/skills/`) with a pre-commit secret scan, then commit + push | **Proven**, own repo only |

**Implication for OD-05 / evaluation Q3:** the corporate-auth risk is *not* undifferentiated. Read auth for all three enterprise systems is obtainable and in production use here. The unproven half is exactly the half AWCP Stage 2 / ladder increment 6 depends on — **approval-gated writes** — plus the separate question of which LLM provider is permitted over corporate content. On that second half Prism is a useful data point: **it holds no LLM provider credentials at all** (verified by search — no OpenRouter/OpenAI/Anthropic/Gemini keys anywhere in the repo). All model use runs through interactive Copilot and Claude Code sessions and the `gh copilot` CLI, i.e. under the corporate Copilot subscription; the dashboard plan lists "direct OpenAI/Azure OpenAI API integration" as an explicit non-goal. So corporate content has been processed by models for months — but only via approved interactive tooling, never via a self-held API key. That is a *precedent for agent-routed model use* (ladder increment 6's approach), not evidence that a keyed provider adapter would be permitted.

### 1.5 Maturity

`IMPLEMENTATION-PLAN.md` Phases 0–7 are substantially complete (progress tracked per item in `.agent/plans/progress.md`). Web dashboard shipped with documented U9/U10/U11 security follow-ups closed. Confluence sync at M8. Drift harness shipped in shadow mode; one active plan (`2026-07-10-001`, requirements-only) covers its agentic wiring. Test coverage exists for the dashboard libs and both scripts. **Maturity is real but narrow**: it is mature *as a wiki + source-lineage product*, and holds nothing at all in the operational-control domain.

---

## 2. Corrections to the evaluation's §5 (inferred overlap)

§5 is explicitly flagged as inference from three spec mentions plus a one-line description. Four corrections:

| §5 inference | Ground truth | Consequence |
|---|---|---|
| Prism is a "knowledge service" that may overlap FR-KNOW-005 search / §9.4 retrieval | **Zero retrieval overlap.** No index, no ranking, no embeddings, no query engine. Retrieval is an agent grepping Markdown | §5's "three places" needs splitting by capability. *Search* exists in exactly one place (ai-memory) — Prism competes with nothing in the RRF/MMR pipeline. *Source-lineage capture* exists in exactly one place (Prism). *Promotion policy* is the one that genuinely exists in three |
| FR-INT-003 (capture and version Confluence content as source snapshots) is "presumably Prism's home turf" | **Correct, and stronger than presumed** — it is *built and in production*: 350 pages, SHA-256 content hashing, version + last-scraped tracking, staleness queries, page→wiki-page projection mapping, run-state machine | Ladder increment 5's "sync + snapshot lineage" is not greenfield. The §5 rule ("one authoritative source lineage, derived copies linked by hash and provenance") is already implemented in this shape |
| Candidate B: "may already hold corporate auth and Confluence/ADO ingestion — the hardest *organisational* dependency" | **Half true.** Read auth: yes, all three. Write auth: never attempted, unknown | Candidate B's headline argument survives only for the read half. The organisational dependency that actually gates Stage 2 — approval-gated writes — is as unproven in Prism as anywhere else |
| §10.1 one-pager decomposition "needs exactly the Confluence understanding a wiki-focused LLM project builds" | Partly. Prism has the *retrieval-and-snapshot* half (registry + hashing + relevance reasons) but its comprehension is entirely interactive-agent-mediated; there is no programmatic comprehension component to reuse | Reusable as **process and data**, not as a callable service |

Symmetric caveat, for the record: this repository contains **no reference to ai-memory, AWCP, or the AWCP spec**. Neither system knows about the other; there is no accidental integration to unwind.

---

## 3. Where Prism lands under ADR-013

> **Superseded — see the provenance note above.** This section's original suggestion that ADR-013's product register might gain a Prism row is superseded by the `prism-llm-wiki` boundary plan's R3/R4: Prism's correlation capability is recorded as a donor to the future Workflow/Operations product, not a fourth product row. The classification analysis below (product vs. platform) still stands; only the register-row conclusion changes.

Applying ADR-013 §1 directly. **Product tests — all four hit:**

| Criterion | Prism |
|---|---|
| Persona | Yes — a Prism-team engineer asking about Zoom / BCF Manager internals |
| Domain vocabulary | Yes — six fixed domains (`architecture`, `api`, `devops`, `processes`, `onboarding`, `troubleshooting`), page-naming grammar, typed `related-pages` relations, gap codes, registry statuses |
| Curation / promotion policy | Yes, and it is the heart of the thing — the conflict rule ("never silently overwrite; always ask"), the archive rule ("never delete; move to `_archive/` with a notice"), lint, the source→page promotion gate, index/log discipline |
| Domain MCP toolset or UI | Yes — `/ingest`, `/query`, `/lint`, `/publish`, `/confluence-sync` prompts and the localhost dashboard |

**Platform capabilities held — none of the seven** in ADR-013 §1: no append-only versioned shard storage, no tag scoping mechanism, no hybrid search, no graph tier or entity extraction, no platform MCP primitives, no queues/workers/migrations/auth/health infrastructure. Provenance and versioning fields exist, but as frontmatter and JSON records in git, not as a capability layer anything else could consume.

**Litmus test** (*does it decide what knowledge means or when it is trusted?*): Prism decides almost nothing else. Domain assignment, conflict adjudication, archival, staleness, drift findings, gap classification — every one is a validity decision.

> **Prism is a pure product with no platform beneath it.** ADR-013's register (§2) does not classify it, and ADR-013's own revisit trigger — "a capability request cannot be classified by the criteria above — amend the definitions, don't special-case silently" — is arguably tripped. The criteria classify it cleanly; the *register* has no row for it. ~~If a row is wanted it would read something like **Source/Wiki Memory (Prism)**...~~ *(This register-row question is resolved by the boundary plan, not left open — see the provenance note.)*

---

## 4. Candidate B scored on §7's six criteria

§7 names the criteria: domain fit, security model, code maturity, migration effort, operational simplicity, retirement path. Scoring **"extend Prism to host the consolidated workflow product"**:

| Criterion | Assessment | Score |
|---|---|---|
| **Domain fit** | Prism's domain is *knowledge validity over documents*. AWCP's is *execution state over agent runs*. Zero shared entities — no run, packet, checkpoint, approval, or attention concept exists here. The one adjacency (traceability) is release evidence, not run evidence | **Poor** |
| **Security model** | Genuine strengths: loopback-only, per-session CSRF, allowlisted commit paths, pre-commit secret scan, output redaction, read-only external posture. But *as a host* it offers nothing AWCP would need: no authn/authz, no scope-enforcement mechanism, no server-side session concept — it is a single-operator desktop model that assumes one trusted user at the keyboard. Note this is **not** an argument against co-locating corporate and personal content: that posture is settled (enforced tag filters over one store, §6 Q1), and it depends on a scope-filter mechanism Prism has no version of | **Adequate for what it does, absent for what AWCP adds** |
| **Code maturity** | High in its own domain (tested libs, reviewed scripts, plans/progress discipline, security follow-ups closed). Irrelevant to the operational core — none of that code is reusable for packets, runs, or approvals | **High but non-transferable** |
| **Migration effort** | Highest of the three candidates. Hosting here means building a transactional store, the event/audit path, and a server runtime **from zero** — Prism's persistence is JSON-in-git, which cannot hold packets, runs, and events at any interesting rate, and whose merge/concurrency semantics are wrong for mutable operational state | **Worst** |
| **Operational simplicity** | Attractive today (no daemon, no DB, `npm run dev` + PowerShell). That simplicity is exactly what hosting AWCP destroys — it would acquire a database, a long-running service, and pollers, and the wiki would inherit that operational weight for no benefit to the one person using it | **Net negative** |
| **Retirement path** | Prism is a **third donor**, which §7's "both donors" phrasing does not account for — but, being single-user, it is genuinely retirable, so Candidate C's defensibility test survives with a corrected count. As a *host*, Prism scores neutrally here: hosting the workflow product inside the wiki leaves ai-memory to retire and creates no fourth system. The real cost sits in the rows above, not this one | **Neutral — not the deciding criterion** |

**Verdict on Candidate B: reject as host.** The decisive argument is document-internal rather than technical: hosting AWCP's authoritative operational state inside Prism puts one product's authoritative state inside another product, which ADR-013 would immediately register as a boundary violation of exactly the kind §4's dispositions exist to unwind — while ADR-013 §3 ("layering is not deployment") already grants everything co-location was meant to buy, without the entanglement.

**What this does *not* settle.** The Prism inventory was Q1 because it might flip the lean to B. It does not — but the *reason* also does not lift Candidate A. Prism's entry in §7's table ("may already hold corporate auth") is now known to be half-true, and A's countervailing entry (ai-memory has shipped none of AWCP's hardest risks) is untouched by anything here. Candidates A and C remain live on their own merits; this document removes one option, it does not choose among the rest.

---

## 5. What Prism contributes — mechanism vs semantics

Prism's value to the consolidation is as **donor of one product and three mechanisms**. The distinction matters: in each case the mechanism class is built and proven, and the *subject* it operates on is different. None of these is "AWCP increment N, already done."

| Prism asset | AWCP counterpart | Reusable as | Semantic gap |
|---|---|---|---|
| Confluence registry — 350 pages, content hashing, version/scrape tracking, staleness, page→projection mapping, M8 run-state machine | FR-INT-003 ExternalSnapshot; ladder **increment 5** | **Schema and code, near-directly** | Closest to a true match. Registry semantics are *document freshness*; AWCP additionally wants snapshot binding to packets |
| `wiki-drift-check.ps1` — hash-baseline drift, deterministic findings, versioned rules, shadow mode | FR-VER-005 scope drift, FR-VER-009 evidence staleness; ladder **increment 4** | **Mechanism and hard-won design lessons** | Subject differs: *page vs its source* drift, not *code change vs packet scope* drift. Notably, the harness already confronted and solved the false-stale-noise problem the evaluation flags as underspecified in §3.4 — versioned rules so a rule change is not reported as drift, and shadow mode so precision is measured before anything acts on findings. That precedent is worth more than the code |
| `traceability-harvest.mjs` — Jira↔git↔release-branch correlation, reachability, 6 gap codes, 406 tickets live | FR-VER-012 (ingest ADO PR/build results, evaluation argues for promotion to Must); evidence for completion gating | **Mechanism, and a working corporate-auth path** | Subject differs: *release* traceability (did this ticket ship in that version?), not *packet* evidence (did this agent run satisfy its verification contract?). Same shape — external record ↔ repo state ↔ gap classification |
| Agent conventions — role tiering, instruction budgets, ExecPlan + execution-spec templates, `progress.md` | Ladder **increment 0** ("Paper AWCP": packet/checkpoint/handoff templates as convention) | **Working precedent for the whole increment-0 premise** | Prism's execution-spec *is* a handoff artefact and `progress.md` *is* a current-work artefact — in a wiki-maintenance domain, driven by humans rather than hooks. Increment 0's schemas should be incubated from these, not designed speculatively |
| The wiki itself — 63 pages, index, log, conflict/archive rules | Source/Wiki product in the consolidated register | **A product surface worth keeping — or retiring, deliberately** | Being single-user, this *can* be absorbed or retired; whether it *should* be is an open product question (now partially resolved: the boundary plan freezes rather than retires it, pending review). The wiki is a useful reading surface over corporate sources in its own right, and "retirable" is not "redundant" |

**A weaker claim than it may look.** The drift harness and the traceability harvester have a similar *description* — compare an external record against local repo state, classify the difference deterministically, track freshness — but not a shared abstraction: one is PowerShell hashing (page, source) pairs against a baseline, the other is Node walking Jira issues against git reachability. What transfers is design experience on real corporate data (twice), not a factored component. Whether FR-VER-005/009/012 is a third instance of a common pattern is a question for whoever designs the operational schema; it should not be assumed here.

---

## 6. Questions this inventory raises (not in §8)

1. **Corporate/personal isolation — asked and answered: enforced tag filters over one store.** Prism's content is corporate (kubusinfo Confluence, PRI Jira, ADO repos); ai-memory is personal. The question was whether NFR-SEC-005 / Q9 isolation forces split stores, which would have *pre-constrained* §7's deliberately-open deployment-topology axis. **It does not** — the posture is ADR-012's tag vocabulary plus enforced retrieval filters, one store. Two consequences: (a) §7's topology axis genuinely stays open, so the host decision is not forced by data policy; (b) the enforcement gap the evaluation identifies in §4 — `parseContext` parses `tags` into scope but `searchQuality.ts` never consumes `scope.tags` as a retrieval filter — moves from "a gap the consolidated product must close" to **the load-bearing control for corporate/personal separation**, and should be a Must in the consolidation decision rather than a deferred item. Corporate content sharing a store with personal memory is only as safe as that filter.
2. ~~**There are three donors, not two — and the third is retirable.**~~ *(Resolved by the boundary plan: Prism is a donor of correlation capability to the future Workflow/Operations product, not a fourth product row awaiting a retirement decision of its own — see the provenance note above. The underlying observation, that Prism is single-user and its wiki half can be absorbed or wound down without stranding anyone, still stands as input to that plan's freeze/review decision.)*
3. **The write half of OD-05 is the only unknown left, and it is cheaply testable.** Read auth is proven three ways here. A single controlled experiment — create one Jira issue or update one Confluence page via the authenticated MCP against a sandbox space — would close the question that gates Stage 2 and ladder increment 6. Has any write ever been attempted from this environment, and is such a test permitted?
4. **The evaluation reviewed a spec this inventory could not see.** Scoring was done against §4/§5/§7's paraphrases of ~120 requirements. If the host decision is going to lean on this document, the `.docx` should be placed somewhere both repos can cite — otherwise every subsequent assessment inherits the same second-hand caveat.
5. **Where this lands — answered.** Mirrored here (this file) so the AWCP host decision can cite it directly.

---

## 7. Recommended next step

Nothing here blocks the evaluation's §9 step 1 — the host-independent work (logical consolidation decision, event contracts, Stage 1 acceptance metrics, disposable vertical slice) is unaffected by anything in this document.

For §9 step 2 (the Prism inventory) — consider it delivered, with three edits to fold back into the evaluation:

1. **§5:** replace the inferred retrieval overlap with "none"; upgrade FR-INT-003 overlap from "likely" to "built"; split the auth claim into proven-read / unproven-write.
2. **§7 Candidate B:** rewrite the "inputs for" entry to *read* auth plus a shipped source-lineage implementation, and the "inputs against" entry to the ADR-013 product-hosts-product violation and JSON-in-git persistence — not "unverifiable."
3. **ADR-013 §2:** no new row needed for Prism — the `prism-llm-wiki` boundary plan (2026-07-28) already places its correlation capability under the proposed Workflow/Operations product rather than as a standalone entry. This edit is a no-op if the boundary plan's R4 is accepted; flag it for the ADR owner only if that plan is rejected.

Then §9 step 3 (host/topology/storage) proceeds between Candidates A and C — with the topology axis confirmed genuinely open (§6 Q1), and enforced tag filtering promoted to a Must, since it is now the only thing separating corporate wiki content from personal memory in a shared store.
