# ExecPlan — ST-014: Investigate memsearch (zilliztech) for architectural learnings

> Status: ✅ Ready for /continue
> Story: ST-014
> Created: 2026-05-04
> Parent: `.github/planning/query-packets/QP-014-memsearch-investigation.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. The sections §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective must be kept up to date as work proceeds.

---

## §1. Background & Context

ai-memory is still in the investigation and governance phase. Its current approved design authority says the service should stay on C# /.NET 8+, keep SQLite as the starting datastore, and use hybrid retrieval built from SQLite FTS5 plus vector search with Reciprocal Rank Fusion (RRF) and Maximal Marginal Relevance (MMR). Those decisions live primarily in `docs/investigations/memory-architecture-design.md`, `docs/investigations/sqlite-vs-postgresql.md`, and `docs/investigations/language-stack-recommendation.md`.

ST-014 is a spike. It does not implement ai-memory itself. It investigates the upstream `zilliztech/memsearch` project to answer four specific questions that could influence later implementation stories:

1. Is ONNX `bge-m3` a credible local alternative to the current OpenAI-first embedding direction for ST-004?
2. Does Milvus Lite materially beat ai-memory's current SQLite-first path strongly enough to justify changing direction?
3. Is memsearch's three-level progressive disclosure pattern (`search` → `expand` → `transcript`) worth adopting or adapting for ai-memory?
4. Does memsearch's Markdown-as-source-of-truth model materially challenge ai-memory's SQLite-first design?

The output of this story is a new investigation doc at `docs/investigations/memsearch-applicability-review.md`, plus tightly bounded follow-on edits only if the evidence clearly supports them:

- targeted traceability updates in existing design docs
- targeted story-metadata updates for ST-004 and ST-005 only

This story must not silently overturn the approved architecture. The investigation may recommend alternatives or future options, but the current defaults remain authoritative unless a later approved story changes them.

Definitions used in this plan:

- **RRF**: Reciprocal Rank Fusion, a rank-merging method that combines multiple ranked result sets without requiring score normalization.
- **MMR**: Maximal Marginal Relevance, a reranking method that trades off relevance against redundancy so near-duplicates do not dominate results.
- **Progressive disclosure**: a staged recall workflow where the system starts with cheap, short search results and only pulls larger context when needed.
- **Source of truth**: the artifact considered authoritative if derived indexes and cached views disagree.
- **Milvus Lite**: the file-backed local deployment mode of Milvus that keeps Milvus data in a local `.db` file but still uses Milvus APIs.

Key local files under discussion:

- `.github/planning/query-packets/QP-014-memsearch-investigation.md`
- `.github/planning/story-board.md`
- `docs/investigations/memory-architecture-design.md`
- `docs/investigations/sqlite-vs-postgresql.md`
- `docs/investigations/openclaw-memory-architecture-analysis.md`
- `docs/investigations/memsearch-applicability-review.md` (new)

Key upstream materials to inspect:

- `README.md`
- `src/memsearch/cli.py`
- `src/memsearch/core.py`
- `src/memsearch/store.py`
- `src/memsearch/watcher.py`
- `src/memsearch/chunker.py`
- `src/memsearch/reranker.py`
- `src/memsearch/embeddings/`
- `plugins/`
- `docs/` and `evaluation/` in the upstream repo

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

- After opening `docs/investigations/memsearch-applicability-review.md`, a reviewer can see explicit sections for ONNX embeddings, Milvus Lite, progressive disclosure, and Markdown-as-source-of-truth, each with a recommendation label and rationale.
- After reading the investigation doc, a reviewer can see what came from published upstream docs, what came from upstream code inspection, and what came from the lightweight local smoke test.
- After running the verification commands in this ExecPlan, the investigation doc proves whether ST-004 and ST-005 should change, and it states explicitly when no change is recommended.
- If the evidence justified traceability updates, the cited local investigation docs contain small cross-links back to the new memsearch applicability review without changing the repo's current architectural defaults.
- If the evidence justified downstream story metadata updates, only ST-004 and/or ST-005 were edited, and storage stories ST-002 and ST-003 remain unchanged.
- After cleanup, the temporary runtime workspace used for the memsearch smoke test is removed from the repo working tree.

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context beyond this ExecPlan
- [x] Script templates or boilerplate provided in §3 or task steps where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ✅ Ready — `/continue` may execute this plan.

---

## §2c. Plan Review Notes

(Empty — populated by `/continue` when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Assess ONNX `bge-m3` local embeddings against the current OpenAI-first ST-004 direction (QP-014) | `docs/investigations/memsearch-applicability-review.md` contains an ONNX section with recommendation label and ST-004 impact | Task 4.2, Task 4.3, Task 4.4, Task 4.5 | Investigation doc contains `ONNX bge-m3`; smoke-test logs and/or explicitly documented runtime gap |
| Assess Milvus Lite against ai-memory's SQLite-first and future pgvector path (QP-014) | Investigation doc contains a Milvus Lite comparison and a keep/adapt/reject conclusion | Task 4.2, Task 4.3, Task 4.4 | Investigation doc contains `Milvus Lite`; cited doc links mention SQLite-first decision |
| Assess progressive disclosure (`search` → `expand` → `transcript`) for ai-memory (QP-014) | Investigation doc contains a progressive disclosure section and ST-005 impact decision | Task 4.2, Task 4.3, Task 4.4, Task 4.5 | Investigation doc contains `Progressive disclosure`; smoke-test outputs include `search`, `expand`, and `transcript` evidence or a documented gap |
| Compare Markdown-as-source-of-truth against SQLite-first design (QP-014) | Investigation doc contains a Markdown-vs-SQLite section with explicit rationale | Task 4.3, Task 4.4 | Investigation doc contains `Markdown as source of truth` and references the SQLite decision |
| Include lightweight local validation rather than document-only analysis (PO during /plan) | Investigation doc has a local validation method/results section; runtime workspace and logs exist during execution | Task 4.1, Task 4.2, Task 4.4 | Runtime log files are created and summarized in the investigation doc |
| Include code-level inspection in addition to published docs (PO during /plan) | Investigation doc evidence appendix lists upstream files inspected from `src/memsearch/` and `plugins/` | Task 4.1, Task 4.3, Task 4.4 | Evidence logs include upstream code file paths and keyword hits |
| Use both a synthetic fixture and a tiny ai-memory doc sample in the smoke test (PO during /plan) | Runtime workspace contains both fixture types and the investigation doc names them | Task 4.2, Task 4.4 | Verification confirms both files exist before cleanup and are named in the doc |
| Produce a standalone investigation doc plus targeted traceability updates to cited design docs where justified (PO during /plan) | New doc exists; existing design docs may contain `See also`-style references back to it | Task 4.4, Task 4.5 | `Select-String` finds the new doc path in any updated local design docs |
| Allow direct downstream story metadata changes only for ST-004 and ST-005 (PO during /plan) | Story impact section in the investigation doc plus bounded board edits only for ST-004/ST-005 when justified | Task 4.4, Task 4.5 | Board diff touches only ST-004/ST-005 story blocks if any metadata changes occur |
| Preserve the current architectural defaults unless the investigation only justifies documenting alternatives or future options (repo governance + QP-014) | Investigation doc explicitly states current defaults remain authoritative; storage stories unchanged | Task 4.4, Task 4.5 | Investigation doc contains the default-preservation statement; ST-002/ST-003 text remains unchanged |

If a scoped requirement does not map cleanly to an output artifact, stop and escalate during `/continue` rather than marking Ready.

---

## §3. Preconditions

List any prerequisites:

- Working tree root exists at `c:\projects\ai-memory\`
- The following local files exist before starting:
  - `.github/planning/query-packets/QP-014-memsearch-investigation.md`
  - `.github/planning/story-board.md`
  - `docs/investigations/memory-architecture-design.md`
  - `docs/investigations/sqlite-vs-postgresql.md`
- `git` is installed and callable from PowerShell:
  ```powershell
  git --version
  ```
- `rg` is preferred for code search. If `rg` is unavailable, use `Select-String` as the fallback noted in task failure handling:
  ```powershell
  rg --version
  ```
- Python 3.11+ is available as `py -3`. If only `python` exists, substitute that interpreter consistently in every command in this plan:
  ```powershell
  py -3 --version
  ```
- Internet access is available for:
  - cloning `https://github.com/zilliztech/memsearch.git`
  - installing Python dependencies from package indexes
  - downloading the ONNX model on first use if runtime validation proceeds successfully
- At least 3 GB of free disk space is available for the upstream clone, Python environment, installed packages, and ONNX model cache.
- No other session is simultaneously editing `.github/planning/story-board.md` or the local investigation docs.
- WIP note: ST-011 currently occupies the Review column. ST-014 may still execute, but if story closeout would require moving ST-014 into Review while ST-011 remains there, stop after full verification and record the board-capacity blocker rather than violating the WIP limit.

Boilerplate used by later tasks:

```powershell
$RepoRoot = 'c:\projects\ai-memory'
$TempRoot = Join-Path $RepoRoot '.tmp\st-014-memsearch'
$UpstreamRoot = Join-Path $TempRoot 'upstream'
$LogsRoot = Join-Path $TempRoot 'logs'
$FixtureRoot = Join-Path $TempRoot 'fixture'
$SyntheticRoot = Join-Path $FixtureRoot 'synthetic'
$TranscriptRoot = Join-Path $SyntheticRoot 'transcripts'
$AiSamplePath = Join-Path $FixtureRoot 'ai-memory-doc-sample.md'
$MilvusLitePath = Join-Path $TempRoot 'memsearch-lite.db'
$Py = Join-Path $TempRoot 'venv\Scripts\python.exe'
```

---

## §4. Task Definitions

### Task 4.1: Create an isolated upstream workspace

**Objective:** Create a disposable workspace for upstream inspection and runtime validation so this spike does not pollute the repo.

**Input:** The files listed in §3 Preconditions and working internet access.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Open PowerShell in `c:\projects\ai-memory\` and initialize the common path variables from §3.
2. Remove any stale runtime workspace from a prior failed attempt:
	```powershell
	if (Test-Path $TempRoot) { Remove-Item $TempRoot -Recurse -Force }
	```
3. Create the disposable folder structure:
	```powershell
	New-Item -ItemType Directory -Force $LogsRoot, $SyntheticRoot, $TranscriptRoot | Out-Null
	```
4. Shallow-clone the upstream memsearch repo into the temp workspace:
	```powershell
	git clone --depth 1 https://github.com/zilliztech/memsearch.git $UpstreamRoot
	```
5. Capture the exact upstream commit and a best-effort version/tag into log files so the new investigation doc can cite what was reviewed:
	```powershell
	git -C $UpstreamRoot rev-parse HEAD | Set-Content (Join-Path $LogsRoot 'upstream-commit.txt')
	git -C $UpstreamRoot describe --tags --always 2>$null | Set-Content (Join-Path $LogsRoot 'upstream-version.txt')
	```

**Expected output:**
- `.tmp\st-014-memsearch\upstream\` contains a shallow clone of memsearch
- `.tmp\st-014-memsearch\logs\upstream-commit.txt`
- `.tmp\st-014-memsearch\logs\upstream-version.txt`

**Requirement mapping:**
- `Include lightweight local validation`
- `Include code-level inspection`

**Verification:**
```powershell
(Test-Path $UpstreamRoot) -and
(Test-Path (Join-Path $LogsRoot 'upstream-commit.txt')) -and
((Get-Content (Join-Path $LogsRoot 'upstream-commit.txt')).Length -ge 40)
```
Expected result: `True`.

**Failure handling:** If the clone fails, retry once after deleting `$UpstreamRoot`. If the second attempt fails, stop execution, record the network blocker in §5b and §6b, and do not continue.

---

### Task 4.2: Run the lightweight memsearch smoke test

**Objective:** Validate key memsearch runtime claims with a tiny, repeatable corpus built from both synthetic content and a small ai-memory doc sample.

**Input:** The upstream clone from Task 4.1 and the existing local investigation docs.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Reuse the path variables from §3 and create the Python environment:
	```powershell
	py -3 -m venv (Join-Path $TempRoot 'venv')
	& $Py -m pip install --upgrade pip
	Push-Location $UpstreamRoot
	& (Join-Path $TempRoot 'venv\Scripts\python.exe') -m pip install -e '.[onnx]'
	Pop-Location
	```
2. Create a transcript file for level-3 recall validation:
	```powershell
	$TranscriptPath = Join-Path $TranscriptRoot 'session-st014.jsonl'
	@'
{"uuid":"st014-turn-001","timestamp":"2026-05-04T09:00:00Z","content":"What embedding option avoids API keys?","tool_calls":[]}
{"uuid":"st014-turn-002","timestamp":"2026-05-04T09:00:30Z","content":"Use ONNX bge-m3 int8 for local CPU-only embeddings without an API key.","tool_calls":[]}
'@ | Set-Content $TranscriptPath
	```
3. Create the synthetic markdown fixture that covers the four investigation areas and includes transcript anchor metadata:
	```powershell
	$SyntheticDocPath = Join-Path $SyntheticRoot '2026-05-04.md'
	@"
# ST-014 Synthetic Memory

## Embedding options
ONNX bge-m3 int8 avoids API keys, runs on CPU, and trades a one-time model download for zero per-token cost.
<!-- session:st014-session turn:st014-turn-002 transcript:$TranscriptPath -->

## Progressive recall
Start with search snippets, expand to a full section only when needed, and use transcript lookup only for exact dialogue recovery.

## Vector storage
Milvus Lite keeps vectors in a local file with the same API as larger Milvus deployments, while SQLite keeps the service fully embedded and single-file on Windows.
"@ | Set-Content $SyntheticDocPath
	```
4. Create the tiny ai-memory sample file by copying short excerpts from the current design-authority docs rather than indexing the entire repo:
	```powershell
	@(
	  '# ai-memory doc sample'
	  ''
	  '## Search / Retrieval Strategy excerpt'
	) +
	(Get-Content '.\docs\investigations\memory-architecture-design.md' | Select-Object -Skip 283 -First 18) +
	@(
	  ''
	  '## Storage decision excerpt'
	) +
	(Get-Content '.\docs\investigations\sqlite-vs-postgresql.md' | Select-Object -Skip 13 -First 12) |
	Set-Content $AiSamplePath
	```
5. Run the memsearch index over both corpus sources, using ONNX and a disposable Milvus Lite file in the temp workspace:
	```powershell
	& $Py -m memsearch index $SyntheticRoot $AiSamplePath --provider onnx --milvus-uri $MilvusLitePath |
	  Tee-Object (Join-Path $LogsRoot 'index.txt')
	```
6. Run three searches and store the JSON output:
	```powershell
	& $Py -m memsearch search 'Which embedding option avoids API keys?' --provider onnx --milvus-uri $MilvusLitePath --json-output |
	  Set-Content (Join-Path $LogsRoot 'search-embedding.json')

	& $Py -m memsearch search 'How does progressive recall work?' --provider onnx --milvus-uri $MilvusLitePath --json-output |
	  Set-Content (Join-Path $LogsRoot 'search-progressive.json')

	& $Py -m memsearch search 'Which storage approach is zero-config on Windows?' --provider onnx --milvus-uri $MilvusLitePath --json-output |
	  Set-Content (Join-Path $LogsRoot 'search-storage.json')
	```
7. Expand the top progressive-disclosure result and record it:
	```powershell
	$Progressive = Get-Content (Join-Path $LogsRoot 'search-progressive.json') -Raw | ConvertFrom-Json
	$ChunkHash = $Progressive[0].chunk_hash
	& $Py -m memsearch expand $ChunkHash --provider onnx --milvus-uri $MilvusLitePath --json-output |
	  Set-Content (Join-Path $LogsRoot 'expand-progressive.json')
	```
8. Validate the transcript command directly against the known transcript file and capture stats:
	```powershell
	& $Py -m memsearch transcript $TranscriptPath --turn st014-turn-002 --json-output |
	  Set-Content (Join-Path $LogsRoot 'transcript.json')

	& $Py -m memsearch stats --milvus-uri $MilvusLitePath |
	  Set-Content (Join-Path $LogsRoot 'stats.txt')
	```

**Expected output:**
- Installed editable memsearch environment under `.tmp\st-014-memsearch\venv\`
- Synthetic fixture markdown and transcript files
- `ai-memory-doc-sample.md`
- Runtime logs under `.tmp\st-014-memsearch\logs\`

**Requirement mapping:**
- `Assess ONNX bge-m3`
- `Assess Milvus Lite`
- `Assess progressive disclosure`
- `Include lightweight local validation`
- `Use both a synthetic fixture and a tiny ai-memory doc sample`

**Verification:**
```powershell
$Embedding = Get-Content (Join-Path $LogsRoot 'search-embedding.json') -Raw | ConvertFrom-Json
$Storage = Get-Content (Join-Path $LogsRoot 'search-storage.json') -Raw | ConvertFrom-Json
$Expand = Get-Content (Join-Path $LogsRoot 'expand-progressive.json') -Raw | ConvertFrom-Json
$Transcript = Get-Content (Join-Path $LogsRoot 'transcript.json') -Raw | ConvertFrom-Json

($Embedding.Count -ge 1) -and
($Storage.Count -ge 1) -and
($Expand.content -match 'Progressive recall') -and
($Transcript[0].content -match 'API key')
```
Expected result: `True`.

**Failure handling:**
- If dependency installation fails, retry once after re-running the pip install step.
- If ONNX model download or ONNX runtime execution fails twice, capture the failure text into `runtime-failure.txt`, skip the remaining runtime commands, continue with Tasks 4.3–4.5 in docs+code mode, and explicitly mark ONNX runtime validation as a gap in the investigation doc.
- If runtime validation is skipped or degraded, do not use runtime-only claims as the basis for changing ST-004 or ST-005 metadata.

---

### Task 4.3: Capture upstream docs and code evidence

**Objective:** Gather explicit, file-level evidence from memsearch docs, code, and plugins so the investigation doc is grounded in reviewed artifacts rather than README impressions.

**Input:** The upstream clone from Task 4.1 and, if available, runtime logs from Task 4.2.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. If `rg` is available, capture doc-evidence hits covering Markdown source of truth, Milvus, progressive disclosure, embeddings, and published evaluation claims:
	```powershell
	rg -n "Markdown is the Source of Truth|Progressive Disclosure|Why Milvus|bge-m3|text-embedding-3-small|Recall@5|Milvus Lite" \
	  (Join-Path $UpstreamRoot 'README.md') \
	  (Join-Path $UpstreamRoot 'docs') \
	  (Join-Path $UpstreamRoot 'evaluation') |
	  Set-Content (Join-Path $LogsRoot 'docs-evidence.txt')
	```
2. Capture code-evidence hits from the core memsearch modules:
	```powershell
	rg -n "search|expand|transcript|watch|compact|onnx|bge-m3|RRF|BM25|sha256|content_hash|dedup" \
	  (Join-Path $UpstreamRoot 'src\memsearch\cli.py') \
	  (Join-Path $UpstreamRoot 'src\memsearch\core.py') \
	  (Join-Path $UpstreamRoot 'src\memsearch\store.py') \
	  (Join-Path $UpstreamRoot 'src\memsearch\watcher.py') \
	  (Join-Path $UpstreamRoot 'src\memsearch\chunker.py') \
	  (Join-Path $UpstreamRoot 'src\memsearch\reranker.py') \
	  (Join-Path $UpstreamRoot 'src\memsearch\embeddings') |
	  Set-Content (Join-Path $LogsRoot 'code-evidence.txt')
	```
3. Capture plugin-evidence hits that show how the cross-agent/plugin layer uses the core engine:
	```powershell
	rg -n "memory-recall|search|expand|transcript|session-start|session-end|summarize|hook" \
	  (Join-Path $UpstreamRoot 'plugins') |
	  Set-Content (Join-Path $LogsRoot 'plugin-evidence.txt')
	```
4. If `rg` is unavailable, replace each `rg` command above with `Get-ChildItem ... | Select-String ...` and store the output to the same log paths.
5. Read the resulting evidence logs and map each of the four focus areas to at least one upstream doc reference and one upstream code reference before writing the final investigation doc.

**Expected output:**
- `docs-evidence.txt`
- `code-evidence.txt`
- `plugin-evidence.txt`

**Requirement mapping:**
- `Assess ONNX bge-m3`
- `Assess Milvus Lite`
- `Assess progressive disclosure`
- `Compare Markdown-as-source-of-truth`
- `Include code-level inspection`

**Verification:**
```powershell
$DocsEvidence = Get-Content (Join-Path $LogsRoot 'docs-evidence.txt') -Raw
$CodeEvidence = Get-Content (Join-Path $LogsRoot 'code-evidence.txt') -Raw
$PluginEvidence = Get-Content (Join-Path $LogsRoot 'plugin-evidence.txt') -Raw

($DocsEvidence -match 'Progressive Disclosure') -and
($DocsEvidence -match 'Why Milvus|Milvus Lite') -and
($CodeEvidence -match 'expand') -and
($CodeEvidence -match 'onnx|bge-m3') -and
($PluginEvidence -match 'memory-recall|session-start|session-end|hook')
```
Expected result: `True`.

**Failure handling:** If any evidence log is empty, rerun the command for that log with a narrower path or, if `rg` is missing, the documented `Select-String` fallback. If a topic still cannot be evidenced from code, document that gap explicitly in the investigation doc instead of guessing.

---

### Task 4.4: Author the memsearch applicability review

**Objective:** Convert the gathered evidence into a standalone investigation doc that a future planner or executor can rely on without rereading the upstream materials.

**Input:** The query packet, local design-authority docs, runtime logs if available, and the evidence logs from Task 4.3.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Create `docs\investigations\memsearch-applicability-review.md` using the repo's standard investigation style with at least these sections and headings:
	- `# Investigation: memsearch applicability to ai-memory`
	- metadata table with `Created`, `Status`, `Scope`, and `Decision`
	- `## 1. Executive Summary`
	- `## 2. What Was Reviewed`
	- `## 3. Lightweight Local Validation`
	- `## 4. Findings`
	- `## 5. Story Impact Decisions`
	- `## 6. Recommendation`
	- `## 7. Evidence Appendix`
2. Under `## 4. Findings`, create four named subsections, one for each required focus area:
	- `ONNX bge-m3 local embeddings`
	- `Milvus Lite vs SQLite-first`
	- `Progressive disclosure (search → expand → transcript)`
	- `Markdown as source of truth vs SQLite-first`
3. For each focus-area subsection, include all of the following in order:
	- ai-memory current position
	- memsearch published-doc evidence
	- memsearch code evidence
	- local smoke-test observation or `Validation gap:` if Task 4.2 was degraded or skipped
	- trade-offs
	- a recommendation label chosen from exactly one of: `Adopt now`, `Adapt later`, `Keep current`, `Reject for now`
4. Add a sentence in the executive summary and conclusion stating exactly that current ai-memory architectural defaults remain authoritative unless a later approved story changes them.
5. Under `## 5. Story Impact Decisions`, add a table with one row for ST-004 and one row for ST-005 using exactly these columns:
	- `Story`
	- `Recommendation`
	- `Board edit required`
	- `Edit type`
	- `Rationale`
6. Populate the story-impact table using these rules:
	- ST-004 may be `yes` only if the ONNX/provider conclusion is `Adopt now` or `Adapt later`
	- ST-005 may be `yes` only if the progressive-disclosure conclusion is `Adopt now` or `Adapt later`
	- If the evidence is weak or runtime validation failed, set `Board edit required` to `no`
7. Under `## 7. Evidence Appendix`, list:
	- the upstream commit from `upstream-commit.txt`
	- the upstream code files inspected
	- the runtime commands run or skipped
	- the temp log filenames that were used to support the conclusions

**Expected output:**
- `docs\investigations\memsearch-applicability-review.md`

**Requirement mapping:**
- All rows in §2d except the actual board/doc-update rows that Task 4.5 handles

**Verification:**
```powershell
$DocPath = '.\docs\investigations\memsearch-applicability-review.md'
@(
  'ONNX bge-m3 local embeddings',
  'Milvus Lite vs SQLite-first',
  'Progressive disclosure \(search → expand → transcript\)',
  'Markdown as source of truth vs SQLite-first',
  'Story Impact Decisions',
  'ST-004',
  'ST-005',
  'Current ai-memory architectural defaults remain authoritative'
) | ForEach-Object {
  Select-String -Path $DocPath -Pattern $_ -Quiet
} | Where-Object { $_ -eq $false } | Measure-Object | Select-Object -ExpandProperty Count
```
Expected result: `0`.

**Failure handling:** If any required section is missing, add the section and explicitly mark unknowns as `Validation gap:` rather than leaving the topic out. Do not infer a recommendation label without evidence in the doc body.

---

### Task 4.5: Apply bounded traceability and story-metadata updates

**Objective:** Make only the repo edits that were explicitly allowed during planning: targeted traceability edits in cited docs and tightly bounded ST-004/ST-005 board changes if the investigation doc calls for them.

**Input:** The completed investigation doc from Task 4.4.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Read the `Story Impact Decisions` table in `docs\investigations\memsearch-applicability-review.md`.
2. Apply local design-doc traceability updates only where the new review materially clarifies an existing decision:
	- In `docs\investigations\memory-architecture-design.md`, add a short `See also` reference near the hybrid retrieval material in section 6 pointing to `docs/investigations/memsearch-applicability-review.md`.
	- In `docs\investigations\sqlite-vs-postgresql.md`, add a short `See also` reference near the executive summary or decision area pointing to `docs/investigations/memsearch-applicability-review.md`.
	- Keep these traceability edits to one or two lines each. Do not rewrite the approved decision text.
3. For ST-004, apply board changes only if the `Story Impact Decisions` row says `Board edit required = yes`:
	- If the ONNX/provider recommendation is `Adapt later`, add a `Notes:` line to the ST-004 block stating that ST-014 found ONNX `bge-m3` viable as a future local provider option but that ST-004 remains OpenAI-first unless a later plan broadens delivery scope.
	- If the ONNX/provider recommendation is `Adopt now`, do the same `Notes:` addition and replace the first ST-004 acceptance criterion text from `IEmbeddingService interface with OpenAI implementation` to `IEmbeddingService interface with provider abstraction and an OpenAI-first implementation`.
	- If the row says `Board edit required = no`, leave ST-004 unchanged.
4. For ST-005, apply board changes only if the `Story Impact Decisions` row says `Board edit required = yes`:
	- Add a `Notes:` line to the ST-005 block stating that ST-014 found memsearch-style progressive disclosure promising, but ST-005 remains focused on ranking and retrieval mechanics unless a later plan expands scope.
	- Do not change ST-005 acceptance criteria in this story.
	- If the row says `Board edit required = no`, leave ST-005 unchanged.
5. Do not edit ST-002 or ST-003 under any condition in this story.

**Expected output:**
- Possible one-line traceability additions in the cited local investigation docs
- Possible bounded updates to the ST-004 and/or ST-005 blocks in `.github\planning\story-board.md`

**Requirement mapping:**
- `Produce a standalone investigation doc plus targeted traceability updates`
- `Allow direct downstream story metadata changes only for ST-004 and ST-005`
- `Preserve current architectural defaults`

**Verification:**
```powershell
$BoardText = Get-Content '.\.github\planning\story-board.md' -Raw
$DocLinksOk =
  (Select-String -Path '.\docs\investigations\memory-architecture-design.md' -Pattern 'memsearch-applicability-review.md' -Quiet) -and
  (Select-String -Path '.\docs\investigations\sqlite-vs-postgresql.md' -Pattern 'memsearch-applicability-review.md' -Quiet)

$NoStorageMutation =
  -not ($BoardText -match 'ST-002[\s\S]*memsearch') -and
  -not ($BoardText -match 'ST-003[\s\S]*memsearch')

$DocLinksOk -and $NoStorageMutation
```
Expected result: `True`.

**Failure handling:**
- If the investigation doc does not clearly justify a board edit, prefer no board change and state that explicitly in the investigation doc.
- If a proposed edit would require widening ST-004 or ST-005 beyond the bounded rules above, stop and escalate through §2c instead of improvising.

---

### Task 4.6: Remove the temporary workspace and run final verification

**Objective:** Leave behind only the approved repo artifacts and confirm that the investigation is self-contained.

**Input:** Completed investigation doc, any bounded board/doc updates from Task 4.5, and the temp workspace from Tasks 4.1–4.3.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Confirm the investigation doc already includes enough evidence summary that the temp workspace is no longer needed.
2. Remove the disposable runtime workspace:
	```powershell
	if (Test-Path $TempRoot) { Remove-Item $TempRoot -Recurse -Force }
	```
3. Run the final verification bundle:
	```powershell
	$DocPath = '.\docs\investigations\memsearch-applicability-review.md'
	$DocOk = @(
	  'ONNX bge-m3 local embeddings',
	  'Milvus Lite vs SQLite-first',
	  'Progressive disclosure',
	  'Markdown as source of truth vs SQLite-first',
	  'Story Impact Decisions',
	  'Current ai-memory architectural defaults remain authoritative'
	) | ForEach-Object {
	  Select-String -Path $DocPath -Pattern $_ -Quiet
	} | Where-Object { $_ -eq $false } | Measure-Object | Select-Object -ExpandProperty Count

	$TempGone = -not (Test-Path $TempRoot)
	($DocOk -eq 0) -and $TempGone
	```
4. If execution workflow expects story closeout, check whether ST-011 is still occupying the Review column. If it is, do not move ST-014 to Review; instead record the board-capacity blocker in §5b and §6b after all verification passes.

**Expected output:**
- No `.tmp\st-014-memsearch\` directory remains
- Investigation outputs remain in repo under `docs\investigations\` and, if justified, bounded updates remain in local docs or the board

**Requirement mapping:**
- `After cleanup, the temporary runtime workspace is removed`
- Final verification for all investigation outputs

**Verification:**
```powershell
(-not (Test-Path '.\.tmp\st-014-memsearch')) -and
(Test-Path '.\docs\investigations\memsearch-applicability-review.md')
```
Expected result: `True`.

**Failure handling:** If cleanup fails because files are locked, close any shell or editor sessions using the temp workspace and rerun the delete step once. If the directory still cannot be removed, document the locked path in §6b and stop before story closeout.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.1 — Create an isolated upstream workspace |
| **Last successful command** | `git -C $UpstreamRoot describe --tags --always 2>$null | Set-Content (Join-Path $LogsRoot 'upstream-version.txt')` |
| **Expected outputs produced** | `.tmp\st-014-memsearch\upstream\`, `.tmp\st-014-memsearch\logs\upstream-commit.txt`, `.tmp\st-014-memsearch\logs\upstream-version.txt` |
| **Next task** | Task 4.2 — Run the lightweight memsearch smoke test |
| **Known blockers** | None |
| **Last updated** | 2026-05-04T10:22:49.9822794+02:00 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-04T10:22:49.9822794+02:00 | Task 4.1 | Complete | Created `.tmp\st-014-memsearch\upstream\`; logged `upstream-commit.txt` and `upstream-version.txt` | Task 4.2 — Run the lightweight memsearch smoke test |

### Avoidance

(Append dated entries here. Do not delete prior guidance.)

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Primary approach: shallow-clone memsearch, run ONNX smoke test, inspect upstream docs/code, then write the investigation and bounded repo updates | Before Task 4.2 install step | 🟢 Active |
| 2 | Fallback approach: if ONNX runtime validation fails after one retry, continue with docs+code evidence only, document the runtime gap, and do not mutate ST-004/ST-005 based on runtime claims | Before any board edit in Task 4.5 | ⬜ Reserve |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

---

## §6. Execution Log

(Populated during execution — timestamped entries of significant actions)

- 2026-05-04T10:22:49.9822794+02:00 — Completed Task 4.1 by creating the isolated upstream workspace, shallow-cloning `zilliztech/memsearch`, and recording the reviewed commit/version metadata.

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

- Observation: ...
  Evidence: ...
  Impact: ...

---

## §6c. Decision Log

(Record every decision made during execution with rationale.)

- Decision: ...
  Rationale: ...
  Date: ...

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review only if the Review WIP slot is free
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

If the Review slot is still occupied by ST-011, complete verification, capture the blocker in §5b and §6b, and stop before moving ST-014 into Review.

---

## §7b. Outcomes & Retrospective

(Summarise at completion: what was achieved, what remains, lessons learned.)

Achieved: ...
Remains: ...
Lesson: ...

---

## Revision Notes

- 2026-05-04: Replaced the stub with a full Ready ExecPlan based on QP-014 and the PO's /plan scoping decisions. Added explicit smoke-test steps, bounded downstream-edit rules, fallback behavior for ONNX runtime failure, and WIP-limit handling for the occupied Review column.
