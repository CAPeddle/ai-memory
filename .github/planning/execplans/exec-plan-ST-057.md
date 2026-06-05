# ExecPlan — ST-057: MCP Compatibility Hardening

> Status: ✅ Ready for /continue
> Story: ST-057
> Created: 2026-06-05
> Approved: 2026-06-05
> Parent: `.github/planning/query-packets/QP-057-mcp-compatibility-hardening.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

After this change, MCP clients that probe ai-memory during startup can ask for tools, prompts, and resources without receiving a JSON-RPC `-32601 Method not found` for the prompt/resource surfaces this story intentionally supports. The immediate user-visible win is that OpenCode-style startup probing no longer logs `MCP error -32601: Method not found failed to get prompts` for ai-memory.

ai-memory is a Deno 2.0 TypeScript MCP server in `server/`, served from `server/index.ts` over Streamable HTTP at `/mcp` using `@hono/mcp`'s `StreamableHTTPTransport`. The current server creates a high-level `McpServer` and registers tools only: `search`, `fetch`, `search_thoughts`, `capture_thought`, `list_thoughts`, `thought_stats`, `graph_traverse`, `graph_search`, and `consolidate`. Direct protocol probes during `/plan-new` showed:

- `initialize` succeeds and advertises `capabilities.tools`.
- `tools/list` succeeds and returns the ai-memory tools.
- `tools/call` succeeds for registered tools.
- `prompts/list` returns JSON-RPC `-32601 Method not found`.
- `resources/list` returns JSON-RPC `-32601 Method not found`.

In MCP terms:

- **Tools** are executable actions callable by agents. ai-memory already uses these as its main product surface.
- **Prompts** are reusable prompt templates that clients may list and request by name. ai-memory does not need a rich prompt library for this story, but exposing one small prompt makes prompt probing safe and gives agents a useful nudge.
- **Resources** are read-only context objects retrievable by URI. ai-memory does not yet expose thought records as MCP resources; this story adds only a harmless server-info resource so resource probing is safe without creating a new data-access API.
- **JSON-RPC `-32601`** means "method not found". Some clients treat it as a noisy startup failure even when the method is optional by capability.

The pinned SDK version is `@modelcontextprotocol/sdk@1.24.3` in `server/index.ts`. Targeted source/type research for that exact version confirmed first-class high-level APIs exist:

- `server.registerPrompt(name, config, callback)`
- `server.registerResource(name, uriOrTemplate, config, readCallback)`

Use those APIs. Do **not** implement this with a low-level transport shim unless the first-class APIs unexpectedly fail in tests, and if that happens, stop and record a plan-review blocker rather than improvising.

This story does **not** fix OpenCode `ProviderModelNotFoundError` or `@opencode-ai/plugin@local` dependency install failures. Those are OpenCode model/provider/plugin configuration issues outside ai-memory. This story removes ai-memory's avoidable protocol-probe incompatibility.

---

## §1b. Outcomes & Conclusions

*(Populated during/after execution. Required for completion visibility.)*

- completion status: not completed
- key findings/achievements: —
- requirements met vs unmet: —
- architectural impact: —
- supporting evidence: —
- downstream changes: —

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

1. After `initialize`, the server advertises `tools`, `prompts`, and `resources` capabilities, while still advertising the existing tools capability.
2. After calling `prompts/list`, the JSON-RPC response has a `result.prompts` array and does **not** have an `error.code = -32601`.
3. After calling `prompts/get` for the supported prompt name `memory_search_guidance`, the response contains at least one prompt message with text that tells the client to use ai-memory search tools before answering from memory.
4. After calling `prompts/get` for an unsupported prompt name, the response is a JSON-RPC error other than `-32601` (for example `Invalid params` / prompt not found), proving the prompt method exists while unknown names are rejected.
5. After calling `resources/list`, the response has a `result.resources` array containing `ai-memory://server-info` and does **not** have an `error.code = -32601`.
6. After calling `resources/templates/list`, the response has a `result.resourceTemplates` array and does **not** have an `error.code = -32601`. It is acceptable for this array to be empty because ST-057 does not add dynamic resource templates.
7. After calling `resources/read` for `ai-memory://server-info`, the response contains one JSON text resource with non-secret server metadata; it must not expose `MEMORY_API_KEY`, `OPENROUTER_API_KEY`, database credentials, or environment values.
8. After calling `resources/read` for an unsupported resource URI, the response is a JSON-RPC error other than `-32601`, proving the resource method exists while unknown URIs are rejected.
9. After calling `ping`, the response succeeds without `-32601`.
10. Existing `tools/list` and at least one existing `tools/call` smoke path still succeed, proving prompt/resource registration did not regress the existing tool surface.
11. The README client troubleshooting section distinguishes ai-memory MCP protocol compatibility errors from OpenCode-side model/provider/plugin errors.
12. Full server tests pass in `mcp-test`, or any unrelated pre-existing failure is documented with evidence.
13. Cross-model critical review passes before the story moves to Review.

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
- [x] Final task includes a cross-model review step

Status: ✅ Ready for /continue — approved by PO on 2026-06-05.

---

## §2c. Plan Review Notes

**Design decision for PO review:** Implement a minimal real prompt and a minimal static resource using first-class SDK APIs.

- Prompt: `memory_search_guidance`, zero arguments. It returns one prompt message reminding clients to search ai-memory using `search_thoughts`, `search`, or `list_thoughts` before relying on memory.
- Resource: `ai-memory://server-info`, static JSON. It reports safe public metadata: server name/version, supported protocol surfaces, and existing tool names. It must not read from the database or environment.
- Rationale: registering at least one prompt/resource initializes the SDK's prompt/resource request handlers using supported APIs. This avoids fragile low-level method shims and gives clients a useful, non-sensitive response. `resources/templates/list` should be initialized by resource registration and return an empty `resourceTemplates` array because no dynamic templates are registered.
- Explicit non-goal: Do not expose thought rows as resources in ST-057. A thought-resource API would be a product/API design change and belongs in a future story if wanted.

PO approval means accepting this minimal prompt/resource approach. If the PO wants empty lists instead, revise this ExecPlan before marking Ready.

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| `prompts/list` no longer returns `-32601` (QP-057 AC1) | First-class prompt registration in `server/index.ts`; protocol test for `prompts/list` | 4.1, 4.2 | `mcp-protocol-compat.test.ts` asserts `result.prompts` array and no `-32601` |
| `prompts/get` behavior decided/tested (QP-057 AC2) | `memory_search_guidance` prompt in `server/index.ts`; tests for valid and invalid prompt names | 4.1, 4.2 | Valid `prompts/get` returns messages; invalid name returns error code not `-32601` |
| Resource compatibility researched/decided (QP-057 AC3) | `ai-memory://server-info` resource; no dynamic templates; tests for list/templates/read | 4.1, 4.2 | `resources/list`, `resources/templates/list`, and `resources/read` tests pass without `-32601` |
| Protocol audit maps relevant methods (QP-057 AC4) | §1 and §2c in this ExecPlan; test file covers chosen method set | 4.1, 4.2, 4.4 | Tests cover `initialize`, `tools/list`, `tools/call`, `prompts/*`, `resources/*`, `ping` |
| OpenCode-style startup probes do not produce `-32601` for accepted endpoints (QP-057 AC5) | Protocol compatibility tests use raw JSON-RPC calls rather than tool-only helper | 4.1 | Red tests fail before implementation and pass after Task 4.2 |
| Existing tools behavior unchanged (QP-057 AC5) | Tests include existing `tools/list` and `tools/call` smoke path | 4.1, 4.2 | `tools/list` includes `thought_stats`; `tools/call thought_stats` returns `Total active thoughts:` |
| README troubleshooting distinguishes ai-memory vs OpenCode-side errors (QP-057 open question accepted in plan) | `README.md` client troubleshooting subsection | 4.3 | `Select-String` verifies `-32601`, `ProviderModelNotFoundError`, and `@opencode-ai/plugin@local` appear in README |
| Cross-model review gate (plan prompt) | §4.5 review step and §6c review outcome | 4.5 | Cross-model reviewer verdict recorded in §6c before board moves to Review |

No orphan requirements: every QP-057 scoped requirement maps to tasks and verification.

---

## §3. Preconditions

- Working directory: `c:\projects\ai-memory\`.
- Docker Desktop running.
- `.env` populated with `MEMORY_API_KEY`, `DB_PASSWORD`, and `OPENROUTER_API_KEY` for the compose stack.
- Test infrastructure available via `docker compose --profile test up -d`.
- Deno commands run inside `mcp-test`, not on the host.
- Current branch contains committed query packet `.github/planning/query-packets/QP-057-mcp-compatibility-hardening.md`.
- No migration or database schema change is needed.

### Boilerplate: Raw JSON-RPC Helper Shape

The existing `server/tests/_helpers/mcpClient.ts` only supports `tools/call`. Add a raw helper in Task 4.1 with this shape:

```ts
export async function mcpRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${MCP_BASE}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
  });
  if (!res.ok) throw new Error(`MCP request failed: ${res.status} ${await res.text()}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) throw new Error(`No data line in SSE response: ${text.slice(0, 200)}`);
    return JSON.parse(dataLine.slice(5).trim());
  }
  return await res.json();
}
```

### Boilerplate: Minimal Prompt

Add this immediately after the `const server = new McpServer(...)` line in `server/index.ts` during Task 4.2:

```ts
server.registerPrompt(
  "memory_search_guidance",
  {
    title: "Search AI Memory Before Answering",
    description: "Guidance for clients that want to use ai-memory recall before answering.",
  },
  () => ({
    description: "Use ai-memory tools to recall relevant project memory before answering.",
    messages: [{
      role: "user" as const,
      content: {
        type: "text" as const,
        text: "Before answering from memory, call ai-memory search_thoughts for project-scoped recall. Use search for ChatGPT-compatible semantic lookup, list_thoughts for recent entries, and fetch when you already have a thought id.",
      },
    }],
  }),
);
```

### Boilerplate: Minimal Resource

Add this below the prompt registration in `server/index.ts` during Task 4.2:

```ts
const SERVER_INFO_RESOURCE_URI = "ai-memory://server-info";

server.registerResource(
  "server-info",
  SERVER_INFO_RESOURCE_URI,
  {
    title: "AI Memory Server Info",
    description: "Safe static MCP compatibility metadata for ai-memory clients.",
    mimeType: "application/json",
  },
  (uri) => ({
    contents: [{
      uri: uri.toString(),
      mimeType: "application/json",
      text: JSON.stringify({
        name: "ai-memory",
        version: "0.1.0",
        protocolSurfaces: ["tools", "prompts", "resources"],
        promptNames: ["memory_search_guidance"],
        resourceUris: [SERVER_INFO_RESOURCE_URI],
        toolNames: [
          "search",
          "fetch",
          "search_thoughts",
          "capture_thought",
          "list_thoughts",
          "thought_stats",
          "graph_traverse",
          "graph_search",
          "consolidate",
        ],
      }, null, 2),
    }],
  }),
);
```

---

## §4. Task Definitions

### Task 4.1: Add red protocol compatibility tests

**Objective:** Add failing tests that reproduce the OpenCode-style prompt/resource probes and protect existing tool behavior.

**Input:** `server/tests/_helpers/mcpClient.ts`, existing `server/tests/*.test.ts` style.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Edit `server/tests/_helpers/mcpClient.ts` and add the `mcpRequest(method, params = {})` helper from §3 after `mcpCall`.
2. Keep `mcpCall`, `extractText`, and `sleep` unchanged.
3. Create `server/tests/mcp-protocol-compat.test.ts`.
4. In the new test file, import `assert`, `assertArrayIncludes`, `assertEquals`, `assertExists`, `assertStringIncludes`, and `assertNotEquals` from Deno std asserts following the style already used in the repo.
5. Import `extractText`, `mcpCall`, and `mcpRequest` from `./_helpers/mcpClient.ts`.
6. Add a helper function in the test file:

   ```ts
   function errorCode(response: unknown): number | undefined {
     return (response as { error?: { code?: number } }).error?.code;
   }
   ```

7. Add test `initialize advertises tools prompts and resources`:
   - Call `mcpRequest("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "st-057-test", version: "0.1" } })`.
   - Assert `result.capabilities.tools`, `result.capabilities.prompts`, and `result.capabilities.resources` exist.
8. Add test `prompts/list and prompts/get are compatible`:
   - Call `mcpRequest("prompts/list")` and assert `errorCode(response) !== -32601`.
   - Assert `result.prompts` is an array and includes a prompt named `memory_search_guidance`.
   - Call `mcpRequest("prompts/get", { name: "memory_search_guidance" })` and assert it has at least one message whose content text includes `search_thoughts`.
   - Call `mcpRequest("prompts/get", { name: "does_not_exist" })` and assert it has an error but `error.code !== -32601`.
9. Add test `resources/list templates and read are compatible`:
   - Call `mcpRequest("resources/list")` and assert `errorCode(response) !== -32601`.
   - Assert `result.resources` includes `uri: "ai-memory://server-info"`.
   - Call `mcpRequest("resources/templates/list")` and assert `errorCode(response) !== -32601` and `result.resourceTemplates` is an array.
   - Call `mcpRequest("resources/read", { uri: "ai-memory://server-info" })` and assert first content has `mimeType: "application/json"`; parse `text` as JSON and assert it contains `name: "ai-memory"` and `promptNames` containing `memory_search_guidance`.
   - Assert the raw text does not include `MEMORY_API_KEY`, `OPENROUTER_API_KEY`, `DB_PASSWORD`, or `DATABASE_URL`.
   - Call `mcpRequest("resources/read", { uri: "ai-memory://missing" })` and assert it has an error but `error.code !== -32601`.
10. Add test `ping and existing tools remain compatible`:
    - Call `mcpRequest("ping")` and assert no error.
    - Call `mcpRequest("tools/list")` and assert returned tool names include `thought_stats` and `search_thoughts`.
    - Call `mcpCall("thought_stats", {})`, extract text with `extractText`, and assert it contains `Total active thoughts:`.

**Expected output:** `server/tests/_helpers/mcpClient.ts` has a raw request helper; `server/tests/mcp-protocol-compat.test.ts` exists and fails before Task 4.2 because prompt/resource methods are missing.

**Requirement mapping:** All §2d rows except README and cross-model review.

**Verification:**

```powershell
docker compose --profile test up -d
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/mcp-protocol-compat.test.ts
```

Expected result before Task 4.2: test command fails with assertions showing missing `prompts`/`resources` capability or `-32601` for prompt/resource methods. This red failure is the expected TDD checkpoint.

**Failure handling:** If the test cannot reach `/mcp`, run `docker compose --profile test ps` and `curl http://localhost:3001/health` from the host. Do not edit production code until the red failure is specifically about protocol compatibility rather than server availability.

---

### Task 4.2: Register minimal prompt and static resource

**Objective:** Use first-class MCP SDK APIs to expose a useful prompt and a safe static resource so prompt/resource probes no longer return method-not-found.

**Input:** `server/index.ts`, boilerplate in §3.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Edit `server/index.ts`.
2. Immediately after `const server = new McpServer({ name: "ai-memory", version: "0.1.0" });`, insert the minimal prompt boilerplate from §3.
3. Immediately after the prompt registration, insert the minimal resource boilerplate from §3.
4. Keep existing tool registrations unchanged.
5. Do not add database reads, environment reads, or secret values to the resource callback.
6. Do not add resource templates or subscribe behavior in this story.

**Expected output:** `server/index.ts` registers `memory_search_guidance` and `ai-memory://server-info` before registering tools. SDK-generated handlers should make `prompts/list`, `prompts/get`, `resources/list`, `resources/templates/list`, and `resources/read` available.

**Requirement mapping:** Prompt compatibility, resource compatibility, protocol audit chosen implementation, existing tools unchanged.

**Verification:**

```powershell
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/mcp-protocol-compat.test.ts
docker compose --profile test exec mcp-test deno check index.ts tests/mcp-protocol-compat.test.ts
```

Expected result: the focused compatibility test passes; `deno check` reports no TypeScript errors.

**Failure handling:** If `registerPrompt` or `registerResource` does not type-check despite the SDK source evidence in §1, stop and set the story to `blocked_by: plan-review`; do not invent a low-level request-handler shim during execution.

---

### Task 4.3: Document client troubleshooting distinction

**Objective:** Update README client troubleshooting so future operators separate ai-memory protocol compatibility from OpenCode model/plugin errors.

**Input:** `README.md` client connection section.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Edit `README.md` in the "Connecting Clients" / verification area.
2. Add a short subsection titled `#### Client troubleshooting` after the existing raw HTTP `406` note.
3. Include these exact facts in concise prose:
   - `MCP error -32601` on `prompts/list` or `resources/list` means a client probed an MCP method the server did not implement; after ST-057, `prompts/list`, `resources/list`, and `resources/templates/list` are compatibility-safe.
   - `ProviderModelNotFoundError` is an OpenCode provider/model configuration problem, not an ai-memory MCP server error.
   - `@opencode-ai/plugin@local` install failure is an OpenCode plugin/dependency configuration problem, not an ai-memory MCP server error.
4. Keep this section operational and avoid promising that ai-memory fixes OpenCode provider/plugin setup.

**Expected output:** README contains a client troubleshooting subsection with the three exact diagnostic strings.

**Requirement mapping:** README troubleshooting row in §2d.

**Verification:**

```powershell
Select-String -Path README.md -Pattern 'Client troubleshooting','MCP error -32601','ProviderModelNotFoundError','@opencode-ai/plugin@local'
```

Expected result: all four patterns are found.

**Failure handling:** If README structure has drifted, place the subsection near the raw HTTP verification snippet and record the placement in §6b.

---

### Task 4.4: Run full server verification

**Objective:** Prove the focused compatibility changes do not regress the server test suite.

**Input:** Completed Tasks 4.1 through 4.3.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Ensure the test stack is running:

   ```powershell
   docker compose --profile test up -d
   ```

2. Run the full Deno server test suite inside `mcp-test`:

   ```powershell
   docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/
   ```

3. If the full suite fails, inspect whether the failure is caused by ST-057 changes:
   - If caused by ST-057, fix the implementation or tests and rerun.
   - If unrelated and pre-existing, capture the failing test names and error snippets in §6b and continue only if focused ST-057 tests still pass.
4. Run a raw protocol smoke check against the dev MCP service if it is running, otherwise skip and record why:

   ```powershell
   $apiKey = [Environment]::GetEnvironmentVariable('MEMORY_API_KEY','User')
   if ($apiKey) {
     $headers = @{ Authorization = ('Bearer ' + $apiKey); Accept = 'application/json, text/event-stream' }
     $body = '{"jsonrpc":"2.0","id":1,"method":"prompts/list","params":{}}'
     Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/mcp' -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 10
   }
   ```

**Expected output:** Full server tests pass or unrelated failures are documented; focused protocol smoke confirms `prompts/list` no longer returns method-not-found when dev service is available.

**Requirement mapping:** Full suite AC, OpenCode-style probe ACs, existing tool regression AC.

**Verification:** Commands in steps 2 and 4.

**Failure handling:** Do not mark the story complete if `tests/mcp-protocol-compat.test.ts` fails. If only the optional dev smoke fails because the dev stack is not running or `MEMORY_API_KEY` is absent, record that as a skipped optional smoke with evidence; the containerized test suite remains authoritative.

---

### Task 4.5: Cross-model review and closeout

**Objective:** Get independent review of the implementation against this ExecPlan, then move the story to Review only if the review passes.

**Input:** Completed implementation and verification results from Tasks 4.1 through 4.4.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Request a cross-model critical review using a different model than the executor. Provide the reviewer:
   - `.github/planning/execplans/exec-plan-ST-057.md`
   - `server/index.ts`
   - `server/tests/_helpers/mcpClient.ts`
   - `server/tests/mcp-protocol-compat.test.ts`
   - `README.md`
   - Full test output from Task 4.4
2. Ask the reviewer to check:
   - Do tests prove prompt/resource methods exist rather than merely avoiding thrown HTTP errors?
   - Does the implementation use SDK first-class APIs and avoid transport shims?
   - Does `ai-memory://server-info` avoid secrets and database/environment exposure?
   - Are unknown prompt/resource names rejected with a method-specific error rather than `-32601`?
   - Is existing `tools/list` / `tools/call` behavior preserved?
3. If the review finds contract defects, fix them and rerun focused and full verification.
4. Record the review verdict and any fixes in §6c.
5. Update §1b Outcomes & Conclusions with completion status, key achievements, requirements met/unmet, architectural impact, supporting evidence, and downstream changes.
6. Move ST-057 from Backlog to Review in `.github/planning/story-board.md` only after review passes.

**Expected output:** Cross-model review PASS recorded in §6c; §1b populated; board moved to Review.

**Requirement mapping:** Cross-model review gate and closeout governance.

**Verification:**

```powershell
Select-String -Path .github/planning/execplans/exec-plan-ST-057.md -Pattern 'PASS','completion status:', 'requirements met vs unmet:'
Select-String -Path .github/planning/story-board.md -Pattern '## Review','ST-057: MCP compatibility hardening'
```

Expected result: review verdict and outcome fields are present; board contains ST-057 under Review.

**Failure handling:** If review cannot be obtained in the session, do not move the story to Review. Leave §5b Current Resume State pointing at Task 4.5 and record the blocker.

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
| **Next task** | Task 4.1 — Add red protocol compatibility tests |
| **Known blockers** | None |
| **Last updated** | 2026-06-05 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-06-05 | Planning | ExecPlan drafted | `.github/planning/execplans/exec-plan-ST-057.md` | PO review |
| 2026-06-05 | Planning | Approved by PO | Status set to Ready for `/continue` | Task 4.1 |

### Avoidance

- 2026-06-05: Do not implement ST-057 with a low-level Streamable HTTP or Hono middleware shim unless `/plan` is reopened. The pinned SDK exposes `registerPrompt` and `registerResource`; use those first-class APIs to avoid protocol drift.
- 2026-06-05: Do not expose thought rows as MCP resources in this story. That would create a new read API surface and should be planned separately.

---

## §5c. Approach Ledger

### Approach Registry

| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Register one minimal prompt and one static resource with first-class SDK APIs | Revert `server/index.ts`, `server/tests/_helpers/mcpClient.ts`, `server/tests/mcp-protocol-compat.test.ts`, README changes | 🟢 Active |
| 2 | Empty-list compatibility handlers with low-level request handlers | Not approved in this ExecPlan | ⬜ Reserve only after plan-review |

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

- Decision: Use first-class `McpServer.registerPrompt` and `McpServer.registerResource` instead of low-level request handlers.
  Rationale: The pinned SDK exposes these APIs, and using them lets the SDK own capabilities and method handlers.
  Date: 2026-06-05
- Decision: Provide one minimal prompt and one static server-info resource instead of trying to expose empty lists only.
  Rationale: Registering real entries initializes prompt/resource handlers through public APIs, gives probing clients useful safe metadata, and avoids creating a new data access API.
  Date: 2026-06-05
- Decision: Do not expose thought rows as MCP resources in ST-057.
  Rationale: Thought resources would be a product/API surface change beyond compatibility hardening.
  Date: 2026-06-05

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

(Use this section for retrospective depth only. The primary at-a-glance outcomes summary belongs in §1b.)

Achieved: —
Remains: —
Lesson: —

---

## Revision Notes

- 2026-06-05: Initial Phase 2 ExecPlan draft from `QP-057-mcp-compatibility-hardening.md`.
- 2026-06-05: PO approved ExecPlan; marked Ready for `/continue`.