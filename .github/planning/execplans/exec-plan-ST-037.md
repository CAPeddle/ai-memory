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

**What this story delivers:** Configuration files and documentation that let three AI clients connect to the local MCP server immediately:

1. **VS Code Copilot** — a committed `.vscode/mcp.json` that any workspace clone picks up automatically.
2. **Claude Code** — documented user-level configuration (machine-specific, not committed).
3. **Claude Desktop** — documented user-level configuration (machine-specific, not committed).

After this story, the PO can begin daily dogfooding: capturing thoughts, searching, and building a real graph corpus.

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

1. After opening the workspace in VS Code, the MCP server panel shows "ai-memory" as a configured server (may show disconnected if Docker is down, but the entry exists).
2. After running `docker compose up -d` and setting `MEMORY_API_KEY` in the environment, VS Code Copilot can invoke `capture_thought` and `search_thoughts` against `localhost:3000/mcp`.
3. After reading README.md §"Connecting Clients", a user can configure Claude Code and Claude Desktop to connect to the same endpoint by following the documented steps.
4. PO manually performs a capture+search round-trip from at least one configured client.

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
| README.md "Connecting Clients" section documents VS Code Copilot, Claude Code, and Claude Desktop (QP-037 AC2) | README.md contains subsections for each client with config snippets | Task 4.2 | `Select-String` evidence for all three client headings and key config values |
| PO performs capture+search round-trip (QP-037 AC3) | Successful tool invocation from a connected client | Task 4.3 | PO confirmation during smoke test |

---

## §3. Preconditions

- Docker dev stack running: `docker compose up -d` (both `db` and `mcp` containers healthy)
- `.env` file at repo root containing `MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY`
- `MEMORY_API_KEY` also exported in the shell environment (for `${env:MEMORY_API_KEY}` interpolation)
- VS Code open on this workspace

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

**Expected output:** `.vscode/mcp.json` exists and is committed.

**Requirement mapping:** Row 1 (`.vscode/mcp.json` with URL and env var interpolation).

**Verification:**

```powershell
Select-String -Path .vscode/mcp.json -Pattern "http://localhost:3000/mcp"
Select-String -Path .vscode/mcp.json -Pattern '\$\{env:MEMORY_API_KEY\}'
```

Expected: Both commands return matches.

**Failure handling:** If `ConvertFrom-Json` errors, fix the JSON syntax (likely a trailing comma or encoding issue).

---

### Task 4.2: Expand README.md "Connecting Clients" section

**Objective:** Replace the existing "4. Connect an MCP client" section with a comprehensive "Connecting Clients" section covering VS Code Copilot, Claude Code, and Claude Desktop.

**Input:** Current README.md lines 95–111 contain a minimal "4. Connect an MCP client" section with a Claude Code JSON snippet.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Open `README.md` and locate the section starting with `### 4. Connect an MCP client` (currently around line 95).

2. Replace the entire section (from `### 4. Connect an MCP client` up to but not including `### Running tests`) with the following content:

````markdown
### 4. Connecting Clients

The MCP server uses **Streamable HTTP transport** at `http://localhost:3000/mcp`. Every request requires a `Authorization: Bearer <MEMORY_API_KEY>` header. Ensure `MEMORY_API_KEY` is set in your environment before configuring clients.

#### VS Code Copilot

The workspace already includes `.vscode/mcp.json` which auto-configures the connection. Just ensure `MEMORY_API_KEY` is set in your shell environment before launching VS Code:

```powershell
# Windows (PowerShell) — add to your $PROFILE or set as a system env var
$env:MEMORY_API_KEY = "your-key-here"
code .
```

VS Code Copilot will detect the server and expose ai-memory tools (capture_thought, search_thoughts, etc.) in the Copilot chat.

#### Claude Code

Add to your project-level `.mcp.json` or user-level MCP settings:

```json
{
  "mcpServers": {
    "ai-memory": {
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer YOUR_MEMORY_API_KEY" }
    }
  }
}
```

Replace `YOUR_MEMORY_API_KEY` with your actual key value (Claude Code does not support env var interpolation in MCP config).

#### Claude Desktop

Edit your Claude Desktop config file:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the `ai-memory` entry under `mcpServers`:

```json
{
  "mcpServers": {
    "ai-memory": {
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer YOUR_MEMORY_API_KEY" }
    }
  }
}
```

Restart Claude Desktop after editing the config.

#### Verify connectivity

From any connected client, ask it to call `thought_stats`. A successful response (even with zero counts) confirms the connection is working.
````

3. Stage and commit:

```powershell
git add README.md
git commit -m "docs: expand Connecting Clients section for all MCP clients

Adds setup instructions for VS Code Copilot (.vscode/mcp.json auto-config),
Claude Code (project or user-level .mcp.json), and Claude Desktop
(platform-specific config path). Replaces the minimal prior snippet.

Story: ST-037
Task: §4.2"
```

**Expected output:** README.md contains a "Connecting Clients" section with subsections for VS Code Copilot, Claude Code, and Claude Desktop.

**Requirement mapping:** Row 2 (README section with three client subsections).

**Verification:**

```powershell
Select-String -Path README.md -Pattern "#### VS Code Copilot"
Select-String -Path README.md -Pattern "#### Claude Code"
Select-String -Path README.md -Pattern "#### Claude Desktop"
Select-String -Path README.md -Pattern "http://localhost:3000/mcp"
Select-String -Path README.md -Pattern "MEMORY_API_KEY"
```

Expected: All five commands return at least one match.

**Failure handling:** If a heading is missing, re-check the replacement boundaries. Ensure the old section was fully replaced and no duplicate headings remain.

---

### Task 4.3: Cross-model review + PO smoke test

**Objective:** Validate the delivered artifacts against acceptance criteria, then hand off to the PO for the manual connectivity smoke test.

**Input:** Committed `.vscode/mcp.json` and updated `README.md` from Tasks 4.1 and 4.2.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. **Cross-model critical review** — Request a review from a different model than the executor. The reviewer checks:
   - Does `.vscode/mcp.json` use the correct VS Code MCP config schema (`servers` → named entry → `type`, `url`, `headers`)?
   - Does the README accurately describe the config format for each client (no incorrect keys, no hallucinated features)?
   - Is the `${env:MEMORY_API_KEY}` syntax correct for VS Code interpolation?
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
```

3. **PO smoke test** — Present the following to the PO:
   - Confirm Docker dev stack is running (`docker compose up -d`)
   - Confirm `MEMORY_API_KEY` is set in the environment
   - From any configured client (VS Code Copilot recommended since it's auto-configured), invoke:
     - `thought_stats` → expect a JSON response with counts (may be zeros)
     - `capture_thought` with content "ST-037 smoke test" and context "project:ai-memory"
     - `search_thoughts` with query "smoke test" → expect the captured thought returned
   - PO confirms the round-trip worked

4. **Board update** — After PO confirmation, move ST-037 from In Progress → Review on `.github/planning/story-board.md`.

**Expected output:** All ACs verified; PO confirms round-trip.

**Requirement mapping:** Row 3 (PO round-trip confirmation).

**Verification:**

PO verbal or written confirmation that capture+search round-trip succeeded from at least one client.

**Failure handling:**
- If `thought_stats` fails with 401: check `MEMORY_API_KEY` matches the value in `.env`.
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
