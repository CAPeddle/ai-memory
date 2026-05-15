---
name: "ADR-008: Request-Scoped Ambient Context Propagation"
summary: "Introduce request-scoped ambient context (AsyncLocal + ASP.NET Core middleware) to flow project/profile/entity scope through the service pipeline without per-parameter repetition"
asset_type: "adr"
status: "accepted"
version: "1.0"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-008-context-scoping.md"
created: "2026-05-15"
---

# ADR-008: Request-Scoped Ambient Context Propagation

**Date:** 2026-05-15  
**Status:** Accepted  
**Deciders:** PO  
**Category:** Interface Design / Service Architecture

---

## Context

The current design exposes search and retrieval operations that optionally accept `project`, `profile`, and entity scope parameters. Every call must specify these parameters independently; there is no mechanism to establish a session-level or request-level default scope.

This creates two problems identified in the contextual scoping investigation:

1. **Verbosity** — An agent operating in "zoom project / professional profile" context must repeat these parameters in every `memory_search`, `story_list`, memory ingest, and consolidation call. This violates the context-engineering principle of "Point, don't dump."

2. **No story → search context inheritance** — When an agent claims a story (transitioning it to `in-progress`), the story's `project` field is not automatically applied to subsequent searches. The agent must explicitly re-supply the project context.

Three statelessness-preserving options were evaluated:

| Option | Notes |
|--------|-------|
| A — Explicit per-request context parameter | Stateless; backward-compatible; but verbose and error-prone |
| B — Server-side MCP session state | Low token overhead; but requires session affinity and server-side state tracking |
| **C — Request-scoped ambient context (chosen)** | Stateless, backward-compatible, low token overhead, traceable via middleware |
| D — Entity-cluster scope | Semantically rich; but requires entity extraction pipeline; deferred to Phase 5 |

---

## Decision

Introduce **request-scoped ambient context** propagated via `AsyncLocal<T>` and ASP.NET Core middleware.

- **REST:** An optional `X-AI-Memory-Context` header carries scope metadata (project, profile, entity). Middleware extracts it and sets an `AsyncLocal` scope for the lifetime of that request.
- **MCP:** An optional `context` parameter on tools accepts a short scope string (e.g., `"project:zoom"`, `"profile:professional"`). Tool handlers set the ambient scope before delegating to the service layer.
- **Service layer:** All `IMemoryService`, `ISearchEngine`, and `IStoryboardService` methods resolve scope by priority: (1) explicit parameter override → (2) `AmbientContextScope.Current` → (3) null/global.

Context is request-scoped: it is created at request start and automatically cleaned up when the request completes. No server-side session tracking is required.

---

## Context Model

```csharp
/// <summary>
/// Scope context for a request or tool call. All fields are optional;
/// null means "no constraint" for that dimension.
/// </summary>
public record ContextScope
{
    /// <summary>
    /// Project slugs to constrain search and filtering toward.
    /// First entry is treated as "primary" project for boosting purposes.
    /// </summary>
    public string[]? Projects { get; init; }

    /// <summary>
    /// Profile to scope storyboard operations (professional | personal).
    /// </summary>
    public string? Profile { get; init; }

    /// <summary>
    /// Entity names or slugs to add as structural pre-filter candidates.
    /// </summary>
    public string[]? Entities { get; init; }

    /// <summary>
    /// Visibility policy for multi-project results.
    /// "prefer" = boost in-scope (default), "exclusive" = only in-scope, "cross-only" = exclude in-scope.
    /// </summary>
    public string Visibility { get; init; } = "prefer";

    /// <summary>
    /// Optional story ID that established this context. Used for story → search inheritance.
    /// </summary>
    public string? SourceStoryId { get; init; }
}
```

---

## Implementation Sketch

### Ambient Scope Manager

```csharp
public static class AmbientContextScope
{
    private static readonly AsyncLocal<ContextScope?> _current = new();

    public static ContextScope? Current => _current.Value;

    public static IDisposable Push(ContextScope scope)
    {
        var previous = _current.Value;
        _current.Value = scope;
        return new RestoreOnDispose(() => _current.Value = previous);
    }

    private sealed class RestoreOnDispose(Action restore) : IDisposable
    {
        public void Dispose() => restore();
    }
}
```

### REST Middleware (Program.cs)

```csharp
app.Use(async (context, next) =>
{
    if (context.Request.Headers.TryGetValue(
            "X-AI-Memory-Context", out var headerValue))
    {
        var scope = ContextHeaderParser.Parse(headerValue.ToString());
        using (AmbientContextScope.Push(scope))
            await next();
    }
    else
    {
        await next();
    }
});
```

**Header format:** `project=zoom,profile=professional` or `project=zoom&profile=professional`

### Service Layer Integration

```csharp
public class MemoryService : IMemoryService
{
    public async Task<SearchResult> HybridSearchAsync(
        string query,
        string? projectOverride = null,
        int limit = 10)
    {
        // Precedence: explicit parameter > ambient context > null (global)
        var project = projectOverride
            ?? AmbientContextScope.Current?.Projects?[0]
            ?? null;

        return await _searchEngine.HybridSearchAsync(query, project, limit);
    }
}
```

### MCP Tool Integration (ADR-004 facade preserved)

```csharp
[McpServerTool("memory_search")]
[Description("Hybrid search across memories")]
public async Task<string> Search(
    [Description("Search query")] string query,
    [Description("Optional context: 'project:slug', 'profile:professional', or 'project:slug,profile:professional'")] 
    string? context = null,
    [Description("Maximum results to return")] int limit = 10)
{
    var scope = context is not null ? ContextHeaderParser.Parse(context) : null;
    using (scope is not null ? AmbientContextScope.Push(scope) : new NoOpDisposable())
    {
        var results = await _memoryService.HybridSearchAsync(query, limit: limit);
        return FormatSearchResults(results);
    }
}
```

### Story → Search Context Inheritance (Phase 3 extension)

```csharp
[McpServerTool("story_claim")]
public async Task<string> ClaimStory(string storyId)
{
    var story = await _storyboardService.ClaimAsync(storyId);

    // Side-effect: publish story context for the caller's next operations
    // (This sets an ambient scope for the claim response; the agent is expected
    //  to pass context="project:{story.Project}" in subsequent memory_search calls
    //  or the MCP host can inject it via connection-level metadata.)
    return $"Story claimed: {story.Title} | context: project:{story.Project},profile:{story.Profile}";
}
```

---

## Context Header Format

| Format | Example | Notes |
|--------|---------|-------|
| Comma-delimited key=value | `project=zoom,profile=professional` | Simple single-project context |
| Multiple projects | `projects=zoom;bcf-managers,profile=professional` | Semicolon-delimited project list |
| Entity scope | `project=zoom,entity=CMake` | Entity-scoped structural pre-filter hint |

---

## Consequences

### Positive

- **Low token overhead** — Agents set context once per logical session block rather than per call
- **Stateless server** — No session affinity requirements; scales horizontally
- **Backward compatible** — Requests without context headers behave identically to v1.0
- **Traceable** — Ambient context propagates through the async pipeline; correlates with OpenTelemetry traces and structured logs
- **Middleware-natural** — Follows established ASP.NET Core pattern consistent with auth, correlation ID, and request logging middleware
- **ADR-004 preserved** — MCP facade remains a thin parameter pass-through; no service logic in tools

### Negative

- **Implicit behaviour** — Context is injected outside the parameter list; may be surprising to developers unfamiliar with the pattern
- **MCP transport limitation** — Stdio transport does not carry HTTP headers; MCP context must be passed as an explicit `context` parameter rather than ambient header injection
- **Request-scoped only** — Session-level persistence across multiple separate HTTP requests (e.g., a long-running agent session) requires the agent or hosting layer to re-supply context on each request batch. For stdio MCP sessions, the agent should call `memory_search` with an explicit context parameter.

---

## Alternatives Considered and Rejected

| Alternative | Reason Rejected |
|-------------|-----------------|
| Option B — Server-side session state (`ISessionContextManager`) | Requires server-side state, session TTL management, session affinity for load-balanced deployments, and additional `CREATE TABLE sessions` schema changes. Not worth the operational complexity at personal-scale single-user deployment. |
| Option D — Entity-cluster scope only | Requires entity extraction pipeline to be running for scoping to work; entity extraction is Phase 5. Deferred as an additive overlay on top of Option C once ST-018/ST-019 are complete. |
| Context in MCP Resource meta | MCP Resources provide passive context injection (Layer 0). Adding scope to resources would mix concerns; scope is a query-time concept, not a resource content concept. |

---

## ADR Relationships

| ADR | Relationship |
|-----|-------------|
| [ADR-004](ADR-004-interface-design.md) | Extended — REST middleware pattern and MCP optional `context` parameter added. Facade design preserved. |
| [ADR-003](ADR-003-hybrid-search.md) | Compatible — Ambient context is resolved before calling `ISearchEngine.HybridSearchAsync()`; no change to search algorithm. |
| [ADR-005](ADR-005-memory-model.md) | Compatible — No schema changes required. Context is query-time, not stored. |
| [ADR-006](ADR-006-views-architecture.md) | Compatible — Story claim flow returns context metadata to caller; no view layer changes. Entity-cluster scoping (Option D) is deferred to Phase 5 alongside ST-018/ST-019. |

---

## SRS Requirements

This ADR introduces the following new requirements (SRS v1.1):

| Req ID | Description |
|--------|-------------|
| FR-R-016 | Request-scoped ambient context: when a request includes context metadata, all operations within that request shall implicitly use that context unless explicitly overridden. |
| FR-API-013 | REST API shall accept optional `X-AI-Memory-Context` header (`project=slug,profile=professional`). Middleware shall extract and set ambient scope. |
| FR-MCP-007 | MCP tools `memory_search`, `memory_teach`, `memory_log_episode`, `story_list` shall accept an optional `context` parameter. When provided, ambient scope is set for that tool call and any nested operations. |
| FR-B-009 | When `story_claim(storyId)` is called, the response shall include the story's resolved context string (`project:{slug},profile:{profile}`) so the calling agent can pass it forward. |
| FR-C-008 | The consolidation pipeline shall accept an optional `context` scope to consolidate within a specific project only (Phase 4 extension, not required in v1.0). |

---

## Revision History

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2026-05-15 | ai-memory-maintainers | Initial — accepted following contextual scoping investigation; Option C selected over session-state and entity-only approaches |
