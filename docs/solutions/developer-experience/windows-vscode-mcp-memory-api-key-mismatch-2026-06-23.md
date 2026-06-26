---
title: Windows VS Code MCP Auth Requires Matching MEMORY_API_KEY
date: 2026-06-23
category: developer-experience
module: ai-memory
problem_type: developer_experience
component: authentication
severity: medium
applies_when:
  - "Connecting Windows VS Code to the local ai-memory MCP server"
  - "Using .vscode/mcp.json with Authorization: Bearer ${env:MEMORY_API_KEY}"
  - "Running the MCP server from WSL2 or Docker with values loaded from repo .env"
symptoms:
  - "VS Code MCP requests fail authentication"
  - "The MCP /health endpoint returns 200 but /mcp returns 401"
  - "Manual MCP requests succeed with the repo .env key but fail with the Windows environment key"
root_cause: config_error
resolution_type: environment_setup
tags: [mcp, vscode, windows, wsl2, environment-variables, authentication]
---

# Windows VS Code MCP Auth Requires Matching MEMORY_API_KEY

## Context

Windows VS Code failed to authenticate to the local ai-memory MCP server even though the server was running and healthy. The server reads `MEMORY_API_KEY` from its runtime environment, while VS Code expands `${env:MEMORY_API_KEY}` from the Windows process environment.

The workspace MCP config expects the Windows environment variable to be present:

```json
{
  "servers": {
    "ai-memory": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MEMORY_API_KEY}"
      }
    }
  }
}
```

The server auth check in `server/src/auth.ts` compares the full header exactly against the server-side value:

```ts
auth === `Bearer ${Deno.env.get("MEMORY_API_KEY")}`
```

In the observed failure, the Windows user-level `MEMORY_API_KEY` existed but did not match `/home/cpeddle/projects/ai-memory/.env`. After setting the Windows user variable to the repo `.env` value and testing from Windows PowerShell, MCP returned `STATUS=200`.

## Guidance

Treat VS Code MCP auth setup as a two-environment configuration step:

- The server needs `MEMORY_API_KEY` in repo `.env` or `.env.dev`.
- Windows VS Code needs a Windows user or process `MEMORY_API_KEY` with the same value.
- VS Code must be restarted after the Windows environment variable changes.

Set the Windows user environment variable without printing the secret:

```powershell
[Environment]::SetEnvironmentVariable("MEMORY_API_KEY", "<repo-.env-value>", "User")
```

Then fully restart VS Code so `${env:MEMORY_API_KEY}` is expanded from the updated Windows environment.

For automated setup, prefer making this explicit in the setup script or checklist: read or generate the repo `.env` key once, then synchronize the Windows user-level `MEMORY_API_KEY` used by VS Code.

### Automated path

The repo ships `sync-api-key.sh` (run from WSL), which automates this:

```bash
./sync-api-key.sh            # reads .env, sets Windows user MEMORY_API_KEY,
                             # materializes the gitignored OpenCode configs
                             # from their .example templates, verifies via
                             # SHA-256 read-back, and prints a
                             # VS_CODE_RESTART_REQUIRED marker on change
./sync-api-key.sh --check    # read-only drift report (zero writes)
```

The OpenCode configs (`opencode-mcp.json`, `.opencode/config.json`) are
gitignored and generated from committed `.example` templates that hold only
the `Bearer YOUR_MEMORY_API_KEY` placeholder, so no secret is ever tracked.
The script is idempotent — re-running on an in-sync tree performs zero writes
and emits no restart marker. The manual PowerShell step above remains a valid
fallback for non-WSL setups; it is what the script automates.

## Why This Matters

This failure looks like an MCP transport or server bug, but the server is behaving correctly. `/mcp` must reject requests whose `Authorization` header does not exactly match `Bearer <server MEMORY_API_KEY>`.

The confusing part is that WSL2 and Windows can both have a variable named `MEMORY_API_KEY` with different values:

```text
Server runtime: /home/cpeddle/projects/ai-memory/.env
Windows VS Code: Windows process/user environment
```

If those values drift, `health` still passes because `/health` is unauthenticated, but every MCP request fails with `401`.

## When to Apply

- VS Code on Windows cannot authenticate to `ai-memory` MCP.
- `http://127.0.0.1:3000/health` returns `200`.
- `/mcp` returns `401` from VS Code or unauthenticated raw requests.
- `.vscode/mcp.json` uses `Authorization: Bearer ${env:MEMORY_API_KEY}`.
- The MCP server runs from WSL2 or Docker using repo `.env` values.

## Examples

Verify the server is reachable:

```powershell
curl.exe http://127.0.0.1:3000/health
```

Verify Windows can authenticate to MCP after setting the environment variable:

```powershell
$key = [Environment]::GetEnvironmentVariable("MEMORY_API_KEY", "User")
$headers = @{
  Authorization = "Bearer $key"
  Accept = "application/json, text/event-stream"
}
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"thought_stats","arguments":{}}}'

$response = Invoke-WebRequest `
  -Uri "http://127.0.0.1:3000/mcp" `
  -Method POST `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body `
  -UseBasicParsing

"STATUS=$($response.StatusCode)"
```

Expected result:

```text
STATUS=200
```

Compare values without printing secrets by hashing each side. In WSL:

```bash
set -a && . ./.env && set +a
printf '%s' "$MEMORY_API_KEY" | sha256sum
```

In Windows PowerShell:

```powershell
$value = [Environment]::GetEnvironmentVariable("MEMORY_API_KEY", "User")
$sha = [System.Security.Cryptography.SHA256]::Create()
[System.BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value))).Replace("-", "").ToLower()
```

If the hashes differ, synchronize the Windows user variable from the repo `.env` value and restart VS Code.

## Related

- `sync-api-key.sh` — the automated sync script that performs this fix from WSL (with `--check` dry-run and SHA-256 read-back verification).
- `opencode-mcp.json.example` / `.opencode/config.example.json` — tracked templates (placeholder only); the real `opencode-mcp.json` and `.opencode/config.json` are gitignored and generated by `sync-api-key.sh`.
- `.vscode/mcp.json` configures VS Code MCP auth with `${env:MEMORY_API_KEY}` (verify-only by the script; manually owned).
- `server/src/auth.ts` validates the exact Bearer header against server-side `MEMORY_API_KEY`.
- `README.md` and `docs/wsl2-setup.md` document the VS Code MCP path and point at `sync-api-key.sh` as the automated setup, with the manual `SetEnvironmentVariable` retained as a fallback.
