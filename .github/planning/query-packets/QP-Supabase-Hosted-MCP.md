# QP-Supabase-Hosted-MCP — Query Packet

**Date:** 2026-05-15  
**Source:** PO request during contextual scoping investigation session  
**Status:** Pending — awaiting PO decision to open as spike story

---

## Question

Should the ai-memory MCP server be deployable as a hosted online service (in addition to local-first) to enable integration with SaaS chat platforms (Claude.ai, GitHub Copilot chat, Zed AI, Cursor)?

Supabase has been named as the candidate platform. The investigation should determine whether "Supabase-hosted MCP" means storage-on-Supabase, Edge-Functions-as-MCP, or Supabase-auth-and-RLS — and which (if any) aligns with the existing architecture.

---

## Background

The current design is local-first: localhost REST binding (NFR-L3), stdio + HTTP/StreamableHTTP MCP transports (FR-MCP-005), SQLite storage (ADR-002). A hosted deployment would enable:

- Agent memory persistence across machines and chat sessions
- Team-shared memory contexts (multi-user)
- Zero-install AI agent integration
- Brain-in-the-cloud accessible from any device

ADR-002 already documents PostgreSQL/Supabase as a first-class storage upgrade path. This investigation extends the question from "storage" to "full hosting platform."

---

## Three Interpretations of "Supabase MCP Hosting"

1. **Storage-on-Supabase + MCP server elsewhere:** Supabase provides PostgreSQL + pgvector (storage backend switch per ADR-002). The C#/.NET MCP server deploys to Azure Container Apps / Fly.io / Render with a public HTTPS endpoint. Supabase = database only.

2. **Supabase Edge Functions as MCP handler:** MCP tool handlers reimplemented as Supabase Edge Functions (Deno/TypeScript). Core service logic requires porting or a JSON-over-HTTP bridge to the C# backend.

3. **Supabase Realtime + Row-Level Security:** C# server connects to Supabase PostgreSQL. Supabase handles auth (JWT/anon keys), multi-tenancy (RLS policies), and Realtime for view push notifications.

---

## Evaluation Dimensions

| Dimension | Questions |
|-----------|----------|
| **Architecture fit** | Which interpretation (1/2/3) aligns with ADR-002 (IMemoryStore), ADR-004 (MCP facade over C# service), and ADR-008 (ambient context)? Which requires fewest ADR revisions? |
| **MCP transport** | Does the ModelContextProtocol C# SDK StreamableHTTP transport work as a public HTTPS endpoint? What changes for public-internet MCP: auth headers, CORS, rate limiting? |
| **Authentication** | NFR-L4 says no auth in v1.0 single-user local mode. What auth model for hosted MCP: API key, OAuth, Supabase anon key? Interaction with per-project memory isolation and WIP-limit-per-profile? |
| **Cost** | NFR-C2 hard ceiling is €10/month. Supabase free: 500 MB DB, 1 GB storage, 2M Edge invocations/month. Supabase Pro: $25/month (over ceiling). Does the ceiling need renegotiation for hosted? |
| **Multi-tenancy** | Hosted = multiple users. Current design has no user identity. Isolation options: one project per user, RLS with user_id column, separate schema per user? |
| **Local + hosted hybrid** | Can both coexist? Local SQLite ($0/month offline) + optional Supabase mirror for online access. Sync model? Overcomplicated for v1.0? |
| **Chat platform mechanics** | How do Claude.ai, GitHub Copilot, Cursor connect to remote MCP servers? URL/handshake format? Does StreamableHTTP satisfy requirements or are there protocol differences? |
| **Delivery impact** | New story (ST-021?) and new ADR (ADR-009?)? Additive to Phase 3 (after ST-007) or Phase 6+? |

---

## Reference Material

| Document | What it covers |
|----------|---------------|
| `docs/design/adr/ADR-002-storage-backend.md` | PostgreSQL/Supabase upgrade path, IMemoryStore abstraction, migration triggers |
| `docs/design/adr/ADR-004-interface-design.md` | MCP facade design, dual transport (stdio + HTTP), shared DI container |
| `docs/design/adr/ADR-008-context-scoping.md` | Ambient context via AsyncLocal; stateless server requirement |
| `docs/requirements/SRS.md` §6 NFR-L3, NFR-L4 | Localhost binding, no auth in v1.0 |
| `docs/requirements/SRS.md` §6 NFR-C1, NFR-C2 | €0 baseline, €10/month hard ceiling |
| `docs/design/SystemDesign.md` §1 | Transport layer diagram (MCP HTTP/StreamableHTTP shown) |

### External References (for investigation phase)

- Supabase Edge Functions: `https://supabase.com/docs/guides/functions`
- Supabase MCP server (reference, not ai-memory): `https://supabase.com/docs/guides/getting-started/mcp`
- MCP StreamableHTTP spec: `https://modelcontextprotocol.io/docs/concepts/transports`
- GitHub Copilot remote MCP: `https://docs.github.com/en/copilot/using-github-copilot/using-extensions/using-github-copilot-extensions`
