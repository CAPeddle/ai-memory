## §6b — Surprises & Discoveries

1. **OB1 already has FTS.** `schemas/enhanced-thoughts/schema.sql` contains a `search_thoughts_text()` PostgreSQL function with `websearch_to_tsquery` + ILIKE fallback and importance/quality weighting in the rank formula. The implementation story should extend this function with the vector RRF lane rather than building BM25 from scratch.

2. **OB1 auth uses `x-brain-key` header.** Not `Authorization: Bearer`. Our ADR-010 specifies `Authorization: Bearer` which is more standard. The fork replaces OB1's auth pattern entirely with `requireApiKey()` from `server/src/auth.ts`.

3. **OB1's MCP SDK version uses `registerTool`, not `server.tool`.** The `@modelcontextprotocol/sdk@1.24.3` API surface uses `registerTool(name, definition, handler)` with `inputSchema` as a Zod object (not `z.object(...)`). This differs from the ADR code samples which used `server.tool()`. The fork uses `registerTool` to match OB1's working pattern.

4. **AGE requires per-session `LOAD 'age'`.** The `SET search_path` and `LOAD 'age'` commands must be issued at the start of every database session that runs `cypher()`. The init SQL sets the default, but runtime queries need these commands in the same statement block. The `graph_traverse` tool handles this via `sql.unsafe()` with a multi-statement prefix.

5. **`StreamableHTTPServerTransport` vs `StreamableHTTPTransport`.** OB1 uses `@hono/mcp`'s `StreamableHTTPTransport`. The `@modelcontextprotocol/sdk` directly exports `StreamableHTTPServerTransport`. The fork uses the SDK directly (no `@hono/mcp` dependency), keeping the dependency tree simpler.

6. **Corporate SSL proxy blocks `git clone` inside Docker.** A Fortinet HTTPS-intercepting proxy on the host injects its own CA certificate for HTTPS connections. `git clone https://github.com/...` inside a Docker build fails with `SSL: certificate verify failed`. The solution is to download release tarballs on the Windows host (where the proxy CA is trusted) and `COPY` them into the image. This pattern applies to any `git clone` or `curl` call inside a Dockerfile on a corporate network with SSL inspection.

7. **AGE `v1.7.0` tag does not exist for PostgreSQL 15.** The `--branch v1.7.0` git clone (and the v1.7.0 tarball URL) return 404 for PG15. AGE v1.7.0 was released only for PG17 and PG18. The correct latest stable tag for PG15 is `PG15/v1.6.0-rc0`. Version lookup: <https://github.com/apache/age/tags> filtered to `PG15/`.

8. **AGE v1.6.0 does not support `|` in relationship type selectors.** The `[:LIKES|INTERESTED_IN*1..3]` syntax produces a parse error in AGE v1.6.0. This feature was added in AGE v1.7.0 (PG17+ only). The workaround is explicit chained MATCH clauses for each relationship type. This is documented in §R6 and confirmed functional: the explicit MATCH chain returns the expected `flowers` result.

---

