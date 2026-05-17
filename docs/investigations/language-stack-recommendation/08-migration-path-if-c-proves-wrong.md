## 8. Migration Path (If C# Proves Wrong)

If for any reason C# doesn't work out, here's the escape hatch:

### Fallback: TypeScript / Node.js

**When to trigger migration:**
- The C# MCP SDK has a critical bug that isn't fixed within 2 weeks
- A TypeScript-only MCP feature is needed that the C# SDK can't provide
- The team composition changes and new members are TypeScript-native

**Migration strategy:**
1. The domain logic (memory operations, search ranking) is in `AiMemory.Core` — this is pure logic that translates to any language
2. The REST API shape (routes, request/response models) stays identical — clients don't notice
3. Replace MCP server implementation with `@modelcontextprotocol/server`
4. Replace SQLite access with `better-sqlite3`
5. Estimated effort: 1–2 weeks for a clean port (the service is intentionally small)

**Why TypeScript and not Python:**
- TypeScript's type system is closer to C# thinking
- The MCP ecosystem is TypeScript-dominant, so maximum community support
- Better Windows deployment story than Python (though still worse than .NET)

---

