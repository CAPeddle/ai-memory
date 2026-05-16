---
name: "ADR-010: Authentication"
asset_type: "adr"
status: "accepted"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-010-authentication.md"
created: "2026-05-16"
---

# ADR-010: Authentication

**Status:** Accepted  
**Date:** 2026-05-16  
**Deciders:** PO (sole maintainer)

---

## Context

The original SRS (NFR-L4) stated "no authentication in v1.0" on the basis that the server bound to localhost and was therefore not reachable from the public internet. The architecture has changed to a publicly accessible HTTPS endpoint (ADR-009). Without authentication, any caller who discovers the URL can read and write memories.

Requirements for the authentication model:
- Single user (sole maintainer)
- Multiple callers: Claude.ai, ChatGPT, Google Gemini, GitHub Copilot, Cursor, local synthesis service
- Simple to configure once per platform (copy-paste a key into settings)
- No user accounts, no OAuth flows, no per-platform identity
- Consistent with how OB1 handles authentication (shared key pattern)

---

## Decision

### Shared API key as Bearer token

A single API key is generated at deployment time and configured as a Bearer token on all callers. The Deno MCP server validates the key on every request before processing any tool call.

**Server-side validation (Deno middleware):**

```typescript
function requireApiKey(req: Request): Response | null {
  const auth = req.headers.get('Authorization');
  const key = Deno.env.get('MEMORY_API_KEY');
  if (!auth || auth !== `Bearer ${key}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;  // proceed
}
```

**Caller configuration (per platform):**

Each AI chat platform that supports remote MCP servers accepts a URL and optional auth headers. The configuration is:

```
MCP Server URL:  https://<host>/mcp
Authorization:   Bearer <MEMORY_API_KEY>
```

This is set once in each platform's settings. The same key is used across all platforms.

### Key generation

The API key is a cryptographically random string generated at first deployment:

```bash
openssl rand -hex 32
# or
deno eval "console.log(crypto.randomUUID().replace(/-/g,''))"
```

Stored as `MEMORY_API_KEY` in the Docker environment (`.env` file on the host, never committed to the repository).

### Rotation

Key rotation requires:
1. Generate a new key
2. Update `MEMORY_API_KEY` in the Docker environment and restart the container
3. Update the key in each chat platform's MCP settings

Single-user rotation is low-friction; no coordination with other users required.

---

## Consequences

### Positive
- Zero configuration complexity: one key, copy-paste into each platform once
- Consistent with OB1's shared key pattern; familiar to developers who have used OB1
- No OAuth server, no JWKS endpoint, no token refresh — nothing to maintain
- The Deno middleware is 5 lines; minimal attack surface

### Negative / Trade-offs
- A single shared key means all platforms have equal access; revoking one platform requires rotating the key for all of them. Acceptable for single-user personal use.
- The key is a static secret; rotation is a manual step. Acceptable given low rotation frequency for a personal tool.
- If the key is leaked (e.g., accidentally committed to a public repo), all memories are exposed. Mitigation: key is in `.env` file, which is in `.gitignore`.

---

## Alternatives Considered

| Alternative | Why Not Chosen |
|-------------|---------------|
| **No authentication (original v1.0 design)** | Server is now on the public internet; unauthenticated access to personal memories is unacceptable |
| **Per-platform API keys** | Adds key management complexity with no security benefit for a single user; rotation would require updating each platform independently for no gain |
| **OAuth 2.0 / OIDC** | Significant infrastructure overhead (auth server or third-party identity provider); wildly over-engineered for single-user personal tool |
| **Supabase JWT / anon key** | Supabase managed is not used; the server is a self-hosted Deno process; Supabase auth is not available |
| **mTLS** | Requires certificate management on both client and server; all target chat platforms use Bearer tokens, not client certificates |

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-05-16 | Initial — shared API key as Bearer token; single key across all platforms; Deno middleware validation |
