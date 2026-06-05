# QP-057: MCP Compatibility Hardening

> Story: ST-057  
> Status: Seed packet from `/plan-new`  
> Created: 2026-06-05  
> Source: OpenCode ai-memory MCP investigation (`prompts/list` JSON-RPC -32601)

---

## PO Intent

Make ai-memory friendlier to MCP clients that probe optional server surfaces during startup, starting with the observed OpenCode failure on `prompts/list`. Do not only patch the one failing call; research the MCP 2025-06-18 server protocol surface enough that `/plan` can decide which optional methods should return safe empty responses, which should expose a minimal useful capability, and which should remain unsupported by design.

## Triggering Evidence

OpenCode log snippet reported by the PO:

```text
ERROR 2026-06-05T14:16:48 +2446ms service=mcp clientName=ai-memory error=MCP error -32601: Method not found failed to get prompts
```

Direct protocol probes against local ai-memory on 2026-06-05 showed:

- `initialize` succeeds and advertises only `capabilities.tools`.
- `tools/list` succeeds and returns the ai-memory tool list.
- `prompts/list` returns JSON-RPC `-32601 Method not found`.
- `resources/list` also returns JSON-RPC `-32601 Method not found`.

This means ai-memory's tool surface is reachable and authenticated, but clients that eagerly probe prompt/resource methods can see noisy or fatal compatibility errors.

## Out Of Scope Evidence

The same OpenCode report included:

```text
ProviderModelNotFoundError
```

and:

```text
No matching version found for @opencode-ai/plugin@local
```

Those errors are OpenCode model/provider/plugin configuration failures, not ai-memory MCP server failures. This story should not try to fix OpenCode model resolution or dependency installation. Its purpose is to remove ai-memory's avoidable MCP protocol-probe incompatibility.

## Confirmed Story Metadata

| Field | Value |
|---|---|
| Title | MCP compatibility hardening |
| Type | hardening |
| Placement | Backlog |
| Value | 5 |
| Blocked by | none |
| Future ExecPlan | `.github/planning/execplans/exec-plan-ST-057.md` |

## Research Findings

### Current ai-memory Server Surface

`server/index.ts` creates an `McpServer` and registers nine tools. It does not register prompts or resources. The server is exposed through `@hono/mcp` `StreamableHTTPTransport` at `/mcp`, with Bearer auth from `server/src/auth.ts`.

Existing implemented/observed behavior:

| Method | Observed behavior |
|---|---|
| `initialize` | Succeeds; advertises `capabilities.tools` only |
| `tools/list` | Succeeds |
| `tools/call` | Succeeds for registered tools |
| `prompts/list` | `-32601 Method not found` |
| `resources/list` | `-32601 Method not found` |

### MCP 2025-06-18 Server-Side Methods To Consider

Targeted spec research from `modelcontextprotocol.io/specification/2025-06-18` surfaced these relevant server method groups:

- Tools: `tools/list`, `tools/call`.
- Prompts: `prompts/list`, `prompts/get`; prompt capability may include `listChanged`.
- Resources: `resources/list`, `resources/read`, `resources/templates/list`, `resources/subscribe`; resource capability may include `subscribe` and `listChanged`.
- Basic utility: `ping`.
- Completion is associated with argument/reference completion in the protocol; `/plan` should verify whether `completion/complete` is relevant to registered prompts/resources/tools in the SDK version used here.

ai-memory currently has real functionality only in tools. Prompt/resource compatibility may therefore be intentionally empty rather than feature-rich.

## Relationship To Existing Stories

- ST-037 configured local MCP clients for dogfooding; this story improves interoperability with another client class discovered during dogfooding.
- ST-047 improves tool descriptions; it does not address prompt/resource protocol methods.
- ST-044 adds structured logging; it does not change MCP protocol compatibility.
- ST-006 REST API is unrelated; this is MCP transport/protocol behavior only.

## Provisional Acceptance Criteria

1. `prompts/list` no longer returns JSON-RPC `-32601 Method not found` for clients that probe prompts; it returns an MCP-compatible empty prompt list or a minimal intentional prompt surface as decided during `/plan`.
2. `prompts/get` behavior is explicitly decided and tested: either a valid minimal prompt is retrievable, or unsupported prompt names return the protocol-appropriate error while `prompts/list` remains safe.
3. `resources/list` and `resources/templates/list` compatibility expectations are researched and either implemented as safe empty lists or deliberately left unsupported with documented rationale.
4. The ExecPlan includes a protocol audit mapping relevant MCP 2025-06-18 server methods (`tools/*`, `prompts/*`, `resources/*`, `ping`, and optional completion/subscribe behavior) to implemented/deferred decisions.
5. Focused tests prove OpenCode-style startup probes do not produce `-32601` for accepted compatibility endpoints and that existing `tools/list` / `tools/call` behavior is unchanged.
6. Cross-model critical review passes before the story moves to Review.

## Open Questions For `/plan`

1. Should ai-memory expose no prompts (`prompts/list: []`) or one useful prompt such as "search memory before answering"?
2. If `prompts/list` is implemented as empty, does the SDK support first-class empty prompt capability registration, or is a low-level request handler/shim needed?
3. Should resources be treated similarly as empty compatibility endpoints, or should ai-memory expose thought fetches as MCP resources later?
4. Is `ping` already handled by the SDK transport/server, and should this story pin that with a protocol test?
5. Should completion support be explicitly tested as unsupported, or deferred because ai-memory has no prompt/resource arguments needing completion?
6. Should client troubleshooting docs mention that OpenCode model/provider/plugin errors are distinct from ai-memory MCP protocol errors?

## Recommended Next Step

Run `/plan ST-057` to produce a Ready ExecPlan that starts from the MCP 2025-06-18 protocol audit, chooses the prompt/resource compatibility strategy, and then specifies focused protocol tests before implementation.