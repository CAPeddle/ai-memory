# Bootstrap: Contact Memory Parser — Implementation Session
**Origin:** Claude.ai architecture + decision session, 2026-06-26  
**Destination:** Claude Code, ai-memory project  
**Prerequisite:** PR #18 (ADR-012 tags migration) merged to main  
**Purpose:** Orient a fresh agent session with all decisions locked and immediate implementation direction

---

## One-Line Orientation

> We are building the Contact Memory parser — a supplier-agnostic WhatsApp extraction pipeline in TypeScript/Deno, structured as a shared module consumed by both a Supabase Edge Function (production path from Android) and a local CLI wrapper (development/testing path). Design the shared module and agentic runtime interface first. The Edge Function and CLI are thin shells around both.

---

## All Prior Decisions (Do Not Re-Open)

These are locked. Do not re-evaluate them.

**Platform:**
- AI Memory is a single-tier append-only shard platform. No wiki tier at platform level.
- Tags (`string[]`) replace the binary `profile` field. ADR-012 is implemented and merged (PR #18).
- Per-product MCP servers. Platform MCP exposes raw primitives. Contact MCP exposes domain tools.

**Contact Memory product:**
- WhatsApp parser output commits via `memory_teach` (bypasses consolidation pipeline).
- Human review gate is product-layer, not platform-layer.
- Android app is a thin client. No agent gateway between app and product.
- Supplier-agnostic agentic runtime lives inside the Contact Memory product layer.

**Parser language: TypeScript / Deno — final.**  
Rationale:
1. The Android app is the WhatsApp export point. Parsing must run server-side (Edge Function), not on a laptop CLI. TypeScript/Deno promotes directly to Supabase Edge Functions without rewriting.
2. Extraction prompt iteration is short-term; the script settles. Don't optimise for it.
3. This is an agent-driven project. Language consistency with the existing TypeScript platform is a project requirement.

**Deployment:**
- Local dev: `supabase start` + `deno serve`
- Production: Supabase Edge Functions
- Storage: Postgres + pgvector + Supabase Storage (WhatsApp `.txt` files)

---

## Architecture: Contact Memory Parser

### Production path (Android)
```
Android selects .txt export
       ↓
Supabase Edge Function (Deno)
  → WhatsApp format parser (pure TypeScript, no AI dependency)
  → Agentic runtime (supplier-agnostic) with extraction prompt
  → Configured AI provider returns structured extraction
  → Edge Function returns extraction to Android for review
       ↓
Android displays review UI (approve / edit / reject per item)
       ↓
Android confirms → Edge Function commits via memory_teach
```

### Development path (local)
```
CLI selects local .txt file
  → Same shared parser module
  → Same agentic runtime (provider from local config)
  → Terminal displays review UI
  → Approval → calls memory_teach on local Supabase instance
```

### Module structure
```
contact-memory/
  parser/
    whatsapp.ts        ← WhatsApp format parser (pure, no AI dependency)
    extractor.ts       ← Extraction prompt + response schema
    types.ts           ← ContactExtraction, Shard, tag types (shared with platform)
  runtime/
    agent.ts           ← Supplier-agnostic invocation interface
    providers/         ← Adapters: Claude, OpenAI, OpenRouter
  functions/
    parse-chat/
      index.ts         ← Supabase Edge Function (thin shell: parser + runtime)
  cli/
    index.ts           ← Local CLI runner (thin shell: parser + runtime)
  tests/
    whatsapp.test.ts   ← Parser unit tests (format edge cases)
    extractor.test.ts  ← Extraction schema validation tests
    agent.test.ts      ← Runtime adapter contract tests
```

**Critical design constraint:** `extractor.ts` owns the prompt and response schema. `agent.ts` owns provider routing. Neither knows about the other's implementation. The Edge Function and CLI wire them together. This means extraction quality can be tested against different providers by swapping config only.

---

## Extraction Targets

What the agentic runtime must extract from a WhatsApp chat:

| Category | Examples |
|---|---|
| **Events / logistics** | Trip names, dates, locations, pickup/dropoff times |
| **Commitments** | What you promised, status (pending/completed/overdue), due dates |
| **Interests / preferences** | Hobbies, food preferences, schedule constraints, values |
| **Sentiment** | Per-snapshot tone (warm, neutral, strained, excited), trend |
| **Important dates** | Birthdays, anniversaries, recurring events |
| **Links shared** | URLs with context and date |
| **Metadata** | Date range of chat, contact frequency, conversation themes |

Extraction output must be structured (typed schema), not free-form markdown. The review UI renders it item by item.

---

## WhatsApp Format Notes

The parser must handle format variation — do not assume a single format. Known variants:

- Date formats vary by device locale: `[15/01/2025, 14:23:45]` vs `[1/15/2025, 2:23 PM]`
- Media messages: `<Media omitted>` or `‎image omitted`
- System messages: `Messages and calls are end-to-end encrypted`, `[Contact] was added`
- Multi-line messages (continuation lines have no timestamp prefix)
- Emoji and non-ASCII names in sender field
- Group chats vs 1:1 chats (Contact Memory focuses on 1:1 but parser should not crash on group format)

**Test investment goes here.** The parser module is the highest-risk component for edge cases. Write comprehensive tests before the extractor.

---

## Agentic Runtime Interface

The runtime is supplier-agnostic. The interface contract (not the implementation):

```typescript
interface AgentRuntime {
  invoke(prompt: string, schema: ExtractionSchema): Promise<ContactExtraction>
}
```

Providers (Claude, OpenAI, OpenRouter) implement this interface. The Edge Function and CLI receive a configured runtime instance — they do not know which provider is underneath.

Provider selection is configuration, not code. Local dev uses an env var to select the provider. Production uses Supabase secrets.

---

## Contact MCP Tool Definitions (First Spec Task)

These tools need to be specced before the Edge Function can be fully implemented. The parser's `memory_teach` calls will use the platform MCP primitives directly, but the Contact MCP layer will eventually expose:

| Tool | Inputs | Purpose |
|---|---|---|
| `get_contact_profile` | `contact_name: string` | Full profile for a contact |
| `search_commitments` | `contact?: string, status?: string` | Find matching commitments |
| `add_fact` | `contact_name: string, fact: string, tags: string[]` | Manual fact entry |
| `get_upcoming_dates` | `days: int` | Upcoming birthdays/events |

**For this session:** The parser implementation can proceed without the full Contact MCP being built — it calls `memory_teach` on the platform MCP directly. Contact MCP tool definitions can be specced in parallel or as the next story.

---

## Shard Schema for Contact Domain

Contact Memory shards use the platform `thoughts` table (post ADR-012) with these tags and provenance conventions:

**Tags:**
- `contact` — always present on contact domain shards
- `colleague` — add when contact is also a work collaborator  
- `contact:[name]` — namespaced tag for contact identity (e.g. `contact:rautie`)
- Additional domain tags as extracted (e.g. `commitment`, `event`, `sentiment`)

**Provenance fields (extend existing platform fields):**
- `source`: `whatsapp_export` | `manual` | `ai_session`
- `agent_context`: `cli` | `android` | `claude`
- `session_id`: chat date range (e.g. `2025-01-15_2026-06-25`)

---

## Immediate Session Agenda

Work through in this order:

### 1. Spec the shared parser module
- `types.ts` — define `ContactExtraction`, `CommitmentItem`, `EventItem`, `SentimentSnapshot`, `ImportantDate`, `SharedLink`
- `whatsapp.ts` — WhatsApp format parser spec (inputs, outputs, edge cases to handle)
- `extractor.ts` — extraction prompt design, response schema, Claude/provider call contract

### 2. Spec the agentic runtime interface
- `agent.ts` interface definition
- Provider adapter contract (what each adapter must implement)
- Configuration model (how provider is selected per environment)

### 3. Implement and test the parser module
- Implement `whatsapp.ts` with comprehensive tests first
- Implement `extractor.ts` with schema validation tests
- Implement `agent.ts` with at least one provider adapter (Claude/Anthropic)

### 4. Edge Function skeleton
- `functions/parse-chat/index.ts` as a thin shell
- Request: receives `.txt` file upload
- Response: returns `ContactExtraction` for review

### 5. CLI skeleton
- `cli/index.ts` as a thin shell
- Reads local `.txt` file, uses same modules, outputs review to terminal

---

## Deferred — Do Not Scope in This Session

- Android app UI implementation
- Contact MCP server implementation (can spec in parallel)
- Google Calendar integration
- `memory_teach` retry / error handling beyond basic
- Multi-provider switching UI
- Cross-contact search

---

## Skills Needed

### Priority 1 — Needed immediately
**Supabase Edge Functions (Deno)**  
Function structure, request/response handling, secrets management, local dev with `supabase functions serve`, deployment. Check project docs or https://supabase.com/docs/guides/functions.

**Anthropic SDK for Deno / TypeScript**  
Structured output / tool use for extraction schema enforcement. Check https://docs.anthropic.com/en/docs/build-with-claude/tool-use.

### Priority 2 — Needed for CLI
**Deno CLI patterns**  
`deno compile`, argument parsing (`@std/cli`), file reading, terminal output formatting.

### Check first in project
- `mcp-builder` skill — may exist at `/mnt/skills/examples/mcp-builder/SKILL.md`
- `architecture-fundamentals` — may exist at `/mnt/skills/user/architecture-fundamentals/SKILL.md`

---

## Key Files Already in the Project (Read Before Writing Code)

- `CLAUDE.md` — source-of-truth precedence and Contact Memory supersession map
- `docs/architecture/ai_memory_architecture_decisions.md` — all platform + product decisions
- `docs/design/adr/ADR-012-tags-replace-binary-profile.md` — tags schema (already implemented)
- `server/db/schema.sql` — current platform schema (post ADR-012)
- `server/src/parseContext.ts` — tag validation grammar (reuse in contact parser)
- `server/index.ts` — `capture_thought` and `memory_teach` patterns to follow

---

## Pre-existing Test Failures (Separate Track — Do Not Fix)

These failures exist in the full test suite and are unrelated to Contact Memory work:
- OpenRouter 401 Missing Authentication header
- Graph comment expectations
- Search quality / vector / MMR expectations
- Worker observability queue duplicate state

Do not attempt to fix these in this session.

