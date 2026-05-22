# ExecPlan — ST-032: Evaluate asset-metadata mechanism (cost/benefit + VS Code reconciliation + automation)

> Status: ⬜ Not Ready — pending PO review
> Story: ST-032
> Created: 2026-05-22
> Parent: PO scoping rounds via AskUserQuestion (Claude Code session 2026-05-22); no formal query packet
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

ST-012 introduced a **governance asset metadata contract** — every prompt, instruction, and skill file in `.github/` carries YAML frontmatter with six required fields (`name`, `summary`, `asset_type`, `status`, `owners`, `source_path`). A .NET CLI tool, `tools/GovernanceAssetValidator/`, discovers these files, parses the frontmatter, and emits two deterministic catalog files at `.github/planning/assets/asset-catalog.json` and `.github/planning/assets/asset-catalog.md`. Validation is intentionally local-command-only — the validator must be invoked manually via `dotnet run --project tools/GovernanceAssetValidator -- build .` (or `… -- validate .`).

The mechanism has two observable problems in practice:

1. **The manual command does not happen.** The PO stated on 2026-05-22 that the manual regeneration step is not run during normal development. Consequence: when frontmatter is edited (as happened during the documentation-pass earlier in the same session), `.github/planning/assets/asset-catalog.{json,md}` silently drifts from the source of truth in the asset files themselves. The validator could detect this drift if run, but nothing prompts a run.
2. **The contract collides with VS Code Copilot's instruction-file schema.** VS Code's GitHub Copilot extension expects `*.instructions.md` files to carry frontmatter shaped `{ applyTo, description, name }`. The repo's contract uses `{ name, summary, asset_type, status, owners, source_path }`. Only `name` overlaps. Every other field triggers an "Attribute X is not supported in instructions files" warning. On `.github/instructions/coding-standards.instructions.md` alone, that's five warnings in the Problems panel. The contract also doesn't carry `applyTo`, so VS Code Copilot never auto-attaches these files as context — defeating the half of the value VS Code's own mechanism would provide.

Combined, the mechanism currently pays a continuous dev-experience cost (warnings noise; cognitive load of maintaining a contract that nobody enforces) without delivering its value (a catalog that nobody regenerates and that drifts silently). The mechanism may still be worth keeping — drift detection, deterministic inventory, and a single source of governance metadata are real benefits — but only if it can be **reconciled** with VS Code's schema AND **automated** so the regeneration step happens without human intervention.

This story is a **spike**. It produces a written cost/benefit evaluation, a recommended reconciliation pattern, a recommended automation mechanism, and a draft follow-on implementation story (**ST-033**) carrying concrete touches and acceptance criteria. Implementation is out of scope here.

**Bounded disposition space (PO 2026-05-22):** the recommendation may propose reconciliation, automation, or both. Sunsetting (deleting the validator, dropping the catalog, stripping frontmatter) is **off the table** — the question is *how* to keep the mechanism, not *whether* to.

Terms used in this plan:
- **Asset file:** any of the discovered governance files — `.github/prompts/*.md`, `.github/instructions/*.instructions.md`, `.github/skills/**/SKILL.md`.
- **Frontmatter:** the YAML block delimited by `---` at the top of an asset file.
- **Catalog:** the generated pair `.github/planning/assets/asset-catalog.{json,md}`.
- **Reconciliation pattern:** a way of restructuring frontmatter so VS Code Copilot's parser sees only fields it recognises at the top level while the validator continues to read its governance fields from a known location.
- **Automation mechanism:** a way of running `validator build` (or equivalent drift detection) without a human typing the command.
- **Drift:** generated catalog files do not byte-match what the validator would produce now from current frontmatter.

---

## §1b. Outcomes & Conclusions

(Populated at story completion. Keep current.)

Required fields:
- completion status:
- key findings/achievements:
- requirements met vs unmet:
- architectural impact:
- supporting evidence:
- downstream changes:

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

- After opening `docs/investigations/asset-metadata-mechanism-evaluation.md`, the reader sees a **Baseline** section reporting: (a) the count of discovered asset files broken down by `asset_type`, (b) the count of VS Code "unknown attribute" warnings emitted across them, (c) the commit hash and date that last regenerated `.github/planning/assets/asset-catalog.json`, and (d) the verbatim output of `dotnet run --project tools/GovernanceAssetValidator -- validate .` captured at spike start.
- After reading the **Cost/Benefit** section of the same document, the reader can identify (a) at least three specific costs the current shape imposes, with evidence (warning counts, drift evidence, complexity in `Program.cs`), and (b) at least three specific benefits the catalog delivers, with evidence (who reads it, where it's referenced, what it would catch).
- After reading the **Reconciliation** section, the reader sees at least two candidate frontmatter shapes evaluated head-to-head against VS Code Copilot's schema, a single recommended pattern, and a demonstration that applying that pattern to one asset file produces (a) **0** VS Code "unknown attribute" warnings on that file and (b) **unchanged** catalog output from `validator build`.
- After reading the **Automation** section, the reader sees at least three automation mechanisms evaluated, a single recommended mechanism, and an explicit explanation of how the recommendation removes the requirement that any human invoke the validator manually.
- After reading the **Recommendation** section, the reader sees a single bounded recommendation (reconcile, automate, or reconcile+automate) supported by the cost/benefit and prototyping evidence above.
- After reading `.github/planning/story-board.md` in Backlog, a new entry **ST-033** exists with `Touches:`, ≥3 `Acceptance criteria:` rows, and `Notes:` linking back to ST-032's findings doc.
- After running `dotnet run --project tools/GovernanceAssetValidator -- validate .` at spike close, the command exits 0 (no drift) — i.e. the spike has not introduced inconsistency in the catalog.

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context — judgement IS in scope (this is a spike) but is bounded by the cost/benefit framework in §2d
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ⬜ Not ready — requires PO review of bounded disposition space and findings-doc structure.

---

## §2c. Plan Review Notes

- 2026-05-22: Authored from PO scoping rounds (AskUserQuestion in Claude Code session). PO bounded the disposition space to {reconcile, automate, reconcile+automate} and rejected sunsetting. PO requested "real evaluation of benefit" — captured as the Baseline + Cost/Benefit sections rather than as an unbounded "should we keep this?" question. Pending PO review.

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Real evaluation of benefit, not rubber-stamp (PO 2026-05-22) | Findings doc Baseline + Cost/Benefit sections with quantitative evidence | Task 4.1, Task 4.2 | Warning counts, validator output, catalog-reference grep in §6 |
| Reconcile with VS Code Copilot schema (PO 2026-05-22) | Findings doc Reconciliation section with ≥2 patterns + 1 recommendation + working demo | Task 4.3 | VS Code Problems panel screenshot/note + `validator build` diff output |
| Automate enforcement so the manual command isn't required (PO 2026-05-22) | Findings doc Automation section with ≥3 mechanisms + 1 recommendation | Task 4.4 | Mechanism prototype evidence + explicit "removes manual step" justification |
| Bounded disposition: keep + adapt only (PO 2026-05-22) | Findings doc Recommendation section, scope sentence excluding sunsetting | Task 4.5 | Recommendation text matches bounded set |
| Follow-on implementation story drafted (PO 2026-05-22) | Board entry ST-033 in Backlog with Touches/ACs/Notes | Task 4.6 | `Select-String "ST-033" .github/planning/story-board.md` returns the new block |
| No catalog drift introduced by the spike itself | Catalog files unchanged at spike close OR regenerated by the chosen automation | Task 4.7 | `dotnet run --project tools/GovernanceAssetValidator -- validate .` exits 0 |

---

## §3. Preconditions

- Working directory for all commands: `c:\projects\ai-memory`.
- Toolchain available: `dotnet` (.NET 8 SDK per `global.json`), `git`, `rg` (ripgrep), VS Code with GitHub Copilot extension active (for warning observation).
- No concurrent story holds a lock on `.github/`, `tools/GovernanceAssetValidator/`, or `docs/governance/`.
- The Deno cloud MCP stack does not need to be running for this spike.
- All work stays on a single branch; atomic commits per task per session-resilience instructions.

### Findings doc skeleton

Create `docs/investigations/asset-metadata-mechanism-evaluation.md` with these top-level headings (populated across tasks 4.1–4.5):

```markdown
# Asset-Metadata Mechanism Evaluation (ST-032)

## 1. Baseline (Task 4.1)
## 2. Cost/Benefit (Task 4.2)
## 3. Reconciliation Patterns (Task 4.3)
## 4. Automation Mechanisms (Task 4.4)
## 5. Recommendation (Task 4.5)
## 6. Draft Follow-on Story (Task 4.6 — links to ST-033 board entry)
```

### Prototyping target file

Use `.github/instructions/coding-standards.instructions.md` as the single reconciliation prototype target throughout Task 4.3. Five "unknown attribute" warnings on that file at spike start (verified 2026-05-22 IDE diagnostics) make it the highest-signal demo surface.

---

## §4. Task Definitions

### Task 4.1: Capture baseline state

**Objective:** Quantify what's true today before any changes.

**Input:** Read-only inspection of `.github/`, `tools/GovernanceAssetValidator/`, `.github/planning/assets/`.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Discover and count asset files by type:
   ```powershell
   Get-ChildItem .github/prompts -Filter *.md | Measure-Object | Select-Object Count
   Get-ChildItem .github/instructions -Filter *.instructions.md | Measure-Object | Select-Object Count
   Get-ChildItem .github/skills -Recurse -Filter SKILL.md | Measure-Object | Select-Object Count
   ```
2. For each discovered file, open it in VS Code and record the count of "Attribute X is not supported in instructions files" warnings emitted on the frontmatter. Capture both the count and the specific attribute names. Note: only `*.instructions.md` files trigger Copilot's instruction-file schema check; `*.md` prompts and `SKILL.md` may or may not — record what's observed.
3. Identify the commit that last regenerated the catalog:
   ```powershell
   git log -1 --format="%H %ai %s" -- .github/planning/assets/asset-catalog.json
   git log -1 --format="%H %ai %s" -- .github/planning/assets/asset-catalog.md
   ```
4. Capture the validator's current view of drift:
   ```powershell
   dotnet run --project tools/GovernanceAssetValidator -- validate . 2>&1 | Tee-Object -FilePath .tmp/st032-validate-baseline.txt
   ```
5. Search for catalog consumers (does anything actually read `asset-catalog.{json,md}`?):
   ```powershell
   rg -F "asset-catalog.json" --hidden -g '!.git' .
   rg -F "asset-catalog.md" --hidden -g '!.git' .
   rg -F ".github/planning/assets" --hidden -g '!.git' .
   ```
6. Write findings into `docs/investigations/asset-metadata-mechanism-evaluation.md` §1 Baseline as a table or bulleted list with the raw counts and command outputs.

**Expected output:** §1 Baseline of the findings doc populated with file counts, warning counts per file, last-regen commit, validator output, and catalog-reference grep results.

**Requirement mapping:** Row 1 (real evaluation), Row 6 (no drift introduced — baseline establishes start state).

**Verification:**
```powershell
Select-String "## 1. Baseline" docs/investigations/asset-metadata-mechanism-evaluation.md
Select-String "warnings|asset_type|owners" docs/investigations/asset-metadata-mechanism-evaluation.md | Select-Object -First 10
```
Expected result: both commands return non-empty matches; the baseline section names at least one specific warning attribute and at least one specific file.

**Failure handling:** If `validator validate .` errors with parse failures rather than drift, record that as a baseline finding — it strengthens the cost argument. If VS Code Copilot is not installed or its warnings are not observable, record the IDE used and the diagnostics source instead.

---

### Task 4.2: Cost/benefit table

**Objective:** Tabulate, with evidence, what the mechanism costs today and what it delivers today.

**Input:** Outputs of Task 4.1; read-only inspection of `tools/GovernanceAssetValidator/Program.cs`, `docs/governance/asset-metadata-contract.md`, `docs/governance/asset-contribution-policy.md`.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Enumerate **costs** with concrete evidence. Examples to include (extend as discovered):
   - Total VS Code unknown-attribute warnings across all instruction files (from 4.1).
   - Cognitive load of maintaining six required frontmatter fields per asset.
   - Validator code surface area: `(Get-Content tools/GovernanceAssetValidator/Program.cs | Measure-Object -Line).Lines` lines of C# to maintain.
   - Drift evidence: did Task 4.1 find the catalog out of sync with current frontmatter? If yes, that's a cost (silent drift in production) AND a benefit case (drift detection works *if* run) — record under both.
   - Contract docs maintenance: `docs/governance/asset-metadata-contract.md` and `docs/governance/asset-contribution-policy.md` are 60+ and 50+ lines respectively; their existence is overhead.
2. Enumerate **benefits** with concrete evidence. Examples:
   - Catalog completeness: today's `.github/planning/assets/asset-catalog.md` enumerates 8 governance assets — verify by `(Select-String "^| " .github/planning/assets/asset-catalog.md).Count`.
   - Drift detection: does the validator's drift-error pathway actually fire on real drift introduced by the spike's baseline? (cross-reference Task 4.1 step 4 output)
   - Catalog consumers: from Task 4.1 step 5 grep, who consumes the catalog files? If grep returns only self-references (the catalog doc references the contract doc references itself), document the consumer count as zero and treat the catalog as currently unused.
   - Reserved-categories future-proofing: the contract reserves `agent`, `hook`, `workflow`, `plugin` — credit only if there's a concrete near-term story that depends on them.
3. Build a single table in `§2. Cost/Benefit` with columns: `Item | Cost or Benefit? | Evidence | Magnitude (S/M/L)`. Aim for ≥3 entries in each direction.
4. Conclude §2 with a one-paragraph synthesis: do the benefits clear the bar that the costs set? (Honest answer required; the recommendation in §5 will be bounded but the analysis here is not.)

**Expected output:** §2 Cost/Benefit table with at least 6 total rows (≥3 cost, ≥3 benefit), each with cited evidence, ending with a synthesis paragraph.

**Requirement mapping:** Row 1 (real evaluation of benefit).

**Verification:**
```powershell
Select-String "## 2. Cost/Benefit" docs/investigations/asset-metadata-mechanism-evaluation.md
$lines = Select-String "^\|" docs/investigations/asset-metadata-mechanism-evaluation.md
$lines.Count
```
Expected result: §2 heading present; the table-row count includes at least 6 data rows (excluding header + separator rows; tolerate baseline-table rows from §1 if same file).

**Failure handling:** If a quantitative item can't be measured (e.g., "cognitive load"), express it qualitatively with a concrete supporting observation rather than dropping the row.

---

### Task 4.3: Prototype reconciliation patterns

**Objective:** Identify the frontmatter shape that satisfies both VS Code Copilot's schema and the validator's required-fields contract.

**Input:** `.github/instructions/coding-standards.instructions.md` (prototype target); `tools/GovernanceAssetValidator/Program.cs` for the parser's contract.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Author **Pattern A — namespaced subkey.** Top-level frontmatter carries only Copilot-recognised fields; governance fields move under a subkey:
   ```yaml
   ---
   name: "Coding Standards"
   description: "Repository coding conventions and architecture constraints for ai-memory"
   applyTo: "**/*.cs"
   governance:
     asset_type: "instruction"
     status: "active"
     owners:
       - "ai-memory-maintainers"
     source_path: ".github/instructions/coding-standards.instructions.md"
   ---
   ```
   Note that the current parser in `Program.cs` is a hand-rolled line parser ([Program.cs:399-460](../../tools/GovernanceAssetValidator/Program.cs#L399-L460)) — it does **not** support nested mappings out of the box. Pattern A requires a parser change. Document the change required in the findings doc; do **not** implement it in this spike.
2. Author **Pattern B — flat with Copilot aliases.** Keep validator fields at the top level but rename overlaps to Copilot's expected names; rely on the validator's existing `summary` ↔ `description` fallback ([Program.cs:166](../../tools/GovernanceAssetValidator/Program.cs#L166)):
   ```yaml
   ---
   name: "Coding Standards"
   description: "Repository coding conventions and architecture constraints for ai-memory"
   applyTo: "**/*.cs"
   asset_type: "instruction"
   status: "active"
   owners:
     - "ai-memory-maintainers"
   source_path: ".github/instructions/coding-standards.instructions.md"
   ---
   ```
   This pattern adds `applyTo`, renames `summary` → `description` (already supported), and accepts that `asset_type`, `status`, `owners`, `source_path` still warn. Document the residual warning count.
3. (Optional) Author **Pattern C — your idea here.** If a third pattern emerges from the cost/benefit analysis (e.g., move governance fields out of frontmatter entirely into a sidecar `*.governance.json` file alongside each asset), document it with the same level of detail.
4. For Pattern B specifically (because it requires no parser change), **apply it to `coding-standards.instructions.md` in a working copy** (commit on a topic branch or as a separate commit), then:
   - Open the file in VS Code and capture the warning count.
   - Run `dotnet run --project tools/GovernanceAssetValidator -- build .` and confirm the catalog output is byte-equivalent to the pre-edit version (or, if different, that the diff is exactly the `summary`→`description` rename, not a content loss).
   - Capture both observations into the findings doc.
5. Score each pattern on three axes: VS Code-warning reduction, parser-complexity delta, contract-doc rewrite cost. Recommend one.

**Expected output:** §3 Reconciliation Patterns section with ≥2 patterns documented and one recommended, plus working evidence (warning count and catalog diff) for at least the prototyped pattern.

**Requirement mapping:** Row 2 (reconcile with VS Code Copilot schema).

**Verification:**
```powershell
Select-String "## 3. Reconciliation Patterns" docs/investigations/asset-metadata-mechanism-evaluation.md
Select-String "Pattern A|Pattern B" docs/investigations/asset-metadata-mechanism-evaluation.md | Measure-Object | Select-Object Count
dotnet run --project tools/GovernanceAssetValidator -- build .
git diff -- .github/planning/assets/asset-catalog.json
```
Expected result: §3 heading present; ≥2 pattern labels named; `validator build` exits 0; the catalog diff is either empty or contains only the deliberate `summary` → `description` field rename for the prototype file.

**Failure handling:** If the prototype file's catalog row changes meaningfully (more than the rename), revert the prototype edit, record the failure in the findings doc, and recommend Pattern A instead — that's a valid evaluation outcome.

---

### Task 4.4: Prototype automation mechanisms

**Objective:** Identify how `validator build` (or equivalent drift detection) runs without a human invoking it.

**Input:** Outputs of Task 4.3; current state of `.git/hooks/`, `.vscode/`, repo root.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Evaluate **Mechanism 1 — Git pre-commit hook.** A `.git/hooks/pre-commit` script (or via `husky.net`) that calls `dotnet run --project tools/GovernanceAssetValidator -- validate .` and aborts the commit on drift. Document: trigger frequency, false-positive rate (does the hook fire on commits that don't touch governance files?), bypass cost (`git commit --no-verify`), platform portability (PowerShell vs bash hook).
2. Evaluate **Mechanism 2 — VS Code `.vscode/tasks.json` runOptions.** A task with `"runOn": "folderOpen"` or a file-watcher task watching `.github/prompts/**`, `.github/instructions/**`, `.github/skills/**` and invoking `validator build` on change. Document: how the user notices a drift (Problems panel? Output panel? Notification?), failure mode if `dotnet` is not on PATH.
3. Evaluate **Mechanism 3 — scheduled CI documentation diff.** A GitHub Actions workflow that runs `validator validate .` on every PR and posts a comment on drift. Important contradiction: ST-012's contribution policy ([docs/governance/asset-contribution-policy.md](../../docs/governance/asset-contribution-policy.md)) explicitly **rejects** moving validation enforcement to CI. Document this contradiction; the spike may recommend revisiting that policy decision as part of the bounded disposition.
4. (Optional) Evaluate **Mechanism 4 — `dotnet watch run` or a long-running file watcher** kicked off by VS Code on folder open.
5. For each mechanism, write a row in `§4. Automation Mechanisms` with columns: `Mechanism | Trigger | Removes manual step? | Failure mode | Cost`.
6. Prototype the recommended mechanism *enough to demonstrate it works on this machine* — for example, write the `pre-commit` script content into a code block inside the findings doc, OR commit a `.vscode/tasks.json` snippet. Do **not** activate the mechanism repo-wide in this spike (activation is the follow-on ST-033's job); just demonstrate it's mechanically sound.
7. Score each mechanism on three axes: removes-manual-step (yes/partial/no), implementation cost, PO-visibility-on-failure. Recommend one.

**Expected output:** §4 Automation Mechanisms section with ≥3 mechanisms evaluated and one recommended; recommendation explicitly addresses the PO premise "the manual command doesn't happen".

**Requirement mapping:** Row 3 (automate enforcement).

**Verification:**
```powershell
Select-String "## 4. Automation Mechanisms" docs/investigations/asset-metadata-mechanism-evaluation.md
Select-String "Mechanism 1|Mechanism 2|Mechanism 3" docs/investigations/asset-metadata-mechanism-evaluation.md | Measure-Object | Select-Object Count
Select-String "removes the manual|manual step|without human" docs/investigations/asset-metadata-mechanism-evaluation.md
```
Expected result: §4 heading present; ≥3 mechanism labels named; at least one match for the manual-step phrasing tying recommendation back to PO premise.

**Failure handling:** If Mechanism 3's policy contradiction blocks the obvious answer, escalate to PO via §2c Plan Review Notes rather than picking a worse mechanism.

---

### Task 4.5: Synthesise recommendation

**Objective:** Produce a single bounded recommendation supported by tasks 4.1–4.4.

**Input:** Findings doc §1–§4 populated.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Write `§5. Recommendation` answering three questions:
   - Which reconciliation pattern? (from §3)
   - Which automation mechanism? (from §4)
   - Combined, does this resolve the PO's premise that the manual command doesn't happen? Justify in one paragraph.
2. State the recommendation in a single sentence at the top of §5 (e.g., "Adopt Pattern B reconciliation and Mechanism 1 automation."), then expand.
3. List **explicit out-of-scope items** (≥3): sunsetting (PO-excluded); CI enforcement (policy-excluded unless §4 recommends revisiting); migrating to a YAML parser library (deferred to ST-033 implementation).
4. List the **risks of the recommendation** (≥2): what breaks first if the chosen automation fails silently?

**Expected output:** §5 Recommendation section with a single-sentence headline, bounded justification, explicit OOS, and risk list.

**Requirement mapping:** Row 4 (bounded disposition).

**Verification:**
```powershell
Select-String "## 5. Recommendation" docs/investigations/asset-metadata-mechanism-evaluation.md
Select-String "out of scope|out-of-scope|OOS" docs/investigations/asset-metadata-mechanism-evaluation.md
```
Expected result: §5 heading present; at least one out-of-scope marker.

**Failure handling:** If tasks 4.1–4.4 yielded a recommendation that *requires* sunsetting (e.g., the cost/benefit clearly negative and no automation removes the cost), document the finding in §5 but stop. Do **not** propose sunsetting as the action — escalate to PO via §2c instead; the bounded scope is a hard constraint, not a softened one.

---

### Task 4.6: Draft follow-on story ST-033

**Objective:** Capture the recommendation as an actionable next-story board entry so implementation can be scheduled.

**Input:** §5 Recommendation; existing board format in `.github/planning/story-board.md`.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Add a new entry in Backlog under the existing `<!-- Phase 0 — governance / dev-experience debt -->` section (immediately after ST-032's entry):
   ```markdown
   ### ST-033: Implement asset-metadata reconciliation + automation
   - Type: debt
   - Source: ST-032 spike recommendation
   - phase: 0
   - Value: 3
   - Blocked by: ST-032 (recommendation must be approved)
   - Touches: <derived from §5 recommendation — e.g., all governance asset files for the chosen reconciliation pattern, tools/GovernanceAssetValidator/Program.cs if parser changes, .vscode/ or .git/hooks/ for automation>
   - Acceptance criteria:
     - [ ] <derived from §5 — at least 3 ACs covering: frontmatter migration, validator parser update if needed, automation mechanism activated>
   - ExecPlan: `.github/planning/execplans/exec-plan-ST-033.md` (to be created)
   - Docs: `docs/investigations/asset-metadata-mechanism-evaluation.md`
   - Notes: Implementation of the ST-032 spike recommendation. Stops being a "the workflow doesn't happen" risk only once this story ships.
   ```
2. Fill in `Touches:` and `Acceptance criteria:` with the specifics from §5. Do not write the ExecPlan itself — that's `/plan`'s job once ST-033 is picked up.
3. Update §6 Draft Follow-on Story of the findings doc with a one-line summary and a link to the board entry.

**Expected output:** New ST-033 entry on the board; findings doc §6 populated.

**Requirement mapping:** Row 5 (follow-on story drafted).

**Verification:**
```powershell
Select-String "ST-033" .github/planning/story-board.md
Select-String "## 6. Draft Follow-on Story" docs/investigations/asset-metadata-mechanism-evaluation.md
```
Expected result: both commands return non-empty matches; the ST-033 block contains `Touches:` and `Acceptance criteria:` headers with at least one non-placeholder entry each.

**Failure handling:** If the recommendation in §5 is too abstract to yield concrete `Touches:`, return to Task 4.5 and tighten the recommendation rather than padding the ST-033 entry.

---

### Task 4.7: Close out — verify no drift introduced

**Objective:** Confirm the spike has not left the catalog in a worse state than it found it.

**Input:** Repo working tree.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. If Task 4.3's prototype edit was committed to the topic branch, decide whether to keep it or revert it. The default is to **keep** the Pattern B edit on `coding-standards.instructions.md` (one file) so the prototype evidence is preserved; the rest of the implementation rides on ST-033.
2. Regenerate the catalog to absorb the prototype edit:
   ```powershell
   dotnet run --project tools/GovernanceAssetValidator -- build .
   ```
3. Confirm clean:
   ```powershell
   dotnet run --project tools/GovernanceAssetValidator -- validate .
   git status --porcelain
   ```
4. Commit any catalog changes atomically with the findings doc and board update under a `docs(st-032): spike findings + draft ST-033` message.

**Expected output:** `validator validate .` exits 0; `git status` is clean (or shows only the deliberate prototype + findings + board commit).

**Requirement mapping:** Row 6 (no drift introduced).

**Verification:**
```powershell
dotnet run --project tools/GovernanceAssetValidator -- validate .
git status --porcelain
```
Expected result: validator output "Validation succeeded."; `git status --porcelain` empty.

**Failure handling:** If drift is reported, regenerate via `build`, confirm the diff is exactly the prototype edit's catalog row, and commit. If anything else changed in the catalog, investigate before closing out the story.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — Capture baseline state |
| **Known blockers** | Pending PO review of §2c Plan Review Notes |
| **Last updated** | 2026-05-22 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-22 | — | Plan authored | This ExecPlan + board entry ST-032 | PO review → Ready → Task 4.1 |

### Avoidance

(Append dated entries here. Do not delete prior guidance.)

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Spike findings doc + Pattern B prototype on one file + automation evaluation + ST-033 draft | Before Task 4.3 edit on `coding-standards.instructions.md` | 🟢 Active |
| 2 | If Pattern B prototype fails (catalog content loss), escalate to PO and recommend Pattern A in §5; do not implement the parser change in this spike | Same as above | ⬜ Reserve |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

---

## §6. Execution Log

(Populated during execution — timestamped entries of significant actions)

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

---

## §6c. Decision Log

(Record every decision made during execution with rationale.)

- Decision: Bound disposition space to {reconcile, automate, reconcile+automate}; sunsetting excluded.
  Rationale: PO direction 2026-05-22. Mechanism stays in some form; spike answers HOW, not WHETHER.
  Date: 2026-05-22

- Decision: Do not author a separate query packet; treat AskUserQuestion rounds in the Claude Code session as the scoping artifact.
  Rationale: PO requested the ExecPlan directly. Conversation captured the scope; a retroactive QP would be ceremonial.
  Date: 2026-05-22

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2).
2. Update board: move ST-032 to Review; confirm ST-033 entry exists in Backlog.
3. Present findings doc + ST-033 to PO with artifact links.
4. Log any Tier 1 compound detections (e.g., if the spike uncovered a contract-doc inconsistency that needs its own fix).

---

## §7b. Outcomes & Retrospective

(Use this section for retrospective depth only. The primary at-a-glance outcomes summary belongs in §1b.)

Achieved: ...
Remains: ...
Lesson: ...

---

## Revision Notes

- 2026-05-22: Initial authoring from PO scoping rounds (AskUserQuestion in Claude Code session). Bounded disposition space, spike-then-implement story shape, board entry added in same session.
