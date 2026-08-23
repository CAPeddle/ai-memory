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

---

## Codex app-server — the transcript verified, and its open question closed

**Source:** `docs/investigations/AWCP Codex Integration Analysis.md` (PO-supplied model session
transcript, created 2026-08-23 21:54, **untracked**), plus this session's own reads of
`learn.chatgpt.com/docs/app-server.md` and `openai/codex` issue #21743. The transcript's protocol
claims were **checked against the vendor documentation rather than accepted**; quoted strings below
are as returned by that read.

### What verified

Every protocol claim the transcript makes holds, and one it hedged on is more precise than it
allowed:

| Transcript claim | Vendor documentation |
|---|---|
| Statuses `notLoaded`, `idle`, `systemError`, `active`; `active` can report `waitingOnApproval` | **Confirmed, exactly.** Status is a union; the active payload carries `activeFlags`, documented as `"status": { "type": "active", "activeFlags": ["waitingOnApproval"] }`. `waitingOnApproval` is a **flag within active**, not a top-level status — the transcript's model is right, and a secondary web summary that flattened them into one list is the thing that was wrong |
| `turn/started` / `turn/completed`, completion distinguishing completed / interrupted / failed | Confirmed |
| Native persisted thread goal with objective, token budget, tokens consumed, execution time | **Confirmed** — `thread/goal/set` returns `{ threadId, objective, status, tokenBudget, tokensUsed, timeUsedSeconds }` |
| `thread/list` discovers persisted sessions by `cwd`, distinguishing sources | Confirmed — filters include `modelProviders`, `archived`, `cwd` |
| WebSocket transport experimental | **Confirmed and stronger than stated** — *"WebSocket transport is experimental and unsupported"*, *"aren't supported for production workloads"*, and *"Use plain WebSockets only for localhost or an SSH port-forwarded connection"* |
| Remote operation via `--listen` / `--remote` | Confirmed, plus `--ws-auth capability-token --ws-token-file` |

### The open question is answered, and the answer is no

The transcript names its *"single most important spike question"*: can a second app-server obtain
authoritative live state for a thread hosted in another app-server process? It hedged — *"the
documentation I found does not prove"* it.

**The documentation is explicit enough to settle it.** `thread/loaded/list` returns *"thread IDs
currently loaded in memory"*; **neither it nor `thread/list` reports live state across different
app-server processes — both operate within a single process instance.** A persisted thread that is
actively running in process A is reported by process B as `notLoaded`.

Independent corroboration at a different layer: **`openai/codex` issue #21743** (open, filed
2026-05-08, **no maintainer response**) — Codex Desktop does not refresh an open thread view when
another app-server client appends a turn; it *"appears to catch up only later."* The reporter's
fourth requested outcome is that OpenAI *"explicitly document that cross-client live sync isn't
supported"*, which is a fair reading of where things stand.

### Consequence: the three integration levels collapse to two

The transcript's Discovered / Attached / Managed-runtime ladder is a good frame, but on today's
Codex:

- **Discovered** is real, and gives association, history and resumability — **never live state.**
- **Attached to a runtime AWCP did not start is not available.** There is no documented path to it.
- **Managed runtime** is the only level that yields trustworthy live state.

So the transcript's *"likely outcome"* — that AWCP *"probably needs sessions to run through a
provider runtime endpoint that AWCP knows about"* — is **not an expectation to test. It is a
documented constraint.** Horizon B should be planned as **managed-runtime-or-nothing for live state**,
with discovered sessions treated as historical association only. The spike's five questions remain
worth running, but question 3 (attachment) now has a documented answer and the experiment's job is to
falsify it, not to discover it.

### The cross-cutting finding — this is why the two sources belong together

Both providers' native control surfaces have a failure mode in which **the answer looks authoritative
and is not**:

| Provider | Failure mode |
|---|---|
| OpenCode 1.18.18 | `POST .../prompt` with `delivery=steer` returns **`200`** and is **never delivered** |
| Codex app-server | A thread actively running in process A is reported by process B as **`notLoaded`** — a real status value, indistinguishable from the truth |

Neither is an error. Neither is detectable from the response alone. This is the same defect wearing
two costumes, and it means the provider capability contract needs **two axes, not one**:

1. **accepted vs delivered** — for control verbs. A verb that returns success without an
   observable consequence is not a capability.
2. **authoritative vs observed** — for state reads. A state reading must carry whether the
   reporting endpoint actually **hosts** the thing it describes, because a non-hosting endpoint
   returns plausible values rather than errors.

**That pair is the requirement Horizon B should be written against**, and it is not derivable from
either source alone — which is the reason this import was held until both were in hand.

### What this changes for Horizon C

`codex app-server --listen` plus `codex --remote` describes execution staying near the compute while
a laptop disconnects — which is the Z2 problem. If it holds, it replaces the previously-envisaged
*inspect terminal → determine idle → send `/exit` → scrape the resume command → save it → shut down*
sequence with a native thread id and a reconnect.

**But the transport that makes it work is documented as unsupported for production and confined to
localhost or SSH port-forwarding.** So it is a legitimate **spike**, not a design AWCP's permanent
remote transport may be built on. This does not displace the existing spool/ack/replay continuity
work, which is provider-independent and already has real evidence behind it (criterion 6).

### One semantic separation worth carrying verbatim

*"`turn/completed` must not mean work item completed."* A Codex turn can finish with *"I found the
problem; shall I implement it?"* — the thread goes idle while the work item stays in progress. This
is the same distinction ST-084 already made in refusing to conflate `blocking` execution state with
workflow transitions, and it is the clearest available argument for the layer split the baseline
adopted: **providers own execution state; AWCP owns workflow state.**

### Provenance and caveats

The transcript is a model session, and its citations are to vendor pages. Its protocol claims are now
**verified against those pages by direct read this session**; its *architectural recommendations*
remain conversation-sourced and carry no more weight than their reasoning. The vendor documentation
itself describes an **experimental** surface — the app-server command and WebSocket transport both —
so every claim above has a shelf life, and issue #21743 is open with no maintainer position.

The file is **untracked** in a tracked directory, as is `Local GPU Model Setup.md`. Both should be
committed with provenance or moved out of `docs/investigations/`.

## Import queue, after this pass

| Item | Status |
|---|---|
| agent-radio | **Imported.** Private repo, read via `gh`. Bears directly on Horizon B |
| Architecture Analyzer | **Imported**, with an unresolved scope mismatch and an unverified-currency caveat |
| Local-model / coding-model evaluation | **Partially imported.** Design rationale captured; measured results **not located** |
| Codex app-server lifecycle/events | **Imported and verified** against vendor documentation. Its own open question is answered *negatively*: no cross-process live state. Paired with the OpenCode finding it yields the two-axis capability contract Horizon B needs |
| Workspace-enrolment invariant | **Unlocated.** Remains a named non-goal |

## What was deliberately not done

No requirement was written from any of this. Decision 3 of the baseline holds: the B–D milestone
starts after ST-088 closes, and nothing here changes that. These findings are inputs to that
milestone's requirements, not the requirements themselves.
