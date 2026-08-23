---
name: "AWCP external evidence import — agent-radio, architecture_analyser, local-model worker"
summary: "Findings imported from three PO-named sources outside this repository, with provenance and currency caveats, and what each does and does not bear on the AWCP capability horizons."
asset_type: "investigation"
status: "imported-with-open-currency-caveats"
created: "2026-08-23"
owners:
  - "ai-memory-maintainers"
source_path: "docs/investigations/awcp-external-evidence-import-2026-08.md"
---

# AWCP external evidence import — 2026-08-23

**Type:** Investigation / external evidence import (Tier 2 reference)
**Origin:** Decision 6 of [the AWCP strategy baseline](awcp-strategy-baseline-2026-08.md) —
unsourced references in the strategy synthesis are imported where artifacts exist and recorded as
named non-goals otherwise. The PO named three sources on 2026-08-23.

> **Provenance tier.** Everything below was read this session from the named sources. The two GitHub
> repositories are **private**: `WebFetch` returns 404 and they were read through authenticated `gh`
> API calls. Nothing here is a project-verified fact about *this* repository — it is external
> evidence, and the baseline's provenance split applies.

---

## The finding that matters most

**agent-radio has measured, against a real provider, the mechanism Horizon B is built on — and the
result is not a clean endorsement.**

The strategy synthesis (§5, §6) argues AWCP should prefer

```
provider-native control/event interface → provider adapter → normalized AWCP state
```

over owning a terminal, with terminal ownership demoted to *"a fallback, not the architecture."*
agent-radio tested exactly that preference against OpenCode 1.18.18 and found the provider-native
surface **accepts calls it does not perform**:

| Mechanism | Measured behaviour |
|---|---|
| `POST /session/{id}/prompt_async`, **idle** session | `204`; a finished assistant turn echoes within ~1.5s. Wakes idle sessions. Works |
| `POST /session/{id}/prompt_async`, **busy** session | `204` accepted — but the payload is persisted as a **new user message consumed by a later assistant turn**, not steered into the in-flight one |
| `POST /api/session/{id}/prompt` with `delivery=steer` or `queue`, busy | **`200` accepted, never delivered** — no nonce observed in the transcript |

*Source: `docs/runtime-compatibility.md`, pinned 2026-08-18, branch `feat/agent-radio-analysis-engine`.*

**A control surface that returns success and silently does nothing is worse than terminal scraping,
because it looks like it worked.** That is precisely the *"AWCP guesses state"* failure the synthesis
wants to design away, arriving through the door the synthesis recommends.

This does not overturn §5's ordering. It sharpens it into a requirement Horizon B can actually be
written against:

> **The provider capability contract must distinguish *accepted* from *delivered*, per verb, per
> provider, and attach an observability requirement to each — a capability an adapter cannot verify
> it performed is not a capability.**

*"Provider adapters advertise what they can really provide"* is not a testable requirement. The above
is.

### Scope of the STOP — stated carefully, because the flattering reading is wrong

`docs/runtime-compatibility.md` records **Gate G1 verdict: STOP**, both plan stop conditions fired,
*"no implementation unit beyond U1 may proceed"*. It would be an overstatement to read that as
"agent-radio is halted."

- The **STOP applies to the in-flight-injection branch and the Coral attachment topology.** Neither
  was selected; the Coral jar's distribution rights are recorded as *"NOT identified"* (no upstream
  LICENSE) with a deliberate decision not to commit or auto-download it.
- The product **routed around** the stop rather than being halted by it. `experiments/bounded-turn-compatibility/README.md`
  (2026-08-19) proves a different path — **completed synchronous turns**, read/glob/grep-only tools,
  four isolated concurrent servers — and records C1–C5 all **PASS**. Its own words: the stopped
  mechanisms *"are never used on the product path."*
- **But that PASS has been retracted by its own authors.** The same README: *"The PASS above is
  retained historical evidence, but it is contradicted: the original probe exercised only a P1-shaped
  response and did not prove the credential-provisioning mechanism or all frozen P1–P5 envelopes. It
  must not be used to revalidate U9."*
- **And the corrective run has not passed.** `docs/handoffs/handoff-20-08-2026-0926.md` opens with a
  `TimeoutError` waiting on `POST /session/{sid}/message` during the corrective live run, under strict
  diagnosis rules (*do not rerun the live probe; do not modify historical evidence*).

**Accurate summary:** in-flight injection and steering are measured-negative and stopped; the
synchronous-turn path is **unresolved** — its only PASS was withdrawn and the corrective harness has
not yet produced a passing live run.

### What is worth stealing regardless of outcome

agent-radio's evidence discipline is the same shape as this repository's, independently arrived at,
and the strategy synthesis was right to admire it (§20, §21):

- Versions and artifacts pinned by **sha256**, not by name (OpenCode OpenAPI digest, Coral jar
  checksum and byte count).
- *"Append rather than overwrite evidence logs."*
- Stop conditions that **actually fired and halted work**, rather than being recorded and passed.
- A retracted PASS **kept in place** and explicitly barred from re-use — failed and superseded
  attempts preserved rather than deleted.
- Synthetic responses in dry runs *"validate the harness only; they are explicitly not compatibility
  evidence"* — the claim/evidence separation the synthesis §21 asked for, already implemented.

### Currency

Repository last pushed **2026-08-23T10:06Z**; the newest handoff read is dated **2026-08-20**. State
after that date is unread. Python; private; zero stars.

---

## architecture_analyser — a scope mismatch that Horizon H must name

`CAPeddle/architecture_analyser` — private, **Rust**, last pushed **2026-08-17**.

Its framing is a strong fit with AWCP's evidence model. From `README.md`: *"Enforce architecture with
evidence, not vibes"*, and it *"keeps extraction, measurement, policy evaluation, and recommendation
separate so metrics are never mistaken for judgment. Every finding is evidence-linked,
confidence-scoped, baseline-aware, and explicit about degraded analysis."*

`STRATEGY.md` (2026-06-18) names four tracks *"sequenced by trust dependency"*, the last of which is
close to what the synthesis §17 wants: **Agent guardrails and validation loop** — *"Export
machine-readable context packets and post-change validations that distinguish declared constraints,
verified facts, and heuristics."*

Its stated non-goals also converge with the synthesis independently: *"Universal architecture scoring
or generic 'clean architecture' rankings"* and *"claims of semantic certainty for inferred domain
boundaries"* — the synthesis §17 likewise insists it must not become an *"is this repository
AI-ready?"* scoring tool.

**The mismatch: it analyses C++ and C#.** ai-memory's active stack is Deno/TypeScript. So Horizon H
— *"integrate Architecture Analyzer into normal changes"* — **cannot apply to `server/` today.** It
could apply to `src/` and `tools/GovernanceAssetValidator/`, which are C# but skeletal. Horizon H
must therefore choose one of:

1. a non-goal for this repository's primary code, applied only to the .NET side;
2. an unscoped dependency on a TypeScript extraction front-end that does not exist;
3. deferred until ai-memory has C#/C++ code worth analysing.

Leaving it as an unqualified horizon hides the choice.

### Currency caveat — do not cite its capability without re-checking

Two documents in that repository disagree, and the disagreement is not resolved by anything read here:

- `ROADMAP.md` (2026-07-31, status **Accepted**) records an external review finding *"the project's
  design documentation and canonical model significantly ahead of its executable behavior: all three
  public commands (`analyze`, `agent-context`, `validate-change`) still return
  `UNIMPLEMENTED_COMMAND`"*.
- `README.md` **Status** describes those same commands as implemented — libclang extraction, a Roslyn
  subprocess for C#, four output writers, policy engine, baseline handling.

The later push (2026-08-17) suggests the README is the newer statement, but that was **not verified**.
Treat its capability as **unverified currency**. Its guiding sequencing rule is worth carrying across
regardless: *"Foundation correctness → working vertical slice → differential (baseline/change)
analysis → maintainability signal breadth → second language → scale and empirical validation."*

---

## Local-model worker — the item that does not close

`docs/investigations/Local GPU Model Setup.md`, created 2026-08-23 21:43.

**Two housekeeping facts first.** The file is **untracked** in a tracked directory, and it is a raw
chat transcript rather than an investigation write-up. It should be committed with provenance or
moved out of `docs/investigations/`; it is neither here.

**What it actually contains is advice, not results.** A 6GB-VRAM laptop GPU is assessed as viable for
*"a bounded local worker, not a replacement for Claude Code, Copilot Agent, or your stronger cloud
models"*; a work-packet JSON interface is proposed; LM Studio is recommended over Ollama **for the
benchmarking phase** with a revised recommendation partway through; and a configuration seam is
proposed (`LOCAL_LLM_BASE_URL` / `LOCAL_LLM_MODEL` / `LOCAL_LLM_API_KEY`) so that *"LM Studio or
Ollama remains a replaceable implementation detail."*

**The measured evidence is not in reach.** The document names five inputs — `RESULTS.md`,
`benchmark-packets.json`, `qwen-runs.json`, `qwen-scorecard.json`, `local_triage.py`. **None exists
under `/home/cpeddle`**, and a code search of `cpeddle/agent-radio` for `qwen` and for `scorecard`
returned nothing.

**Consequence for the synthesis §18.** Its claim that *"the Qwen experiments have already given us
useful negative evidence"* traces to **recommendations about how to set up an experiment**, not to
the experiment's results. The earlier review flagged this as a conflation with ST-077; that was half
right — the local-coding-model work is genuinely separate from ST-077's Qwen3-VL retrieval spike, but
the measured evidence is unlocated either way.

**Disposition:** §18's bounded-function capability-matrix idea stands on its **design merits**, which
are good and align with the work-packet model AWCP already implements. It may **not** be cited as
evidence-backed. The scorecard files are the thing to ask for.

---

## Import queue, after this pass

| Item | Status |
|---|---|
| agent-radio | **Imported.** Private repo, read via `gh`. Bears directly on Horizon B |
| Architecture Analyzer | **Imported**, with an unresolved scope mismatch and an unverified-currency caveat |
| Local-model / coding-model evaluation | **Partially imported.** Design rationale captured; measured results **not located** |
| Codex app-server lifecycle/events | **Not yet fetched.** Deliberately deferred to a separate pass — it is vendor documentation, a different provenance tier, and the interesting question is whether it distinguishes *accepted* from *delivered* where OpenCode did not. That comparison wants both halves in one place |
| Workspace-enrolment invariant | **Unlocated.** Remains a named non-goal |

## What was deliberately not done

No requirement was written from any of this. Decision 3 of the baseline holds: the B–D milestone
starts after ST-088 closes, and nothing here changes that. These findings are inputs to that
milestone's requirements, not the requirements themselves.
