# ExecPlan — ST-037: Configure local MCP clients for dogfooding

> Status: ✅ Ready for /continue
> Story: ST-037
> Created: 2026-05-29
> Approved: 2026-05-29
> Parent: `.github/planning/query-packets/QP-037-local-mcp-client-config.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

The ai-memory MCP server is fully functional at `http://localhost:3000/mcp` (Deno 2.0 / TypeScript / Hono / `@modelcontextprotocol/sdk`) with Bearer auth. It exposes tools for `capture_thought`, `search_thoughts`, `list_thoughts`, `thought_stats`, `graph_traverse`, `graph_search`, and `consolidate`. The Docker dev stack (`docker compose up -d`) runs both the Postgres database and the MCP server.

**Problem:** No AI coding agent is currently connected to this server. The dev database contains zero thoughts and zero entities. Without connected clients performing daily capture, ST-034 (cardinality spike) cannot be grounded in real data.

**What this story delivers:** One immediately usable local client configuration plus verified setup guidance for the other targeted clients:

1. **VS Code Copilot** — a committed `.vscode/mcp.json` that any workspace clone picks up automatically.
2. **Claude Code** — README instructions for the verified current user-level setup method (machine-specific, not committed).
3. **Claude Desktop** — README instructions for the verified current setup method, or an explicit limitation note if the current client documentation does not confirm a JSON-based localhost Streamable HTTP configuration.

After this story, the PO can begin daily dogfooding in at least one configured client and has verified guidance for the others without relying on guessed snippets.

**Key terms:**
- **MCP** — Model Context Protocol. A JSON-RPC protocol over HTTP for AI tool invocation.
- **Streamable HTTP transport** — The MCP transport variant this server uses (not stdio). Clients connect via HTTP POST to `/mcp`.
- **Bearer auth** — Every request to `/mcp` must include `Authorization: Bearer <token>`. The token value is the `MEMORY_API_KEY` environment variable from `.env`.
- **`${env:MEMORY_API_KEY}`** — VS Code's variable interpolation syntax; replaced at runtime with the environment variable value. No secret is committed to the repo.

---

## §1b. Outcomes & Conclusions

(Populated after execution)

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

1. After restarting VS Code with `MEMORY_API_KEY` already present in the environment, the MCP server panel shows "ai-memory" as a configured server (it may show disconnected if Docker is down, but the entry exists).
2. After running `docker compose up -d` and setting `MEMORY_API_KEY` in the environment before launching VS Code, VS Code Copilot can invoke `capture_thought` and `search_thoughts` against `localhost:3000/mcp`.
3. After reading README.md §"Connecting Clients", a user can follow verified current setup instructions for VS Code Copilot, Claude Code user-level settings, and Claude Desktop without relying on guessed JSON snippets.
4. PO manually confirms both (a) the VS Code MCP panel shows `ai-memory` and (b) a capture+search round-trip succeeds from at least one configured client.

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ✅ Ready for /continue

---

## §2c. Plan Review Notes

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| `.vscode/mcp.json` configures VS Code Copilot to connect to `http://localhost:3000/mcp` using `${env:MEMORY_API_KEY}` (QP-037 AC1) | `.vscode/mcp.json` contains `"url": "http://localhost:3000/mcp"` and `${env:MEMORY_API_KEY}` in auth header | Task 4.1 | `Select-String` evidence for URL and env var interpolation |
| README.md "Connecting Clients" documents VS Code Copilot, Claude Code user-level setup, and Claude Desktop using verified current client syntax or verified current UI/path instructions (QP-037 AC2 + plan review 2026-05-29) | README.md contains the three client subsections; Claude Code is documented as user-level only; Claude Code/Desktop JSON snippets appear only if verified in Task 4.2; otherwise the README contains the verified entry point/path plus the explicit limitation note | Task 4.2 | `Select-String` evidence for headings + `user-level`; §6b verification notes for Claude Code and Claude Desktop |
| VS Code MCP panel shows `ai-memory` after restart with environment configured (plan review 2026-05-29) | PO smoke-test evidence recorded in this ExecPlan | Task 4.3 | PO confirmation after restarting VS Code with `MEMORY_API_KEY` set |
| PO performs capture+search round-trip from at least one configured client (QP-037 AC3) | Successful `thought_stats`, `capture_thought`, and `search_thoughts` tool invocations recorded in this ExecPlan | Task 4.3 | PO confirmation during smoke test |

---

## §3. Preconditions

- Docker dev stack running: `docker compose up -d` (both `db` and `mcp` containers healthy)
- `.env` file at repo root containing `MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY`
- `MEMORY_API_KEY` also exported in the shell environment (for `${env:MEMORY_API_KEY}` interpolation)
- VS Code open on this workspace
- Internet access to official client documentation or access to the installed client settings/help surface so Task 4.2 can verify the current Claude Code and Claude Desktop setup method before editing README.md
- If the current Claude Code/Desktop remote HTTP syntax cannot be verified, the executor must document only the verified entry point/path and the explicit limitation note; do not invent JSON snippets

**Boilerplate — `.vscode/mcp.json` structure:**

VS Code Copilot reads MCP server configs from `.vscode/mcp.json`. The schema:

```json
{
  "servers": {
    "<server-name>": {
      "type": "http",
      "url": "<endpoint-url>",
      "headers": {
        "Authorization": "Bearer ${env:ENV_VAR_NAME}"
      }
    }
  }
}
```

---

## §4. Task Definitions

### Task 4.1: Create `.vscode/mcp.json`

**Objective:** Commit a VS Code Copilot MCP configuration that connects to the local ai-memory server.

**Input:** §3 boilerplate structure; server endpoint is `http://localhost:3000/mcp`; auth is Bearer token from `MEMORY_API_KEY` env var.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create the directory `.vscode/` if it does not exist.
2. Create the file `.vscode/mcp.json` with the following exact content:

```json
{
  "servers": {
    "ai-memory": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MEMORY_API_KEY}"
      }
    }
  }
}
```

3. Verify the file is valid JSON by running:

```powershell
Get-Content .vscode/mcp.json | ConvertFrom-Json
```

Expected: No error; object returned with `servers.ai-memory.url` = `http://localhost:3000/mcp`.

4. Stage and commit:

```powershell
git add .vscode/mcp.json
git commit -m "feat(config): add VS Code MCP client configuration

Configures VS Code Copilot to connect to the local ai-memory MCP
server at http://localhost:3000/mcp with Bearer auth via env var
interpolation. No secrets committed.

Story: ST-037
Task: §4.1"
```

5. Update this ExecPlan's §5b Recovery Ledger immediately after the commit:

```markdown
- Set **Last completed task** to `Task 4.1 — Create .vscode/mcp.json`
- Set **Last successful command** to the `git commit` command above
- Set **Expected outputs produced** to `.vscode/mcp.json committed`
- Set **Next task** to `Task 4.2 — Expand README.md "Connecting Clients" section`
- Append one timestamped **Progress History** row summarizing Task 4.1 completion
```

**Expected output:** `.vscode/mcp.json` exists and is committed; §5b records Task 4.1 completion.

**Requirement mapping:** Row 1 (`.vscode/mcp.json` with URL and env var interpolation).

**Verification:**

```powershell
Select-String -Path .vscode/mcp.json -Pattern "http://localhost:3000/mcp"
Select-String -Path .vscode/mcp.json -Pattern '\$\{env:MEMORY_API_KEY\}'
```

Expected: Both commands return matches.

**Failure handling:** If `ConvertFrom-Json` errors, fix the JSON syntax (likely a trailing comma or encoding issue). If the commit fails because unrelated files are dirty, stage only `.vscode/mcp.json` and retry.

---

### Task 4.2: Expand README.md "Connecting Clients" section

**Objective:** Replace the existing "4. Connect an MCP client" section with a comprehensive "Connecting Clients" section that uses verified current setup instructions for VS Code Copilot, Claude Code user-level config, and Claude Desktop.

**Input:** Current README.md lines 95–111 contain a minimal "4. Connect an MCP client" section with a Claude Code JSON snippet; Task 4.1 has already committed `.vscode/mcp.json`; §3 defines the rule that unverified client syntax must not be guessed.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Open `README.md` and locate the section starting with `### 4. Connect an MCP client` (currently around line 95).

2. Before editing `README.md`, verify the current setup surface for Claude Code and Claude Desktop using official vendor documentation or the installed client settings/help surface. Confirm all of the following:

   - **Claude Code:** the user-level configuration entry point/path, whether remote HTTP MCP servers use JSON config, and whether env var interpolation is supported.
   - **Claude Desktop:** the Windows/macOS configuration entry point or settings UI path, whether a localhost Streamable HTTP server is configured via JSON file or UI, and whether `url`/`headers` JSON is explicitly documented.

3. Record the verification results in §6b using these exact prefixes so the evidence is searchable later:

   - `Observation: Claude Code setup verification — ...`
   - `Observation: Claude Desktop setup verification — ...`

   Each note must identify the source used (page title + URL, or in-app settings/help surface) and the conclusion reached.

4. Replace the entire section (from `### 4. Connect an MCP client` up to but not including `### Running tests`) with a `### 4. Connecting Clients` section using the following structure and decision rules:

````markdown
### 4. Connecting Clients

The MCP server uses **Streamable HTTP transport** at `http://localhost:3000/mcp`. Every request requires an `Authorization: Bearer <MEMORY_API_KEY>` header. Ensure `MEMORY_API_KEY` is set in your environment before configuring clients.

#### VS Code Copilot

The workspace already includes `.vscode/mcp.json` which auto-configures the connection. Ensure `MEMORY_API_KEY` is set in your shell environment before launching VS Code:

```powershell
# Windows (PowerShell) — add to your $PROFILE or set as a system env var
$env:MEMORY_API_KEY = "your-key-here"
code .
```

After VS Code starts, open the MCP server panel and confirm `ai-memory` appears as a configured server.

#### Claude Code

Document the **user-level** setup method verified in Step 2. Do not document project-level `.mcp.json`.

If Step 2 verified a JSON-based user-level config for remote HTTP MCP servers, include:
- the verified user-level file path
- the verified JSON snippet
- whether env var interpolation is supported

If Step 2 did not verify a JSON snippet, include this exact note instead of guessing:
`The current Claude Code documentation or client help did not confirm a JSON snippet for a remote HTTP MCP server, so this README intentionally documents only the verified user-level configuration entry point.`

#### Claude Desktop

Document the verified Windows/macOS setup entry point from Step 2.

Only include a JSON snippet if Step 2 verified that the current client supports a JSON-defined remote HTTP MCP server with `url` and `headers`.

If Step 2 did not verify that JSON shape, include this exact note:
`Current official documentation confirms where Claude Desktop MCP configuration lives, but does not confirm this exact JSON shape for a localhost Streamable HTTP server. Verify the current Claude Desktop release before adding ai-memory there.`

#### Verify connectivity

From a connected client, call `thought_stats`. A successful non-error text response containing `Total active thoughts:` confirms the server connection is working.
````

5. Stage and commit:

```powershell
git add README.md
git commit -m "docs: expand Connecting Clients section for all MCP clients

Adds setup instructions for VS Code Copilot (.vscode/mcp.json auto-config),
Claude Code (user-level only), and Claude Desktop using verified
current setup guidance. Replaces the minimal prior snippet.

Story: ST-037
Task: §4.2"
```

6. Update this ExecPlan's §5b Recovery Ledger immediately after the commit:

```markdown
- Set **Last completed task** to `Task 4.2 — Expand README.md "Connecting Clients" section`
- Set **Last successful command** to the `git commit` command above
- Set **Expected outputs produced** to `README.md updated and committed`
- Set **Next task** to `Task 4.3 — Cross-model review + PO smoke test`
- Append one timestamped **Progress History** row summarizing Task 4.2 completion
```

**Expected output:** README.md contains a "Connecting Clients" section with subsections for VS Code Copilot, Claude Code, and Claude Desktop; the Claude Code subsection is user-level only; any Claude Code/Desktop JSON snippet appears only if verified; otherwise the explicit limitation note is present; §5b records Task 4.2 completion.

**Requirement mapping:** Row 2 (README section with three client subsections and verified syntax handling).

**Verification:**

```powershell
Select-String -Path README.md -Pattern "#### VS Code Copilot"
Select-String -Path README.md -Pattern "#### Claude Code"
Select-String -Path README.md -Pattern "user-level"
Select-String -Path README.md -Pattern "#### Claude Desktop"
Select-String -Path README.md -Pattern "http://localhost:3000/mcp"
Select-String -Path .github/planning/execplans/exec-plan-ST-037.md -Pattern "Observation: Claude Code setup verification"
Select-String -Path .github/planning/execplans/exec-plan-ST-037.md -Pattern "Observation: Claude Desktop setup verification"
```

Expected: All six commands return at least one match.

**Failure handling:** If a heading is missing, re-check the replacement boundaries. Ensure the old section was fully replaced and no duplicate headings remain. If the verified current setup entry point for a client cannot be confirmed at all, stop and escalate in §2c rather than inventing instructions. If only the remote HTTP JSON shape is unverified, omit the snippet and use the exact limitation note.

---

### Task 4.3: Cross-model review + PO smoke test

**Objective:** Validate the delivered artifacts against acceptance criteria, then hand off to the PO for the manual VS Code panel check and connectivity smoke test.

**Input:** Committed `.vscode/mcp.json` and updated `README.md` from Tasks 4.1 and 4.2; §6b client-verification notes from Task 4.2.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Cross-model critical review** — Request a review from a different model than the executor. The reviewer checks:
   - Does `.vscode/mcp.json` use the correct VS Code MCP config schema (`servers` → named entry → `type`, `url`, `headers`)?
   - Does the README accurately describe the config format or settings flow for each client (no incorrect keys, no hallucinated features)?
   - Is the `${env:MEMORY_API_KEY}` syntax correct for VS Code interpolation?
   - Do the Claude Code and Claude Desktop instructions align with the Task 4.2 verification notes, and does the Claude Code section stay user-level only?
   - Are there any secrets or sensitive values accidentally committed?

2. **Automated verification sweep:**

```powershell
# AC1: .vscode/mcp.json exists with correct content
Test-Path .vscode/mcp.json
Get-Content .vscode/mcp.json | ConvertFrom-Json | ForEach-Object { $_.servers.'ai-memory'.url }
# Expected: http://localhost:3000/mcp

# AC2: README has all three client sections
@("#### VS Code Copilot", "#### Claude Code", "#### Claude Desktop") | ForEach-Object {
    $match = Select-String -Path README.md -Pattern $_
    if ($match) { "PASS: $_" } else { "FAIL: $_ not found" }
}

# Claude Code remains user-level only
Select-String -Path README.md -Pattern "user-level"
```

3. **PO smoke test** — Present the following to the PO:
   - Confirm `MEMORY_API_KEY` is set in the environment, then fully restart VS Code so `${env:MEMORY_API_KEY}` is available when the workspace loads.
   - Confirm the VS Code MCP server panel shows `ai-memory` as a configured server.
   - Confirm Docker dev stack is running (`docker compose up -d`).
   - From any configured client (VS Code Copilot recommended since it's auto-configured), invoke:
     - `thought_stats` with no arguments → expect a non-error text response containing `Total active thoughts:`
     - `capture_thought` with `content = "ST-037 smoke test"` and `context = "project:ai-memory"` → expect response text containing `Captured as`
     - `search_thoughts` with `query = "ST-037 smoke test"` and `context = "project:ai-memory,strict"` → expect response text containing `ST-037 smoke test`
   - PO confirms both panel visibility and the round-trip.

4. Update §1b, §6, and §7b in this ExecPlan with the verification results. Record:
   - the PO confirmation that the VS Code MCP panel showed `ai-memory`
   - the client used for the smoke test
   - the observed `thought_stats`, `capture_thought`, and `search_thoughts` outcomes
   - any Claude Code/Desktop limitations carried forward from Task 4.2

5. **Board update** — After PO confirmation, move ST-037 from In Progress → Review on `.github/planning/story-board.md`.

6. Stage and commit the story closeout artifacts:

```powershell
git add .github/planning/story-board.md .github/planning/execplans/exec-plan-ST-037.md
git commit -m "docs(planning): record ST-037 validation and move story to Review

Logs PO confirmation that the VS Code MCP panel shows ai-memory and
records an end-to-end capture/search smoke test from a configured client,
then moves ST-037 to Review.

Story: ST-037
Task: §4.3"
```

7. Update this ExecPlan's §5b Recovery Ledger immediately after the commit:

```markdown
- Set **Last completed task** to `Task 4.3 — Cross-model review + PO smoke test`
- Set **Last successful command** to the `git commit` command above
- Set **Expected outputs produced** to `story board moved to Review; ExecPlan closeout recorded`
- Set **Next task** to `Closeout complete — await PO review`
- Append one timestamped **Progress History** row summarizing Task 4.3 completion
```

**Expected output:** All ACs verified; PO confirms both the VS Code panel requirement and the round-trip; the board is moved to Review; the closeout commit is recorded.

**Requirement mapping:** Rows 3 and 4 (VS Code panel confirmation + PO round-trip confirmation).

**Verification:**

PO verbal or written confirmation that (a) the VS Code MCP panel showed `ai-memory` after restart and (b) `thought_stats`, `capture_thought`, and `search_thoughts` succeeded from at least one configured client.

**Failure handling:**
- If `thought_stats` fails with 401: check `MEMORY_API_KEY` matches the value in `.env`.
- If `thought_stats` succeeds but does not contain `Total active thoughts:`, treat that as contract drift and inspect `server/index.ts` before proceeding.
- If VS Code doesn't show the server: restart VS Code; ensure `MEMORY_API_KEY` is in the environment *before* VS Code launches.
- If connection refused: ensure `docker compose up -d` is running and `curl http://localhost:3000/health` returns `ok`.

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
| **Next task** | Task 4.1 — Create `.vscode/mcp.json` |
| **Known blockers** | None |
| **Last updated** | — |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| — | — | — | — | — |

### Avoidance

(Append dated entries here. Do not delete prior guidance.)

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Direct config file creation + README edit | — | 🟢 Active |

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

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

(Populated after execution)
