---
name: "ADR-008: Request-Scoped Context Propagation"
summary: "Introduce request-scoped context (Deno request lifecycle) to flow project/profile/entity scope through MCP tool handlers without per-parameter repetition"
asset_type: "adr"
status: "revised"
version: "2.0"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-008-context-scoping.md"
created: "2026-05-15"
revised: "2026-05-16"
---

# ADR-008: Request-Scoped Context Propagation

**Date:** 2026-05-15 | **Revised:** 2026-05-16  
**Status:** Revised  
**Deciders:** PO  
**Category:** Interface Design / Service Architecture

---

## Context

The original decision (v1.0) introduced request-scoped ambient context via `AsyncLocal<T>` and ASP.NET Core middleware in C#. The cloud server is now a TypeScript/Deno process (ADR-001); `AsyncLocal` and ASP.NET Core do not apply.

The conceptual model is identical:
- An optional `context` parameter on MCP tools carries scope metadata (project, profile, entity)
- Tool handlers propagate this context to service functions before delegating
- Requests without context behave identically to requests with no scope constraint (backward compatible)

The implementation changes to use Deno's request lifecycle and TypeScript parameter passing in place of `AsyncLocal`.

---

## Decision

### Context is an explicit parameter propagated through tool handlers

In Deno, there is no built-in `AsyncLocal` equivalent for HTTP request handlers. Context scope is propagated explicitly as a parameter from the MCP tool handler down to service functions. This is simpler than the C# ambient scope pattern and equally effective for a single-process server.

```typescript
// Context type (TypeScript equivalent of C# ContextScope)
interface ContextScope {
  projects?: string[];          // project slugs; first entry is primary for boosting
  profile?: 'professional' | 'personal';
  entities?: string[];          // entity pre-filter hints
  visibility?: 'prefer' | 'exclusive' | 'cross-only';  // default: 'prefer'
  sourceStoryId?: string;       // story that established this context
}

function parseContext(raw: string | undefined): ContextScope | null {
  if (!raw) return null;
  // "project:zoom,profile:professional" → { projects: ['zoom'], profile: 'professional' }
  // "project:zoom;bcf-managers,entity:CMake" → { projects: ['zoom','bcf-managers'], entities: ['CMake'] }
  const scope: Partial<ContextScope> = {};
  for (const pair of raw.split(',')) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx === -1) continue;
    const k = pair.slice(0, colonIdx).trim();
    const v = pair.slice(colonIdx + 1).trim();
    if (k === 'project')    scope.projects   = v.split(';');
    else if (k === 'entity')     scope.entities   = v.split(';');
    else if (k === 'profile')    scope.profile    = v as ContextScope['profile'];
    else if (k === 'visibility') scope.visibility = v as ContextScope['visibility'];
  }
  return scope as ContextScope;
}
```

### MCP tool integration

```typescript
server.tool(
  'search_thoughts',
  { query: z.string(), context: z.string().optional(), limit: z.number().default(10) },
  async ({ query, context, limit }) => {
    const scope = parseContext(context);
    const results = await searchThoughts(query, scope, limit);
    return { content: [{ type: 'text', text: formatResults(results) }] };
  }
);
```

### Service function signature

```typescript
async function searchThoughts(
  query: string,
  scope: ContextScope | null,
  limit: number
): Promise<ThoughtResult[]> {
  const project = scope?.projects?.[0] ?? null;
  const profile = scope?.profile ?? null;
  // BM25 + vector search with optional WHERE project = $project
}
```

### Priority precedence (unchanged)

1. Explicit parameter override (passed directly to service function)
2. Context parameter on MCP tool call
3. Null / global (no constraint)

### Tools that accept `context` parameter

| Tool | Context use |
|------|------------|
| `search_thoughts` | Project boost + entity pre-filter |
| `capture_thought` | Project/profile assignment on write |
| `list_thoughts` | Project filter |
| `story_list` | Profile filter |
| `story_claim` | Returns resolved context in response |
| `consolidate` | Project-scoped consolidation run |

### `story_claim` context inheritance

When a story is claimed, the response includes the resolved context string so the agent can pass it forward to subsequent tool calls:

```typescript
server.tool('story_claim', { storyId: z.string() }, async ({ storyId }) => {
  const story = await claimStory(storyId);
  const ctx = `project:${story.project},profile:${story.profile}`;
  return {
    content: [{
      type: 'text',
      text: `Story claimed: ${story.title}\ncontext: ${ctx}`
    }]
  };
});
```

### Context header format (unchanged for cross-platform compatibility)

| Format | Example | Parsed result |
|--------|---------|---------------|
| Single project | `project:zoom,profile:professional` | `projects: ['zoom'], profile: 'professional'` |
| Multiple projects | `project:zoom;bcf-managers,profile:professional` | `projects: ['zoom','bcf-managers']` — semicolon-delimited |
| Entity scope | `project:zoom,entity:CMake` | `entities: ['CMake']` — `entity` key maps to `entities[]`; semicolon-delimited for multiple |

---

## Consequences

### Positive
- Explicit parameter propagation is idiomatic in Deno/TypeScript; no hidden ambient scope surprises
- Simpler than `AsyncLocal` — no scope stack, no disposal pattern, no thread-safety considerations
- All context propagation is visible in the call chain; easier to trace and test
- Backward compatible: tools without `context` parameter behave identically (scope = null = global)

### Negative / Trade-offs
- Service functions carry an extra `scope` parameter in every signature; slightly more verbose than ambient injection
- No automatic propagation across async boundaries — each nested service call must receive scope explicitly. Acceptable given the shallow call depth of MCP tool handlers.

---

## Alternatives Considered

| Alternative | Reason Not Chosen |
|-------------|-----------------|
| **AsyncLocal + middleware (original C# design)** | Superseded by TypeScript/Deno server; no equivalent built-in in Deno |
| **Deno `AsyncLocalStorage`** | Available in Deno's Node.js compatibility layer but adds complexity for minimal benefit over explicit parameter passing at this call depth |
| **Server-side session state** | Requires session affinity and TTL management; stateless design preferred |
| **Context in MCP Resource metadata** | Resources provide passive context injection; scope is a query-time concept, not resource content |

---

## ADR Relationships

| ADR | Relationship |
|-----|-------------|
| [ADR-004](ADR-004-interface-design.md) | Extended — `context` parameter added to all relevant MCP tools |
| [ADR-003](ADR-003-hybrid-search.md) | Compatible — scope is resolved before calling search functions; no change to search algorithm |
| [ADR-005](ADR-005-memory-model.md) | Compatible — context is query-time only; no schema changes required |
| [ADR-006](ADR-006-views-architecture.md) | Compatible — `story_claim` returns context metadata; no view layer changes |

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-05-15 | Initial — AsyncLocal + ASP.NET Core middleware; C# ContextScope record; X-AI-Memory-Context HTTP header |
| 2.0 | 2026-05-16 | Revised — Explicit parameter propagation in TypeScript/Deno; AsyncLocal replaced by explicit scope passing; C# implementation samples replaced by TypeScript; concept and tool surface unchanged |
