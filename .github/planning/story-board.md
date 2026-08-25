> System: Continuous-flow kanban · WIP limit: 1 In Progress · 1 in Review
> Cadence: No sprint boundaries. Plans are authored as `docs/plans/*.md` (unified format, mandatory `story: ST-NNN` frontmatter) via `ce-brainstorm`/`ce-plan` or by hand; `ce-work` (or equivalent) executes them. Legacy `/plan` (Opus) + `/continue` (Sonnet) ExecPlan workflow retired for new work — see CLAUDE.md's Workflow gate section.
> Prioritisation: Value-first with dependency-aware sequencing. Value: 1-5.
> Next planning target: (TBD after ST-072 completes).
> Unblocked: ST-023, ST-019, ST-045, ST-048, ST-049, ST-050, ST-051, ST-053, ST-059, ST-060, ST-061 (ST-042 migration framework complete — ST-045/ST-048 blockers cleared; ST-047 in Review). ST-070 + ST-071 done 2026-07-03 (integration suite green in CI, PR #21 merged).
> Field convention: New/updated entries use `Plan:` pointing to `docs/plans/*.md`. Older entries retain `ExecPlan:` pointing to `.github/planning/execplans/*.md` as historical record — not retroactively renamed.
> Last updated: 2026-08-23 (**Board hygiene: ST-092 moved Review → Done, and ST-093 lifted onto `main`.** ST-092 squash-merged as `69b50bd` (PR #52) on 2026-08-22, but its entry was still sitting under `## Review`, holding that slot against the 1-in-Review WIP limit above — moved to the top of `## Done` with the merge SHA, PR number, and (newly checked) CI result: PR #52 targeted `main` directly rather than a stacked branch, so unlike the entry's own in-flight notes, CI *did* run and all three checks (`contact-memory-tests`, `dotnet-build`, `server-integration-tests`) went green. Separately, `docs/st-093-entity-queue-isolation` (tip `f41980b`) held the *only* copy of ST-093's board entry, and that branch **must never be merged**: its merge-base with `main` is `4b05e95`, 3 commits behind `main` (`git rev-list --count origin/docs/st-093-entity-queue-isolation..origin/main`), and `git diff --numstat origin/main origin/docs/st-093-entity-queue-isolation` sums to 175 additions / 7,860 deletions — merging it would revert ST-092's node-client hardening, the disposability-stamp corrections, and everything else landed on `main` since. Its ST-093 entry was lifted verbatim into `## Backlog` here instead (nothing else taken from that branch), with every `file:line` citation in it re-verified against current `main` first — all held up unchanged, since ST-092 never touched `entityWorker.ts`, `index.ts`, or either entity-worker test file.)
>
> Previously: 2026-08-22 (**ST-094 filed to Backlog** — the `policy.ts` permissive-default authorization gap, surfaced by `ce-compound-refresh` over `docs/solutions/conventions/` and verified independently twice. `requiresOperator` is `OPERATOR_ONLY_ROUTES.some(...)` over a 4-entry allowlist while `api.ts` registers 11 routes, so **the default is agent-reachable** and a new supervision route is reachable the moment it lands, with nothing reporting it. Three hand-kept enumerations (4 / 7 / 11), none derived from the router. Filed rather than fixed because it carries a decision the PO owns: flip the default to deny, or keep it permissive with a router-derived test as the guard. Same session corrected six stale `SPIKE / DISPOSABLE` stamps under `server/src/workflow/` to a PROVISIONAL note — corrected rather than removed, since ADR-016 is still Proposed/Conditional. A **seventh** stamp in `server/db/workflow/001_workflow_schema.sql` was deliberately left: the workflow migration runner checksums raw file bytes, so editing an applied migration trips `MigrationDriftError` and `index.ts` exits 1 before the port opens. ST-092 squash-merged as `69b50bd` (PR #52) while this was open; its entry and this line came in from `main` on merge. ST-093 still exists only on its own unmerged branch, which is why several docs disagree about whether it is filed.)
>
> Previously: 2026-08-20 (**ST-092 filed and implemented in one pass — entered Review directly, not Backlog, because the work is done and the Review slot was free.** Built from the two-lane cross-AI review of ST-088 Phase 3 (`03-REVIEWS.md`, codex + Antigravity, both source-grounded). Nine implementation units on branch `feat/st-092-node-client-hardening`, stacked on the unmerged ST-088 docs branch, so **CI has not run on it** — `.github/workflows/ci.yml` triggers only on `main` and PRs targeting `main`, and the local Docker test-stack run is the only gate this branch has had. **`server/src/` and `server/index.ts` are untouched**; every production change is in `server/scripts/awcp-node-client.mjs`. Regression gate passed against a delta declared *before* the comparison ran: 432 baseline + 50 added − **0 removed** = 482 identities, and the failure set matches the baseline name for name. 48 of the 50 additions were declared; the other two came from a defect found by *measuring* the shutdown change rather than trusting it — racing the heartbeat wait woke the loop but left the `setTimeout` pending, and a pending timer keeps Node alive, so the process outlived its own shutdown by 42.2s where clearing the timer takes 82ms. **The most valuable finding was not in either review lane**: `allocateSeq` wrote its counter with a truncate-in-place open, so the crash window was a zero-length file and the recovery path read it as 0 and returned 1 — the exact D-14 sequence reset the function's own docblock exists to prevent, reached by a door it never named. It surfaced while verifying an unrelated claim about rename call sites. **Findings §16.11 discharges §16.10's standing hazard** — "use the test stack" was an instruction and is now enforcement. **One stale note for the PO to reconcile, deliberately not edited here**: ST-088's entry below still says "Wave 6 (03-06) outstanding", but wave 6 shipped in `b32b6ab` (PR #50). **ST-088 stays In Progress**; ADR-016 remains Proposed/Conditional and the §6.1 pricing gate is untouched.)
>
> Previously: 2026-08-18 (**ST-088 Phase 3 waves 1–5 merged — PR #49 → `main` as `47cd90b`, and PR #48 as `f19fa47`.** The node-client half of criterion 6 ships: `server/scripts/awcp-node-client.mjs`, a single-file dependency-free Node client (`.mjs` because the repo has no `package.json` at any level), with a bounded crash-safe spool, ack-gated removal, oldest-first eviction, terminal auth (exit 77) versus deferred transport (exit 75), and heartbeat/checkpoint reporting. 32 new tests across two files; `server/src/` and `server/index.ts` untouched all phase — the client is purely additive. **SAFE-01 is an empty diff** (391 ok / 9 FAILED / 400, byte-identical to the 03-01 baseline, re-derived from the artifacts rather than taken from the plan summary — which is how a stated `389 ok / 9 FAILED` was caught summing to 398 before 03-06 quoted it verbatim into the findings document; `389` is Deno's *test function* count, not the JUnit testcase count). SAFE-02 corpus 33/33 unchanged. Two real bugs found while building, neither anticipated by the plan and both now test-covered: an **infinite loop in `flush()`** when a 200 acknowledged nothing from the batch just sent (zero progress, retry counter reset unconditionally), and **`flushOnce` calling `res.json()` before `res.status`** — a real 401 is plain text, so auth failures were misclassified `"unreachable"`, silently defeating D-17. **Criterion 6 is NOT discharged. Phase 3 is 5/6** — plan 03-06, the z2 enrolment and experiments 4–6, is deliberately unrun: it carries a `<human-check>` on its *output* (a human must read the committed findings section, because the mechanical credential gate cannot judge whether a quoted line reveals something else worth withholding), and it generates live credentials, SSHes to `personal-server`, and commits transcripts permanently. Its Tasks 1–2 are reversible (scoped `DELETE FROM workflow.execution_nodes`); Task 3 is not. Resume: `/gsd-execute-phase 03 --wave 6`. **Squash trailers now actually parse, and the convention changed to make that true.** `47cd90b` is the first squash on `main` whose `%(trailers:key=Story)` returns `ST-088`; every earlier squash returns empty. Two independent causes, both now in CLAUDE.md as Rule 1 and Rule 2: a blank line between `Story:` and the lines beneath it splits one trailer block into two and git reads only the last; and GitHub harvests `Co-authored-by:` from squashed commits and appends its own `---------` block *after* the PR body, pushing `Story:` out of scope no matter how the body is written. The repo's own history is the proof — every co-authored squash (`f19fa47`, `382c291`, `094b141`) has an empty trailer, every non-co-authored one (`1e15d94`, `5fc4bdf`, `75a40ea`, `d16ed06`, `89648d3`) parses. `--grep` worked throughout and is what governance depends on, so nothing was ever lost; the structured parser is the part that was broken. #49's branch was force-pushed (`c5dfde0` → `9cd2cd5`) to strip co-authors from 6 commits, with `git diff` between the two tips empty — content byte-identical. **Two decisions are open and blocking nothing yet.** (1) `FEATURE_WORKFLOW` is now hardcoded `"true"` on the base `mcp` service — before 03-01 the base compose contained the variable **zero** times and only `docker-compose.workflow.yml` set it, so every plain `docker compose up -d` now mounts the workflow module where it previously did not. `app.get("/workflow")` (`server/index.ts:1262`) serves a 15.6KB dashboard shell with **no auth middleware**, unlike `/api/workflow/*` (:1212) and `/workflow/nodes/*` (:1252) which both have one; the shell only fetches `/api/workflow`, which is authenticated, so an anonymous visitor gets chrome and not data. Port `3000:3000` is published on all interfaces, unlike `mcp-test`'s loopback-only `127.0.0.1:3001:3000`. Logged as `T-03-01-02`. (2) `.planning/STATE.md` progress metadata regressed when `state.begin-phase` recomputed it from the **phase directories on disk** rather than ROADMAP: `total_phases: 2` where ROADMAP declares 4, `completed_phases: 1` where Phases 1 and 2 are both `[x]`, and `percent` dropped entirely — leaving `current_phase: 03` greater than `total_phases`. Only phase dirs 02 and 03 exist; 1 and 4 have none. `phase.complete` would build its next-phase advance on those numbers. **ST-088 stays In Progress**; ADR-016 remains Proposed/Conditional. Review slot free.)
>
> Previously: 2026-08-15 (**ST-088 Phase 3 preflight — the four unknowns that gated planning are now resolved, and the headline is that criterion 6 is provable.** `.planning/STATE.md` had made z2 reachability the gating unknown, instructing that criterion 6 be recorded UNPROVEN if the node were unreachable. **It is reachable, in both directions.** Inbound: `ssh personal-server` (the `~/.ssh/config` alias for Tailscale `100.65.192.115`; a bare `ssh z2` fails publickey because it matches no alias and so offers no key — that near-miss is what made it look unreachable). z2 is Ubuntu `6.8.0-136`, **Node v18.19.1, no Deno**, exactly as the plan's §7.1 assumed. Outbound: `curl http://100.106.232.78:3000/health` **from z2** returns `{"status":"healthy"}`, so the node can reach this hub over the tailnet. Three constraints for Phase 3's plan to decide rather than let an executor discover: (1) **only the dev `mcp` service is reachable from z2** — `docker-compose.yml:54` publishes `3000:3000` on all interfaces, but `mcp-test` is `127.0.0.1:3001:3000`, loopback-only, so U4's real-node experiments cannot run against the test stack the way its hub-side tests do; (2) **`server/scripts/awcp-node-client.js` + ESM is a `SyntaxError` as specified** — the repo contains **no `package.json` at any level**, so Node resolves a bare `.js` as CommonJS; the plan must pick `.mjs`, a scoped `package.json` with `"type":"module"`, or CJS. Node 18 also emits an ExperimentalWarning on global `fetch`, which will appear in any captured stderr; (3) **`AWCP_NODE_ENROLMENT_SECRET` is unset/empty in both `mcp` and `mcp-test`** — last session verified the variable's *spelling*, not that it has a *value*. **CORRECTED 2026-08-15 by `ce-doc-review`:** this entry originally said an unset secret means registration "gets the quiet 401 by design". That was **inferred from source, never observed, and wrong** — `POST /workflow/nodes/register` on the dev hub returns **404**, because the node routes mount only inside `if (workflowFeatureEnabled())` and `FEATURE_WORKFLOW` is set solely by `docker-compose.workflow.yml`. The preflight probed `/health`, which answers identically whether or not the workflow module is enabled. `FEATURE_WORKFLOW` must be enabled on the **base `mcp` service** before any real-node leg can run. **ST-088 stays In Progress**; ADR-016 remains Proposed/Conditional and criterion 6 is still undischarged — reachability makes it provable, spooled replay from a real client is what discharges it. Review slot free.)
>
> Previously: 2026-08-14 (**ST-088 Phase 2 merged — PR #47 → `main` as `47284cc`.** The remote execution-node hub ships: an authorized machine registers with a bearer it already holds and streams execution events, ingested idempotently on `(node_id, client_seq)`. **Merged rather than squashed**, per CLAUDE.md's multi-story exception — the branch carried 24 commits spanning ST-088 (16), ST-091 (2), and GSD bootstrap (5), so all `Story:` trailers survive and `git log --grep` still resolves each story. **CI fully green on the merge**, including `server-integration-tests` — red on `main` since 2026-08-04 and now cleared. Two `Copilot Autofix` commits landed on the PR before merge (`0bc9d98`, `2b23a5b`): both **comment/label only**, no behavior change — the `api.ts` one corrected a stale `readJson` docblock that claimed an unparseable body became an empty object when it actually returns `BODY_UNPARSEABLE`. `.env.example` verified this session — `AWCP_NODE_ENROLMENT_SECRET` is spelled identically across `.env.example`, `docker-compose.yml`, and `remoteNodeHub.ts`, so the "unset means closed" failure mode cannot be triggered by a typo. **ST-088 stays In Progress** — ADR-016 remains Proposed/Conditional and **criterion 6 is not discharged**; the hub half exists, spooled replay from a real client is Phase 3. Review slot free.)
>
> Previously: 2026-08-13 (**ST-091 filed to Backlog** — move the .NET stack to the latest feasible SDK before .NET 8 LTS ends 10 Nov 2026. Scoped as "latest feasible" rather than a named version at the PO's direction: the selection criteria are the durable part, the version is their output, and today they resolve to `net10.0`. Surfaced by ST-088 close-out: `GovernanceAssetValidator -- validate .` could not run in WSL2 (`global.json` pins `8.0.100`, box has `10.0.110`), so an ADR and a solutions doc shipped hand-checked against the corpus rather than validated. Option A (install the .NET 8 SDK locally) applied as the interim unblock — a developer-environment fix touching no tracked file. **ST-088 stays In Progress**; its Phase 2 code-review remediation landed in four unpushed commits on `main` (`6f24c2f` enrolment gate closing the P0 self-provisioning hole plus 15 mechanical findings, `ff7a102` compose passthrough, `29b1320` the learning, `c6cb79c` ADR-016 §2 node-admission limits). ADR-016 stays Proposed/Conditional — **criterion 6 is not discharged**; the hub half exists, spooled replay from a real client is Phase 3. Review slot free.)
>
> Previously: 2026-08-04 (**ST-088 In Progress** — PR #46 merged to `main` as `382c291` (ST-088 Stage 2 plan + three pre-existing `search-golden-set.test.ts` CI failures fixed: corpus trigger disabled during seed to prevent consolidation worker deactivating corpus shards; `zoom meeting rotation` / `bcf retention rule` added to `LIVE_MEMBERSHIP_EXCLUDED_QUERIES`; corpus generator updated to preserve fixes). Plan at `docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md`. Six implementation units: U1 prices the 15-path enforcement surface (ADR-016 gate); U2-U4 implement and exercise the remote Ubuntu execution node (hub tables, Node client, experiments 4–6); U5 assesses actual execution blocking; U6 produces the final ADR-016 recommendation. In Progress slot taken by ST-088; Review slot free.)
>
> Previously: 2026-08-03 (**ST-084 Review → Done**, and **ST-088 filed**. The PO's Stage 1 review completed — the story's last outstanding item. All five proposed ADR-016 amendments accepted and applied as revision 1.2; **amendment 3 adopted in its stronger form, as an acceptance *gate***, so Candidate A may not be accepted while §6.1's policy-scope enforcement surface is unpriced. **ADR-016's status is unchanged — still Proposed/Conditional; the gate is recorded against, not discharged.** The review re-derived the findings against the tree rather than reading the document, and **two of the three §6 concerns had moved since the verdict was formed, in opposite directions**: §8's "not wired at boot" caveat is discharged by ST-086 (favours Candidate A), while §6.2's "a bad workflow migration cannot kill the server" is no longer true of a deployed server, since ST-086 chose fail-startup (counts against it). §6.1 re-verified and undiminished — `scope.tags` still enforced in zero retrieval paths. Recorded in findings §12a. ST-084's Stage 2 criteria block was split out as **ST-088** so merged, reviewed Stage 1 work could be marked Done rather than sitting behind three unticked criteria. **Both WIP slots are now free.**)
>
> Previously: 2026-08-03 (**ST-087 In Progress → Done** — PR #43 squash-merged to `main` as `1e15d94`. `git log --grep="Story: ST-087"` resolves to `1e15d94`, so the trailer is present and the story's shipped work is findable — check that on every squash rather than assuming it, since GitHub's default message is not obliged to carry it. ST-086's AC6 browser Point-in-Time Result was re-checked against this merge and **still holds**: `git diff f36903e..1e15d94 -- server/src/workflow/dashboard.ts` is empty, so its anchor stands unmoved. All eight acceptance criteria met; suite at **336 passed / 9 failed**, the nine being the documented provider-401 baseline, and CI green on `718b0f2`. The story's own red control found a defect in the story's own test — the null-path assertions stayed green under it, proving "null" rather than "null because there is no repository here" — now fixed with a same-run positive control. ST-086's criterion 5 was **re-evidenced, not re-ticked**: a checkpoint is now created with no `--commit` in argv and compared against a freshly-read `HEAD`. One production change (`awcp.ts` surfaces the API's per-field `issues[]`); git in the runtime image is a **settled** PO decision, not deferred work. **The In Progress slot is free**; ST-084 stays in Review awaiting the PO, ADR-016 stays Proposed/Conditional, ST-084 Stage 2 stays unstarted.)
>
> Previously: 2026-08-03 (**ST-086 In Progress → Done** — PR #39 squash-merged to `main` as `f36903e`, with the `Story: ST-086` trailer written deliberately into the squash message so `git log --grep` still finds the shipped work. Pre-merge run from the `main` checkout, bind mount confirmed: 334 passed / 9 failed (the documented provider-401 baseline); CI green. AC6's browser Point-in-Time Result re-anchored `0d3af13` → `f36903e` after proving `dashboard.ts` did not change between the browser run and the merge. One gap found while closing out and fixed at the source: `docker-compose.yml` enumerates the `mcp` service's environment explicitly, so `AWCP_AGENT_API_KEY` in `.env` never reached the container — the credential split silently did not apply on the Docker path, the only path an operator actually uses, while passing natively and in tests. Fixed in `0ba8064`. **The In Progress slot is now free**; ST-084 stays in Review, ADR-016 stays Proposed/Conditional, ST-084 Stage 2 stays unstarted.)
>
> Previously: 2026-08-02 (Two ST-086 workstreams landed. **Code review applied** — 18 findings fixed in `189b51c`, plus PO decisions on the five surfaced items: provider egress now refuses the tool call, the agent/operator credential split is enforced at the server, ST-086's missing plan is recorded as a deliberate soft-gate exception, CLI test coverage filed as ST-087, and the hardcoded provider URLs confirmed as ST-085 scope. **AC6 moved from *partially verified* to verified** — the dashboard was driven in a real headless Chromium, 28/28 checks, and the one defect it surfaced was fixed; CI still has no browser and deliberately gains none, see docs/workflow-mvp.md. ST-086 stays In Progress, ST-084 stays in Review, ADR-016 stays Proposed/Conditional.)

---

## Backlog

### ST-097: Transition — the WorkItem contract (D0), the GSD/CE workflow migration (A), and the first AWCP slice (B)
- Type: chore (design decision + workflow migration + product slice)
- Source: PO direction 2026-08-23, **restructured by PO direction 2026-08-24** after a five-reviewer pass returned two P0s. The 2026-08-24 direction identified a missing design boundary: the `ST-NNN` stories used to *develop* ai-memory/AWCP and the work items a *running* AWCP creates and monitors are two different concerns and must not be assumed to share a persistence or lifecycle mechanism. Grounded in [`awcp-strategy-baseline-2026-08.md`](../../docs/investigations/awcp-strategy-baseline-2026-08.md) and the external evidence import
- phase: D0 (contract) → A (workflow migration) ∥ B (AWCP slice)
- Value: 5
- Blocked by: **nothing is blocked on a decision.** The ADR-016 §1 override for migration `005` was **granted 2026-08-24** (narrow — that migration only), and the §3 storage-layout question is settled (existing `workflow` schema; WorkItem is the parent of WorkPacket in the same aggregate). D0-4 now *records* the override and must land before B2. **A4–A7 remain gated on ST-088 closing** — the milestone boundary at which the new structure becomes authoritative. Everything else, including the whole AWCP product slice, is runnable now
- Touches: `docs/design/adr/ADR-017-*.md` (new), `CONCEPTS.md`, `.planning/config.json`, `.planning/backlog-candidates.md` (new), `.github/planning/story-ids.md` (new), `.github/planning/story-board.md`, `CLAUDE.md`, `server/db/workflow/005_*.sql`, `server/src/workflow/{types,schema,store,readModel,attention,api,policy,dashboard}.ts`, `server/scripts/awcp.ts`, and the partitioned subset of the 77 files referencing the board
- Acceptance criteria:
  - [ ] **D0 — the WorkItem contract is a decision of record.** `ADR-017` states identity (`uuid`), external provenance as a `(source_system, source_ref)` pair, the relation to packet/run/session, and the supersession of `ADR-013` §4(b)'s *"the WorkPacket model"* layering — recorded as a reader instruction, with `ADR-013` left unedited per the strategy baseline
  - [ ] **D0 — AWCP-native work gets its own `AW-NNN` namespace**, allocated by AWCP's persistence rather than by the development-story allocator. `ST-NNN` stays the development identity and becomes *provenance* when AWCP dogfoods its own work *(PO decision 2026-08-24)*
  - [ ] **D0 — the granted ADR-016 §1 override is recorded before migration `005` lands.** §3 is explicitly *"not a host decision"* and cannot lift §1's bar, so this is an override, not compliance. The PO **granted it 2026-08-24**, narrow: migration `005` only, not evidence that ST-088 has completed the host decision, and every later AWCP migration returns for its own. D0-4 writes the dated Revision History entry, and records the §3 outcome — existing `workflow` schema, WorkItem as parent of WorkPacket in the same aggregate — in the same place
  - [ ] **D0 — a WorkItem has no aggregate authoritative status.** External requested-work status stays authoritative at its source (`awcp-spec-evaluation.md:163` assigns it to Jira); AWCP presents packet operational state and observed-session state separately under the WorkItem, and neither client synthesises `in_progress` or `blocked` from packets whose own status cannot be written *(design decision 2026-08-24)*
  - [ ] **A — archive, forward planning, and ID allocation are three separate artifacts.** The 48 Done + 6 Archived entries freeze as a delivery ledger that **no longer mints**; the 35 Backlog entries stage as requirement candidates; allocation moves to its own append-only registry
  - [ ] **A — the allocator records at mint time and never derives identity from history.** Concurrency-safety is proven by allocating the same id from two branches and getting a **merge conflict**, not a silent duplicate. **No new `ST-NNN` is minted until this lands**
  - [ ] **A — `999.x` is not used.** It is GSD's icebox, excluded from phase candidacy; forward work becomes schedulable by being a requirement of a milestone
  - [ ] **A — no live-milestone artifact is rewritten.** `.planning/REQUIREMENTS.md:66` and the three `ROADMAP.md` pointers are ST-088-milestone-scoped and expire at the boundary. The project-level restatements in `PROJECT.md` (`:59`, `:60`, `:77`) are amended at the boundary through that document's own Evolution mechanism
  - [ ] **A — a CE skill is observed executing inside a GSD-spawned agent.** Proof is an observed run, not a config diff
  - [ ] **B — the web UI is the primary surface** and renders a WorkItem with its packets and its observed sessions, visually distinguishing observed from authoritative. `awcp status` exists as a secondary diagnostic consuming the *same* read model
  - [ ] **B — a caller holding no UUID can resolve a WorkItem by provenance** (`GET /work-items/by-ref/story-board/ST-097`), which is the dogfooding path
  - [ ] **B — session capture fabricates nothing.** No packet id, no policy scope. An observed session announces itself on the node lane and is associated to a WorkItem only by an explicit claim; unclaimed is a legitimate terminal state
  - [ ] **B — attention is *out* of this slice** *(PO decision 2026-08-24)*, restoring baseline decision 4's ordering: provider/session truth and continuity precede the attention UI. The zero-attention requirement and its Red/Green Control are **deferred, not dropped** — specified in the plan's KTD-B6 so the attention milestone inherits them
  - [ ] **A — ST-097 is the bootstrap only.** It carries D0 and A1–A3; once A2 makes safe allocation possible, the remaining GSD-boundary work (A4–A7) and the AWCP product slice (B) each get their own story *(PO decision 2026-08-24)*. One story must not hold the development slot across both an ST-088 boundary wait and an independent product slice
- Plan: [docs/plans/2026-08-23-2245-chore-st097-gsd-pivot-board-split-awcp-status-slice-plan.md](../../docs/plans/2026-08-23-2245-chore-st097-gsd-pivot-board-split-awcp-status-slice-plan.md)
- Handoff:
  - **Read in this order:** (1) this story's plan, especially its **D0 verdict** and **Review disposition** table; (2) the strategy baseline's six decisions and its *"What is blocked, and on what"*; (3) `awcp-spec-evaluation.md:159-167` (the authority matrix) and `:177` (storage layout open, with its named process); (4) `ADR-016:57`
  - **The D0 verdict, in one line:** PARTIALLY SPECIFIED. `WorkItems → WorkPackets → AgentRuns` is the AWCP source spec's **own** model (`awcp-spec-evaluation.md` §1); the WorkItem layer was dropped between the Tier-2 evaluation and the Tier-1 ADRs, which say only *"the WorkPacket model"*. The provenance-not-replacement half is **already decided** by the authority matrix. The persisted entity is genuinely new
  - **Already decided — do not re-litigate.** GSD drives discuss→plan→execute→verify→review; CE is invoked via `agent_skills`; CE retains commit→PR. Runtime flips in the project config. The web UI is the primary product surface, **but attention is deferred past the continuity boundary**. `AW-NNN` for AWCP-native work; `ST-NNN` becomes provenance. The ADR-016 override is **narrow** — migration `005` only. ST-096 is coordinated, not superseded. Session events inherit the run-event retention posture. WorkItem is deliberately **scope-free** — Policy Scope stays the packet's, which closes the *capture* path by removing the field, though it does **not** stop an agent minting a packet, so the WorkItem binding write is operator-only
  - **Two corrections that cost the previous version its P0s.** (1) `REQUIREMENTS.md:66` is milestone-scoped, not a project rule — it expires at the boundary and needs no supersession edit. (2) There is **no join path** from an observed node stream to an authoritative run: `agent_runs.node_id` is `text` with no FK while `execution_nodes.node_id` is `uuid`. The previous plan's "read-time join without DDL" was false
  - **Hazards.** `.planning/STATE.md` is dirty in the tree and belongs to a concurrent session — do not touch it. `docs/st-093-entity-queue-isolation` **must never be merged** (175 additions / 7,860 deletions against `main`); lift content only. Nothing pushes. `POST /packets` is **not** in `OPERATOR_ONLY_ROUTES`, so an agent key can create a packet today — the prohibition is on the capture flow, not an existing server boundary
  - **Verification matched to scope, and commit-anchored.** D0 and A change no server code and run no Deno suite. B runs the workflow files only. A PR into a feature branch runs **no CI**, so the local run is the only gate — anchor every verification record to a commit SHA, never a date
  - **Numbering.** ST-097 verified free on `main` and across all local branches before filing. Four entries insert at the top of `## Backlog` (`main`'s ST-094, plus ST-095, ST-096, ST-097), so the conflict is four-way and resolves by **keeping all four**
- Notes: Value 5 — this is the transition the rest of the roadmap is sequenced behind. Filed on the board whose **queue role** it is retiring; the file itself survives as the delivery ledger, per `CLAUDE.md` §Workflow gate C5 — a governance change may not skip the gate. **Coordinates with [ST-096](#st-096-realign-the-gsd-milestone-structure-onto-the-awcp-capability-horizons) rather than superseding it** *(narrowing the 2026-08-23 decision, on the milestone-scoping evidence above)*: ST-096 is a pure sequencing plan that schedules the ST-088 → Horizon B–D boundary, and that boundary is exactly where A6 hands authority over. Its branch-landing requirement stands.

### ST-096: Realign the GSD milestone structure onto the AWCP capability horizons
- Type: chore (planning-structure realignment)
- Source: PO strategy round, 2026-08-23 — [`docs/investigations/awcp-strategy-baseline-2026-08.md`](../../docs/investigations/awcp-strategy-baseline-2026-08.md) and its [external evidence import](../../docs/investigations/awcp-external-evidence-import-2026-08.md). A supplied strategy synthesis proposed reorganising future work around capability horizons A–I; it was reviewed against the tree, revised once by its author after the review presumed-host objection, and settled by six PO decisions
- phase: 0 (planning structure)
- Value: 3
- Blocked by: **ST-088** — baseline decision 3 puts the first new milestone at Horizon B, *after* ST-088 closes and ADR-016 leaves Proposed/Conditional. Nothing here may be executed before that; the plan exists so the sequence is written down rather than rediscovered
- Touches: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/config.json`, `.github/planning/story-board.md`, `docs/investigations/awcp-spec-evaluation.md`
- Acceptance criteria:
  - [ ] **The planning-state lag is reconciled before ST-088 Phase 4 draws its conclusions, not after.** `ROADMAP.md:111` still shows `- [ ] 03-06-PLAN.md` unchecked though wave 6 shipped in `b32b6ab` (PR #50), and `REQUIREMENTS.md` traceability still lists NODE-01/02/03 **Pending** though `840a90c` is titled *"record phase 2 completion — NODE-01, NODE-02, NODE-03 discharged"*. Phase 4's job is weighing evidence; it must not first have to work out which of two records is true. **Where they disagree, the findings document plus merged PRs outrank derived GSD status**
  - [ ] **ST-095's runtime gate is discharged before `new-milestone` runs, as a prerequisite rather than a criterion.** `.planning/config.json` sets `"runtime": "copilot"`, and `buildAgentSkillsBlock` emits a Skill-tool directive for a namespaced plugin skill **only** when `runtime === 'claude'`. Until that resolves, GSD cannot invoke CE at all, so the entire GSD → CE structure the realignment assumes is inert. Same for `claude_md_path`, which points at `.github/copilot-instructions.md` rather than `CLAUDE.md`
  - [ ] **The milestone closes and `/gsd-new-milestone` opens Horizon B–D**, with horizons B, C and D as the requirement categories and phases derived from the requirements in the normal way — 4–6 per `granularity: standard`, not one phase per horizon
  - [ ] **Two verified external constraints appear as named requirements, not as background.** (a) The provider capability contract distinguishes **accepted vs delivered** for control verbs and **authoritative vs observed** for state reads; (b) live provider state is **managed-runtime-or-nothing** — a discovered session yields association, history and resumability, never live state
  - [ ] **Web-UI primacy is recorded in `awcp-spec-evaluation.md` as superseding its increment-7 deferral**, with the reason and the date. Horizon *order* is unchanged — B and C still precede D; it is the surface ranking that reverses
  - [ ] **The ADR-016 verdict selects between two conditional milestone shapes** (see the plan's Open Questions). Accept A pulls the co-tenancy tax forward; Recommend C pulls extraction/donor work forward. Neither is pre-chosen
  - [ ] `docs/investigations/awcp-strategy-baseline-2026-08.md` frontmatter `status:` moves off `baseline-confirmed-milestone-unwritten` once the milestone exists
- Plan: [docs/plans/2026-08-23-2210-chore-st096-gsd-milestone-realignment-plan.md](../../docs/plans/2026-08-23-2210-chore-st096-gsd-milestone-realignment-plan.md)
- Handoff:
  - **Read in this order, then stop:** (1) the strategy baseline — the six decisions and what was withdrawn; (2) the external evidence import — the two-axis capability contract and why it needed both sources; (3) this story's plan; (4) `ADR-016:57` and its acceptance pre-condition. Do **not** read the raw transcripts first; they are sources, and the import records which of their claims survived checking
  - **Already decided — do not re-litigate.** Host-neutral roadmap (decision 1). Horizons are milestones, not phases (2). First new milestone starts at **B**, after ST-088 (3). Web UI is the primary surface, superseding the increment-7 deferral, without reordering horizons (4). Architecture Analyzer, local-model routing, autoresearch and the provider-normalization lifecycle are **future strategy, not architecture** (5). Unsourced references imported or made named non-goals (6)
  - **The presumed-host trap, in one line:** *"one deployable system containing different domains/modules"* **is** Candidate A, and `ADR-016:57` says *"no schema or migration work may assume the host"* until the spike concludes. The sharper form is the ADR's own: Candidate A's reuse is *"still zero"* for session instrumentation and approval semantics — which is exactly what horizons B and F propose to build
  - **Hazards.** `.planning/` is contested — a concurrent session has had `STATE.md` dirty in the shared working tree throughout, and this file has now regressed **twice** (2026-08-15, fixed in `2e94be4`; and again uncommitted). Do not edit `.planning/` from a session that does not own it. `attention_items` was dropped **as a table** and attention made a derived pure function (findings `:106-109`) — a requirement written against a stored entity regresses that deliberately
  - **Verification matched to scope.** `grep` on the reconciled ROADMAP/REQUIREMENTS lines; `node ~/.claude/gsd-core/bin/gsd-tools.cjs query agent-skills <agent>` for the runtime gate; the roadmapper's own 100%-coverage validation for the new milestone. **Do not run the Deno server suite** — this story changes no server code
  - **Branch situation at filing.** Entry and plan land on `docs/awcp-strategy-baseline` (commits `7820607`, `95fde71`, `305c66d`, `36484da`), based on `main` at `6216a5f`, **not pushed**. Board-side `Plan:` is filled here but the entry stays in **Backlog** and is not moved to In Progress — same pattern as ST-094, whose plan sits on disk with live `story:` frontmatter while its board move was deferred by PO instruction
  - **Numbering.** ST-096 verified free on `main` and across all thirteen local branches before filing. Confirm again at merge time — this is the **third** story-board entry inserting at the top of `## Backlog` (with `main`'s ST-094 and this branch-family's ST-095), so that conflict is now three-way and resolves by **keeping all three entries**
- Notes: Value 3 — it produces no user-visible capability, but every later AWCP milestone is planned wrongly without it, and two of its criteria are corrections to records that are *already* wrong. **Deliberately not a re-plan of ST-088 Phase 4**: that phase has its own success criteria in `ROADMAP.md:121-140` and this story depends on its verdict rather than anticipating it.

### ST-095: Write the CE/GSD lifecycle boundary into governance, and wire `agent_skills`
- Type: chore
- Source: `ce-pov` verdict, 2026-08-21 — `docs/investigations/gsd-ce-lifecycle-drive-direction.md`. Triggered by the PO's question about mapping arXiv 2607.29516 (ARCTIC: Intent/Drift/Spotlight) onto CE vs GSD vs agentic-dev-team; the tooling question had to be settled before the review-handoff capability could be scoped.
- phase: 0
- Value: 3
- Blocked by: none technically. **WIP-blocked at filing** — ST-088 In Progress, ST-092 in Review, and this story edits governance, so it must not start until a slot frees. **Re-checked 2026-08-23:** ST-092 is now Done and the **Review slot is free**; ST-088 still holds In Progress. The block therefore still stands via In Progress alone — but ST-092's own entry is the precedent that a completed one-pass story may enter **Review directly** when that slot is open, so this need not wait for ST-088 if it is implemented in a single pass.
- Touches: `CLAUDE.md`, `.planning/config.json`, `AGENTS.md`, `.github/instructions/ways-of-working.instructions.md`, `docs/investigations/gsd-ce-lifecycle-drive-direction.md`
- Acceptance criteria:
  - [ ] **CLAUDE.md gains a "which system drives what" section.** It must state that GSD orchestrates `discuss → plan → execute → verify → review` through `.planning/`; that CE owns `docs/plans/`, the story board, and **commit + PR creation**; and *why* the commit/PR carve-out exists (only CE can honour the `Story: ST-NNN` trailer contract). Mechanical check: `grep -ci 'gsd\|get-shit-done\|\.planning/' CLAUDE.md` returns **0 today** and must return non-zero
  - [ ] **The Source-of-truth precedence list gains a tier for `.planning/` artifacts.** `docs/plans/2026-08-19-001-fix-st092-node-client-hardening-plan.md:17` already cites `.planning/phases/03-*/03-REVIEWS.md` as "Product authority", while the precedence list does not mention `.planning/` at all — so a reader today cannot resolve a conflict between a GSD review artifact and a Tier 1 document
  - [ ] **The GSD runtime gate is decided and recorded — this is a precondition for the criterion below, not a detail.** `.planning/config.json` sets `"runtime": "copilot"`, and `~/.gsd/defaults.json` sets the same machine-wide. `buildAgentSkillsBlock` (`~/.claude/gsd-core/bin/lib/init.cjs`) emits a Skill-tool directive for a namespaced `global:<plugin>:<skill>` **only when `runtime === 'claude'`**; on any other runtime it takes the `else` branch and warns *"requires a Skill-tool-capable runtime (claude) — skipping on runtime"*. `references/agent-skills-bootstrap.md:47` states the same. **So on this repo's config as it stands, populating `agent_skills` with CE skills does nothing at all** — the verdict's central mechanism is inert. Do not treat the flip as mechanical: `runtime` has ~118 references across `bin/lib/` and decides the global config home, the skills home, where slash commands materialise, agent-install location, and model resolution. The likely resolution is that **runtime is a property of the session's host, not of the repo** — `GSD_RUNTIME` takes precedence over `config.runtime` (`capability-state.cjs:409`), so `GSD_RUNTIME=claude` for Claude Code sessions leaves the Copilot default intact. Decide between that, flipping the project config, and accepting the mechanism as Claude-Code-only
  - [ ] **The boundary must land where GSD actually looks.** `.planning/config.json` sets `"claude_md_path": "./.github/copilot-instructions.md"`, so GSD-spawned agents are injected with *that* file, not `CLAUDE.md` — and `CLAUDE.md` itself records `.github/copilot-instructions.md` as architecturally stale (*"C# / SQLite / FTS5"*, superseded by ADR-009/ADR-011). Writing the boundary into `CLAUDE.md` alone leaves it invisible to every GSD agent. Resolve by one of: repointing `claude_md_path`, carrying the boundary in both files, or making `.github/copilot-instructions.md` point at `CLAUDE.md` the way `AGENTS.md` already does. Tightly coupled to the first criterion — do not close that one without closing this
  - [ ] **`agent_skills` is populated and the load is proven, not assumed.** At minimum `"gsd-code-reviewer": "global:compound-engineering:ce-code-review"` in `.planning/config.json`. Proof is two-part: `node ~/.claude/gsd-core/bin/gsd-tools.cjs query agent-skills gsd-code-reviewer` emits a **non-empty** block (it exits 0 with an empty one today), **and** one real `/gsd-code-review` run shows the CE skill actually ran — the namespaced form emits a Skill-tool directive, so "configured" and "executed" are different claims
  - [ ] **The `Story:` trailer audit becomes mechanical rather than remembered.** Pick one and implement it — a `commit-msg`/`pre-push` hook, a CI check on PRs targeting `main`, or a merge-checklist command whose output is recorded. Leaving it as prose is what failed twice; do not re-document the workaround and call it done
  - [ ] **A GSD-driven commit made under the new arrangement carries the trailer**, verified with `git log -1 --format='%(trailers:key=Story,valueonly)'` returning non-empty. This is the regression `docs/solutions/workflow-issues/gsd-commit-helper-omits-story-trailer.md` documents
  - [ ] **Decide and record whether this warrants an ADR (ADR-017) or lives in CLAUDE.md only.** All 14 existing ADRs are product-architecture; a tooling/process ADR would be a new category. Decide deliberately — do not default silently either way
  - [ ] `docs/investigations/gsd-ce-lifecycle-drive-direction.md` frontmatter `status:` is moved off `verdict-recorded-boundary-unwritten` once the boundary lands
- Plan: (to be created — `docs/plans/`)
- Handoff:
  - **Read in this order, then stop reading:** (1) `docs/investigations/gsd-ce-lifecycle-drive-direction.md` — the whole verdict, its grounding, and its provenance split; (2) `docs/solutions/workflow-issues/gsd-commit-helper-omits-story-trailer.md` — the incident this story prevents recurring; (3) `CLAUDE.md` § *Merge strategy* and § *Source-of-truth precedence* — the two sections being amended. Everything else is background
  - **Already decided — do not re-litigate.** Direction: GSD drives, CE is invoked from inside it. Carve-out: CE keeps commit + PR. agentic-dev-team: dropped (solo maintainer, ~5.5 months old, v12.0.0→v12.5.0 inside one week, and no drift/spotlight concept at all). Full consolidation onto either system: rejected. The reasoning and the citations are in the investigation doc
  - **Why the direction is what it is, in one line:** only GSD can persistently invoke the other. `agent_skills` reaches 22 consumer agent types across 38 of 88 workflows including the whole spine, and `buildAgentSkillsBlock` in `~/.claude/gsd-core/bin/lib/init.cjs` emits a namespaced `global:<plugin>:<skill>` as a **Skill-tool directive** on the Claude runtime — GSD *runs* the CE skill rather than reading its prose. CE has no equivalent wiring. Conventions are cheaper to rewrite than machinery that does not exist
  - **Still genuinely open — decide during this story, they were deliberately not pre-empted:** (e) the GSD runtime gate and the `claude_md_path` target, both added 2026-08-23 and both now carried as acceptance criteria above rather than left as questions, because each has a determinate answer once the PO picks a host story; (a) ADR or CLAUDE.md-only (criterion 6); (b) which enforcement mechanism for the trailer audit (criterion 4) — a hook is strongest but this repo has no hooks today, and CI only triggers on `main` and PRs targeting `main`, so a CI check would not fire on the stacked PRs that are the common case here; (c) whether `agent_skills` should carry more than the reviewer mapping, or stay minimal until the first one is proven; **(d)** whether a **Transition gate** belongs alongside the trailer audit — `.github/workflows/ci.yml` triggers only on `main` and PRs targeting `main`, so a PR into a feature or integration branch runs **no CI at all**, and ST-092 entered Review under exactly that condition. Both (b) and (d) are the same question wearing different clothes: what evidence must exist before work leaves a stage, and what enforces it. Context and the reasoning behind (d) are in the *Appendix — the RUP ↔ Compound Engineering mapping, evaluated* section of `docs/investigations/gsd-ce-lifecycle-drive-direction.md`; it arrived as a PO-supplied opinion piece on 2026-08-21 whose lifecycle mapping was otherwise superseded, but whose Transition gate landed on a real gap
  - **Hazards.** `gsd-ship` cannot be made to emit the `Story:` trailer — its core sections are frozen, `pr_body_sections` entries are append-only, and `ship.md:345` puts `gate_status:` alone on the final line after a blank line, which is exactly the separate-final-paragraph condition that voids trailer parsing. Do not "fix" this by routing the trailer through `pr_body_sections`; the carve-out exists because the fix does not exist. Separately: `.planning/STATE.md` metadata has regressed once before (2026-08-15, fixed in `2e94be4`), so re-read state rather than trusting a cached summary
  - **Verification matched to scope.** `grep` checks on `CLAUDE.md`; `node ~/.claude/gsd-core/bin/gsd-tools.cjs query agent-skills gsd-code-reviewer`; one real GSD-driven commit checked with `git log -1 --format='%(trailers:key=Story,valueonly)'`. **Do not run the Deno server suite** — nothing here touches `server/`, and an unrelated suite is not a safety net
  - **Branch situation at filing.** The investigation doc landed on `docs/gsd-ce-drive-direction`, based on `main` at `b32b6ab`, one commit (`5600e62`), **not pushed**. It was deliberately kept off `feat/st-092-node-client-hardening`, which is 22 commits ahead of `main` and in Review. This story's board entry was added on that same docs branch, in the Backlog section, far from the hunks the ST-092 branch touches (header and Review), so the two should merge cleanly — confirm rather than assume
  - **Downstream, not in scope here.** The ARCTIC human-review-handoff capability (Intent/Drift/Spotlight) remains unscoped. When it is scoped, it hangs off CE's PR stage reading `.planning/` + `docs/plans/` as its intent source — *not* off `gsd-ship`'s `pr_body_sections`, for the hazard above. No open-source implementation of that pattern exists to borrow from; the paper's data is legally unreleasable
- Notes: Value 3 rather than 4 because the damage so far has been traceability, not correctness — `git log --grep` kept working throughout, and only the structured `%(trailers)` parser was broken. The case for doing it anyway is that enforcement is currently *remembered*, and it has already been forgotten twice on `main` (`f19fa47`, `382c291` both return empty for `%(trailers:key=Story)`; `1e15d94` and `5fc4bdf` parse). Adjacent to **ST-066**, which has been Backlog since 2026-07-02 and covers the VS Code prompt half of the same governance gap — worth sequencing together if both are picked up. **Numbered ST-095, after two collisions.** This entry was drafted as ST-093, renumbered to ST-094 when a concurrent session filed ST-093 (entity_extraction_queue test-isolation) on `docs/st-093-entity-queue-isolation`, and renumbered again to ST-095 on 2026-08-23 when `main` was found to already hold ST-094 (router-derived workflow route authorization, filed 2026-08-22, with a plan on disk carrying live `story: ST-094` frontmatter). `main` owns ST-093 and ST-094; this branch owns ST-095 alone. Both this entry and `main`'s ST-094 insert at the top of `## Backlog`, so a merge conflict there is certain and must be resolved by keeping both entries. The split itself is not the defect: the defect is that the drive direction is undefined and varies per session, so `CLAUDE.md` names `docs/plans/` canonical (CE driving) while the ST-088 trailer omission happened under `gsd-execute-phase` (GSD driving).

### ST-094: Derive workflow route authorization from the router, not a hand-kept allowlist
- Type: security
- Source: `ce-compound-refresh` over `docs/solutions/conventions/`, 2026-08-22 — surfaced while auditing the learnings store, verified independently twice against the tree, and deliberately left unfiled until the PO decided it earned a story rather than a residual note
- phase: 2
- Value: 4
- Blocked by: — (nothing; `policy.ts` and `api.ts` are both stable, and ST-088 Stage 2 does not touch them)
- Touches: `server/src/workflow/policy.ts`, `server/src/workflow/api.ts`, `server/tests/workflow-policy.test.ts`
- Acceptance criteria:
  - [ ] A test derives the route set from Hono's `.routes` on the real `api.ts` router and asserts every registered route falls into exactly one bucket — operator-only or agent-reachable. There is currently **no** `.routes` introspection anywhere under `server/`, so this is new capability, not a refactor
  - [ ] **The derived test must re-apply the mount prefix.** `createWorkflowApi()` is a sub-app mounted at `server/index.ts:1237` via `app.route("/api/workflow", ...)`, so its `.routes` entries carry *unprefixed* paths, while `requiresOperator` matches full paths beginning `^/api/workflow/`. A test that forgets the prefix classifies every route as agent-reachable and passes vacuously — the exact failure the next criterion exists to catch
  - [ ] That test fails when a route is added to `api.ts` alone — proven by adding one, observing red for that reason, and removing it. A guard that cannot fail on the thing it guards is the shape this story exists to stop repeating
  - [ ] `CASES` in `workflow-policy.test.ts` gains a non-vacuity guard. It already has a discrimination control (an always-true classifier, `workflow-policy.test.ts:129-138`), but nothing proves `CASES` ever saw the real route set
  - [ ] The `requiresOperator` docblock's hand-listed "all seven reporting/read routes" (`policy.ts:75-78`) either derives from the same source or is deleted — a third hand-kept enumeration is a third thing that drifts
  - [ ] Decide and record whether the default flips to deny (allowlist) or stays permissive with the router-derived test as the guard. Either is defensible; leaving it undecided is not
- Plan: to be created under `docs/plans/` at implementation time
- Notes: 🔴 Must fix. Live production authorization, not a test blind spot. `OPERATOR_ONLY_ROUTES` (`policy.ts:65-70`) holds **4** patterns and `requiresOperator` (`policy.ts:85`) is `OPERATOR_ONLY_ROUTES.some(...)`, so **the default is `false` = agent-reachable**. `api.ts` registers **11** routes; the decision is consumed at `server/index.ts:1231`. A new supervision route added to `api.ts` alone is therefore agent-reachable the moment it lands, with nothing reporting it. **Three** hand-maintained enumerations must stay in sync and none derives from the router: `OPERATOR_ONLY_ROUTES` (4) · the `requiresOperator` docblock prose (7) · `CASES` (11). The repo already holds the rule this violates — [`verification-mechanisms-need-adversarial-review.md`](../../docs/solutions/conventions/verification-mechanisms-need-adversarial-review.md) §1 (*"Prefer allowlists to blocklists for any boundary check"*) and its When-to-Apply list (*"Any boundary, allow/deny, or lint-style check over a surface that grows"*) — two locations, not one passage. This is that rule never applied to a second surface. [`fix-the-assumption-not-the-symptom.md`](../../docs/solutions/conventions/fix-the-assumption-not-the-symptom.md) Instance 4 is the same shape one level down, but its blast radius was a *test* blind spot; this one's is live authorization. Line numbers are named alongside symbols deliberately — see this story's own source. **Scope boundary:** this covers `/api/workflow` only. The remote node hub is mounted separately at `server/index.ts:1257` (`app.route("/workflow/nodes", createRemoteNodeHubRoutes())`) behind its own `validateNodeBearer`, deliberately outside this middleware — a different credential boundary, not in scope here. **Precedent that this module has this exact failure class:** [`a-credential-format-gate-is-not-an-authorization-gate.md`](../../docs/solutions/conventions/a-credential-format-gate-is-not-an-authorization-gate.md) (`severity: critical`) records a shipped authorization gap in this same `workflow/` area that survived three review passes, one of them automated. Its tell — *"A docblock stating a security property is a claim to verify, never evidence"* — lands squarely on `requiresOperator`'s hand-listed prose.

### ST-093: Fix entity_extraction_queue test-isolation defect in entity worker observability tests
- Type: debt
- Source: ST-092 (node-client hardening) close-out, 2026-08-21 — `entity-worker-observability.test.ts`'s pass/fail flip across runs was traced to queue pollution rather than to that branch's own changes; two earlier explanations ("environmental", then "this branch's tests expose it") were both falsified before the queue-isolation cause was identified
- phase: 2
- Value: 2
- Blocked by: — (nothing; a self-contained fix in one test file, and its sibling)
- Touches: `server/tests/entity-worker-observability.test.ts`, `server/tests/entity-worker-crash-isolation.test.ts` (only if it shares the exposure — see acceptance criteria)
- Acceptance criteria:
  - [ ] `entity-worker-observability.test.ts`'s three tests no longer assume they are the only rows in `entity_extraction_queue`, and no longer assume their own call to `processQueue()` produced the `worker_runs` row they read back. `processQueue()` (`server/src/entityWorker.ts:148`) claims up to `BATCH_SIZE` (10) oldest-pending rows per call (`ORDER BY queued_at ASC ... LIMIT 10 FOR UPDATE SKIP LOCKED`), not just the row a test seeded, so `items_processed` picks up any foreign pending rows left by other tests or earlier runs against the shared, accumulating `db-test`. There is a second hazard beyond stale rows: `startEntityWorker()` runs at boot (`server/index.ts:1317`) on a 10s poll unless disabled, and there are two independent flags rather than one: `FEATURE_ENTITY_WORKER=false` (gate at `server/index.ts:1313`) and `ENTITY_WORKER_DISABLED=true` (checked inside `startEntityWorker`, `server/src/entityWorker.ts:325`) (`POLL_INTERVAL_MS`, `entityWorker.ts:5`), and the `mcp-test` container the test runs inside is that same boot — so the live background worker can claim the test's seeded row via `SKIP LOCKED` before the test's own `processQueue()` call runs, leaving the test reading a `worker_runs` row (`ORDER BY started_at DESC LIMIT 1`) that its own call didn't produce. Clearing the queue does not close this race by itself. Fix needs both: (a) clearing/claiming past `entity_extraction_queue` state before seeding so the claimed batch is guaranteed to contain only the test's own row (with ten-or-more stale older-`queued_at` pending rows, the test's row can also simply miss the `LIMIT 10` batch — clearing beats filtering), and (b) asserting on the specific run the test's own `processQueue()` call produced — e.g. snapshot the newest `worker_runs.run_id` before calling, then assert against a row newer than that snapshot — rather than trusting "newest `worker_runs` row" to mean "my row". Implementer's choice on mechanism, but both hazards must be closed
  - [ ] `entity-worker-crash-isolation.test.ts` checked for the same exposure. As found during this story's filing, it does **not** manually seed `entity_extraction_queue` and does not assert on `items_processed` — its three tests assert on `capture_thought`/`thought_stats`/health-endpoint success and on `safePoll`'s failure-counter behavior, not a queue-wide count — so it did not appear to share the defect. Re-confirm this against the tree at fix time and apply the same isolation fix if it turns out to
  - [ ] Red/green control demonstrated: before merging the fix, seed a foreign pending row in `entity_extraction_queue` deliberately and confirm the *unfixed* test fails on it, then confirm the *fixed* test still passes with that foreign row present. Record the seeded-row cleanup so this control run doesn't itself leave pollution behind
- Plan: (to be created)
- Notes: The failure is **intermittent**, not deterministic — it depends on what, if anything, is sitting in `db-test`'s `entity_extraction_queue` when the test runs, and `db-test` is wiped only on container stop, not between runs (CLAUDE.md § Dev vs Test isolation). A story description or reviewer expecting a reliably-reproducing failure will see it pass on the first try; that is expected, not evidence the defect is gone. First test's assertion is `assertEquals(run.items_processed, 1)` at `server/tests/entity-worker-observability.test.ts:44`; the `finally` blocks (lines ~51-56, ~112-117, ~153-158) delete only each test's own `thought_id`, never touching rows left by anything else.

### ST-091: Move the .NET stack to the latest feasible SDK (off net8.0, before .NET 8 EOL)
- Type: infrastructure
- Source: ST-088 close-out, 2026-08-13 — `dotnet run --project tools/GovernanceAssetValidator -- validate .` could not run in WSL2 (`global.json` pins `8.0.100`; the box has `10.0.110` only), so an ADR + solutions-doc frontmatter change shipped hand-checked rather than validated
- phase: 2
- Value: 3
- Blocked by: — (nothing; the only real dependency is doing it while the C# surface is still small)
- Touches: `global.json`, `Directory.Build.props`, `.github/workflows/ci.yml` (:117), `src/AiMemory.sln`, `.editorconfig`
- Acceptance criteria:
  - [ ] **First, and before any retarget:** `tools/GovernanceAssetValidator.Tests` added to `src/AiMemory.sln`. It is absent today, so CI's `dotnet test src/AiMemory.sln` runs only the placeholder `SmokeTests` and the validator's own tests — the repo's only real C# coverage — never execute. Without this the retarget has nothing to prove itself against
  - [ ] **Target chosen at plan time and recorded with its reasoning** — this story is "latest feasible", deliberately not a version fixed in advance. *Feasible* means all of: **GA** (never a preview or RC); installable via `actions/setup-dotnet`; supported by all four analyzer packages, where `StyleCop.Analyzers 1.2.0-beta.556` is the binding constraint; and inside a support window long enough to repay the analyzer sweep. **Default to LTS** — even-numbered releases carry three years, odd-numbered eighteen months, and an STS target means repeating this sweep in ~18 months for what is build tooling only. As of 2026-08-13 that resolves to **net10.0** (GA since Nov 2025, LTS, already on the dev box as 10.0.110) — re-derive rather than inherit it. If the work slips past ~Nov 2026, .NET 11 should be GA on the established annual cadence but is STS, so 10 most likely still wins
  - [ ] `global.json` moved to the selected SDK's feature band (note the current `rollForward: latestPatch` is a tight pin — it accepts only `8.0.1xx`, not even the `8.0.4xx` feature band; consider whether a looser policy is wanted alongside the move)
  - [ ] `Directory.Build.props`: `TargetFramework` → the selected TFM, `LangVersion` raised from 12 to whatever that SDK supports
  - [ ] `.github/workflows/ci.yml:117` `dotnet-version: '8.0.x'` moved **in the same commit** — dev and CI must never build on different SDKs
  - [ ] Analyzer sweep completed. `TreatWarningsAsErrors=true` + `AnalysisLevel=latest-recommended` means the rule set tracks the SDK, so two majors' worth of newly-recommended rules arrive as build **errors**. Every new suppression documented in `.editorconfig` with rationale, per CLAUDE.md
  - [ ] `StyleCop.Analyzers 1.2.0-beta.556` either upgraded or its incompatibility with the newer Roslyn recorded — it is a long-standing beta and the likeliest source of sweep noise
  - [ ] `dotnet build src/AiMemory.sln` and `dotnet run --project tools/GovernanceAssetValidator -- validate .` both green, run from a checkout matching CI
- Plan: (to be created)
- Docs: `CLAUDE.md` § .NET analyzers and warnings (the suppression-logging requirement this story must honour)
- Notes: **Framed as "latest feasible" rather than a named version, deliberately** (PO, 2026-08-13). Pinning a target in a backlog entry bakes in whatever was current the day it was written, and this story may sit for months — the selection criteria above are the durable part, the version is their output. **Deadline-driven: .NET 8 LTS support ends 10 November 2026.** Whatever is selected will skip 9, whose STS window has already closed. **This is the cheapest this migration will ever be** — 752 lines of C# repo-wide, effectively one real project (`GovernanceAssetValidator`); `AiMemory.Server/Program.cs` is 3 lines and `IMemoryService.cs` is 6, and ST-019 has not landed. **No runtime blast radius:** nothing ships .NET — no Dockerfile references it and the server is Deno — so this is a build-and-tooling change only. The retarget itself is three lines because `TargetFramework`/`LangVersion` are centralised in `Directory.Build.props`; the cost is entirely the analyzer sweep, which is unpredictable until run. Placed at the top of Backlog on the strength of the external deadline rather than a value judgement against the stories below it — move it if that reads wrong. **Interim unblock already applied (Option A), 2026-08-13:** the matching SDK turned out to be installed at `~/.dotnet/sdk/8.0.100` already — it was never a missing SDK, only a PATH one, since `/usr/bin/dotnet` resolves to the system 10.0.110. `~/.dotnet/dotnet run --project tools/GovernanceAssetValidator -- validate .` returns **Validation succeeded**, and CLAUDE.md's .NET section now records that invocation plus the reason not to put `~/.dotnet` on PATH globally (it holds 8.0.100 only, so it would shadow 10.0.110 for every other project). That is a documentation fix for a recurring trap, not a reduction in this story's scope — the split root and the EOL clock both remain. **Check `.github/workflows/ci.yml:117` early:** `dotnet-version: '8.0.x'` resolves to the newest 8.0 SDK, which is in the `8.0.4xx` band and would *not* satisfy this `global.json` — so either CI's .NET job is already failing or setup-dotnet is reading `global.json` instead. Worth confirming before planning, since it changes whether this story fixes a break or merely moves a pin.


### ST-085: Investigate local GPU inference as ST-082's compliant model provider
- Type: spike / investigation
- Source: `ce-pov` verdict 2026-07-31 (grade: Trial; reversibility tier 3)
- phase: 2
- Value: 3
- Blocked by: — (subordinate to ST-082 — close unstarted if ST-082 concludes corporate-scoped content should never be processed at all)
- Touches: `server/src/entityWorker.ts` (:66, hardcoded provider URL), `server/src/consolidationLLM.ts` (:37, same), `server/src/healthCheck.ts` (provider reachability), `server/tests/` (new extraction golden set)
- Acceptance criteria:
  - [ ] **Stage 1 (hard gate):** settle definitively, against AMD's official ROCm WSL compatibility matrix, whether the Radeon RX 7700S (gfx1102) is supported under WSL2 — currently **uncorroborated**. If it is not, prove reachability of a Windows-hosted Lemonade Server (`http://localhost:13305`) from the WSL-hosted Deno runtime, measure the added latency, record which device actually served the request, and confirm Lemonade supports the RX 7700S **at all on Windows** (assumed throughout, never verified)
  - [ ] **Stage 2:** both chat-completion call sites take a configurable base URL mirroring the existing `OPENROUTER_BASE_URL` pattern (`server/src/embeddings.ts:6`, `server/src/healthCheck.ts:91,97`) — landing **with** ST-082's scope-aware routing, not bolted on afterwards
  - [ ] **Stage 3:** an extraction golden set exists (none does today — `search-golden-set.test.ts` covers search only and the entity-worker tests cover crash-isolation/observability, not output quality; `server/tests/fixtures/consolidation-corpus.sql` can seed one) and a local 7–8B model is measured against `openai/gpt-4o-mini` for node/edge precision, recall, and malformed-JSON rate under `response_format: json_object`
  - [ ] The **"do nothing"** baseline — deny corporate scope under ST-082, keep cloud for everything else — is explicitly beaten on compliance coverage, or the story closes with that conclusion recorded
- Plan: `docs/plans/2026-07-31-001-spike-local-gpu-inference-provider.md`
- Docs: ST-082 (the `model-provider routing` default-deny criterion this serves); ST-022 (established the OpenRouter extraction provider this revisits)
- Notes: **Confirmed in scope by the ST-086 review (2026-08-02):** `entityWorker.ts:66` and `consolidationLLM.ts:37` hardcode `https://openrouter.ai/api/v1/chat/completions` and never read `OPENROUTER_BASE_URL`, so ST-086's provider sentinel is structurally blind to both. That is not merely a configurability gap — it means any "zero provider requests" evidence gathered by redirecting `OPENROUTER_BASE_URL` covers only two of the four egress paths. Stage 2's base-URL seam therefore also buys *observability of provider egress*, which the PO accepted as ST-085 scope rather than patching under ST-086. Explicitly **not** a cost-reduction play — the GPU is pursued only as ST-082's enabler, and the primary question is the product one (should corporate-scoped memories receive extraction at all). Local **embeddings** are out of scope: `embedding vector(512)` behind HNSW (`server/db/schema.sql:18`) makes any dimensionality change a one-way schema migration + full re-embed for near-zero reward. **NPU offload is hardware-infeasible** — Lemonade requires XDNA2 (Ryzen AI 300/400); this host is a Ryzen 7 7840HS (Phoenix/XDNA1). Reversal trigger fires immediately if Stage 1 finds only CPU or the 780M iGPU reachable.


### ST-083: Developer Memory design pass (module spec)
- Type: design
- Source: AWCP §8 Q10 (PO decision 2026-07-29, PR #31); fires ADR-013's "Developer Memory design begins" revisit trigger
- phase: 2
- Value: 4
- Blocked by: —
- Touches: `docs/design/adr/ADR-007-consolidation-pipeline.md` (existing, may need revision); new Developer Memory module spec doc(s); `docs/design/adr/ADR-013-platform-product-definitions.md` §4(a) (disposition revisit)
- Acceptance criteria:
  - [ ] Developer Memory's module spec authored, covering at minimum `record_decision` / `search_decisions` / `get_project_context` — the shape AWCP's own knowledge needs already implied (`docs/investigations/awcp-spec-evaluation.md` §4, §8 Q10)
  - [ ] Relationship to AWCP's operational module clarified: Developer Memory owns promoted/recalled knowledge (ADR-007 consolidation scoring — frequency, diversity, helpfulness), AWCP's operational model owns transactional execution state — per the truth-conditions distinction the `prism-llm-wiki` boundary plan drew (recall-promoted vs. correlation-expires)
  - [ ] ADR-013 disposition (a) (consolidation worker, currently grandfathered) revisited: converts to relocated/fenced, or is explicitly re-grandfathered with rationale
  - [ ] Storage/schema implications assessed against [ADR-016](../../docs/design/adr/ADR-016-awcp-consolidation-host-topology.md) §3's still-open storage-layout axis (informs, does not have to resolve, that decision)
- Plan: (to be created — `docs/plans/`)
- Docs: `docs/investigations/awcp-spec-evaluation.md` §4, §8 Q10; `docs/design/adr/ADR-007-consolidation-pipeline.md`; `docs/design/adr/ADR-013-platform-product-definitions.md` §4(a); `prism-llm-wiki` boundary plan (`docs/plans/2026-07-28-001-docs-developer-memory-prism-boundary-plan.md`) for the truth-conditions distinction
- Notes: Committed as a real follow-on story rather than "raw platform primitives forever" (PO decision, AWCP §8 Q10, 2026-07-29) — AWCP's own knowledge requirements are effectively Developer Memory's spec already. Verify referenced file paths/sections still hold when picked up — memories freeze in time.

### ST-082: Enforce `scope.tags` as a retrieval filter (corporate/personal isolation)
- Type: hardening / security
- Source: AWCP §8 Q9 (PO decision 2026-07-29, promoted to Must, PR #31)
- phase: 2
- Value: 4
- Blocked by: —
- Touches: `server/src/searchQuality.ts` (must consume `scope.tags` as a retrieval filter — currently parsed but not enforced), `server/src/parseContext.ts` (parsing already shipped), `server/tests/`
- Acceptance criteria:
  - [ ] `scope.tags`, already parsed by `parseContext.ts`, is enforced as a retrieval filter in `searchQuality.ts` across both `search_thoughts` and `list_thoughts` lanes — not merely available on the context object
  - [ ] **Controlled policy-scope field** (extended per PR #31 governance round, AWCP §8 Q9): observations/sources carry a closed-vocabulary policy scope distinct from free-form descriptive tags — ordinary tags are not the sole policy boundary
  - [ ] **Default-deny** semantics for retrieval *and* model-provider routing: content is never returned to, or sent through a provider for, a scope it wasn't granted; absence of scope means deny, not allow
  - [ ] **Negative isolation tests across every egress path** — lexical search, vector search, graph traversal, context assembly, and exports — each proving corporate-scoped content is not reachable from a personal scope and vice versa (not just the search lanes)
  - [ ] ADR-012's descriptive tag vocabulary is unchanged — the policy-scope field is additive, not a tag-vocabulary rewrite
  - [ ] Documented as the load-bearing control set for corporate/personal isolation per `docs/investigations/prism-ground-truth-inventory.md` §6 item 1 and AWCP §8 Q9 (rev 1.5)
- Plan: (to be created — `docs/plans/`)
- Docs: `docs/investigations/awcp-spec-evaluation.md` §8 Q9; `docs/investigations/prism-ground-truth-inventory.md` §6 item 1; `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` §4
- Notes: Promoted from a known, previously-deferred gap (`docs/investigations/awcp-spec-evaluation.md` §4) to a **Must** now that AWCP's local source-lineage tracker (ADR-016 §4) will co-locate corporate Confluence/Jira/ADO-derived content with personal memory in the same store. Should land before or alongside that tracker's implementation, not after — verify `parseContext.ts`/`searchQuality.ts` still match this description when picked up.

### ST-080: Revisit deployment host — self-hosted homeserver + Tailscale (fills ADR-009's deferred host decision)
- Type: spike / architecture decision
- Source: Investigation `docs/investigations/homeserver-tailscale-deployment-evaluation.md` (2026-07-22) — PO proposal to host the platform (and potentially all products) on a personal Z2 homeserver over Tailscale
- phase: 0 (platform)
- Value: 4
- Blocked by: —
- Unblocks: **ST-024** (PG17/PG18 + AGE v1.7.0 — the homeserver is the demonstrated requirement its deferral waited for); dissolves Risk A + Risk B from `age-platform-divergence-product-impact.md`
- Touches: `docs/design/adr/ADR-014-*.md` (new — production host decision); `docs/design/adr/ADR-009-deployment-model.md` (fill the deferred host slot / cross-link); `docs/architecture/ai_memory_architecture_decisions.md` Decision 7 (revisit Contact Memory Supabase); `CLAUDE.md` (deployment note)
- Context: ADR-009 **never selected a production host** (`:74-86`, deferred to post-spike; spike ST-021 is done). The Z2 homeserver fills that open slot and, being an AGE-capable self-hosted Postgres on owned hardware, unifies platform + products (removes the Supabase-no-AGE divergence) and affords the latest Postgres major. Client model confirmed: cloud web assistants (ChatGPT/Claude.ai/Gemini) must connect, so the Bearer-gated `/mcp` edge is exposed via **Tailscale Funnel** (or a tunnel) while DB + workers stay tailnet-private — exposure posture identical to the status-quo public VPS.
- Acceptance criteria:
  - [ ] **ADR-014 "Production host: self-hosted homeserver + Tailscale, MCP edge via Funnel/tunnel"** authored, *filling* (not silently superseding) ADR-009's deferred host decision; cross-references ADR-009/010/011, Contact Decision 7, and ST-024
  - [ ] ADR records the resolved open decisions: Funnel vs Cloudflare Tunnel vs reverse proxy for the `/mcp` edge; availability target for a home box; **off-site encrypted backup destination + cadence + a restore drill** (hard requirement, not optional); Postgres major (PG17 vs PG18) and the AGE tag in that per-major namespace (ST-078 constraint)
  - [ ] Security posture documented, scoped to the real threat (Funnel opens no router port and exposes only the one service — see investigation §2a): DB + workers tailnet-only; only Bearer-gated `/mcp` public; **Tailscale ACLs + unprivileged container + app patching** to contain a compromised process. LAN/VLAN segmentation recorded as optional defense-in-depth, **not** a Funnel requirement
  - [ ] Single-user dependency recorded explicitly so a future multi-user pivot re-opens this decision (ADR-011 "must not foreclose multi-user")
  - [ ] Contact Memory Decision 7 revisited: build on the platform MCP vs stay on Supabase — with a staged-migration recommendation (platform first, Contact after stable)
  - [ ] On acceptance, **ST-024 moved out of `deferred`** (its trigger — a use case needing latest AGE — is now met)
- Plan: `docs/investigations/homeserver-tailscale-deployment-evaluation.md` §6-§7 (recommendation + open decisions)
- Notes: The critical caveat is **availability** — a home box is a SPOF with no SLA; the ADR must own uptime/backups rather than assume managed-service durability. Value 4 because it unblocks the graph roadmap (ST-024/ST-034) and removes the platform's biggest architectural divergence. Verify ADR-009 line refs (`:74-86`, `:88-96`, `:130-133`) still hold when picked up — memories freeze in time.

### ST-079: Governance guardrail — products inherit the platform graph (AGE) tier by default
- Type: chore / governance
- Source: Investigation `docs/investigations/age-platform-divergence-product-impact.md` (2026-07-21) — Risk A (unacknowledged Postgres+AGE vs Supabase-no-AGE divergence)
- phase: 0 (governance)
- Value: 3
- Blocked by: —
- Touches: `docs/design/adr/ADR-015-*.md` (new — the guardrail ADR; renumbered from ADR-013 on 2026-07-28: ADR-013 taken by platform/product definitions per ST-081, ADR-014 reserved by ST-080); `CLAUDE.md` (one-line pointer near the Contact Memory Supersession Map)
- Problem: The platform mandates Postgres + Apache AGE (ADR-003/009/011), but Contact Memory deploys on Supabase without AGE — a choice explicitly scoped "for Contact Memory deployment only" (`CLAUDE.md:32`). No document analyzes the resulting two-database divergence as a risk. Developer Memory's deployment target is undecided; a future "just use Supabase like Contact did" choice could silently strip the graph tier that ADR-003/011 treat as first-class, without anyone weighing the cost.
- Acceptance criteria:
  - [ ] New **ADR-015 "Products inherit the platform graph tier by default"** (renumbered from ADR-013, 2026-07-28): products built on the Platform MCP inherit its storage capabilities including the AGE graph; moving a product onto a stack that omits AGE (as Contact→Supabase) is a **per-product decision that must explicitly account for losing graph-based retrieval (ADR-003 Mode 2 / entity traversal)** — it does not become the platform default
  - [ ] ADR-015 cross-references ADR-003/009/011, ADR-013 (platform/product definitions — the guardrail is a sub-rule of its platform-capability inheritance), the Contact supersession note (`CLAUDE.md:32`), and ST-024 for the version ceiling (Risk B)
  - [ ] One-line pointer to ADR-015 added in `CLAUDE.md` near the Contact Memory Supersession Map
  - [ ] Guardrail is framed as "weigh the cost each time", **not** a ban on divergence — Contact's deliberate trade remains valid
  - [ ] No duplication of ST-024 (the deferred PG17/AGE-v1.7.0 upgrade owns Risk B); this story owns Risk A only
- Plan: `docs/investigations/age-platform-divergence-product-impact.md` §7 (recommendation); ADR to be authored on pickup
- Notes: Low severity / governance hygiene. Closes the gap the AGE-divergence investigation surfaced. The ADR wording is drafted in the investigation's §7 recommendation — pickup is mostly formalizing it into ADR-013 and cross-linking. Verify ADR-003/009/011 line refs still hold when picked up — memories freeze in time.

### ST-034: Spike — Graph-expanded "connected" retrieval: cardinality bounding + orchestration design
- Type: spike
- Source: PO (brainstorming session 2026-05-22, entity↔thought provenance design); scope widened 2026-06-04 to carry the connected-retrieval orchestration outcome (PO decision during ST-054 intake)
- phase: 2
- Value: 3
- Blocked by: ST-037 (needs accumulated real data from dogfooding)
- Touches: `docs/investigations/graph-expanded-search-cardinality.md` (new); no code changes expected
- Acceptance criteria:
  - [ ] Findings doc quantifies the cardinality problem on current dev data: for each entity label (Person/Function/Error/Topic/Project), the distribution of (thoughts mentioning entity) and (entities reachable at 1-hop, 2-hop)
  - [ ] At least 3 bounding strategies evaluated with trade-offs: hard limits (top-N per hop), score-based ranking (shared-entity count / edge confidence / recency / recall_count), and edge-type allow-listing (e.g. exclude `RELATED_TO` from expansion; weight `CAUSED_BY` higher than `LIKES`)
  - [ ] One strategy recommended for graph-expanded search v1 with rationale grounded in the observed dev-data distribution (not a guess)
  - [ ] Findings note explicitly addresses: does a popular entity (e.g. "TypeScript" if it appears in many thoughts) reliably get pruned, or does it dominate results?
  - [ ] **Orchestration design (added 2026-06-04):** recommend *when* graph expansion fires and *how* its candidates fuse with the lexical/vector path — specifically a **conditional** trigger on thin/low-confidence results (not always-on, to protect latency and ranking predictability) plus a **bounded-boost** fusion into the existing RRF/MMR ranker. Grounds the "surface connected memories" requirement that motivated ST-054 but is out of ST-054's scope
  - [ ] Out of scope: implementing the strategy (a follow-on feature story owns the graph-expanded search tool itself)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-034.md` (to be created)
- Relates to: ST-054 (retrieval robustness) — ST-054's thin-corpus / low-confidence result signal is the trigger condition this spike designs the graph expansion against; ST-034 owns the "connected memories" answer ST-054 explicitly defers
- Notes: Surfaced 2026-05-22 during entity↔thought provenance brainstorming. Without a bounding strategy, 1-hop expansion over popular entities returns hairballs and drowns out the high-signal hits that motivate the graph lane. Foundational design — settle before any graph-expanded search tool ships, not retrofitted after users hit noise. **Why widened 2026-06-04:** the build-failure false-empty incident (ST-054) showed the conceptually-correct mechanism for "surface *connected* memories" is the AGE graph, but it is built and orphaned from the default search path. Rather than spawn a duplicate "Story B", this spike now also designs the orchestration (conditional trigger + bounded-boost fusion) so the connected-retrieval feature story that follows has a settled design, not just cardinality numbers.

### ST-077: Spike — Applicability of Qwen3-VL Embedding + Reranker two-stage (and multimodal) retrieval to ai-memory search
- Type: spike / applicability review
- Source: PO (learnopencv newsletter — "How to master Qwen3-VL Embedding and Reranker for multimodal search", 2026-07-13)
- phase: 2 (retrieval quality)
- Value: 2
- Blocked by: —
- Touches: `docs/investigations/qwen3-vl-multimodal-rerank-applicability.md` (new); no code changes expected
- Acceptance criteria:
  - [ ] Findings doc created at `docs/investigations/qwen3-vl-multimodal-rerank-applicability.md`, structured like the other applicability reviews (`memsearch-applicability-review.md`, `awesome-copilot-applicability-review.md`) with the Tier 2 Reference header, a "Read This When" section, and a decision line (keep-current / adopt-selectively / adopt)
  - [ ] **Two-stage retrieval question:** evaluate whether a dedicated cross-encoder **reranker** second stage (retrieve top-50/100 → rerank the shortlist for precision) earns its keep on top of the existing `search_thoughts` pipeline, which already fuses BM25 + vector via **RRF (k=60)** and applies **MMR (λ=0.7)** for diversity ([server/src/searchQuality.ts](../../server/src/searchQuality.ts)). MMR optimizes diversity, not relevance-precision — the doc must state clearly whether a reranker is additive or redundant to what RRF+MMR already do, and at what latency/cost
  - [ ] **Multimodal question:** assess whether the multimodal angle (text ↔ image / screenshot / short-video retrieval, 2048-dim normalized embeddings, natural-language retrieval instructions) is applicable *today* given ai-memory thoughts are **text-only** — and whether the Contact Memory track (WhatsApp exports can carry media) or a future screenshot-capture path changes that calculus. Do not recommend multimodal work absent a concrete consumer
  - [ ] **Provider/deployment fit:** note the embedding-provider implications — ai-memory embeds fire-and-forget via **OpenRouter** (`text-embedding-3-small`, 512-dim truncation) in [server/index.ts](../../server/index.ts); a 2048-dim Qwen3-VL embedding and a self-hosted reranker are a different operational shape (GPU/self-host vs API). Record the cost/latency/ops delta rather than assuming a drop-in swap
  - [ ] Recommendation bounded to {keep current defaults, adopt reranker-only as a follow-on story, adopt multimodal as a follow-on story, defer}; if any follow-on is recommended, add the concrete story to Backlog with `Touches:`/`Acceptance criteria:` derived from the finding
  - [ ] Out of scope: implementing a reranker stage or any multimodal ingestion — this spike only decides applicability and whether to spawn implementation stories
- Plan: (to be created — `docs/plans/`)
- Docs: newsletter tutorial https://learnopencv.com/how-to-master-qwen3-vl-embedding-and-reranker-for-multimodal-search/ ; code/notebook https://github.com/spmallick/learnopencv/tree/master/Qwen3-VL-Embedding-Reranker
- Notes: Advisory-derived from an external newsletter (no independent grounding yet — low anchor confidence, hence Value 2). The idea worth testing is the **embeddings-for-recall / reranker-for-precision** split: our current second stage (MMR) buys diversity, not the cross-encoder precision the mailer's "judge" stage provides — e.g. its "outdoor scene, no people or animals" example where reranking promotes full-intent matches over surface matches. Whether that precision gap exists in ai-memory's text-only, RRF+MMR pipeline is the core question. The multimodal half is likely premature (text-only corpus, no image/screenshot/video consumer today) but is worth a recorded verdict so a future media-carrying track (Contact Memory) doesn't re-derive it from scratch. When picked up, verify the referenced files/flags (`searchQuality.ts` RRF/MMR constants, OpenRouter embedding call) still exist before grounding recommendations on them — memories freeze in time.

### ST-075: Validate or defer premature medium-generalization abstractions (shared IR + MediumProfile registry)
- Type: spike / design
- Source: PO (compass_artifact_wf.md review FYI observations #1 + #2, 2026-07-03)
- phase: contact-memory
- Value: 2
- Blocked by: — (best evaluated once ≥2 mediums are implemented; WhatsApp is n=1 today)
- Touches: `docs/investigations/compass_artifact_wf.md` (§7 / Recommendations); no code changes expected
- Acceptance criteria:
  - [ ] Decide whether the shared IR (`NormalizedConversation`/`NormalizedTurn`) should be frozen in Stage 1 from WhatsApp-only (n=1), or held provisional until email/transcript validate it — the doc calls this core "never-changes" but it is derived from a single medium
  - [ ] Decide whether the `MediumProfile` capability-flag registry earns its keep at the 3–4 target-medium scale, or is premature generalization borrowed from Airbyte's 600-connector scale (~2 orders larger) with zero current consumers
  - [ ] Recommendation recorded in the doc (keep / defer / simplify) with rationale grounded in the actual target-medium count, not the Airbyte analogy
- Plan: (to be created — `docs/plans/`)
- Docs: `docs/investigations/compass_artifact_wf.md`
- Notes: Both FYIs are premature-abstraction / YAGNI risks in the same design area (medium-generalization layer). Bundled because they share the same evidence and decision. Advisory-derived (review anchor confidence 50) — low value, revisit when a second medium exists.

### ST-076: Add a privacy/consent fitness gate to Contact Memory stage gates
- Type: design
- Source: PO (compass_artifact_wf.md review FYI observation #5, 2026-07-03)
- phase: contact-memory
- Value: 3
- Blocked by: —
- Touches: `docs/investigations/compass_artifact_wf.md` (Recommendations / Caveats stage-gate criteria)
- Acceptance criteria:
  - [ ] Stage gates currently measure only extraction accuracy; add a privacy/consent *fitness function* the pipeline must pass before advancing a stage (e.g. no verbatim PII egress outside the ZDR contract, third-party-subject deletion path exercised, lawful-basis note present)
  - [ ] Fitness criteria are observable/testable, not aspirational — each maps to a check that can fail a stage gate
  - [ ] Reuses the already-resolved S3 (no-train/ZDR egress), S4 (hard-delete/erasure), S5 (lawful-basis) decisions rather than re-litigating them
- Plan: (to be created — `docs/plans/`)
- Docs: `docs/investigations/compass_artifact_wf.md`
- Notes: The consent *basis* was resolved 2026-07-03 (S3/S4/S5), but the stage gates still measure accuracy only — a pipeline can pass every accuracy benchmark and still ship a privacy violation. This story turns those resolved decisions into a gating fitness function. Advisory-derived (review anchor confidence 50).

<!-- Phase 3 — Local Companion Services -->

### ST-019: Local Obsidian synthesis service (C# MCP client)
- Type: feature
- Source: PO (rewritten post-ST-021 pivot 2026-05-17)
- phase: 3
- Value: 4
- Blocked by: —
- Touches: New `local-synthesis/` solution (separate from `server/`)
- Acceptance criteria:
  - [ ] Standalone C# console/daemon (.NET 8) that authenticates to the cloud MCP via Bearer token
  - [ ] Uses the official MCP C# client SDK to call `search_thoughts`, `list_thoughts`, and `fetch` tools as a consumer
  - [ ] Calls a local Ollama instance (or OpenRouter, configurable) to synthesise summaries from retrieved thoughts
  - [ ] Writes Obsidian-compatible Markdown to a configurable vault path (YAML frontmatter, `[[wiki-links]]`, backlinks)
  - [ ] Incremental update: tracks last-synthesised thought ID or `updated_at` per view; only re-synthesises views whose source thoughts changed
  - [ ] At least one built-in view type: per-project topic-summary board listing recent shards + promoted wiki facts
  - [ ] Configurable polling interval (default: 5 minutes); webhook trigger deferred to v2
  - [ ] Unit tests with mocked MCP client + mocked LLM
- ExecPlan: `.github/planning/execplans/exec-plan-ST-019.md` (to be created)
- Docs: `docs/investigations/openbrain-pivot-evaluation.md`, `docs/investigations/memory-architecture-design.md`
- Notes: Rewritten post-ST-021. Originally framed as the "C# core advantage" over OB1 cloud-hosted; now repositioned as a **local companion that consumes the cloud MCP**. Preserves the local-first synthesis + direct filesystem-write benefits (Obsidian vault on disk, $0 LLM cost via Ollama) without competing with the cloud MCP as source of truth. Iterable against either the deployed cloud MCP or a local `docker compose up` stack.

### ST-026: Obsidian storyboard view (C# MCP client storyboard projection)
- Type: feature
- Source: PO assessment of storyboard sufficiency (2026-05-18)
- phase: 3
- Value: 3
- Blocked by: ST-019 (reuses C# MCP client scaffolding, Markdown writer, polling loop)
- Touches: `local-synthesis/` solution (new view type alongside the wiki view)
- Acceptance criteria:
  - [ ] Reads `.github/planning/story-board.md` and `.github/planning/execplans/*.md` from a configured local repo path; parses into structured story records
  - [ ] Renders one Markdown note per story at `storyboard/{profile}/{story-id}.md` with YAML frontmatter (`type: story`, `status`, `value`, `blocked_by`, `touches`, `phase`)
  - [ ] Renders a kanban-style index note `storyboard/{profile}/index.md` with columns Backlog / Refined / In Progress / Review / Done
  - [ ] Per-story notes use `[[wiki-link]]` backlinks to `blocked_by` story notes; touches/docs paths render as Obsidian-relative or external links per convention
  - [ ] Profile partitioning: `professional` and `personal` directories; default profile from config
  - [ ] Incremental update: per-story checksum (SHA-256 over the story block) tracked in local state; only re-renders changed notes
  - [ ] Read-only — editing happens via `/plan` and `/continue`, not in Obsidian
  - [ ] Unit tests: mocked storyboard input → renders expected Markdown structure
- ExecPlan: `.github/planning/execplans/exec-plan-ST-026.md` (to be created)
- Query packet: `.github/planning/query-packets/QP-026-obsidian-storyboard-view.md`
- Docs: `docs/design/adr/ADR-006-views-architecture.md`
- Notes: Second of the "two views" promised in ADR-006. Reuses ST-019's C# scaffolding (MCP client, Markdown writer, polling loop) — thin extension, not a separate solution. Source of truth is the planning artifacts on disk today; if/when ADR-006's cloud-side `story_*` MCP tools are implemented, migrate to those.

<!-- Phase 0 — governance / dev-experience debt -->

### ST-032: Evaluate asset-metadata mechanism (cost/benefit + VS Code reconciliation + automation)
- Type: spike
- Source: PO (governance-friction observation 2026-05-22)
- phase: 0
- Value: 3
- Blocked by: none
- Touches: `docs/investigations/asset-metadata-mechanism-evaluation.md` (new), `docs/governance/asset-metadata-contract.md` (proposal section), `.github/planning/story-board.md` (adds follow-on ST-033), `.github/instructions/` (one file prototyped), `tools/GovernanceAssetValidator/` (read-only inspection)
- Acceptance criteria:
  - [ ] Findings doc at `docs/investigations/asset-metadata-mechanism-evaluation.md` contains a baseline section quantifying current state: count of governance asset files, count of VS Code Copilot "unknown attribute" warnings per file, last commit that regenerated `.github/planning/assets/asset-catalog.json`, output of `dotnet run --project tools/GovernanceAssetValidator -- validate .` at spike start
  - [ ] Findings doc contains a cost/benefit table: dev-experience cost of current shape (warnings, manual-command frequency, contract complexity) vs concrete value the catalog delivers today (who reads `asset-catalog.json` / `asset-catalog.md`; how many drift events have been detected since ST-012 shipped)
  - [ ] Findings doc evaluates ≥2 frontmatter reconciliation patterns against VS Code Copilot's schema (`applyTo`, `description`, `name`); recommends one pattern with rationale; demonstrated by editing one asset file to the proposed shape and showing both (a) VS Code reports 0 unknown-attribute warnings on that file and (b) `dotnet run --project tools/GovernanceAssetValidator -- build .` produces unchanged catalog output
  - [ ] Findings doc evaluates ≥3 automation mechanisms (e.g. `.git/hooks/pre-commit`, `.vscode/tasks.json` runOptions, `dotnet watch`, `husky.net`, scheduled CI documentation diff); recommends one with rationale that **explicitly addresses the PO's premise that the manual `dotnet run … build .` step does not happen in practice**
  - [ ] Recommendation is bounded to {reconcile, automate, reconcile+automate}; sunsetting is out of scope for this spike (PO scope decision 2026-05-22)
  - [ ] Follow-on implementation story ST-033 added to Backlog with concrete `Touches:` and `Acceptance criteria:` derived from the spike's recommendation
- ExecPlan: `.github/planning/execplans/exec-plan-ST-032.md`
- Docs: `docs/governance/asset-metadata-contract.md`, `docs/governance/asset-contribution-policy.md`, `tools/GovernanceAssetValidator/Program.cs`, `.github/planning/assets/asset-catalog.md`
- Notes: PO observed 2026-05-22 that the validator's manual `dotnet run -- build .` step does not happen, so the catalog is silently drifting AND the mechanism is paying its dev-experience cost (VS Code warnings on every governance file) without delivering its value. Spike must produce a real cost/benefit evaluation, not a rubber-stamp of the existing design. Disposition space bounded to "keep, in some form" per PO direction.

### ST-066: Migrate VS Code planning prompts to the unified docs/plans/ format
- Type: chore
- Source: PO (Contact Memory MVP code review, workflow-gate finding, 2026-07-02)
- phase: 0
- Value: 2
- Blocked by: none
- Touches: `.github/prompts/plan-new.prompt.md`, `.github/prompts/plan.prompt.md`, `.github/prompts/continue.prompt.md`, `.github/prompts/recover.prompt.md`, `.github/copilot-instructions.md`, `.github/planning/execplans/_TEMPLATE.md` (retired, not deleted)
- Acceptance criteria:
  - [ ] `/plan-new` and `/plan` Phase 2 write `docs/plans/*.md` (unified format, `story: ST-NNN` frontmatter) instead of `.github/planning/execplans/exec-plan-ST-NNN.md`
  - [ ] `/continue` reads Implementation Units from `docs/plans/*.md` instead of ExecPlan §4 Task Definitions, and derives resume state from git history (commits, board status) instead of an in-plan §5b Recovery Ledger — since the unified format stores no execution-progress fields in the plan body
  - [ ] `/recover`'s forensic annotation targets are redesigned for the git-history-as-source-of-truth model (no §5b/§6b/§6c sections to annotate in `docs/plans/*.md`); decide and document the replacement mechanism (e.g. a session log entry, a `docs/residual-review-findings/*.md`-style doc, or a dedicated recovery-notes file) as part of this story, not assumed
  - [ ] Cross-model review gate (currently described in `/plan` Phase 2 and `/continue` step 5) is preserved in the new flow, not silently dropped
  - [ ] `.github/copilot-instructions.md` and the four prompt files' deprecation banners (added 2026-07-02) are removed once the migration lands
  - [ ] At least one real story is planned and executed end-to-end through the migrated prompts as a validation pass before calling this Done
- Plan: (to be created — `docs/plans/`)
- Notes: Surfaced by the Contact Memory MVP code review (P1 finding: three consecutive Contact Memory sessions shipped through `docs/plans/*.md` with no board entry, because no VS Code-compatible path existed to produce that format with board linkage). CLAUDE.md's Workflow gate section and this board's header were updated 2026-07-02 to make `docs/plans/*.md` canonical for Claude Code/OpenCode work immediately; this story closes the remaining gap for VS Code Copilot sessions. The `/continue` and `/recover` redesign is the substantive part — the ExecPlan format's Recovery Ledger has no direct equivalent in the unified format's git-history-as-source-of-truth philosophy, so this is real design work, not a mechanical find-and-replace.

### ST-067: Extract shared MCP transport module
- Type: debt / maintainability
- Source: Contact Memory MVP review, Finding C (2026-07-03)
- phase: contact-memory
- Value: 2
- Blocked by: none
- Touches: `shared/mcpTransport.ts` (new), `contact-memory/commit/captureThoughtAdapter.ts`, `server/tests/_helpers/mcpClient.ts` (optionally re-point to shared module)
- Acceptance criteria:
  - [ ] `shared/mcpTransport.ts` exports pure transport (`POST /mcp`, Bearer auth, `Accept: application/json, text/event-stream`, JSON-RPC envelope, SSE `data:` parsing with per-request `id` matching) with **no** env-var default fallbacks — fail loudly on missing config (mirror `captureThoughtAdapter`'s existing `mcp_config_missing` throw, not `mcpClient.ts`'s `?? "test-key"` / localhost defaults)
  - [ ] `captureThoughtAdapter` consumes the shared module; its bespoke transport code (currently `captureThoughtAdapter.ts` L87–L118) is removed while preserving its `REQUEST_TIMEOUT_MS` AbortSignal and fail-closed `assertMcpToolSucceeded` behavior
  - [ ] `mcpClient.ts` either re-uses the shared transport or is documented as a test-only wrapper that adds `extractText`/`sleep` and the env-var fallbacks
  - [ ] All existing server + contact-memory tests pass
- Plan: (to be created — `docs/plans/`)
- Docs: `docs/investigations/contact-memory-mvp-review-and-governance-handoff.md` §6
- Notes: Grounded against real code 2026-07-03 — the duplication is confirmed and the shared core is pure `fetch` transport with no mocking hooks. Low urgency; both implementations are small and stable. Do once, don't rush. PO decision 2026-07-03: board-track, do not implement now.

### ST-068: Repair-pass — never lose a fact silently
- Type: bug / design
- Source: Contact Memory MVP review, Finding D (2026-07-03)
- phase: contact-memory
- Value: 4
- Blocked by: none
- Touches: `contact-memory/parser/extractor.ts` (`buildRepairPrompt`, `extractContactMemory` repair loop), `contact-memory/cli/index.ts` (CLI output), `contact-memory/tests/parser/extractor.test.ts`
- Acceptance criteria:
  - [ ] CLI/extractor output reports a **"N items dropped during repair"** count, including each dropped item's extracted text, whenever the repair pass returns fewer/changed items than the first extraction (the model's only current pass-validation path for an `unknown_message_id` is to drop the offending item — see `validateAndCrossCheck` in `extractor.ts` L145–L153)
  - [ ] `buildRepairPrompt` includes the **valid `message_id` list** (IDs only — no transcript bodies) so the model can re-ground a bad citation instead of being forced to drop it
  - [ ] A test proves: given a hallucinated `message_id`, the item is either re-grounded to a valid ID **or** surfaced in the dropped-count — never silently lost
  - [ ] Privacy assertion: the repair prompt never contains transcript message **bodies** (current `buildRepairPrompt` L186 already omits the transcript via `privacy_note`; adding the ID list must preserve that)
- Plan: (to be created — `docs/plans/`)
- Docs: `docs/investigations/contact-memory-mvp-review-and-governance-handoff.md` §7, `docs/investigations/compass_artifact_wf.md`
- Notes: Grounded against real code 2026-07-03 — confirmed the silent-drop path: repair model drops an item to satisfy validation, whole extraction then succeeds with fewer items and zero reviewer signal (repeated failure instead throws and aborts the batch). Source-grounding research (`compass_artifact_wf.md`) favours re-grounding over dropping and treats the human gate as non-optional. Visibility is the non-negotiable half; re-grounding is the secondary improvement. PO decision 2026-07-03: board-track, do not implement now; when greenlit, prioritise visibility over re-grounding.

### ST-070: Fix broken `.timeout()` calls in health-check probes
- Type: bug
- Source: PR #21 CI review, uncovered once the secret gate was cleared (2026-07-03)
- phase: server
- Value: 4
- Blocked by: none
- Touches: `server/src/healthCheck.ts`, `server/tests/healthCheck.test.ts` (or equivalent)
- Acceptance criteria:
  - [ ] Replace the four `sql\`...\`.timeout(PROBE_TIMEOUT_MS)` calls with a real per-query timeout — postgres.js `PendingQuery` has **no** `.timeout()` method (`PendingQueryModifiers` exposes only `execute()`/`cancel()`), so the current code fails `deno check` (TS2339 ×4) and throws `TypeError` at runtime, which the probe try/catch swallows into a `status: "error"` — i.e. the pg / extension / embedding-backlog / worker-staleness probes have been silently non-functional since ST-053
  - [ ] Suggested fix: a `withQueryTimeout(pending, ms)` helper that `setTimeout(() => pending.cancel(), ms)` and clears the timer in `.finally()` — cancels the real query on timeout instead of leaking it (preferred over `Promise.race`)
  - [ ] `deno check` passes clean across `server/`
  - [ ] A test proves a slow probe times out and reports `status: "error"` (not a hang), and a fast probe reports `status: "ok"`
  - [ ] CI `integration-tests` job goes green
- Plan: (to be created — `docs/plans/`)
- Notes: Pre-existing on `main` (introduced by commit `06f53b8`, health check for ST-053; `1074cba` didn't catch it). NOT introduced by PR #21 — confirmed `git show main:server/src/healthCheck.ts` has the identical calls. This is the second stacked CI blocker: the secret gate hid it because `deno test` never ran. Fixed on `feat/whatsapp-parser` per PO decision 2026-07-03. **Fixing the type error unmasked that `health-check.unit.test.ts` had never executed** (the type error blocked `deno test` from ever running it) — revealing two further pre-existing defects, both fixed in the same change: (1) the 3 latency-threshold tests asserted "degraded" from an instant mock that produced ~0ms latency (fixed with a delay-injecting postgres mock so `performance.now()` measures a deterministic above-threshold latency); (2) a real concurrency bug in `probeEmbeddingApi` where the single module-level `inflightPromise` ignored `cacheKey`, so concurrent probes with different configs wrongly shared one fetch (benign in prod where config is stable; fixed by keying the inflight map on `cacheKey`). Separately noted (NOT fixed — out of scope, and outside CI's test type-check graph): a latent `TS2769` in `server/index.ts:453` (`sql` template parameter typing) — `index.ts` is not imported by any test, so it doesn't block `deno test tests/`; worth its own cleanup. **Health-check portion verified green** (20/20 unit tests pass, `deno check` clean); the CI `integration-tests` job is now blocked by ST-071 (6 unrelated pre-existing failures), not by this fix.

### ST-071: Green the server integration test suite (6 pre-existing failures)
- Type: bug / infra
- Source: PR #21 CI — first-ever run of the integration suite after ST-070 cleared the type error that blocked it (2026-07-03)
- phase: server
- Value: 4
- Blocked by: ST-070 (type error had to be fixed before the suite could run at all)
- Touches: `server/tests/cypher-injection.test.ts`, `server/tests/consolidation-worker-observability.test.ts`, `server/tests/worker-observability-e2e.test.ts` (and possibly the code under test)
- Acceptance criteria:
  - [x] `graph_traverse` comment-handling: 3 `assertEquals` failures at `cypher-injection.test.ts` L114/127/140 (keyword inside line comment, inside block comment, leading comment before `MATCH`) — fixed 2026-07-03 (commit `780f3a2`). Root cause was a real product bug in `walkCypherTokens` (server/index.ts): the opening `--`/`/*` delimiters were yielded with `state` still `normal` (reassigned only after the yields), leaking them into masked/stripped output → leading comment failed the `^\s*match` start check, block/line comments left an unterminated/invalid marker in the executable query. Fixed by entering the comment state before emitting the delimiter. All 20 `cypher-injection` tests pass, security guards intact.
  - [x] `consolidation-worker-observability.test.ts:68` — `PostgresError: null value in column "query" of relation "recall_events" violates not-null constraint`: fixed 2026-07-03 (added the NOT NULL `query`/`rrf_score`/`rank` columns to the `recall_events` insert; also backdated the test's `consolidation_queue.queued_at` so `drainPendingOnce(limit=1)`, which claims `ORDER BY queued_at ASC`, reaches the test's `__TEST_LLM_FAIL__` item instead of one of the 33 seed-corpus pending rows) — commit `3c0dd1a`
  - [x] worker-observability (2 failures) — `PostgresError: duplicate key value violates unique constraint "entity_extraction_queue_pkey"`: fixed 2026-07-03 (the `trg_queue_entity_extraction` AFTER INSERT trigger already enqueues the row, so the test's plain INSERT collided; made both inserts idempotent `ON CONFLICT (thought_id) DO UPDATE`) — commit `3c0dd1a`
  - [x] Full `deno test tests/` goes green — **225 passed / 0 failed** in CI run 28656810023 (conclusion: success). First-ever green run of the integration suite.
- Plan: (to be created — `docs/plans/`)
- Notes: Surfaced 2026-07-03 the first time the integration suite ever ran in CI. All 6 failures are in files **unchanged from `main`** (`git diff --name-only origin/main...HEAD -- server/` shows only the two ST-070 health files) — so they are pre-existing on `main`, not introduced by PR #21 or ST-070. Root story: the CI `integration-tests` job has been red since inception (secret gate → type error → these), so the suite's green state was never established. **Progress 2026-07-03 (commit `3c0dd1a`, PO scope "fix only the trivial ones now"):** the 3 test-isolation/fixture failures (2× duplicate-key, 1× null-`query`) are fixed and confirmed green in CI (222 passed / 3 failed, run 28654276687). The 3 `graph_traverse` comment-handling failures turned out to be a genuine product bug (not assertion drift) and were fixed in commit `780f3a2`. **DONE 2026-07-03:** CI run 28656810023 is fully green (225 passed / 0 failed) — PR #21's `integration-tests` check passes for the first time. Commits: `3c0dd1a` (fixture isolation), `780f3a2` (graph_traverse comment tokenizer).

<!-- Phase 1 follow-ups deferred from earlier scoping -->

### ST-031: N:1 cluster-based consolidation (multi-shard → one wiki)
- Type: feature
- Source: PO deferred during ST-008 scope-lock (2026-05-20)
- phase: 2 (post-v1 consolidation maturity)
- Value: 2 (reassess once v1 consolidation has run in production)
- Blocked by: ST-008 (1:1 consolidation must ship first)
- Touches: `server/src/consolidationWorker.ts` (extend), possibly `server/db/schema.sql` (cluster bookkeeping)
- Acceptance criteria:
  - [ ] Worker clusters eligible shards by embedding cosine similarity > 0.85 (the §4.2 fragment value)
  - [ ] N:1 promotion: cluster contents merged via LLM call into one wiki row; each cluster-source shard receives `active=false`
  - [ ] `consolidation_log` records the N→1 mapping (multiple `thought_id`s associate to one `wiki_id` via a new linking table or jsonb array — decide during scoping)
  - [ ] Integration test: seed 3+ similar shards → run consolidation → verify one wiki row, all source shards inactive
- ExecPlan: `.github/planning/execplans/exec-plan-ST-031.md` (to be created)
- Notes: Deferred from ST-008 (2026-05-20). v1 is 1:1 only. N:1 requires maturity data from v1 — do we actually see clusters worth merging? — before investing in the more complex logic.


<!-- Deferred — not blocking the production path -->

### ST-006: Implement REST API endpoints (deferred)
- Type: feature
- Source: PO (deferred post-ST-021 pivot)
- phase: deferred
- Value: 2
- Blocked by: ST-023
- Touches: `server/index.ts` (REST routes alongside the existing MCP handler)
- Acceptance criteria:
  - [ ] REST routes for `/thoughts` (POST/GET/PATCH/DELETE), `/search`, `/stats`
  - [ ] Response envelope with consistent error format (RFC 7807)
  - [ ] OpenAPI spec generated and published
  - [ ] Bearer auth shared with `/mcp` endpoint
  - [ ] Integration tests for happy path + error cases
- ExecPlan: `.github/planning/execplans/exec-plan-ST-006.md` (to be created)
- Docs: `docs/investigations/interface-design-mcp-rest.md`
- Notes: Deferred post-ST-021. MCP is the primary interface; a REST API is only valuable when a non-MCP consumer is identified (e.g., a browser extension or third-party script). Reassess once such a consumer exists.

### ST-024: Upgrade to AGE v1.7.0 + PG17 (deferred)
- Type: infrastructure
- Source: ST-021 spike outcome
- phase: deferred
- Value: 2
- Blocked by: ST-023
- Touches: `docker/postgres-age/Dockerfile`, `server/db/graph.sql`
- Acceptance criteria:
  - [ ] PostgreSQL base image bumped to 17
  - [ ] AGE compiled at v1.7.0 (officially supports PG17)
  - [ ] All existing openCypher queries pass against v1.7.0
  - [ ] `|` relationship-type selector verified working (the v1.6.0 limitation hit in ST-021)
  - [ ] Migration plan for existing graph data documented
- ExecPlan: `.github/planning/execplans/exec-plan-ST-024.md` (to be created)
- Docs: `docs/investigations/ST-021-findings.md`
- Notes: Deferred from ST-021. Only triggered if a use case requires the `|` selector in openCypher (multi-relationship-type traversal in a single MATCH). Current workaround: explicit MATCH chains per relationship type, as documented in §R6 of the findings.

<!-- Phase 2 — Operational Hardening (from QP-038 vectorize-mcp-worker review) -->



### ST-045: Worker idempotency
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 3
- Blocked by: — (ST-042 migration framework complete)
- Touches: `server/src/entityWorker.ts`, `server/db/migrations/004_entity_extracted.sql` (new)
- Acceptance criteria:
  - [ ] Entity worker uses `entity_extracted` flag for safe replay (AC-10 extended, AC-11)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-045.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟡 Should fix. ST-042 (migration framework) complete — blocker cleared. Prevents duplicate processing after crash.

### ST-048: Queryable metrics table
- Type: observability
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: — (ST-042 migration framework complete)
- Touches: `server/db/migrations/003_tool_metrics.sql` (new), `server/index.ts`
- Acceptance criteria:
  - [ ] Tool metrics are persisted to a queryable `metrics` table (AC-4)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-048.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Additive to ST-028 (worker observability) which covers worker-run metrics. This covers per-tool-invocation timing/error persistence. ST-042 (migration framework) complete — blocker cleared.

### ST-049: Query routing (lane skipping)
- Type: performance
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: —
- Touches: `server/src/searchQuality.ts`, `server/index.ts`
- Acceptance criteria:
  - [ ] Query routing skips vector lane for keyword-only queries (AC-13)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-049.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Exact error codes, UUIDs, and short tokens benefit from BM25 precision without the vector lane's embedding call latency.

### ST-050: Latency assertions in tests
- Type: quality
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: —
- Touches: `server/tests/search-golden-set.test.ts`
- Acceptance criteria:
  - [ ] Search tests include latency assertions (AC-8)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-050.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Extends ST-046's golden-set test with timing checks (< 500ms on seeded local corpus).

### ST-051: Rate limiting
- Type: security
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: —
- Touches: `server/src/rateLimit.ts` (new), `server/index.ts`
- Acceptance criteria:
  - [ ] Rate limiting returns 429 after threshold exceeded (AC-14)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-051.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Single-instance in-memory token bucket. Document Redis needed for multi-instance. Protects against runaway agent loops burning embedding quotas.

### ST-052: Backpressure control
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: ST-045 (needs entity_extracted flag)
- Touches: `server/src/entityWorker.ts`
- Acceptance criteria:
  - [ ] Entity worker respects backpressure limits (AC-11)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-052.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Bounded queue with observational alerting when pending count exceeds configurable threshold. Items never dropped.

### ST-053: Deep health check
- Type: observability
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 2
- Blocked by: —
- Touches: `server/index.ts` (/health endpoint)
- Acceptance criteria:
  - [ ] Health check reports DB latency, queue depth, and degraded state (operational polish)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-053.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟢 Nice to have. Industry standard for container orchestration. Reports degraded state (e.g. embedding failures, worker backlog) in health response for monitoring.

### ST-059: Sanitize raw Postgres error messages in tool error responses
- Type: hardening
- Source: ST-029 code review (round 2, 2026-06-22) — adversarial + api-contract reviewers
- phase: 2
- Value: 2
- Blocked by: —
- Touches: `server/index.ts` (all tool catch blocks), possibly `server/src/errorSanitizer.ts` (new)
- Acceptance criteria:
  - [ ] Tool error responses no longer expose internal Postgres constraint names (e.g. `feedback_events_thought_id_fkey`, `feedback_events_query_check`) in the `text` field
  - [ ] A shared error-sanitization helper maps common Postgres error codes (23503 FK violation, 23514 CHECK violation, 23505 unique violation) to user-friendly messages
  - [ ] Existing tests updated to assert on sanitized messages rather than raw constraint names
  - [ ] Consistent application across all 11 tool handlers
- ExecPlan: `.github/planning/execplans/exec-plan-ST-059.md` (to be created)
- Notes: 🟢 Nice to have. Pre-existing codebase-wide pattern — all tool catch blocks return `(err as Error).message` verbatim. Not a regression from ST-029 but surfaced by its review. Low security risk since schema is public in the repo, but leaks internal naming to clients without source access.

### ST-060: Add direct unit tests for isMcpContextError type guard
- Type: quality
- Source: ST-029 code review (round 2, 2026-06-22) — maintainability + kieran-typescript reviewers
- phase: 2
- Value: 2
- Blocked by: —
- Touches: `server/tests/parseContext.test.ts`
- Acceptance criteria:
  - [ ] Direct unit tests for `isMcpContextError` covering: null → false, valid ContextScope → false, MCP error object → true
  - [ ] Edge case: ContextScope with unexpected properties → still returns false (not an error)
  - [ ] Tests pin the type-narrowing contract to protect against future `ContextScope` gaining an optional `isError` property
- ExecPlan: `.github/planning/execplans/exec-plan-ST-060.md` (to be created)
- Notes: 🟢 Nice to have. The sibling `isContextError` has direct tests in `parseContext.test.ts:94-101`. `isMcpContextError` is currently exercised only indirectly through 3 tool integration tests. Small testing debt from ST-029.

### ST-061: Consolidate duplicated test helper functions
- Type: debt
- Source: ST-029 code review (round 2, 2026-06-22) — maintainability reviewer
- phase: 2
- Value: 2
- Blocked by: —
- Touches: `server/tests/capture-size-limit.test.ts`, `server/tests/_helpers/mcpClient.ts` (or new shared module)
- Acceptance criteria:
  - [ ] `responseText()` in `capture-size-limit.test.ts` replaced with `extractText()` from `_helpers/mcpClient.ts` (functionally identical)
  - [ ] `responseIsError()` and `ToolCallResult`/`ToolCallResponse` interfaces extracted to shared helper or `_helpers/types.ts`
  - [ ] All test files using these patterns updated to import from the shared location
  - [ ] No duplicated response-parsing helpers remain across test files
- ExecPlan: `.github/planning/execplans/exec-plan-ST-061.md` (to be created)
- Notes: 🟢 Nice to have. Pre-existing duplication — `responseText()` in `capture-size-limit.test.ts:16` is identical to `extractText()` in `_helpers/mcpClient.ts:62`. ST-029 consolidated `extractThoughtId` but left this parallel duplication. Future test authors won't know which to use.

---

## Refined

## In Progress

### ST-088: ST-084 Stage 2 — criteria 5–7 and the final ADR-016 host recommendation
- Type: spike / architecture decision (continues ST-084)
- Source: split out of ST-084 on PO decision 2026-08-03, when the Stage 1 review completed. Stage 2 was carried on ST-084 as an unticked second criteria block, which meant merged, reviewed Stage 1 work could never be marked Done
- phase: 0 (architecture)
- Value: 4
- Blocked by: — (ST-084 Stage 1 merged and reviewed; contracts defined)
- Touches: `server/src/workflow/` (remote-node client, policy-scope enforcement); memory-side retrieval paths (**enumerated**, not yet chosen — findings §6.1); `docs/investigations/ST-084-awcp-host-spike-findings.md` (Stage 2 report); `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` (final disposition — **only** this story may move it off Proposed/Conditional)
- Acceptance criteria:
  - [ ] **Criterion 5 — policy-scope enforcement** (controlled field, not descriptive tags; default-deny; every enabled retrieval/graph/context/export/provider path enforces or fails closed)
  - [ ] **Criterion 6 — remote Ubuntu execution node** (authenticated registration, heartbeat, checkpoint, repo-state; offline spool + idempotent replay; disconnection/duplicate/invalid-auth experiments)
  - [ ] **Criterion 7 — final extraction viability and the final ADR-016 recommendation**
  - [ ] **ADR-016's acceptance pre-condition is discharged:** the §6.1 enforcement surface is **priced** — a defended estimate of the cost of enforcing a boundary column across 15 hand-written read paths with no chokepoint, a `fetch` that accepts no context parameter, two structurally unfilterable graph tools, unscoped provider egress, and a fingerprint dedup whose `ON CONFLICT` merges tags. Added to ADR-016 §1 as a **gate** by PO decision 2026-08-03: this story may not recommend accepting Candidate A while that number does not exist
  - [ ] **Actual execution blocking** is proven or reported UNPROVEN with the same honesty as Stage 1 — `blocking` is still modelled state whose only implemented consequence is the attention item (`server/src/workflow/attention.ts:51`) and a dashboard tag
- Plan: [docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md](../../docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md)
- Docs: [docs/investigations/ST-084-awcp-host-spike-findings.md](../../docs/investigations/ST-084-awcp-host-spike-findings.md) §7 (contracts), §8 (what is UNPROVEN), §12a (post-Stage-1 drift); `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` §1
- Notes: **Pricing is this story's job; building is ST-082's.** They must not collide — ST-088 produces the estimate that lets the host decision be taken, ST-082 implements the enforcement once a host is settled. If ST-082 lands first the estimate becomes an actual, which is better evidence, not a conflict. **Burden of proof still sits with the spike, not the preference** — Candidate A remains the hypothesis, and the honest outcome set is still accept / accept-with-changes / recommend Candidate C. Read findings §12a before trusting any Stage 1 claim: two of the three §6 concerns had already moved by the time Stage 1 was reviewed, in opposite directions, and a third story could move them again.
- **Moved Backlog → In Progress 2026-08-04.** Plan created.
- **Phase 1 complete** (policy-scope pricing, U1). **Phase 2 complete** 2026-08-14 — hub-side tables, registration, idempotent event ingestion (PR #47 → `47284cc`, merged not squashed).
- **Phase 3 waves 1–5 complete** 2026-08-18 (PR #49 → `47cd90b`): node client with bounded crash-safe spool and replay, terminal-vs-deferred failure states, SAFE-01 empty-diff regression gate, SAFE-02 corpus integrity. **Wave 6 (03-06) outstanding** — the z2 enrolment and experiments 4–6 that actually discharge criterion 6, held at its `<human-check>` output gate. Resume: `/gsd-execute-phase 03 --wave 6`.
- **Phase 4 not started** — blocking evidence and the final ADR-016 recommendation (U5+U6).

### ST-098: ST-097 follow-ups — observed-session restart-pinning fix, WorkItem store split, pre-existing test triage, browser-check refresh
- Type: chore (bug fix + refactor + investigation + verification)
- Source: four findings from ST-097's 12-reviewer code review, deliberately left open at that
  review as non-blocking for the merge — see the handoff at
  `docs/plans/2026-08-23-2245-chore-st097-gsd-pivot-board-split-awcp-status-slice-plan.md`'s
  Review disposition table
- phase: 0 (workflow module hardening, no product surface change)
- Value: 3
- Blocked by: — (ST-097 merged to `main` at `af84b03`)
- Touches: `server/scripts/awcp-node-client.mjs`, `server/src/workflow/observedSession.ts`,
  `server/src/workflow/store.ts` (split into `server/src/workflow/workItemStore.ts`),
  `server/tests/e2e.test.ts`, `server/tests/entity-worker-observability.test.ts`,
  `server/src/workflow/dashboard.ts` (browser-check re-anchor only, no expected code change)
- Acceptance criteria:
  - [ ] **`ended_at` absorbing-state fix.** `AWCP_SESSION_ID` restart-pinning is dropped: a
    node client process always mints a fresh `session_id` at start, so a clean close can no
    longer be conflated with a later, unrelated process's abandonment. `GREATEST`-based
    monotone merge in `store.ts` stays unchanged — PO decision 2026-08-25, chose this over
    timestamp-based reopen
  - [ ] **`workItemStore.ts` split.** WorkItem persistence extracted out of
    `server/src/workflow/store.ts` (1,411 lines), mirroring the boundary already drawn for
    `readModel.ts`, `api.ts`, and `dashboard.ts`. No behavior change; existing tests are the
    regression gate
  - [ ] **Pre-existing test failures triaged.** The ~9 failures in `server/tests/e2e.test.ts`
    and `entity-worker-observability.test.ts` (search, entity extraction, consolidation) are
    root-caused and either fixed or recorded as a known, dated baseline with a story filed for
    the fix
  - [ ] **28 browser checks re-verified.** The manual dashboard checks invalidated by the
    WorkItem lane (`585d2c9`) are re-run against current `main` and their disposition recorded
- Plan: to be created under `docs/plans/` at implementation time
- Notes: Filed from the ST-097 handoff rather than mid-review — none of the four block
  ST-097's landing, all four were the user's explicit choice to pick up next.
  **WIP-limit note:** ST-088 already holds the sole "In Progress" slot; this story starts
  concurrently anyway at the user's explicit direction to proceed now, so the 1-In-Progress
  limit is knowingly exceeded rather than silently violated. Record here, not hidden.
- **Moved Backlog → In Progress 2026-08-25**, same session it was filed in, at the user's
  explicit direction to proceed on all four items.
- **Open for the PO, neither blocking:** `FEATURE_WORKFLOW` hardcoded `"true"` on base `mcp` leaves an unauthenticated dashboard shell on `0.0.0.0:3000` for every `docker compose up -d` (`T-03-01-02`); and `.planning/STATE.md` progress metadata now describes a 2-phase project against ROADMAP's 4, with `current_phase` exceeding `total_phases`.

## Review

## Done

### ST-092: Node-client hardening and test-suite operational safety
- Type: bug / hardening (client durability + test isolation)
- Source: cross-AI peer review of ST-088 Phase 3, 2026-08-19 — [`03-REVIEWS.md`](../../.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REVIEWS.md), two source-grounded lanes (codex + Antigravity), findings 1–8
- phase: 0 (unblocks nothing; it repairs what ST-088 Phase 3 shipped)
- Value: 4
- Completed: 2026-08-22
- Blocked by: — (Phase 3 is merged; this is additive and forward-only, and rewrites none of its evidence)
- Branch: `feat/st-092-node-client-hardening` — **squash-merged to `main` as `69b50bd` on 2026-08-22 via PR #52.** `git log -1 --format='%(trailers:key=Story,valueonly)' 69b50bd` resolves to `ST-092`, so the trailer parses and `git log --grep="Story: ST-092"` finds this story's shipped work
- Touches: `server/scripts/awcp-node-client.mjs` (the only production file); `server/tests/_helpers/serverProcess.ts`, `server/tests/_helpers/testDatabaseGuard.ts`, seven test files; `server/tests/fixtures/test-database-marker.sql` and the compose `seed` service; `CLAUDE.md` grant inventory; `docs/investigations/ST-084-awcp-host-spike-findings.md` §16.11
- Acceptance criteria:
  - [x] **R1 — single-writer enforced, not assumed.** Exclusive lockfile; a second client exits 69 naming the holder and changes nothing; a lock naming a dead pid is reclaimed so one `kill -9` cannot brick a node. Proven by two genuinely contending processes, because an in-process test cannot distinguish this lock from no lock — the exact weakness the review found in the Phase 3 allocation test
  - [x] **R2 — the rename is durable.** `fsyncDir` after every `renameSync` in `writeSpool` and `writeState`; the docblock that claimed the guarantee before the code provided it is corrected as part of the fix
  - [x] **R2b — the counter is crash-atomic.** *Not from the review.* The truncate-in-place write left a zero-length counter readable as 0, so the next allocation returned 1 — a D-14 reset by a route the docblock did not cover. Counter now goes through the shared rewrite-and-rename primitive; an unparseable counter is refused rather than read as zero
  - [x] **R3 — a drop is never invisible.** `evictOldest` records before it shrinks. A crash now over-counts (visible, harmless) instead of under-counting (silent, and what EVENT-04 forbids). The docblock says plainly that the over-count is *not* self-correcting
  - [x] **R4 — `flushOnce` is total.** Both `res.json()` sites can no longer reject, and a 200 is validated before it is trusted — an unverified `acknowledged` array would delete spool entries the hub never confirmed
  - [x] **R5 — shutdown is honest.** A signal interrupts the heartbeat wait instead of being noticed after it (proven with a sleep that never resolves); a stop whose final flush deferred exits 75, not 0
  - [x] **R6 — a destructive suite cannot run on a real database.** The guard keys on a property of the connected database, because an environment check passes in exactly the dangerous case and the *name* does not discriminate at all (`db` and `db-test` are both `POSTGRES_DB: ai_memory`). Fails closed; throws rather than skips. `migrations.test.ts` guarded too — the review named only the e2e file, but the same hazard was one grep away
  - [x] **R7 — the port-collision class is gone.** `startServerProcess` binds `PORT=0` and parses the real port from the child's own `Listening on` line, which makes that line the binding proof *and* the port source. `awcp-cli.test.ts` and `workflow-agent-key-e2e.test.ts` had each been assigned 3144
  - [x] **Regression gate passed** against a delta declared before the comparison ran ([`docs/verification/ST-092-declared-test-identity-delta.md`](../../docs/verification/ST-092-declared-test-identity-delta.md)). Not an empty-diff gate: Phase 3 was purely additive, this story modifies six existing test files
  - [x] **PO review and merge.** PR #52 targeted `main` directly (not a stacked branch), so unlike the caveat below, CI *did* run and went green on all three checks — `contact-memory-tests`, `dotnet-build`, `server-integration-tests` (run `32489574370`)
- Plan: [docs/plans/2026-08-19-001-fix-st092-node-client-hardening-plan.md](../../docs/plans/2026-08-19-001-fix-st092-node-client-hardening-plan.md)
- Docs: [`docs/verification/ST-092-declared-test-identity-delta.md`](../../docs/verification/ST-092-declared-test-identity-delta.md) and [`ST-092-regression-final.txt`](../../docs/verification/ST-092-regression-final.txt); [`docs/solutions/workflow-issues/a-documented-inner-loop-command-can-destroy-real-state.md`](../../docs/solutions/workflow-issues/a-documented-inner-loop-command-can-destroy-real-state.md); `docs/investigations/ST-084-awcp-host-spike-findings.md` §16.11
- Notes: **Entered Review directly rather than Backlog** — the implementation is complete and the Review slot was free; the In Progress slot is ST-088's and was not taken. **The branch was stacked on `docs/st-088-phase-3-wave-6-summary`, which was unmerged at the time, so no CI had run** — CLAUDE.md's own note that a PR into a feature branch runs no CI applied here, and the local test-stack run was the only gate this branch had had up to that point. **Every red/green control was observed going red against the unfixed code**: U1's fsync ordering, U2's eviction order, U4's two new-behaviour tests, U5's three, U3's contention and reclaim with lock acquisition stubbed out, and U6's guard removed against a real unmarked database holding a row in `workflow.execution_nodes` (row survives guarded, gone unguarded). **Two review findings are deliberately out of scope and route elsewhere:** `FEATURE_WORKFLOW` permanence (Phase 4 owns it) and `last_seen_at` never advancing on ingestion (hub-side, worth its own story — it makes a healthily-reporting node read as stale). **One defect found and left**: `registerNode` still writes `node_id` with the same truncate-in-place primitive R2b removed from the counter; its blast radius is a loud 404, not a silent discard, and R2b scoped only the counter. **Moved Review → Done on 2026-08-22** on the squash-merge of PR #52 to `main` as `69b50bd` — by then the stacking caveat above no longer applied: the PR targeted `main` directly, so CI ran (and passed) for the first time on this story's own diff.

### ST-090: Clear the seven governance frontmatter gaps so the validator exits 0
- Type: chore / governance debt
- Source: `GovernanceAssetValidator` output 2026-08-03
- phase: 1
- Value: 2
- Completed: 2026-08-04
- Plan: `docs/plans/2026-08-04-001-chore-clear-governance-frontmatter-gaps-plan.md`
- Acceptance criteria:
  - [x] The validator reports **zero** findings and exits 0
  - [x] Each of the seven is resolved **deliberately**: two live instructions files get real `name`/`summary`/`status`/`owners`; five legacy prompt files get `status: retired` (no fake `owners`)
  - [x] The five `.prompt.md` files get a disposition consistent with **ST-066** — `status: retired` added, `owners` deliberately absent
  - [x] **CI runs the validator:** `dotnet run --project tools/GovernanceAssetValidator -- validate .` added as final step of `dotnet-build` job. Red control confirmed: strip `owners` → exits 1 → revert → exits 0

### ST-089: `GovernanceAssetValidator` is outside the analyzer gate it already inherits
- Type: bug / tooling
- Source: found 2026-08-03 while validating the ST-084 review's governance assets
- phase: 1
- Value: 3
- Completed: 2026-08-03
- Plan: `docs/plans/2026-08-03-002-fix-governance-validator-analyzer-violations-plan.md`
- Acceptance criteria:
  - [x] `dotnet run --project tools/GovernanceAssetValidator -- validate .` builds and runs with no `-p:` overrides
  - [x] Each violation fixed (no `<NoWarn>` or `#pragma warning disable`): SA1402/MA0048 resolved by per-type file split; SA1503/SA1413 fixed in place; MA0051 resolved by helper extraction; S2325/MA0006/CA1305/CA1859 fixed in place
  - [x] Project added to `src/AiMemory.sln` — built by `dotnet build src/AiMemory.sln` routinely
  - [x] `dotnet-build` CI job added to `.github/workflows/ci.yml`; red control confirmed: deliberate SA1503 → build failed → reverted → green
  - [x] `dotnet build src/AiMemory.sln` passes at 0 warnings / 0 errors

### ST-087: Test the `awcp` CLI — the one untested surface of the ST-086 slice
- Type: test coverage
- Source: ST-086 code review 2026-08-02 (testing + correctness reviewers, independently)
- phase: 1
- Value: 3
- Blocked by: —
- Branch: `test/st-087-awcp-cli-coverage` (from `main` at `22fa20c`) — **squash-merged to `main` as `1e15d94` on 2026-08-03 via PR #43.** `git log --grep="Story: ST-087"` resolves to `1e15d94` — the trailer is present in the squash message, which is the property the convention actually depends on
- Touches: `server/tests/awcp-cli.test.ts` + `server/tests/_helpers/awcpCli.ts` (new); `server/scripts/awcp.ts` (one production change — `post()` now surfaces the API's per-field `issues[]`); `server/Dockerfile` (git); `.github/workflows/ci.yml`, `CLAUDE.md`, `docs/workflow-mvp.md` (widened test grants — all three drift silently, update them together)
- Why it matters: `server/scripts/awcp.ts` is ~290 lines of argument parsing, git wrapping and HTTP client with **zero** automated coverage. The review found two real defects in it by reading alone (`--help` exited 2 instead of printing usage; path ids interpolated unencoded) — both now fixed, neither caught by any test. Board criterion 5 of ST-086 claims "one real local repository/session reported a commit-bearing checkpoint **through the CLI**", but the e2e test posts a hardcoded SHA; nothing proves the CLI produced it.
- Approach as shipped: process-boundary only, no import seam — the CLI is spawned via `Deno.Command(Deno.execPath())` with `clearEnv`, and its permission grants are **read from the shipped shebang** rather than hardcoded in the test, so a test cannot silently run the CLI under a wider grant than it ships with. Every assertion locates its row by an id the CLI itself printed and then reads it with direct SQL, so the write path (CLI → API → Postgres) and the witness path (test → Postgres) stay independent.
- Acceptance criteria:
  - [x] Each subcommand (`packet`, `run`, `checkpoint`, `decision`, `end-run`) drives the real HTTP API end to end and the resulting row is asserted in the database
  - [x] **Criterion 5 of ST-086 is actually proven:** a checkpoint is created with no `--commit` **and** no `--no-commit` anywhere in its argv — asserted, not merely omitted — and the stored `repo_commit` is compared against a freshly-read `HEAD`. ST-086's criterion 5 was re-evidenced on this basis, not re-ticked
  - [x] Argument parsing is covered at its edges: missing required flag, flag with no value, unknown subcommand, `--help` / `-h` / no args (each with its expected exit code — `0` for help, `2` for usage errors)
  - [x] Git-derived defaults degrade correctly when git fails or is absent (the `null` path), and `--no-commit` opts out explicitly
  - [x] The HTTP timeout path (`AWCP_TIMEOUT_MS`) produces its distinct message, proven against a server that accepts and never responds — and distinguished from the unreachable-server message
  - [x] Error surfaces are asserted to be *self-correcting for an agent*: a 400 names the offending field. This **did** fail first — `post()` read only `message` and `unmetCriteria` and dropped the API's per-field `issues[]`, so a malformed `--policy-scope` yielded a bare "400 request body failed validation". Fixed in `7821dcc`, red-before-green observed; the API response shape is unchanged, so no other `/api/workflow` client is affected. Covered on three branches: one offending field, several, and a 400 carrying no `issues` array at all
  - [x] The agent/operator credential split is exercised from the CLI: with `AWCP_AGENT_API_KEY` set, the CLI's reporting subcommands succeed
  - [x] At least one **red control**: removing `PATH` from the CLI child's environment — so `git` cannot resolve — was observed turning the commit assertion red, per [docs/solutions/conventions/verification-mechanisms-need-adversarial-review.md](../../docs/solutions/conventions/verification-mechanisms-need-adversarial-review.md). Like ST-086's AC6, this is a **Point-in-Time Result** — a control observed once by hand, not an automated assertion — describing `server/tests/awcp-cli.test.ts` and `server/tests/_helpers/awcpCli.ts` at **`1e15d94`**. A commit touching either expires it (`git diff 1e15d94..HEAD -- server/tests/awcp-cli.test.ts server/tests/_helpers/awcpCli.ts`; non-empty ⇒ re-observe the control before this box counts as ticked)
- Verification: `server/tests/awcp-cli.test.ts` — 2 tests / 18 steps against one shared spawned server on port 3144. Suite run in `mcp-test`: **336 passed / 9 failed**, the 9 being the documented pre-existing provider-401 baseline (`tests/e2e.test.ts`, `tests/entity-worker-observability.test.ts`), which is the ST-086 baseline of 334/9 plus this story's two tests. CI green on `718b0f2` (run `30824498485`: `server-integration-tests` 4m23s, `contact-memory-tests` 10s) — CI passes the nine because it holds a provider credential. The command now needs three grants beyond the defaults, each earned by one file and each naming its binary rather than opening `--allow-run` wholesale: `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/`
- **The red control found a defect in this story's own test.** Removing `PATH` reddened the commit assertion but left the *null-path* assertions green — they proved "the value is null", not "the value is null because there is no repository here", so they would have passed against a CLI that never consulted git at all. Fixed with a same-run positive control. The general lesson (a verification mechanism needs adversarial review of its own, not just of the code it guards) is captured in the conventions doc linked above.
- **Two environment traps, invisible to reasoning and found only by running things.** (1) The plan's assumption A1 asked whether `--allow-run=deno` covers a CLI child that itself runs `git`; the real blocker was bigger than the grant it named — `mcp-test` had **no git binary and no repository mounted**, so the story's central requirement was unachievable as specified. Stopped and surfaced rather than widening grants unilaterally. PO decision: install git in the test image and have the test build its own throwaway repository in a temp dir rather than reading this checkout — hermetic, identical in CI, and it still proves the claim. (2) Under `clearEnv` the CLI child inherits no `PATH`, so `git` never resolves and *every* git-derived default takes its degradation branch — assertions about them pass while testing nothing. `PATH` is now supplied deliberately, with a docblock in `server/tests/_helpers/awcpCli.ts` saying why.
- **Settled, not deferred (PO, 2026-08-03):** git lands in the runtime image as well as the test image, and that is accepted long-term. A test-only build stage was weighed and declined; do not split it as a tidy-up. What would reopen the decision is the runtime image's contents becoming a compliance surface. This corrects the record: `242edb2` and the PR #43 squash message both say splitting the stage was "deferred as build work outside this story", which was accurate when written and was overtaken the same day by the PO's decision. The Dockerfile comment carries the settled version; the git log does not, so this line is where the two reconcile.
- Gaps, recorded rather than papered over: the plan's U6 also wanted an `unmetCriteria` regression test, which is **not reachable from this surface** — that field comes from the complete-packet route, which the CLI deliberately does not expose. Assumption A1 stands in the plan as open because `ce-work` does not mutate plan bodies; its falsification is recorded here, which is the authoritative place. A full `ce-code-review` pass was **not** run — the change was reviewed inline only.
- Plan: [docs/plans/2026-08-03-001-test-awcp-cli-coverage-plan.md](../../docs/plans/2026-08-03-001-test-awcp-cli-coverage-plan.md)
- Notes: **Moved In Progress → Done on 2026-08-03** on the merge of PR #43. This story changed no product behaviour beyond the one error-message fix — its output is evidence. The In Progress slot is free again; ST-084 stays in Review, blocked on the PO's review of the Stage 1 findings and the proposed ADR-016 amendments. **ADR-016 stays Proposed/Conditional** and ST-084 Stage 2 (criteria 5–7) stays unstarted — closing ST-087 closes the last untested surface of the ST-086 slice, not the host question.

### ST-084: Architecture spike — ADR-016 host-acceptance gate (ai-memory as AWCP host)
- Type: spike / architecture decision
- Source: PR #31 governance round (2026-07-29) — host acceptance must be proven, not presumed; ADR-016 held at Proposed/Conditional until this spike reports
- phase: 0 (architecture)
- Value: 4
- Blocked by: —
- Branch: `claude/st-084-awcp-host-spike`
- Touches: `server/db/007_workflow_schema.sql` (new); `server/src/workflow/` (new module — first subdirectory under `server/src/`); `server/tests/workflow-*.test.ts` (new); `server/tests/migrations.test.ts` (4 hardcoded version assertions); `docs/investigations/ST-084-awcp-host-spike-findings.md` (new); `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` (disposition on outcome — **not** flipped to Accepted by this story)
- **Staged execution (PO decision 2026-07-30):** the supplied plan is ~3 sessions of work; rather than thinly demonstrating all seven criteria, Stage 1 fully proves four and honestly marks the rest UNPROVEN.
- Acceptance criteria — **Stage 1**:
  - [x] **Criterion 1 — operational independence:** WorkPacket, AgentRun, Checkpoint, OperationalDecision, AttentionItem, Evidence and completion gating all function with OpenRouter, embeddings, entity extraction, AGE, hybrid ranking, consolidation and knowledge promotion disabled
  - [x] **Criterion 2 — separate persistence and API boundary:** independent transactional persistence in a `workflow` Postgres schema; operational entities are not thoughts/shards/graph records; memory reached only via explicit ports; a **no-op memory adapter supports the complete operational flow**
  - [x] **Criterion 3 — failure isolation:** knowledge-search failure, knowledge-promotion failure, graph unavailability and central-service restart each proven not to corrupt or roll back operational state; promotion proven to be an optional projection (deleting it leaves the decision intact)
  - [x] **Criterion 4 — reuse and coupling:** the ten named ai-memory components classified (directly reusable / adapter-reusable / modification-required / unnecessary / harmful coupling), with the slice's actual introduced dependencies recorded
  - [x] Dependency rule enforced **by a test that scans the module's own source**, not by documentation alone
  - [x] Stage 2 contracts *defined but not implemented*: remote-node protocol, auth + idempotency, spool format, policy-scope model, and the enumerated paths requiring enforcement — so Stage 2 does not begin from assumptions
  - [x] Preliminary findings doc with a verdict of **promising / promising with concerns / unlikely to fit** (deliberately weaker vocabulary than the final accept/reject), marking criteria 5 and 6 explicitly **UNPROVEN**
  - [x] Full server test suite green (spike must not red the existing suite) — 253 passed / 9 failed, the 9 being the documented pre-existing local-401 baseline (216 + 37 new = 253) in files this change never touches
  - [x] **ADR-016 is NOT marked Accepted by this story** and no final host decision is taken
  - [x] **PO review of the findings and the proposed ADR-016 amendments — completed 2026-08-03.** This was the story's last outstanding item and the reason it sat in Review
- **Stage 2 (criteria 5–7) is now ST-088.** It was carried on this entry as an unticked second criteria block, which meant a merged, reviewed, shipped Stage 1 could never be marked Done. Split on PO decision 2026-08-03: this story is Stage 1, ST-088 is Stage 2, and ADR-016's gate spans both
- Plan: [docs/plans/2026-07-29-001-awcp-ai-memory-host-spike.md](../../docs/plans/2026-07-29-001-awcp-ai-memory-host-spike.md) — PO-supplied controlling spec, plus an Implementation Addendum recording exact module locations, migration approach, dependency rules, Stage 2 contracts, test commands and rollback steps
- Findings: [docs/investigations/ST-084-awcp-host-spike-findings.md](../../docs/investigations/ST-084-awcp-host-spike-findings.md) — **Stage 1 verdict: PROMISING WITH CONCERNS.** Criteria 1–4 pass on evidence (37/37 tests, including a full run with all memory capabilities disabled and the provider unroutable). The qualifying concern is the policy-scope enforcement surface (§6.1): `scope.tags` is enforced in **zero** retrieval paths today, across 15 hand-written read paths with no chokepoint, a one-call `fetch` bypass, and two structurally unfilterable graph tools — a cost Candidate A carries that Candidate C would not, so it is a host-decision input rather than only an ST-082 item. Criteria 5–7 UNPROVEN.
- Docs: `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` §1; `docs/investigations/awcp-spec-evaluation.md` §7, §9; `docs/investigations/prism-ground-truth-inventory.md` §4
- Notes: Burden of proof sits with the spike, not with the preference — ai-memory is the *hypothesis*. (A transient WIP exception on 2026-07-30 — ST-074 also sitting In Progress — was resolved the same day: ST-074 was verified complete and moved to Done.) Code is **disposable** (`DROP SCHEMA workflow CASCADE` — the ledger lives inside that schema, so it is the whole teardown — plus deleting the module paths); the schemas/contracts are the intended survivors per awcp-spec-evaluation §6.1. **Moved In Progress → Review on 2026-08-01** when ST-086 started: Stage 1 is merged and its remaining item is the PO's review of the findings and the proposed ADR-016 amendments. Stage 2 (criteria 5–7) is still unstarted and is **not** covered by ST-086.
- **PO review outcome, 2026-08-03 — Review → Done.** All five proposed ADR-016 amendments (findings §13) accepted and applied as revision 1.2. Four were record corrections; **amendment 3 was adopted in its stronger form, as an acceptance *gate* rather than a trade-off** — ADR-016 now states Candidate A may not be accepted while §6.1's policy-scope enforcement surface is unpriced, which binds ST-088 to produce that estimate before it may recommend acceptance. **ADR-016's status is unchanged: still Proposed/Conditional.** Applying the amendments records progress against the gate; it does not discharge it, and no final host decision was taken.
- **The review re-derived the findings against the tree rather than reading the document, and two of the three §6 concerns had moved since the verdict was formed** — in opposite directions, neither announced by the story that caused it. §8's "test-applied, not wired at boot" caveat, which qualified *every* proven claim in the report, is **discharged** by ST-086's composition-root wiring (`server/index.ts:73`) — that favours Candidate A. §6.2's "a bad workflow migration cannot kill the server" is **no longer true of a deployed server**: ST-086 chose fail-startup, so under `FEATURE_WORKFLOW=true` a failed workflow migration exits before the port opens (`server/index.ts:87`) — that counts against it, and is now in ADR-016 §3's trade-offs. §6.1, the concern that could change the verdict, was re-verified and **stands undiminished**: `scope.tags` appears once in the server (`parseContext.ts:109`, assignment) and in no `WHERE` clause anywhere. Recorded in findings §12a, which deliberately leaves the verdict-era text as written rather than rewriting it.

### ST-086: Operate one local WorkPacket end to end (AWCP local MVP)
- Type: feature / vertical slice
- Source: PO direction 2026-08-01 — turn ST-084's proven Stage 1 module into one runnable local loop, without expanding the architecture spec or reopening settled Stage 1 decisions
- phase: 1
- Value: 4
- Blocked by: —
- Branch: `feat/st-086-awcp-local-mvp` (from `main` at `2bbb962`, after PR #31 merged) — **squash-merged to `main` as `f36903e` on 2026-08-03 via PR #39.** The `Story: ST-086` trailer was written deliberately into the squash message rather than accepting GitHub's default, which drops it, so `git log --grep="Story: ST-086"` still finds this story's shipped work
- Touches: `server/src/workflow/{bootstrap,api,readModel,dashboard}.ts` (new); `server/src/workflow/store.ts` (read-model additions, `endRun` now reports a missing run); `server/scripts/awcp.ts` (new CLI); `server/index.ts` (workflow bootstrap, `/api/workflow`, `/workflow`, `PORT`); `server/src/startupValidation.ts` (capability-aware); `server/src/healthCheck.ts` (provider probe gated); `server/tests/workflow-mvp-e2e.test.ts` + `server/tests/_helpers/serverProcess.ts` (new); `docker-compose.workflow.yml` (new); `.github/workflows/ci.yml` (`--allow-run`)
- **No schema change.** Migrations `001` and `002` are untouched and no `003` was needed — the slice is composition, API and read model over the Stage 1 schema.
- Acceptance criteria:
  - [x] A clean checkout starts the local stack in workflow mode with **no** OpenRouter credential (`docker-compose.workflow.yml`; `OPENROUTER_API_KEY` cleared, not blanked)
  - [x] Workflow migrations are invoked explicitly by the deployed composition root — proven by dropping the schema, booting a real process, and reading the ledger
  - [x] The typed API supports the complete local workflow across 11 named commands; no generic row mutation, arbitrary SQL, shell execution, or packet-status setter
  - [x] Missing or out-of-vocabulary policy scope fails closed (400), with a same-request success as the discrimination control
  - [x] One real local repository/session reported a commit-bearing checkpoint through the CLI (`repo_commit` = actual `git rev-parse HEAD`) — **re-evidenced by ST-087 on 2026-08-03.** When this box was first ticked the backing test posted a hardcoded SHA, which proves the API stores what it is handed, not that the CLI obtained anything; the claim was true but the evidence did not reach it. `server/tests/awcp-cli.test.ts` now creates a checkpoint with no `--commit` anywhere in its argv and compares the stored value against a freshly-read `HEAD`, and a red control (removing `PATH` from the CLI child's environment, so `git` cannot resolve) was observed turning exactly that assertion red
  - [x] The dashboard at `/workflow` shows active work, attention grouped by reason, decisions, checkpoints and criteria/evidence, and offers exactly resolve / attach-evidence / complete — **verified, in two layers:** the process-boundary test asserts the served page carries every required section, all three actions and no status control, each targeting an endpoint it exercises; and on 2026-08-02 the page was driven in a real headless Chromium, 28/28 checks — it renders, attention groups by reason with each reason class resolving to its intended colour, repository/branch/policy scope render with scope shown once per packet, criteria show met/unmet with evidence, all three interactions work end to end, completion is refused while a required criterion lacks evidence **with the unmet criteria named** (and the optional one correctly not named), a completed packet leaves the active overview, and a 401 clears the stored key without re-prompting. CI still has no browser, so the rendering layer is a **Point-in-Time Result** describing `server/src/workflow/dashboard.ts` at **`f36903e`** — re-anchored on 2026-08-03 from the pre-squash `0d3af13` after confirming `git diff 0d3af13..f36903e -- server/src/workflow/dashboard.ts` is empty, i.e. the verified file did not change between the browser run and the merge. Any commit touching that file — anyone's — expires it, checkable with `git diff f36903e..HEAD -- server/src/workflow/dashboard.ts` (non-empty ⇒ re-run the 28 checks before this box counts as ticked). **EXPIRED 2026-08-25 by `585d2c9` (ST-097)**, which added the WorkItem lane to that file; the 28 checks also predate that lane and cover none of it. Procedure and the reasoned decision *not* to automate it are in [docs/workflow-mvp.md](../../docs/workflow-mvp.md#verifying-the-dashboard-in-a-real-browser). One defect was found by looking and fixed: the refusal banner named the unmet criteria twice, because the server message already embeds them and the page appended them again
  - [x] Completion remains evidence-gated — refused with the unmet criteria named, and the packet verified still not complete after the refusal
  - [x] Operational state survives an actual server restart (SIGTERM, port freed, second process); the second boot applies nothing and skips both migrations
  - [x] The slice runs with the memory workers and provider access disabled, with a provider sentinel recording **zero** requests
  - [x] Out of scope and absent: remote collector, offline spool, Jira/Confluence/ADO writes, semantic operational search, graph representation, ADR-016 acceptance, broad memory refactor
- Verification: `server/tests/workflow-mvp-e2e.test.ts` — a **process-boundary** test (spawns and restarts a real server with `clearEnv`), plus two red/green controls proven red by removing the behaviour: deleting the `probeEmbeddingApi` capability gate makes the zero-request assertion fail with 2 recorded `/models` hits, and removing the `bootstrapWorkflow()` call makes the migration-at-startup assertion fail. **Final pre-merge run 2026-08-03**, from the `main` checkout with the `mcp-test` bind mount confirmed to point at it (`/home/cpeddle/projects/ai-memory/server -> /app`, so the worktree trap did not apply): 334 passed / 9 failed — the documented pre-existing provider-401 baseline in `tests/e2e.test.ts` and `tests/entity-worker-observability.test.ts`, all nine tracing to `OpenRouter 401: Missing Authentication header` and none touching the workflow module. CI on PR #39 green (`server-integration-tests`, `contact-memory-tests`), which is where those nine pass, since CI holds a real provider credential.
- Plan: **none — soft-gate exception recorded by PO decision 2026-08-02.** CLAUDE.md gates implementation on a `docs/plans/*.md` artifact, and this story shipped without one. The exception is deliberate, not an oversight: ST-086 was specified by a detailed external brief that already carried the product contract, scope boundaries and acceptance criteria, and that brief was transcribed into the acceptance-criteria list below rather than duplicated into a plan file. A retroactive plan would be a transcription of work already done — a decision artifact recording no decision. Recorded here so the gap is visible to an audit rather than silently absent.
- Docs: [docs/workflow-mvp.md](../../docs/workflow-mvp.md) — run instructions and the CLI/dashboard sequence
- Notes: This sits **beside** ST-084 Stage 2, it does not supersede or complete it. Criteria 5–7 (policy-scope enforcement across retrieval paths, remote execution node, final ADR-016 recommendation) remain UNPROVEN and unstarted. **ADR-016 stays Proposed/Conditional.** ST-084 moved to Review to hold the 1-In-Progress limit; its Stage 1 deliverable is merged and its outstanding item is the PO's review of the findings and proposed ADR amendments, which is a review activity. **Moved In Progress → Done on 2026-08-03** on the merge of PR #39, freeing the 1-In-Progress slot. Closing ST-086 closes the *slice*, not the host question: ADR-016 remains Proposed/Conditional and ST-084 Stage 2 remains unstarted.

### ST-047: Tool descriptions
- Type: dx
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 3
- Blocked by: —
- Touches: `server/index.ts` (tool registration descriptions)
- Acceptance criteria:
  - [x] All MCP tool descriptions include usage examples and parameter docs (AC-15)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-047.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🟡 Should fix. All 11 tool descriptions enriched. Misleading metadata (search fallback wording, search_thoughts/list_thoughts profile-isolation claims) corrected to match runtime behavior. Protocol compatibility test expanded with source-of-truth derivation and targeted regression assertions. 15/15 tests pass. Audited against the tree 2026-08-01 before closing: 11/11 tool descriptions carry Parameters/Example/Returns/Errors, 21/21 inputSchema fields carry `.describe()`, zero `profile` references remain (consistent with ADR-012), and the work is present on `main`. The earlier "10 tools / 10 tests" figures were undercounts — the work grew past its own record.

### ST-074: Reconcile `ExtractionItem` shape — Opt 3 provenance accessors
- Type: bug / design
- Source: PO (compass_artifact_wf.md residual concern #3, 2026-07-03)
- phase: contact-memory
- Value: 3
- Blocked by: — (ST-073 done; PO chose Opt 3 2026-07-03)
- Completed: 2026-07-03 (closed on the board 2026-07-30 after independent verification)
- Commit: `f919fda` — fix(contact-memory): reconcile ExtractionItem shape via provenance accessors
- Touches: `contact-memory/parser/types.ts`, `contact-memory/commit/captureThoughtAdapter.ts`, `contact-memory/tests/parser/types.test.ts`, `docs/investigations/compass_artifact_wf.md`
- Acceptance criteria:
  - [x] Direction chosen by PO — **Option 3**: keep the union shape, add pure accessors + document the `evidence[0]` convention (2026-07-03)
  - [x] `getPrimaryQuote` / `getAllSourceIds` accessors added to `parser/types.ts`; adapter routes its provenance quote through `getPrimaryQuote` and documents the `evidence[0]` convention; doc shape note updated to "done"
  - [x] All existing contact-memory tests pass (plus new accessor unit tests) — 79 passed / 0 failed
- Plan: [docs/plans/2026-07-03-005-fix-reconcile-extractionitem-shape-plan.md](../../docs/plans/2026-07-03-005-fix-reconcile-extractionitem-shape-plan.md)
- Docs: `docs/investigations/compass_artifact_wf.md`
- Notes: Confirmed mismatch 2026-07-03 — doc proposes `{kind, payload, quote, source_ids, char_span}`; actual [`ExtractionItem`](../../contact-memory/parser/types.ts#L152) is a flattened discriminated union with provenance in `evidence: EvidenceReference[]`. Opt 3 closes the drift without restructuring the union: accessors centralize the primary-quote + full-source-id patterns the doc's flat shape implied.
- Closure verification (2026-07-30): all three ACs re-checked independently against the code rather than trusting the tick marks. `getPrimaryQuote`/`getAllSourceIds` confirmed present and pure ([`parser/types.ts:172-192`](../../contact-memory/parser/types.ts#L172)); the adapter genuinely routes through the accessor ([`captureThoughtAdapter.ts:140`](../../contact-memory/commit/captureThoughtAdapter.ts#L140)) rather than inlining `evidence[0].quote`; the `evidence[0]` convention is documented at both the adapter and the accessor; the doc shape note is marked resolved (`compass_artifact_wf.md:155`). Contact-memory suite re-run with the CI command: **79 passed / 0 failed**, matching the claim exactly. `f919fda` confirmed an ancestor of `main` — nothing stranded on a side branch. The residual `candidate.evidence[0]` at `captureThoughtAdapter.ts:139` is deliberate, not an oversight: the plan's Scope Boundaries keep the metadata line's existing message-id semantics.


### ST-081: Formalise platform/product definitions (ADR-013 + SRS v1.2 supersession banners)
- Type: chore / governance
- Source: PO (platform-vs-product formalisation request, 2026-07-28, following the AWCP spec evaluation on PR #31)
- phase: 0 (governance)
- Value: 4
- Completed: 2026-07-29
- Blocked by: —
- Touches: `docs/design/adr/ADR-013-platform-product-definitions.md` (new); `docs/requirements/SRS.md` (v1.2 — header note + supersession banners on §4.3/§5.4/§5.5/§5.6 + revision history); this board (ST-079 ADR renumbered ADR-013 → ADR-015)
- Acceptance criteria:
  - [x] ADR-013 defines platform and product by **criteria** (litmus test: "decides what knowledge means / when it's trusted" → product; "stores/indexes/retrieves any knowledge identically" → platform), not just examples
  - [x] Product register recorded: Contact Memory (active), Developer Memory (deferred), Workflow/Operations Memory (proposed — AWCP; host/topology/lineage decided per ADR-016, storage layout open)
  - [x] Layering-vs-deployment clause: products may be co-deployed in one runtime (AWCP consolidation-first direction) without collapsing logical boundaries; separate infra (Contact→Supabase) stays a per-product decision
  - [x] Known violations dispositioned: consolidation worker grandfathered as Developer Memory logic in the platform runtime (no new wiki-tier dependencies); Storyboard confirmed superseded by the WorkPacket model (AWCP §8 Q4); three-tier Brain/views marked product-layer
  - [x] SRS bumped to v1.2 with banners in place (no section rewrites — supersession-map culture) and a revision-history row
  - [x] PO accepts ADR-013 (status `proposed` → `accepted`) — accepted 2026-07-29 after AWCP §8 Q2–Q10 resolved
- Plan: — (PO-directed governance drafting, same session as the request; no `docs/plans/` artifact — direct PO instruction 2026-07-28)
- Docs: `docs/investigations/awcp-spec-evaluation.md` (PR #31), `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md`, `docs/architecture/ai_memory_architecture_decisions.md`
- Notes: WIP-limit exception (entered Review directly alongside ST-047, PO-directed 2026-07-28) resolved by completion — ST-047 is now the sole Review entry. ST-079's planned guardrail ADR renumbered to ADR-015 (ADR-014 reserved by ST-080); ST-079 becomes a sub-rule of ADR-013's capability-inheritance frame. AWCP host/topology/source-lineage decided 2026-07-29 in [ADR-016](../../docs/design/adr/ADR-016-awcp-consolidation-host-topology.md); storage layout deferred to module design. Follow-on stories filed: ST-082 (tag-filter enforcement, AWCP §8 Q9) and ST-083 (Developer Memory design pass, AWCP §8 Q10). The grandfathered consolidation-worker relocation still has **no story yet** — tied to ST-083's design pass, not raised separately to avoid duplication.

### ST-078: Reconcile Apache AGE version drift (docs said v1.7.0; image ships PG15/v1.6.0-rc0)
- Type: chore / docs correction
- Source: Surfaced during the TurboPuffer storage build-vs-buy evaluation (`docs/investigations/turbopuffer-storage-evaluation.md`, 2026-07-21)
- phase: 0 (housekeeping)
- Value: 2
- Completed: 2026-07-21
- Resolution: **Option A (docs fix)** — the ADRs, not the Dockerfile, were wrong. AGE cuts per-Postgres-major tags and PG15's ceiling is `v1.6.0-rc0`; `PG15/v1.7.0` does not exist (`v1.7.0-rc0` is PG18-only), so the image was always correct. Option B (PG18 upgrade) rejected: no demonstrated requirement, still a release candidate, and it breaks ADR-011's PG15↔Supabase alignment.
- Touches: `docs/design/adr/ADR-011-storage-strategy.md` (primary: version corrected throughout, per-major tag-namespace constraint note added, Dockerfile snippet fixed to the vendored-tarball pattern, revision history 1.1); sibling ADRs corrected for the same stale pairing — `ADR-002`, `ADR-003`, `ADR-005`, `ADR-009`
- Acceptance criteria:
  - [x] Confirmed against apache/age releases: highest PG15 tag is `PG15/v1.6.0-rc0`; no stable (non-rc) PG15 release exists; `v1.7.0-rc0` is PG18-only — recorded in ADR-011 §Decision
  - [x] ADR-011 no longer asserts v1.7.0 for PG15; the false "no version mismatch" Positive corrected; per-Postgres-major tag-namespace constraint note added so the drift can't silently reappear
  - [x] `git grep "v1.7.0"` under `docs/design/adr/` returns only correct usages (the constraint note + revision-history rows); no stale PG15↔v1.7.0 pairing remains in the binding ADRs
  - [x] Option B path documented as rejected (would re-type as a Postgres major upgrade with its own plan) — not taken
- Notes: Delivered as a docs-only PR (no image rebuild, no test impact). The ST-021 spike findings (`docs/investigations/ST-021-findings/05-…`, `10-6b-…`) already documented the truth in 2026-05 — implementation vendored `v1.6.0-rc0` correctly; only the ADRs drifted. Those historical findings left intact (accurate, frozen). Dockerfile unchanged — it was already correct.

### ST-073: Verify residual claims in compass_artifact_wf.md (Deno libs, arXiv IDs, Zoom captions, k-run matching)
- Type: spike
- Source: PO (post-ce-doc-review residual concerns, 2026-07-03)
- phase: contact-memory
- Value: 3
- Completed: 2026-07-03
- Touches: `docs/investigations/compass_artifact_wf.md` (annotations only); no code changes
- Acceptance criteria:
  - [x] Each parsing lib verdict applied — mailparser/mbox-reader ✓ `npm:` (Deno 2 node-compat); planer ✓ but use `linkedom`/`deno-dom` not jsdom; Talon Python-only (not viable) — all sources reachable, verified 2026-07-03 ([L84](../../docs/investigations/compass_artifact_wf.md#L84)/[L89](../../docs/investigations/compass_artifact_wf.md#L89)/[L134](../../docs/investigations/compass_artifact_wf.md#L134))
  - [x] All 5 arXiv IDs resolved on arxiv.org — two citation errors corrected in-doc: 2501.11840 author Konet→**Schroeder et al.** (figures matched); 2512.12818 system TEMPR→**Hindsight**
  - [x] Zoom claim corrected — date May 18 2026 ✓ + captions-no-longer-downloadable ✓, but "paid cloud-recording plan" → **host-enabled Meeting Transcript setting** (Zoom KB0063899) ([L105](../../docs/investigations/compass_artifact_wf.md#L105))
  - [x] Concern #5 resolved — PO chose **structured-key blocking → embedding-cosine** hybrid; recommendation written into §2 ([L54](../../docs/investigations/compass_artifact_wf.md#L54))
  - [x] Verdicts applied as annotations; no claim silently deleted
  - [x] Concern #3 Agent D proposal produced → PO chose **Opt 3 (accessor fns + evidence[0] doc note)**; split to ST-074; no code changed here
- Plan: `docs/plans/2026-07-03-004-spike-verify-compass-residual-claims-plan.md`
- Docs: `docs/investigations/compass_artifact_wf.md`
- Notes: Residual concerns from the `ce-doc-review` of compass_artifact_wf.md. Verification fanned out to 4 parallel read-only sub-agents (3× ce-web-researcher + 1× Explore); web fully reachable this session. All findings PO-reviewed before doc edits. Concern #3 (ExtractionItem shape) split to ST-074 (code, blocked on this).
- Type: debt / infra
- Source: Contact Memory MVP review, PR #21 CI finding (2026-07-03)
- phase: contact-memory
- Value: 3
- Completed: 2026-07-03
- PR: #22 (squash-merged, branch deleted)
- Touches: `.github/workflows/ci.yml`
- Acceptance criteria:
  - [x] CI runs the `contact-memory/` Deno test suite (`deno test --allow-read --allow-env tests/`) as its own job — new independent `contact-memory-tests` job (native Deno 2.0.0, no Docker); 77 tests green in CI (7s)
  - [x] The contact-memory job does **not** require `OPENROUTER_API_KEY` (its tests stub the `AgentRuntime`/provider seam), so it stays green independent of the server integration job's secret gate — verified 77/0 locally with the secret unset and green in CI
  - [x] The `OPENROUTER_API_KEY` secret-gate failure mode is documented and scoped to the server job only (renamed `server-integration-tests`), so a missing secret can't silently red-X jobs that don't need it
  - [x] A run on `main` and on a contact-memory PR both go green — PR #22: `contact-memory-tests` ✓ (7s), `server-integration-tests` ✓ (4m23s)
- Plan: `docs/plans/2026-07-03-002-feat-contact-memory-ci-coverage-plan.md`
- Notes: Two independent sibling jobs, no `needs:` edge. Secret gate stays a hard `exit 1` but lives entirely inside the server job (KTD4). Reviewed via ce-code-review — verdict approve, no P0/P1/P2 findings; three P3 advisory notes (Deno pin duplicated across ci.yml + server/Dockerfile, job-rename safe only because `main` has no required status checks, cosmetic `.gitignore` comment). `main` currently has no branch-protection required checks — if added later, reference `server-integration-tests` / `contact-memory-tests`, not the old `integration-tests`.

### ST-072: Fix latent `TS2769` in `capture_thought` INSERT (`server/index.ts`)
- Type: bug / debt
- Source: Uncovered during ST-070/ST-071 (PR #21 CI review, 2026-07-03)
- phase: server
- Value: 3
- Completed: 2026-07-03
- Commit: `e172d70`
- Acceptance criteria:
  - [x] `deno check server/index.ts` passes clean (0 errors)
  - [x] `deno check` passes clean across all of `server/`
  - [x] Integration suite baseline maintained: 216 passed / 9 expected-local-401 (CI is arbiter for LLM tests)
- Plan: `docs/plans/2026-07-03-001-fix-capture-thought-metadata-jsonb-typing-plan.md`
- Notes: One-line fix: `${metadata}` → `${sql.json(metadata)}` in the `capture_thought` INSERT. Pattern matches existing jsonb binds in `entityWorker.ts` and `consolidationWorker.ts`. Pushed to main (direct commit, no PR — trivial type-only fix, no behavioral change).

### ST-065: Contact Memory local MVP (WhatsApp export → reviewed shards via platform MCP)
- Type: feature
- Source: PO (Contact Memory local MVP kickoff, 2026-07-01)
- phase: contact-memory
- Value: 4
- Completed: 2026-07-02
- Blocked by: — (ST-063, ST-064 complete)
- Touches: `contact-memory/runtime/agent.ts` (new), `contact-memory/runtime/providers/anthropic.ts` (new), `contact-memory/parser/extractor.ts` (new), `contact-memory/commit/captureThoughtAdapter.ts` (new), `contact-memory/cli/index.ts` (new), `contact-memory/README.md` (new), `contact-memory/tests/**` (new), `docs/residual-review-findings/feat-whatsapp-parser.md` (new)
- Acceptance criteria:
  - [x] CLI parses a real WhatsApp export, extracts structured facts via a swappable `AgentRuntime` seam (Anthropic adapter), and enforces platform-decoupling (no `capture_thought`/platform fields in `ContactExtraction`)
  - [x] Terminal review loop (approve/edit/reject) shows cited sender/body evidence and requires explicit confirmation before any write
  - [x] Approved/edited items commit through the existing platform MCP's `capture_thought`, with provenance embedded via the `---cmv1---` content grammar
  - [x] Manual verification against the real export and live platform MCP: both a contact-name query and a fact-specific query retrieve the committed shard
  - [x] 9-persona code review completed post-ship; 7 findings applied and tested (terminal-injection sanitization, pre-commit summary accuracy, `--from`/`--to` validation, MCP commit fail-closed behavior, early config validation, order-insensitive evidence comparison, review-loop de-duplication); 3 findings left as tracked follow-ups (workflow-gate backfill — this story; MCP transport duplication; repair-pass privacy/repairability tradeoff)
- Plan: `docs/plans/2026-07-01-001-feat-contact-memory-local-mvp-plan.md`
- Notes: Retroactively logged — this story, ST-063, and ST-064 shipped through `docs/plans/*.md` without board entries, which the code review flagged as a workflow-gate violation. Backfilled together as part of formalizing `docs/plans/*.md` as the canonical plan format (see CLAUDE.md's Workflow gate section). Fixes committed on `feat/whatsapp-parser`, not yet merged.
- Residuals (accepted, from 2026-07-03 handoff review §4 — not MVP-blocking per the plan's deferred scope):
  - **A1 (P1) — re-run can duplicate facts:** `extraction_id`/`item_id` are LLM-regenerated each run with no session persistence, so re-running after a partial commit failure can re-commit already-committed facts. Real fix = deterministic idempotency keys derived from content + provenance (not LLM-regenerated) via session/resume state. May warrant its own story when Contact Memory resume UX is scoped.
  - **A2 (P2) — provenance block spoofable:** a contrived WhatsApp message could spoof the pipe-delimited provenance metadata block. No live exploit today (nothing parses it back). **Partially mitigated (2026-07-03 PR #21 review):** `renderCaptureContent` now `encodeURIComponent`-encodes each provenance value, so delimiter (`|`/`:`) injection *via values* is blocked. Residual risk is the unencoded fact `content` that precedes the `---cmv1---` marker — a body containing that literal marker line could still inject a spoofed block. Revisit with structured/escaped encoding (or content-side escaping of the marker) if any consumer parses the provenance block.
  - **A3 (P2/P3) — no retry + collapsed error categories:** no retry on transient network failures; error messages collapse distinct categories (an expired API key looks like a network outage). Cheap future win: bounded retry with backoff + distinct auth/network/server error classification.

### ST-064: WhatsApp export parser (pure parser module)
- Type: feature
- Source: PO (Contact Memory product track, real-export-grounded parser)
- phase: contact-memory
- Value: 4
- Completed: 2026-06-30
- Blocked by: — (ST-063 complete)
- Touches: `contact-memory/parser/whatsapp.ts` (new), `contact-memory/tests/parser/whatsapp.test.ts` (new), `contact-memory/tests/fixtures/whatsapp/sanitized-chat.txt` (new)
- Acceptance criteria:
  - [x] Pure parser (no AI/provider/runtime/MCP/database dependencies) converts a WhatsApp `.txt` export into `WhatsAppChat`/`WhatsAppMessage` validating through `contact-memory/parser/types.ts`
  - [x] Handles the observed day-first export format, multiline continuations, empty bodies, system notices, media/deleted/edited markers, Unicode, and out-of-order timestamps
  - [x] Deterministic, unique `message_id` generation stable across insertions/removals of unrelated earlier messages
  - [x] Fails closed (structured parser error) on unsupported timestamp formats and malformed input, without leaking raw transcript content in errors
  - [x] Regression coverage uses a sanitized committed fixture, not the real investigation export
- Plan: `docs/plans/2026-06-30-001-feat-whatsapp-parser-plan.md`
- Notes: Retroactively logged alongside ST-063 and ST-065 — see ST-065's Notes for why. Merged via PR #20.

### ST-063: Contact Memory parser types (domain contract)
- Type: feature
- Source: PO (Contact Memory product track kickoff)
- phase: contact-memory
- Value: 4
- Completed: 2026-06-29
- Blocked by: —
- Touches: `contact-memory/parser/types.ts` (new), `contact-memory/tests/parser/types.test.ts` (new), `shared/tagGrammar.ts` (tag grammar extracted for reuse)
- Acceptance criteria:
  - [x] Parser-output types (`WhatsAppChat`, `WhatsAppMessage`) with no AI/runtime dependencies
  - [x] `ContactExtraction`/`ExtractionItem` defined as a review-only, platform-decoupled discriminated union (commitment/event/preference/sentiment/important_date/shared_link/conversation_theme)
  - [x] `ReviewDecision` modeled per-item (approve/edit/reject), not per-batch
  - [x] `ContactShard`/`ContactShardCandidate` kept independent of commit mechanisms (`capture_thought`, future `memory_teach`) — translation deferred to a separate adapter
  - [x] Tag grammar shared between `server/src/parseContext.ts` and Contact code via `shared/tagGrammar.ts`, not mirrored
  - [x] Contract tests cover type/schema validation, review-decision mapping, tag validation, and shard-boundary invariants
- Plan: `docs/plans/2026-06-29-001-feat-contact-parser-types-plan.md`
- Notes: Retroactively logged alongside ST-064 and ST-065 — see ST-065's Notes for why. Merged via PR #19.

### ST-062: WSL→Windows MEMORY_API_KEY sync script
- Type: feature
- Source: dev-ex gap during WSL2 native setup (2026-06-23)
- phase: 0
- Value: 3
- Completed: 2026-06-26
- Blocked by: —
- Touches: `sync-api-key.sh` (new), `tests/sync-api-key.test.sh` (new), `.gitignore`, `opencode-mcp.json.example`, `.opencode/config.example.json`, `README.md`, `docs/wsl2-setup.md`, `docs/solutions/developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md`
- Acceptance criteria:
  - [x] `sync-api-key.sh` reads `MEMORY_API_KEY` from `.env` and sets Windows user env var via `powershell.exe`
  - [x] Real `opencode-mcp.json` / `.opencode/config.json` are gitignored and materialized from `.example` templates
  - [x] Script is idempotent and verifies writes via SHA-256 read-back
  - [x] Script never prints raw key; uses env var transport to PowerShell
  - [x] `--check` dry-run mode reports drift with zero writes
  - [x] `README.md` and `docs/wsl2-setup.md` document the automated path
  - [x] `tests/sync-api-key.test.sh` exercises deterministic paths with stubbed powershell
- ExecPlan: `docs/plans/2026-06-23-002-feat-windows-api-key-sync-plan.md`
- Notes: Merged via PR #16 (merge commit `fd76676`). Closes the Windows VS Code MCP auth gap where `${env:MEMORY_API_KEY}` drifts from repo `.env`.

### ST-029: Feedback API (`report_feedback` tool + `feedback_events`)
- Type: feature
- Source: PO scope-lock during QP-005 planning (2026-05-18)
- phase: 1
- Value: 3
- Completed: 2026-06-23
- Blocked by: —
- Touches: `server/index.ts` (new MCP tool), `server/db/schema.sql` (new table), `server/db/005_feedback_events.sql`, `server/tests/feedback.test.ts`
- Acceptance criteria:
  - [x] New MCP tool `report_feedback({ thought_id, query, verdict: 'helpful' | 'irrelevant' })`
  - [x] New `feedback_events` table with `(id, thought_id, query, verdict, created_at)`; FK to `thoughts`
  - [x] Feedback rows joinable to the originating `recall_events` row (shared `(thought_id, query)` natural key)
  - [x] `requireApiKey` middleware applies; no new auth surface
  - [x] Integration test: capture → search → report_feedback → row visible in `feedback_events`
  - [x] Out of scope for this story: surfacing feedback in `stats` (owned by ST-028) and rate-limiting (defer to a later story if abuse emerges)
- Docs: `docs/investigations/memory-architecture-design/05-recall-tracking-and-promotion-scoring.md` §5.2
- Notes: Implemented and merged via PR #14 (merge commit `952b233`). Includes parseContext null-safety fix and code-review follow-ups ST-059, ST-060, ST-061 added to Backlog.

### ST-044: Structured logging
- Type: observability
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 3
- Completed: 2026-06-19
- Blocked by: —
- Touches: `server/src/logging.ts` (new), `server/index.ts` (middleware)
- Acceptance criteria:
  - [x] Every MCP tool invocation emits structured JSON log with timing (AC-3)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-044.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: Additive to ST-028 (worker observability). ST-028 covers worker-specific logs; this covers tool invocation timing. Merged via PR #11.

### ST-043: Context validation + feature flags
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 3
- Completed: 2026-06-19
- Blocked by: —
- Touches: `server/src/parseContext.ts`, `server/index.ts`
- Acceptance criteria:
  - [x] Malformed context strings are rejected with a clear error (AC-6)
  - [x] Feature flags disable graph/entity features when toggled off (AC-16)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-043.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: Context validation returns structured ContextParseError for unknown keys, bare tokens, empty values, invalid profile/visibility. Feature flags FEATURE_ENTITY_WORKER / FEATURE_CONSOLIDATION_WORKER default enabled; "false" disables. 28/28 tests pass (24 unit + 4 integration). Merged via PR #12.

### ST-028: Worker observability and `stats` MCP tool
- Type: feature
- Source: PO assessment of storyboard sufficiency (2026-05-18)
- phase: 2
- Value: 3
- Completed: 2026-06-19
- Blocked by: —
- Touches: `server/index.ts` (`stats` tool), `server/src/entityWorker.ts`, `server/src/consolidationWorker.ts`, `server/db/004_worker_runs.sql`
- Acceptance criteria:
  - [x] Both workers emit structured JSON logs to stdout, one line per event: `{ts, level, worker, run_id, event, duration_ms, items_processed, errors}` where `event` is one of `run_started|item_processed|run_completed|run_failed`
  - [x] New `worker_runs` table persists per-run state: `(run_id uuid PK, worker text, started_at, ended_at, items_processed int, errors int, error_summary jsonb)`
  - [x] 30-day retention on `worker_runs` via `DELETE FROM worker_runs WHERE ended_at < now() - interval '30 days'` at end of each run
  - [x] New `stats` MCP tool returns one JSON object with sections: `queues` (entity_extraction_queue depth), `workers` (last-24h run counts + error counts per worker), `recall` (recall events last 24h), `content` (counts from existing `thought_stats`)
  - [x] `stats` subject to existing `requireApiKey` middleware (no new auth surface)
  - [x] Failure of either worker visible in `stats` output within one poll cycle of the next run
  - [x] Integration test: induce worker failure → `stats` reports `errors > 0`; recover → next run reports success
- ExecPlan: `.github/planning/execplans/exec-plan-ST-028.md`
- Query packet: `.github/planning/query-packets/QP-028-worker-observability.md`
- Docs: `docs/design/adr/ADR-007-consolidation-pipeline.md`
- Notes: Merged via PR #9. Worker_runs table as 004_worker_runs.sql. stats tool registered with sections for queues, workers, recall, content. All suite tests pass.

### ST-039: Embedding resilience
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 5
- Completed: 2026-06-14
- Blocked by: —
- Touches: `server/db/002_needs_embedding.sql`, `server/src/embeddingBackfill.ts` (new), `server/src/embeddings.ts` (extracted), `server/index.ts` (capture_thought fire-and-forget wiring), `server/tests/embedding-backfill.test.ts`, `server/tests/embedding-timeout.test.ts`
- Acceptance criteria:
  - [x] Thoughts with failed embeddings are recoverable via backfill (AC-2)
  - [x] Embedding model version is recorded per thought (AC-17)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-039.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🔴 Must fix resolved. Backfill worker polls every 60s (configurable), batch size 50, max 5 attempts per thought via `embedding_attempts` counter. Capture_thought fire-and-forget sets `needs_embedding=false` + `embedding_model` on success; leaves `needs_embedding=true` on failure for backfill retry. Concurrent-writer-safe UPDATE guards prevent races. 9 focused tests pass.

### ST-040: Worker crash isolation
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 5
- Completed: 2026-06-04
- Blocked by: —
- Touches: `server/src/entityWorker.ts`
- Acceptance criteria:
  - [x] Entity worker survives errors without crashing the server (AC-10)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-040.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🔴 Must fix resolved. Poll loop wrapped in try/catch with exponential backoff (1s→60s max). `safePoll` tracks consecutive failures; after 5 logs ALERT-level message. No schema changes required. 3 crash-isolation tests pass.

### ST-054: Retrieval robustness (false-empty, identifier dilution, zero-result observability)
- Type: hardening
- Source: Session analysis 2026-06-04 (build-failure false-empty incident) + adversarial design review + local-instance validation
- phase: 2
- Value: 5
- Completed: 2026-06-10
- Blocked by: —
- Touches: `server/index.ts` (`search` floor fallback, structured `search_thoughts` output, capture/query normalization), `server/src/identifierNormalization.ts` (new), `server/src/searchQuality.ts` (query-level recall logging), `server/db/schema.sql`, `server/db/003_search_text_and_recall_queries.sql` (new), `server/tests/`
- Acceptance criteria:
  - [x] **D1** — `search` no longer returns an empty set when relevant memories exist below the legacy 0.5 floor; response shape `{results:[{id,title,url}]}` remains pinned
  - [x] **D2** — non-destructive identifier normalization persists retrieval text (`search_text`) and `normalizer_version` while preserving raw `content`; identifier facets are retained in `metadata`
  - [x] **D3** — both `search` and `search_thoughts` write query-level observability rows including zero-result queries
  - [x] **D3b** — `search_thoughts` returns machine-parseable structured JSON with per-result `score` and `quality_band`
  - [x] **Gate** — ST-046 harness ST-054 flip-points are green (`normalizeForBm25`, identifier-form BM25 baseline, and `search` D1 baseline)
  - [x] Cross-model critical review passes (different model reviews implementation against the ExecPlan contract before the story moves to Review)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-054.md`
- Query packet: `.github/planning/query-packets/QP-054-retrieval-robustness.md`
- ce-plan artifact: `docs/plans/2026-06-04-001-feat-retrieval-robustness-plan.md`
- Docs: `server/index.ts`, `server/db/search.sql`, `server/src/searchQuality.ts`
- Notes: Planned and ready 2026-06-05. ST-057 completed 2026-06-10 (full suite 87/0), plan-review block cleared, ST-054 resumed and verification passed (`tests/search-golden-set.test.ts` 16/16; full suite 87/0). Cross-model critical review PASS recorded in ExecPlan §6. Scope lock preserved: floor-with-fallback for `search`; persisted `search_text` + `normalizer_version`; token boundary strips Jira/build identifiers but preserves UUID/error-code/version tokens; zero-result observability via `recall_queries`; `search_thoughts` response uses structured JSON score+band. Full historical re-normalization/backfill remains deferred via `coalesce(search_text,content)` compatibility. PO accepted and story moved to Done on 2026-06-10.

### ST-057: MCP compatibility hardening
- Type: hardening
- Source: OpenCode ai-memory MCP investigation 2026-06-05 (`prompts/list` returned JSON-RPC -32601)
- phase: 2
- Value: 5
- Completed: 2026-06-10
- Blocked by: —
- Notes (execution order, 2026-06-10): Execute ST-057 first, then ST-054. These stories are functionally independent; ST-057 is lower-complexity (protocol stubs only). Clearing MCP compatibility issues first lets ST-054's verification gate (`deno test tests/`) pass cleanly without scope expansion. PO approved 2026-06-10.
- Touches: `server/index.ts` (MCP server capability/registration surface), possibly new protocol-compat helper under `server/src/`, focused protocol tests under `server/tests/`, README/client troubleshooting docs if behavior changes
- Acceptance criteria:
  - [x] `prompts/list` no longer returns JSON-RPC `-32601 Method not found` for clients that probe prompts; it returns an MCP-compatible empty prompt list or a minimal intentional prompt surface as decided during `/plan`
  - [x] `prompts/get` behavior is explicitly decided and tested: either a valid minimal prompt is retrievable, or unsupported prompt names return the protocol-appropriate error while `prompts/list` remains safe
  - [x] `resources/list` and `resources/templates/list` compatibility expectations are researched and either implemented as safe empty lists or deliberately left unsupported with documented rationale
  - [x] A protocol audit in the ExecPlan maps the server-side MCP 2025-06-18 methods relevant to ai-memory (`tools/*`, `prompts/*`, `resources/*`, ping, and any optional completion/subscribe behavior) to implemented/deferred decisions
  - [x] Focused tests prove OpenCode-style startup probes do not produce `-32601` for accepted compatibility endpoints and that existing `tools/list` / `tools/call` behavior is unchanged
  - [x] Cross-model critical review passes (different model reviews implementation against ExecPlan contract before story moves to Review)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-057.md`
- Query packet: `.github/planning/query-packets/QP-057-mcp-compatibility-hardening.md`
- Docs: MCP 2025-06-18 server specs for prompts/resources/tools; README client setup section
- Notes: Direct diagnostic probes showed `initialize` advertises only `capabilities.tools`, `tools/list` works, while `prompts/list` and `resources/list` returned `-32601`. Implemented first-class SDK `registerPrompt` and `registerResource`, added protocol compatibility tests (including SDK client smoke), and updated README troubleshooting guidance. Cross-model critical review passed on 2026-06-10. PO accepted and story moved to Done on 2026-06-10.

### ST-058: Sync alignment wrap-up (ST-041, ST-042, ST-056 completion)
- Type: governance
- Source: PO (2026-06-14, gap analysis: three completed stories not reflected in governance artifacts)
- phase: 2
- Value: 3
- Completed: 2026-06-17
- Blocked by: —
- Touches: `.github/planning/execplans/exec-plan-ST-041.md` (updated), `.github/planning/execplans/exec-plan-ST-042.md` (updated), `.github/planning/execplans/exec-plan-ST-056.md` (created), `.github/planning/story-board.md`, `FollowUpSessionLog.txt`, `.gitignore`
- ExecPlan: `.github/planning/execplans/exec-plan-ST-058.md`
- Notes: Wrap-up story reconciling three independently-completed work-streams (ST-041 cypher hardening, ST-042 migration framework, ST-056 diagnostics) with governance artifacts. Created branch feat/ST-058-sync-alignment off origin/main. Cherry-picked 56a492c for cypher baseline consistency. All 131 server tests pass, lint clean. Cross-model review gated before merge.

### ST-056: Embedding request timeout resilience
- Type: hardening
- Source: MCP stall investigation 2026-06-05 (VS Code agent fetch failures + embedding-call timeout risk)
- phase: 2
- Value: 4
- Completed: 2026-06-17
- Blocked by: —
- Touches: `server/src/mcpDiagnostics.ts`, `server/src/startupValidation.ts`, `server/deno.lock`, `server/tests/mcp-diagnostics.test.ts`, `server/tests/startup-validation.test.ts`
- Acceptance criteria:
  - [x] AsyncLocalStorage adopted for request-scoped context isolation in `mcpDiagnostics`
  - [x] Module-level `_activeEmbeddingLane` state removed; no regression in lane tracking
  - [x] Concurrent requests no longer overwrite each other's active lane
  - [x] `ensureRecallQueriesTable` removed from startupValidation.ts (moved to migrate.ts)
  - [x] New focused test documents the fix and prevents regression
  - [x] Full suite 131/131 tests pass, lint clean
  - [x] Cross-model critical review passes before story moves to Review
- ExecPlan: `.github/planning/execplans/exec-plan-ST-056.md`
- Query packet: `.github/planning/query-packets/QP-056-embedding-request-timeout-resilience.md`
- Relates to: ST-039 (embedding recoverability/backfill), ST-044 (general tool logging), ST-049 (query routing / vector-lane skipping), ST-053 (deep health check)
- Notes: Refactored mcpDiagnostics to use node:async_hooks AsyncLocalStorage instead of module-level state. Cherry-picked commit 56a492c for startupValidation import consistency (stripCypherComments → maskCypherLiteralsAndComments). diagnostics now supports concurrent request isolation — the embedding lane context contamination that caused search stalls in high-concurrency scenarios is eliminated. PO accepted and story moved to Done on 2026-06-17.

### ST-042: Migration framework
- Type: infrastructure
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 4
- Completed: 2026-06-17
- Blocked by: —
- Touches: `server/src/migrate.ts`, `server/db/001_initial.sql`, `server/db/002_needs_embedding.sql`, `server/db/003_recall_queries.sql`, `server/index.ts`, `server/tests/migrations.test.ts`
- Acceptance criteria:
  - [x] Schema changes applied via numbered SQL migration files
  - [x] `schema_migrations` table tracks applied versions
  - [x] Bootstrap detection for existing databases (tables exist, no schema_migrations)
  - [x] All migrations executed before Deno.serve() at startup
  - [x] Deno.exit(1) on migration failure
  - [x] Full suite 131/131 tests pass
  - [x] Cross-model critical review passes before story moves to Review
- ExecPlan: `.github/planning/execplans/exec-plan-ST-042.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: Lightweight migration runner in server/src/migrate.ts processes numbered SQL files from server/db/. Migration 003 (recall_queries table) replaces the old ensureRecallQueriesTable in startupValidation.ts. File structure uses direct-path loader (server/db/, not server/db/migrations/) per existing DB init convention. Bootstrap detection: queries for existing tables; if found and no schema_migrations, seeds current versions without re-running DDL. PO accepted and story moved to Done on 2026-06-17.

### ST-041: Cypher injection hardening
- Type: security
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 5
- Completed: 2026-06-17
- Blocked by: —
- Touches: `server/index.ts` (graph_traverse tool handler via maskCypherLiteralsAndComments)
- Acceptance criteria:
  - [x] graph_traverse rejects queries containing mutation keywords (token-aware deny-list)
  - [x] Max query length cap at 4096 enforced
  - [x] MATCH-only gate preserved
  - [x] Fails closed on malformed literal/comment input
  - [x] Legitimate MATCH ... RETURN queries continue to work
  - [x] 20/20 focused cypher-injection tests pass
  - [x] Full suite 131/131 tests pass
- ExecPlan: `.github/planning/execplans/exec-plan-ST-041.md`
- Query packet: `.github/planning/query-packets/QP-041-cypher-injection-hardening.md`
- Notes: Cypher hardening already shipped in merged commit 56a492c (author date 2026-06-13) as maskCypherLiteralsAndComments; present on origin/main via 72799b4. ST-058 verified baseline, confirmed 20/20 injection tests pass, and reconciled governance artifacts. Function name differs from plan (maskCypherLiteralsAndComments not stripCypherComments). PO accepted and story moved to Done on 2026-06-17.

### ST-055: MMR null-embedding BM25 recall preservation
- Type: bug
- Source: ST-046 plan-review resolution (2026-06-05 Task 4.3 e2e failure after expanded corpus)
- phase: 2
- Value: 5
- Completed: 2026-06-05
- Blocked by: —
- Touches: `server/src/searchQuality.ts` (`mmrRerank` null-embedding merge behavior), `server/index.ts` only if caller-side merge is chosen during ExecPlan authoring, `server/tests/e2e.test.ts`, focused unit tests under `server/tests/`
- Acceptance criteria:
  - [x] A deterministic unit test proves a null-embedding candidate with a higher fused/BM25 score than at least one embedded candidate remains in the final top-k
  - [x] `mmrRerank` uses one selection loop over embedded and null-embedding candidates; null candidates participate with similarity-to-selected = `0`, making their MMR score `λ * score`
  - [x] The intentional equal-score bias is pinned: a null candidate may beat an embedded candidate when the embedded candidate is redundancy-penalized and their fused scores are equal
  - [x] The all-null degenerate case remains pure score order
  - [x] Embedded candidates still receive MMR diversity ranking; existing MMR behavior is not collapsed into plain score sorting
  - [x] `e2e: capture_thought → search_thoughts returns via BM25 lane` passes against the ST-046 expanded seeded corpus
  - [x] Existing e2e `MMR keeps null-embedding row returnable` still passes
  - [x] Full `mcp-test` server tests pass, or any unrelated pre-existing failure is documented with evidence
  - [x] Cross-model critical review passes before the story moves to Review
- ExecPlan: `.github/planning/execplans/exec-plan-ST-055.md`
- Query packet: `.github/planning/query-packets/QP-055-mmr-null-embedding-bm25-recall.md`
- Blocks: ST-046 (eval harness Task 4.3 should not resume until current-state e2e is green with the expanded corpus)
- Notes: Completed 2026-06-05. The ST-046 corpus expansion revealed a runtime recall bug: newly captured BM25-only rows can have `embedding = NULL` while embedding generation is fire-and-forget. Current MMR selection fills `k` from embedded candidates before appending null-embedding candidates, so a high-scoring BM25-only hit can be dropped once the corpus has enough embedded rows. Fixed via a unified MMR selection loop where null-embedding candidates participate with similarity-to-selected = `0` (intentional recency/lexical-recall bias), not by raising e2e limits or waiting synchronously for embeddings. Implementation, full verification, cross-model critical review, and PO acceptance passed 2026-06-05.

### ST-038: Startup safety & input guards
- Type: hardening
- Source: QP-038 (vectorize-mcp-worker best practices review, 2026-05-31)
- phase: 2
- Value: 5
- Completed: 2026-06-02
- Blocked by: —
- Touches: `server/index.ts`, `server/src/startupValidation.ts`, `server/src/entityWorker.ts`, `server/tests/capture-size-limit.test.ts`, `server/tests/startup-validation.test.ts`
- Acceptance criteria:
  - [x] Server fails fast at startup if required env vars are missing (AC-1)
  - [x] `capture_thought` rejects content exceeding 32KB with clear error (AC-5)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-038.md`
- Query packet: `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md`
- Notes: 🔴 Must fix resolved. Startup validation now fails fast on missing required env vars; 32KB byte-limit enforcement and boundary coverage added. Cross-model review gate passed.

### ST-037: Configure local MCP clients for dogfooding
- Type: enablement
- Source: PO (scoping session 2026-05-28, prerequisite for ST-034 data accumulation)
- phase: 2
- Value: 4
- Completed: 2026-05-29
- Blocked by: —
- Touches: `.vscode/mcp.json` (new), `README.md` (new section)
- Acceptance criteria:
  - [x] `.vscode/mcp.json` configures VS Code Copilot to connect to `http://localhost:3000/mcp` using `${env:MEMORY_API_KEY}` interpolation
  - [x] README.md "Connecting Clients" section documents setup for VS Code Copilot, Claude Code, and Claude Desktop
  - [x] PO manually performs capture+search round-trip from at least one configured client
- ExecPlan: `.github/planning/execplans/exec-plan-ST-037.md`
- Query packet: `.github/planning/query-packets/QP-037-local-mcp-client-config.md`
- Notes: Dev graph is empty (0 thoughts). Service is functional but no AI agent is connected. This story enables daily dogfooding so that real data accumulates for ST-034's cardinality analysis. Cloud clients (ChatGPT/Gemini) deferred to ST-023.
  - **Completed 2026-05-29:** `.vscode/mcp.json` committed with Streamable HTTP config; README updated with three-client setup section; all-tools smoke test passed (thought_stats, capture_thought, search_thoughts)
  - **Accepted 2026-06-02:** VS Code MCP visibility issue resolved; server visible after user-scoped env + global MCP config refresh and VS Code reload.

### ST-010: Integration testing for cloud MCP (Deno + Docker Compose)
- Type: debt
- Source: PO (rewritten post-ST-021 pivot)
- phase: 2
- Value: 4
- Blocked by: —
- Touches: `server/tests/` (new), `.github/workflows/ci.yml`, `docker-compose.test.yml`
- Acceptance criteria:
  - [x] E2E test: `capture_thought` → `search_thoughts` returns it via BM25 lane
  - [x] E2E test: `capture_thought` (with embedding settled) → `search_thoughts` returns it via vector lane
  - [x] E2E test: shard promoted to wiki via consolidation worker; both queryable
  - [x] E2E test: entity extraction populates AGE graph; `graph_traverse` returns expected nodes
  - [x] E2E test: context-scoped search filters correctly across `project` / `profile`
  - [x] CI pipeline runs `docker compose up` against test images on every push
  - [x] Recall event tracking verified end-to-end
- ExecPlan: `.github/planning/execplans/exec-plan-ST-010.md`
- Docs: `docs/investigations/interface-design-mcp-rest.md`
- Notes: Rewritten post-ST-021 pivot for TypeScript/Deno/Docker Compose. CI runs against the same `docker-compose.yml` used locally to keep dev and CI environments in sync.

### ST-008: Implement consolidation worker (shard → wiki promotion)
- Type: feature
- Source: PO (rewritten post-ST-021 pivot; scope locked 2026-05-20 in QP-008)
- phase: 1
- Value: 3
- Completed: 2026-05-27
- Touches: `server/src/consolidationWorker.ts` (new), `server/src/consolidationScoring.ts` (new), `server/src/consolidationLLM.ts` (new), `server/index.ts` (modify), `server/db/schema.sql` (modify), `server/tests/consolidation-worker.test.ts` (new), `server/tests/fixtures/consolidation-corpus.sql` (new)
- Acceptance criteria:
  - [x] Event-driven worker: triggers on `thoughts` INSERT and `recall_events` INSERT call `pg_notify('consolidation_event', thought_id::text)`; worker holds a `sql.listen('consolidation_event', ...)` connection and processes pending queue rows on each notification
  - [x] On worker startup, pending queue is drained once (miss recovery); MCP `consolidate({dry_run?, limit?})` tool exposes manual full-sweep as fallback
  - [x] Three-factor scoring per ADR-007: `0.40 × frequency_norm + 0.35 × diversity_norm + 0.25 × relevance`; frequency = recall_event count; diversity = distinct projects; relevance = `helpful` proportion in `feedback_events` OR `thoughts.confidence` as fallback when no feedback rows exist
  - [x] Threshold bands: ≥0.7 auto-promote; 0.5–0.69 flag (log only, no `thoughts` write); <0.5 skip
  - [x] Eligibility: `memory_type='shard'`, `active=true`, ≥2 recall events, `content_fingerprint` not already in a wiki row (dedup)
  - [x] Promotion: INSERT new `thoughts` row with `memory_type='wiki'`, `source='auto-promoted'`, `supersedes=NULL`, `confidence=score`, `content`=LLM-normalised; UPDATE original shard `active=false`; INSERT `consolidation_log` row
  - [x] LLM normalisation: OpenRouter `openai/gpt-4o-mini` call for every ≥0.5 candidate produces `normalised_content`; on call failure mark queue `status='llm_error'`, set `retry_after = now() + interval '1 hour'`
  - [x] 1:1 promotion model (one shard → one wiki). N:1 cluster-based promotion deferred to ST-031
  - [x] Integration tests: 7 cases — promote happy path, flag band, skip band, dry-run, dedup, relevance fallback, LLM failure defer
- ExecPlan: `.github/planning/execplans/exec-plan-ST-008.md`
- Query packet: `.github/planning/query-packets/QP-008-consolidation-worker.md`
- Docs: `docs/design/adr/ADR-007-consolidation-pipeline.md`, `docs/investigations/memory-architecture-design.md`
- Notes: Scope locked across 4 /plan rounds 2026-05-19/20. Wiki.supersedes=NULL per ADR-007. Relevance fallback to `thoughts.confidence` avoids blocking on ST-029 (feedback API). Event-driven LISTEN/NOTIFY replaces earlier "Configurable schedule (default: daily)" wording. 34/34 tests pass. Commits: 1825f76, ad56741, ae768d7, b3cf14a, 073db30, bd38629, 04b456b. Accepted by PO 2026-05-27.

### ST-030: Add `.gitattributes` and normalize line endings repo-wide
- Type: debt
- Source: PO scope-lock during /plan closeout (2026-05-19); plan-review resolved 2026-05-20
- phase: 0
- Value: 2
- Completed: 2026-05-27
- Touches: `.gitattributes` (created); 540 text files renormalized in commit `0611109`
- Acceptance criteria:
  - [x] `.gitattributes` created at repo root with policy: `* text=auto eol=lf` baseline + `*.bat`/`*.cmd`/`*.ps1` → `text eol=crlf` (commit `c1c1c7d`)
  - [x] `git add --renormalize .` applied; renormalized files committed in a single commit titled `build: add .gitattributes and normalize line endings` (commit `0611109`)
  - [x] `git status --porcelain` produces zero lines on a clean checkout (verified 2026-05-20)
  - [x] `git ls-files --eol -- server/Dockerfile server/db/graph.sql server/db/schema.sql server/src/parseContext.ts` shows `i/lf` in index under `attr/text=auto eol=lf` for each
  - [x] `git ls-files --eol -- '*.ps1'` shows `i/lf w/crlf` under `attr/text eol=crlf` for each
  - [x] `git diff 0611109^..0611109 -w --stat` produces empty output (Task 4.4 — completed 2026-05-27; empty output confirmed)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-030.md`
- Query packet: `.github/planning/query-packets/QP-030-gitattributes-line-endings.md`
- Notes: Accepted by PO 2026-05-27. Two plan-reviews resolved 2026-05-20 (Git EOL semantics; verification scope). All 6 ACs met. `git diff -w` proves renormalize commit is whitespace-only.

### ST-035: Entity↔thought provenance link (entity_mentions back-link table)
- Type: feature
- Source: PO (brainstorming session 2026-05-22)
- phase: 1 (foundational — enables Phase 3 consumers ST-019, ST-026 and future graph-expanded search)
- Value: 4
- Completed: 2026-05-26
- ExecPlan: `.github/planning/execplans/exec-plan-ST-035.md`
- Query packet: `.github/planning/query-packets/QP-035-entity-thought-provenance.md`
- Docs: `docs/design/specs/2026-05-22-entity-thought-provenance.md`, `docs/design/plans/2026-05-22-entity-thought-provenance.md`
- Notes: Accepted by PO 2026-05-26. All 7 tasks complete; 4/4 integration tests pass. `entity_mentions` table live with composite PK, CHECK, FK cascade, and secondary index. Entity worker writes batched DELETE+INSERT on every extraction. `server/index.ts` untouched — data-plane only. 4 pre-existing search test failures (seed-corpus gap on fresh DB) are not regressions — see exec-plan §6b Discovery 2.

### ST-036: Separate dev/test DB containers (Compose profiles)
- Type: debt
- Source: PO decision during ST-035 execution (2026-05-25); test-pollution incident surfaced the need
- phase: 2
- Value: 4
- Completed: 2026-05-26
- Query packet: `.github/planning/query-packets/QP-036-dev-test-db-separation.md`
- Notes: Accepted by PO 2026-05-26. 20/20 tests pass via `docker compose --profile test exec mcp-test`. Compose profiles separate dev DB (persistent, `db_data` volume) from test DB (ephemeral, tmpfs). `mcp-test` service connects to `db-test` on port 3001. Corpus-isolation filter retained for intra-run test ordering.

### ST-005: Search quality enhancements (MMR, project boosting, recall logging)
- Type: feature
- Source: PO (rewritten post-ST-021 pivot)
- phase: 1
- Value: 4
- Completed: 2026-05-19
- ExecPlan: `.github/planning/execplans/exec-plan-ST-005.md`
- Query packet: `.github/planning/query-packets/QP-005-search-quality-and-recall.md`
- Notes: Accepted by PO 2026-05-19. 16/16 tests pass; MMR diversification, 1.2× project boost, recall_events logging, strict? context flag all delivered.

### ST-022: Implement entity extraction worker (OpenRouter → AGE graph)
- Type: feature
- Source: ST-021 spike outcome (2026-05-16)
- phase: 1
- Value: 5
- Completed: 2026-05-19
- Blocked by: ST-021 (done)
- ExecPlan: `.github/planning/execplans/exec-plan-ST-022.md`
- Query packet: `.github/planning/query-packets/QP-022-entity-extraction-worker.md`
- Notes: Accepted by PO 2026-05-19. 4/4 integration tests pass; graph_search, entity worker, AGE nested-array fix all delivered.

### ST-013: Split investigation docs into landing pages and focused fragments
- Type: infrastructure
- Source: PO
- phase: 6
- Value: 4
- Completed: 2026-05-18
- Touches: `.github/copilot-instructions.md`, `.github/prompts/`, `.github/planning/`, `docs/investigations/`
- Acceptance criteria:
  - [x] Each current top-level investigation file remains in place as a compact landing page that links to focused fragment docs
  - [x] All investigation content under `docs/investigations/` (including nested research trees) is covered by per-topic fragment sets that preserve approved design decisions
  - [x] Governance consumers reference either the retained landing pages or precise fragment docs instead of broad monolith assumptions
  - [x] A section mapping matrix proves every original major section has a destination and no design-authority content was dropped during the split
- ExecPlan: `.github/planning/execplans/exec-plan-ST-013.md`
- Docs: `docs/investigations/split-section-mapping-matrix.md`, `docs/investigations/split-manifest.md`
- Notes: Accepted by PO 2026-05-18. 14 top-level landing pages + 174 fragments (top-level) + 45 Discussions + 3 Youtube = 437 total .md files. 222/222 matrix rows mapped. Zero content dropped.

### ST-021: Spike — Fork OB1 and extend with memory tiers, context scoping, BM25, and openCypher structural search
- Type: spike
- Source: PO (architecture review session 2026-05-16)
- phase: 0
- Value: 5
- Completed: 2026-05-16 (Docker validation confirmed locally)
- Touches: `docker/`, `server/`, `docker-compose.yml`, `docs/investigations/ST-021-findings.md`, `.github/planning/execplans/exec-plan-ST-021.md`
- Acceptance criteria:
  - [x] **Memory tier mapping** — Single-table discriminator (`memory_type` column on `thoughts`) recommended and validated; `server/db/schema.sql` produced
  - [x] **BM25 on PostgreSQL** — `tsvector`/`tsquery` + `ts_rank_cd` + RRF fusion validated; `server/db/search.sql` produced; OB1's existing `search_thoughts_text()` identified as extension base
  - [x] **Structural search without AGE (baseline)** — Recursive CTE ceiling documented in findings §R3; variable-length multi-label patterns require AGE
  - [x] **AGE v1.7.0 on PostgreSQL 15 in Docker** — Dockerfile with `postgresql-server-dev-15` + AGE v1.6.0-rc0 from source (COPY tarball approach); `docker/postgres-age/Dockerfile` and `init/01-extensions.sql` produced and tested
  - [x] **openCypher validation** — Multi-hop traversal (`CAUSED_BY*1..5`) returned 3-hop chain; fact inference returned `flowers` via explicit MATCH chain (AGE v1.6.0 `|` workaround); validated in findings §R5 and §R6
  - [x] **Context scoping in OB1 MCP tools** — `server/src/parseContext.ts` + `server/index.ts` fork with `context` parameter on `capture_thought`, `search_thoughts`, and `list_thoughts`
  - [x] **Entity extraction worker wire-up design** — OpenRouter call shape, `FOR UPDATE SKIP LOCKED` queue loop, `MERGE` AGE writes (with label/rel allow-listing) documented in findings §R8
  - [x] **Docker Compose validation** — `docker compose up -d` confirmed locally: both `db` and `mcp` containers healthy; `vector` and `age` extensions loaded; `memory_graph` created; BM25+RRF `rrf_score` column returned; `CAUSED_BY*1..5` traversal returned 3-hop chain; fact inference returned `flowers` via explicit MATCH chain
- ExecPlan: `.github/planning/execplans/exec-plan-ST-021.md`
- Docs:
  - `docs/investigations/ST-021-findings.md`
  - `server/db/schema.sql`, `server/db/search.sql`, `server/db/graph.sql`
  - `server/index.ts`, `server/src/parseContext.ts`, `server/src/auth.ts`, `server/src/db.ts`
  - `docker/postgres-age/Dockerfile`, `docker-compose.yml`
- Notes: All 8 ACs met. Key discoveries: AGE v1.7.0 does not exist for PG15 (use PG15/v1.6.0-rc0); git clone inside Docker blocked by Fortinet SSL proxy — use COPY of pre-downloaded tarball; flex + bison required in apt-get; AGE v1.6.0 does not support `|` in relationship type selectors (requires AGE v1.7.0 / PG17+). OB1 already has `search_thoughts_text()` with two-phase BM25 — implementation story should extend it. Downstream stories needed: entity extraction worker, consolidation worker, cloud deployment.

### ST-015: Improve ExecPlan template to show outcomes up front
- Type: infrastructure
- phase: 0
- Source: PO
- Value: 3
- Completed: 2026-05-15
- Blocked by: none
- Touches: `.github/planning/execplans/_TEMPLATE.md`, `.github/planning/execplans/`
- Acceptance criteria:
  - [x] ExecPlan template now has an "Outcomes & Conclusions" section immediately after §1 Background
  - [x] The Outcomes section has type-specific structure: spikes emphasize discoveries/learnings, features emphasize completion/delivery, and infrastructure/debt emphasize risk/improvements
  - [x] Template documents required fields: completion status, key findings/achievements, requirements met vs unmet, architectural impact, supporting evidence, and downstream changes
  - [x] A worked example (based on a completed story like ST-014) shows how the new section is populated
  - [x] The narrative flow makes it clear at a glance: intent → requirements → what was actually delivered
- ExecPlan: `.github/planning/execplans/exec-plan-ST-015.md`
- Docs: `.github/planning/execplans/_TEMPLATE.md`, `.github/planning/execplans/supporting_material/exec-plan-ST-014-outcomes-worked-example.md`
- Notes: Accepted by PO.

### ST-016: Research software engineering best practices for governance adoption
- Type: infrastructure
- phase: 0
- Source: PO
- Value: 5
- Completed: 2026-05-15
- Blocked by: none
- Touches: `.github/instructions/`, `.github/prompts/`, `.github/planning/`, `docs/investigations/`
- Acceptance criteria:
  - [x] A research-backed shortlist of software engineering practices (code quality + C# idioms) is documented with applicability to ai-memory
  - [x] Recommended governance updates define where each practice is enforced (instructions, prompts, checklists, or automation)
  - [x] A WoW proposal captures linting/setup expectations and checklist-driven execution guidance for future stories
  - [x] Adoption guidance identifies what to introduce now vs defer, including rationale and risk
- ExecPlan: `.github/planning/execplans/exec-plan-ST-016.md`
- Docs: `docs/investigations/se-best-practices.md`, `.github/instructions/coding-standards.instructions.md`, `.github/instructions/ways-of-working.instructions.md`
- Notes: Accepted by PO. All 6 tasks executed and verified. Build clean, tests pass, 4 analyzers active.

### ST-017: Evaluate Open Brain as base layer vs current architecture
- Type: spike
- phase: 0
- Source: PO
- Value: 5
- Completed: 2026-05-15
- Blocked by: none
- Touches: `docs/investigations/`, `.github/planning/`
- Acceptance criteria:
  - [x] Documented assessment of Open Brain (OB1) as a platform for ai-memory's use cases — can it be used directly with plugins/recipes/schemas?
  - [x] Evaluation of per-ingest synthesis extension feasibility on OB1 vs current C#/SQLite architecture — which base makes this easier to build?
  - [x] Evaluation of graph/structural similarity search extension feasibility on OB1 vs current architecture
  - [x] Stack tradeoff analysis: TypeScript/Python (OB1 ecosystem) vs C#/.NET 8 (current) — evaluation of ecosystem, hosting, and extension authoring
  - [x] Hosting model evaluation: Supabase/OpenRouter (OB1 default) vs local-first (current) vs hybrid
  - [x] Clear recommendation: use OB1 as-is + extend, fork OB1, adopt patterns in C#, or stay current course — with rationale
  - [x] Impact assessment on existing backlog stories ST-002 through ST-010 if pivot is recommended
- ExecPlan: `.github/planning/execplans/exec-plan-ST-017.md`
- Docs: `docs/investigations/openbrain-pivot-evaluation.md`
- Notes: Accepted by PO. Recommendation was Option C (Stay Current, 4.50/5.0). ST-021 opens a new evaluation with hybrid architecture lens.

### ST-012: Add discoverable AI-governance asset catalog and validation
- Type: infrastructure
- phase: 0
- Source: PO
- Value: 4
- Completed: 2026-05-05
- Blocked by: none
- Touches: `.github/prompts/`, `.github/instructions/`, `.github/planning/`, `docs/`
- Acceptance criteria:
  - [x] A documented metadata contract exists for repo AI-governance assets covering prompts, instructions, and planned future extensions such as agents or skills
  - [x] A machine-readable inventory or index exposes the repo's AI-governance assets and their intended use
  - [x] Validation guidance or automation detects drift between asset metadata, indexes, and published docs
  - [x] Contribution guidance defines what prompt/instruction/skill-style additions are accepted, rejected, or deferred
- ExecPlan: `.github/planning/execplans/exec-plan-ST-012.md`
- Docs: `docs/investigations/awesome-copilot-applicability-review.md`, `docs/investigations/workflow-and-prompt-design.md`, `docs/investigations/context-engineering-principles.md`
- Notes: Accepted by PO.

### ST-001: Scaffold .NET solution and project structure
- Type: infrastructure
- phase: 0
- Source: PO
- Value: 5
- Completed: 2026-05-05
- Blocked by: none
- Touches: `src/`, `tests/`, `*.sln`, `Directory.Build.props`, `NuGet.config`, `.github/instructions/`, `.github/prompts/`
- Acceptance criteria:
  - [x] Solution builds with `dotnet build`
  - [x] Three projects exist: AiMemory.Core, AiMemory.Server, AiMemory.Tests
  - [x] Directory.Build.props sets C# 12, .NET 8, nullable enabled, implicit usings
  - [x] `dotnet test` runs and executes one placeholder smoke test
  - [x] Coding standards plus `/plan` and `/continue` prompts state that testing follows TDD principles
- ExecPlan: `.github/planning/execplans/exec-plan-ST-001.md`
- Docs: `docs/investigations/language-stack-recommendation.md`
- Notes: Accepted by PO.

### ST-014: Investigate memsearch (zilliztech) for architectural learnings
- Type: spike
- phase: 0
- Source: PO
- Value: 4
- Completed: 2026-05-04
- Blocked by: none
- Touches: `docs/investigations/`, `docs/investigations/memory-architecture-design.md`, `docs/investigations/sqlite-vs-postgresql.md`
- Acceptance criteria:
  - [x] Assessment of ONNX bge-m3 local embeddings as an alternative to OpenAI for ST-004 — feasibility, trade-offs, and a go/no-go recommendation
  - [x] Assessment of Milvus Lite as a vector store option against ai-memory's current SQLite + pgvector plan — documented in investigation note
  - [x] Summary of memsearch's 3-layer progressive recall pattern (search → expand → transcript) with a recommendation on whether to adopt, adapt, or skip for ai-memory
  - [x] Comparison of memsearch's markdown-as-source-of-truth model against ai-memory's SQLite-first design — with documented rationale for maintaining or reconsidering the current approach
  - [x] Findings captured in a new investigation doc: `docs/investigations/memsearch-applicability-review.md`
- ExecPlan: `.github/planning/execplans/exec-plan-ST-014.md`
- Docs: `docs/investigations/memory-architecture-design.md`, `docs/investigations/sqlite-vs-postgresql.md`
- Notes: Accepted by PO. Use memsearch as a reference for future provider flexibility and staged recall UX, not as a replacement architecture.

### ST-011: Institutionalize recurring governance review and remediation
- Type: debt
- phase: 0
- Source: PO
- Value: 5
- Completed: 2026-05-04
- Notes: Accepted by PO; review slot cleared. Validation report: `.github/planning/audit-reports/audit-report-2026-05-03.md`.

### ST-009: Create workflow governance files (.github/)
- Type: infrastructure
- phase: 0
- Source: PO
- Value: 5
- Completed: 2025-05-02
- Notes: Prompts, board, ExecPlan template, instructions, session log created from investigation docs

---

## Archived

> Stories superseded by the ST-021 architectural pivot (2026-05-16) from local-first C#/SQLite to OB1 fork (TypeScript/Deno + PostgreSQL + pgvector + AGE). Retained for traceability; ExecPlans (where drafted) remain in `.github/planning/execplans/` as historical reference.

### ST-002: Implement SQLite schema + FTS5 + migrations
- Superseded by: `server/db/schema.sql` — PostgreSQL 15 + tsvector generated column + HNSW pgvector index + AGE init scripts (delivered by ST-021)
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-002.md`

### ST-003: Implement IMemoryRepository (SQLite)
- Superseded by: Direct SQL via `postgres` npm package in `server/index.ts`; dedup (content_fingerprint), soft-delete (active), and recall fields already in the `thoughts` schema
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-003.md`

### ST-004: Implement embedding service (OpenAI)
- Superseded by: OpenRouter inline embedding (`text-embedding-3-small`, 512-dim, fire-and-forget) in `server/index.ts` (delivered by ST-021)
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-004.md`

### ST-007: Implement MCP server (facade over service layer)
- Superseded by: OB1 fork in `server/index.ts` — 7 MCP tools live: `search`, `fetch`, `search_thoughts`, `capture_thought`, `list_thoughts`, `thought_stats`, `graph_traverse` (delivered by ST-021)
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-007.md`

### ST-018: Graph schema + structural fingerprints for SQLite
- Superseded by: AGE `memory_graph` + `entity_extraction_queue` trigger in `server/db/graph.sql` (delivered by ST-021)
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-018.md` (never drafted)

### ST-020: Implement request-scoped ambient context (contextual scoping)
- Superseded by: `server/src/parseContext.ts` + explicit `context` parameter on `capture_thought`, `search_thoughts`, and `list_thoughts` (delivered by ST-021)
- Original ExecPlan: `.github/planning/execplans/exec-plan-ST-020.md` (never drafted)
