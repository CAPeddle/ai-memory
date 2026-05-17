### 4.1 TypeScript / Node.js

**Strengths for ai-memory:**
- Largest MCP ecosystem by far — the reference Memory server is literally TypeScript
- Rich npm packages for text processing (natural, compromise, lunr)
- Express/Fastify for REST; excellent ergonomics
- `better-sqlite3` is mature and fast; `pg` driver is battle-tested
- Hot-reload development with `tsx` or `nodemon` enables fast iteration

**Weaknesses for ai-memory:**
- **Team doesn't know it well.** The team's expertise is C++/C# — picking up TypeScript for a side project adds cognitive load and slows initial development.
- Node.js single-threaded model requires care for CPU-intensive text processing
- Less natural type safety than C# (TypeScript types are erased at runtime)
- Windows service deployment requires extra tooling (pm2, node-windows, or NSSM)

**Verdict**: Would be the default choice *if the team were polyglot or TypeScript-native*. For this team, it's a viable fallback but not the natural first choice.

