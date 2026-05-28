# QP-037: Configure Local MCP Clients for Dogfooding

> Story: ST-037
> Status: Complete — ready for Phase 2
> Created: 2026-05-28

---

## PO Intent

Enable the PO to start using the ai-memory MCP server daily from multiple AI coding
agents (VS Code Copilot, Claude Code, Claude Desktop). This accumulates real graph
data, which is a prerequisite for ST-034 (cardinality spike).

## Problem Statement

The MCP server is fully functional at `http://localhost:3000/mcp` with Bearer auth,
but no client configuration exists in the repo or documentation. The dev database is
empty (0 thoughts, 0 entities) because no agent is currently connected for capture.

Without connecting clients, ST-034 cannot be grounded in real usage patterns.

## PO Decisions (from scoping 2026-05-28)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| VS Code Copilot config | Committed `.vscode/mcp.json` using `${env:MEMORY_API_KEY}` | Any clone gets it; no secret leak |
| Claude Code config | User-level, documented in README | Path is machine-specific, not repo-appropriate |
| Claude Desktop config | User-level, documented in README | Same as Claude Code — outside workspace |
| ChatGPT / Gemini | Out of scope (needs ST-023 cloud deploy) | Localhost unreachable from cloud services |
| Smoke test | Required as AC | Proves end-to-end connectivity, not just file existence |
| ST-034 dependency | ST-034 blocked_by ST-037 | Can't run cardinality spike without accumulated data |

## In Scope

1. **`.vscode/mcp.json`** — VS Code Copilot HTTP transport config pointing to
   `http://localhost:3000/mcp` with `Authorization: Bearer ${env:MEMORY_API_KEY}`.
2. **README section** — "Connecting Clients" with subsections:
   - VS Code Copilot (reference the committed config, explain env var)
   - Claude Code (user-level project config or `~/.claude.json`)
   - Claude Desktop (`claude_desktop_config.json` path per OS)
3. **Smoke-test AC** — PO manually captures a thought and searches for it from at
   least one configured client, confirming the full round-trip works.

## Out of Scope

- Cloud-accessible deployment (ST-023 owns this)
- ChatGPT Actions / Gemini MCP bridge (blocked by ST-023)
- New MCP tools or server-side changes
- Automated CI testing of client connectivity

## Technical Notes

- The server uses `StreamableHTTPTransport` (Hono + `@modelcontextprotocol/sdk`).
  Clients must support Streamable HTTP MCP transport (not stdio).
- VS Code Copilot MCP config supports `${env:VAR}` interpolation for secrets.
- Claude Code supports project-level `.mcp.json` or user-level settings; since the
  server URL/key are machine-specific, user-level is more appropriate.
- Claude Desktop reads `~/Library/Application Support/Claude/claude_desktop_config.json`
  (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

## Acceptance Criteria (proposed)

1. `.vscode/mcp.json` exists and configures VS Code Copilot to connect to the local
   MCP server using env-var interpolation for the Bearer token.
2. README.md contains a "Connecting Clients" section with setup instructions for
   VS Code Copilot, Claude Code, and Claude Desktop.
3. PO performs a manual capture+search round-trip from at least one configured client,
   confirming thoughts are persisted and retrievable.

## Dependencies

- Prerequisite for: ST-034 (cardinality spike needs real accumulated data)
- Requires: Docker dev stack running (`docker compose up -d`), `.env` populated

## Estimated Complexity

Trivial — configuration files and documentation only. No server-side code changes.
