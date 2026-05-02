# Investigation: Interface Design — MCP + REST

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Complete |
| **Scope** | API interface design for ai-memory service |
| **Decision** | MCP facade over REST API core; C# / .NET 8+ with ASP.NET Core |

---

## 1. Executive Summary

The ai-memory service exposes two interfaces sharing one underlying engine:

1. **REST API** — The core HTTP interface implementing all memory operations. Portable, testable, usable by any client.
2. **MCP Server** — A thin facade that translates MCP tool calls into REST-like operations on the same service layer. Native integration with GitHub Copilot and other MCP-aware agents.

This "MCP facade over REST core" architecture means:
- The REST API can be developed, tested, and used independently
- The MCP layer is a thin adapter, not a reimplementation
- New clients (CLI, web UI, other agents) only need HTTP
- The MCP SDK handles protocol complexity while our code stays simple

---

## 2. Architecture: Layered Interface Pattern

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                │
│                                                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Copilot /   │  │ curl / HTTP  │  │ Future: CLI tool,       │ │
│  │ MCP Clients │  │ clients      │  │ VS Code extension       │ │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬────────────┘ │
└─────────┼────────────────┼────────────────────────┼──────────────┘
          │                │                        │
          │ stdio/HTTP     │ HTTP                   │ HTTP
          ▼                ▼                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                      TRANSPORT LAYER                               │
│                                                                    │
│  ┌──────────────────┐  ┌────────────────────────────────────┐   │
│  │ MCP Server       │  │ ASP.NET Core REST API              │   │
│  │ (Facade)         │  │ (Core Interface)                   │   │
│  │                  │  │                                    │   │
│  │ • Tool handlers  │  │ • Minimal API endpoints            │   │
│  │ • Resource URIs  │  │ • Request/response DTOs            │   │
│  │ • Protocol msgs  │  │ • Validation middleware            │   │
│  └────────┬─────────┘  └──────────────────┬─────────────────┘   │
│           │                               │                       │
│           └───────────────┬───────────────┘                       │
└───────────────────────────┼───────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER                                 │
│                                                                    │
│  ┌──────────────────┐  ┌───────────────┐  ┌─────────────────┐   │
│  │ IMemoryService   │  │ ISearchEngine │  │ IConsolidation  │   │
│  │                  │  │               │  │  Pipeline       │   │
│  │ • Teach()        │  │ • Search()    │  │                 │   │
│  │ • LogEpisode()   │  │ • Embed()     │  │ • RunCycle()    │   │
│  │ • Correct()      │  │ • RankRRF()   │  │ • Score()       │   │
│  │ • Delete()       │  │ • ApplyMMR()  │  │ • Promote()     │   │
│  │ • Promote()      │  │               │  │                 │   │
│  └──────────────────┘  └───────────────┘  └─────────────────┘   │
│                                                                    │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                    │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ IMemoryRepository (SQLite implementation)                    │ │
│  │                                                             │ │
│  │ • Semantic CRUD  • Episodic CRUD  • FTS5 queries            │ │
│  │ • Vector store   • Recall events  • Projects registry       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. REST API Design (Core Interface)

### 3.1 Design Principles

| Principle | Application |
|-----------|-------------|
| **RESTful resource naming** | Nouns not verbs: `/memories`, `/episodes`, `/projects` |
| **Consistent response shape** | All responses use `{ data, meta?, errors? }` envelope |
| **Idempotent where possible** | PUT/PATCH for updates; POST for creates with client-generated ULIDs |
| **Pagination** | Cursor-based for lists (no offset drift on inserts) |
| **Versioned** | `/api/v1/` prefix; new versions coexist during migration |
| **Health & observability** | `/health`, `/ready` endpoints; structured logging |

### 3.2 Endpoint Specification

#### Memories (Semantic)

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/api/v1/memories` | Teach a fact | `{ content, project?, tags?, source? }` | `{ data: Memory }` |
| GET | `/api/v1/memories/search` | Hybrid search | Query params: `q`, `project?`, `type?`, `limit?`, `tags?` | `{ data: Memory[], meta: { total, scores } }` |
| GET | `/api/v1/memories/:id` | Get by ID | — | `{ data: Memory }` |
| PATCH | `/api/v1/memories/:id` | Correct a fact | `{ content?, tags?, project? }` | `{ data: Memory }` |
| DELETE | `/api/v1/memories/:id` | Soft-delete | — | `204 No Content` |
| GET | `/api/v1/memories` | List with filters | Query params: `project?`, `type?`, `tags?`, `cursor?`, `limit?` | `{ data: Memory[], meta: { cursor } }` |
| POST | `/api/v1/memories/:id/promote` | Force promote episodic→semantic | — | `{ data: Memory }` |

#### Episodes

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/api/v1/episodes` | Log an episode | `{ content, session_id, project?, tags?, agent_context? }` | `{ data: Episode }` |
| GET | `/api/v1/episodes` | List episodes | Query params: `session_id?`, `project?`, `cursor?`, `limit?` | `{ data: Episode[], meta: { cursor } }` |
| GET | `/api/v1/episodes/:id` | Get episode detail | — | `{ data: Episode }` |

#### Recall & Feedback

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/api/v1/recall/:event_id/feedback` | Submit feedback | `{ feedback: "helpful" \| "irrelevant" }` | `204` |
| GET | `/api/v1/recall/events` | List recall events | Query params: `memory_id?`, `limit?` | `{ data: RecallEvent[] }` |

#### Consolidation

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/api/v1/consolidate` | Trigger pipeline | `{ dry_run?: bool }` | `{ data: ConsolidationResult }` |
| GET | `/api/v1/consolidate/log` | History | Query params: `cursor?`, `limit?` | `{ data: ConsolidationRun[] }` |

#### Projects

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| GET | `/api/v1/projects` | List projects | — | `{ data: Project[] }` |
| POST | `/api/v1/projects` | Register project | `{ slug, display_name, description?, build_system?, languages? }` | `{ data: Project }` |

#### System

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/api/v1/stats` | System statistics | `{ data: Stats }` |
| GET | `/health` | Health check | `200 OK` |
| GET | `/ready` | Readiness (DB accessible) | `200 OK` or `503` |

### 3.3 Response Envelope

```json
{
  "data": { ... },
  "meta": {
    "cursor": "01HXY...",
    "total": 42,
    "took_ms": 12
  },
  "errors": null
}
```

Error response:
```json
{
  "data": null,
  "errors": [
    {
      "code": "MEMORY_NOT_FOUND",
      "message": "No memory found with id '01HXY...'",
      "field": "id"
    }
  ]
}
```

### 3.4 ASP.NET Core Minimal API Implementation Pattern

```csharp
// Program.cs — endpoint registration
var api = app.MapGroup("/api/v1");

api.MapPost("/memories", async (TeachRequest req, IMemoryService svc) =>
{
    var memory = await svc.TeachAsync(req.Content, req.Project, req.Tags);
    return Results.Created($"/api/v1/memories/{memory.Id}", new { data = memory });
})
.WithName("TeachMemory")
.Produces<DataEnvelope<Memory>>(201)
.ProducesValidationProblem();

api.MapGet("/memories/search", async (
    [FromQuery] string q,
    [FromQuery] string? project,
    [FromQuery] string? type,
    [FromQuery] int limit,
    ISearchEngine search) =>
{
    var results = await search.HybridSearchAsync(q, project, type, limit);
    return Results.Ok(new { data = results.Memories, meta = results.Meta });
})
.WithName("SearchMemories");
```

---

## 4. MCP Server Design (Facade Layer)

### 4.1 MCP SDK Integration

Using `ModelContextProtocol.AspNetCore` for HTTP transport alongside the REST API in the same ASP.NET Core host:

```csharp
// Program.cs — MCP + REST in one host
var builder = WebApplication.CreateBuilder(args);

// Shared services
builder.Services.AddSingleton<IMemoryService, MemoryService>();
builder.Services.AddSingleton<ISearchEngine, HybridSearchEngine>();

// MCP server registration
builder.Services.AddMcpServer()
    .WithTools<MemoryTools>()
    .WithResources<MemoryResources>();

var app = builder.Build();

// REST endpoints
app.MapRestEndpoints();

// MCP endpoint (Streamable HTTP transport)
app.MapMcp("/mcp");

// Also support stdio transport for direct Copilot connection
if (args.Contains("--stdio"))
{
    await app.RunMcpServerAsync();
}
else
{
    app.Run();
}
```

### 4.2 MCP Tool Definitions

Each MCP tool is a thin wrapper calling the same `IMemoryService` the REST API uses:

```csharp
[McpServerToolType]
public class MemoryTools
{
    private readonly IMemoryService _memoryService;
    private readonly ISearchEngine _searchEngine;

    public MemoryTools(IMemoryService memoryService, ISearchEngine searchEngine)
    {
        _memoryService = memoryService;
        _searchEngine = searchEngine;
    }

    [McpServerTool("memory_teach")]
    [Description("Store a permanent fact about a project or cross-project knowledge")]
    public async Task<string> Teach(
        [Description("The fact to remember in natural language")] string content,
        [Description("Project slug (e.g., 'zoom', 'bcf-managers'). Null for cross-project facts.")] string? project = null,
        [Description("Tags for categorization (e.g., 'cmake', 'dependencies')")] string[]? tags = null)
    {
        var memory = await _memoryService.TeachAsync(content, project, tags);
        return $"Stored memory {memory.Id}: \"{memory.Content}\"";
    }

    [McpServerTool("memory_search")]
    [Description("Search all memories using hybrid full-text + semantic search")]
    public async Task<string> Search(
        [Description("Natural language search query")] string query,
        [Description("Filter to specific project")] string? project = null,
        [Description("Filter by type: 'semantic', 'episodic', or 'all'")] string? type = "all",
        [Description("Maximum results to return")] int limit = 10)
    {
        var results = await _searchEngine.HybridSearchAsync(query, project, type, limit);
        return FormatSearchResults(results);
    }

    [McpServerTool("memory_log_episode")]
    [Description("Record an observation or event from the current development session")]
    public async Task<string> LogEpisode(
        [Description("What happened or was discovered")] string content,
        [Description("Unique session identifier")] string sessionId,
        [Description("Project context")] string? project = null,
        [Description("Tags")] string[]? tags = null)
    {
        var episode = await _memoryService.LogEpisodeAsync(content, sessionId, project, tags);
        return $"Logged episode {episode.Id} in session {sessionId}";
    }

    [McpServerTool("memory_correct")]
    [Description("Correct an existing fact. The old version is preserved for audit.")]
    public async Task<string> Correct(
        [Description("ID of the memory to correct")] string memoryId,
        [Description("The corrected content")] string newContent)
    {
        var memory = await _memoryService.CorrectAsync(memoryId, newContent);
        return $"Corrected memory {memory.Id}. Previous version archived.";
    }

    [McpServerTool("memory_delete")]
    [Description("Soft-delete a memory (preserved for audit but excluded from search)")]
    public async Task<string> Delete(
        [Description("ID of the memory to delete")] string memoryId)
    {
        await _memoryService.DeleteAsync(memoryId);
        return $"Deleted memory {memoryId}";
    }

    [McpServerTool("memory_list")]
    [Description("List memories with optional filters")]
    public async Task<string> List(
        [Description("Filter by project")] string? project = null,
        [Description("Filter by type: 'semantic' or 'episodic'")] string? type = null,
        [Description("Filter by tags")] string[]? tags = null,
        [Description("Pagination cursor")] string? cursor = null,
        [Description("Page size")] int limit = 20)
    {
        var page = await _memoryService.ListAsync(project, type, tags, cursor, limit);
        return FormatMemoryList(page);
    }

    [McpServerTool("memory_inspect")]
    [Description("Get full details of a specific memory including recall history")]
    public async Task<string> Inspect(
        [Description("Memory ID")] string memoryId)
    {
        var detail = await _memoryService.InspectAsync(memoryId);
        return FormatMemoryDetail(detail);
    }

    [McpServerTool("memory_feedback")]
    [Description("Report whether a recalled memory was helpful")]
    public async Task<string> Feedback(
        [Description("Recall event ID from search results")] string recallEventId,
        [Description("'helpful' or 'irrelevant'")] string feedback)
    {
        await _memoryService.RecordFeedbackAsync(recallEventId, feedback);
        return "Feedback recorded.";
    }

    [McpServerTool("memory_promote")]
    [Description("Force promote an episodic memory to permanent semantic memory")]
    public async Task<string> Promote(
        [Description("Episodic memory ID to promote")] string episodicId)
    {
        var semantic = await _memoryService.PromoteAsync(episodicId);
        return $"Promoted to semantic memory {semantic.Id}: \"{semantic.Content}\"";
    }

    [McpServerTool("memory_consolidate")]
    [Description("Run the consolidation pipeline to promote recurring patterns")]
    public async Task<string> Consolidate(
        [Description("If true, shows what would be promoted without actually doing it")] bool dryRun = false)
    {
        var result = await _memoryService.ConsolidateAsync(dryRun);
        return FormatConsolidationResult(result, dryRun);
    }

    [McpServerTool("memory_projects")]
    [Description("List all registered projects")]
    public async Task<string> Projects()
    {
        var projects = await _memoryService.ListProjectsAsync();
        return FormatProjects(projects);
    }

    [McpServerTool("memory_stats")]
    [Description("Get memory system statistics")]
    public async Task<string> Stats(
        [Description("Specific project or null for system-wide")] string? project = null)
    {
        var stats = await _memoryService.GetStatsAsync(project);
        return FormatStats(stats);
    }
}
```

### 4.3 MCP Resources (Read-Only Context Injection)

MCP Resources allow agents to request contextual information that gets injected into their context window:

```csharp
[McpServerResourceType]
public class MemoryResources
{
    private readonly IMemoryService _memoryService;

    public MemoryResources(IMemoryService memoryService)
    {
        _memoryService = memoryService;
    }

    [McpServerResource("memory://facts/{project}")]
    [Description("All active semantic facts for a specific project")]
    public async Task<string> GetProjectFacts(string project)
    {
        var facts = await _memoryService.GetProjectFactsAsync(project);
        return FormatFactsAsContext(facts);
    }

    [McpServerResource("memory://recent-episodes")]
    [Description("Most recent development episodes across all projects")]
    public async Task<string> GetRecentEpisodes()
    {
        var episodes = await _memoryService.GetRecentEpisodesAsync(limit: 20);
        return FormatEpisodesAsContext(episodes);
    }

    [McpServerResource("memory://stats")]
    [Description("Memory system statistics and health")]
    public async Task<string> GetStats()
    {
        var stats = await _memoryService.GetStatsAsync(project: null);
        return FormatStatsAsContext(stats);
    }
}
```

### 4.4 MCP Prompts (Agent Guidance)

MCP Prompts provide pre-built prompt templates agents can use:

```csharp
[McpServerPromptType]
public class MemoryPrompts
{
    [McpServerPrompt("recall_context")]
    [Description("Get relevant context before starting work on a topic")]
    public static ChatMessage[] RecallContext(
        [Description("What you're about to work on")] string topic,
        [Description("Project context")] string? project = null)
    {
        return [
            new ChatMessage(ChatRole.User,
                $"Search memory for relevant context about: {topic}" +
                (project != null ? $" in project {project}" : "") +
                "\n\nReturn all relevant facts and past experiences that might help.")
        ];
    }

    [McpServerPrompt("session_summary")]
    [Description("Summarize current session learnings for episode logging")]
    public static ChatMessage[] SessionSummary(
        [Description("Key things learned or discovered")] string learnings)
    {
        return [
            new ChatMessage(ChatRole.User,
                $"Log the following session learnings as episodic memories:\n\n{learnings}\n\n" +
                "For each distinct fact or discovery, call memory_log_episode separately.")
        ];
    }
}
```

---

## 5. Transport Configuration

### 5.1 Dual Transport Support

The service supports two MCP transports simultaneously:

| Transport | Use Case | Configuration |
|-----------|----------|---------------|
| **stdio** | Direct GitHub Copilot integration (VS Code) | Launch as subprocess per `mcp.json` |
| **Streamable HTTP** | Remote agents, multi-client, debugging | Single server process on `localhost:5280/mcp` |

### 5.2 VS Code MCP Configuration

```json
// .vscode/mcp.json (for stdio transport)
{
  "servers": {
    "ai-memory": {
      "type": "stdio",
      "command": "dotnet",
      "args": ["run", "--project", "src/AiMemory.Server", "--", "--stdio"],
      "env": {
        "AI_MEMORY_DB_PATH": "${userHome}/.ai-memory/memory.db"
      }
    }
  }
}
```

```json
// Alternative: HTTP transport (server already running)
{
  "servers": {
    "ai-memory": {
      "type": "http",
      "url": "http://localhost:5280/mcp"
    }
  }
}
```

### 5.3 Deployment Modes

| Mode | How | When |
|------|-----|------|
| **Development** | `dotnet run` in terminal | Active development |
| **stdio per-editor** | VS Code spawns process via `mcp.json` | Normal Copilot use |
| **Background service** | Windows Service or Task Scheduler | Always-on REST API |
| **Docker** | Container with volume-mounted DB | Team/CI environments |

---

## 6. Service Layer Interface Contracts

### 6.1 Core Interfaces

```csharp
public interface IMemoryService
{
    // Write operations
    Task<SemanticMemory> TeachAsync(string content, string? project, string[]? tags);
    Task<EpisodicMemory> LogEpisodeAsync(string content, string sessionId, string? project, string[]? tags);
    Task<SemanticMemory> CorrectAsync(string memoryId, string newContent);
    Task DeleteAsync(string memoryId);
    Task<SemanticMemory> PromoteAsync(string episodicId);

    // Read operations
    Task<MemoryDetail> InspectAsync(string memoryId);
    Task<PagedResult<MemoryBase>> ListAsync(string? project, string? type, string[]? tags, string? cursor, int limit);
    Task<IReadOnlyList<SemanticMemory>> GetProjectFactsAsync(string project);
    Task<IReadOnlyList<EpisodicMemory>> GetRecentEpisodesAsync(int limit);

    // Feedback & consolidation
    Task RecordFeedbackAsync(string recallEventId, string feedback);
    Task<ConsolidationResult> ConsolidateAsync(bool dryRun);

    // Projects
    Task<IReadOnlyList<Project>> ListProjectsAsync();
    Task<Project> RegisterProjectAsync(string slug, string displayName, string? description, string? buildSystem, string[]? languages);

    // Stats
    Task<MemoryStats> GetStatsAsync(string? project);
}

public interface ISearchEngine
{
    Task<SearchResult> HybridSearchAsync(string query, string? project, string? type, int limit);
}

public interface IEmbeddingService
{
    Task<float[]> EmbedAsync(string text);
    Task<float[][]> EmbedBatchAsync(string[] texts);
}

public interface IMemoryRepository
{
    // Semantic CRUD
    Task<SemanticMemory> InsertSemanticAsync(SemanticMemory memory);
    Task<SemanticMemory?> GetSemanticByIdAsync(string id);
    Task UpdateSemanticAsync(SemanticMemory memory);
    Task SoftDeleteAsync(string id);

    // Episodic CRUD
    Task<EpisodicMemory> InsertEpisodicAsync(EpisodicMemory episode);
    Task<IReadOnlyList<EpisodicMemory>> GetEpisodesBySessionAsync(string sessionId);

    // Search
    Task<IReadOnlyList<FtsResult>> FtsSearchAsync(string query, string? project, int limit);
    Task<IReadOnlyList<VectorResult>> VectorSearchAsync(float[] embedding, string? project, int limit);

    // Recall tracking
    Task InsertRecallEventAsync(RecallEvent evt);
    Task IncrementRecallCountAsync(string memoryId, string memoryType);

    // Deduplication
    Task<bool> IsDuplicateAsync(float[] embedding, double threshold = 0.95);
}
```

### 6.2 Key Design Decision: Shared Service Layer

Both the REST controllers and MCP tools call the **same** `IMemoryService`. This guarantees:
- Consistent validation rules
- Consistent business logic (dedup, embedding, recall tracking)
- Single source of truth for behavior
- Easy testing — test the service layer once, both interfaces are covered

---

## 7. Error Handling Strategy

### 7.1 Error Taxonomy

| Error Type | HTTP Status | MCP Behavior | Example |
|------------|-------------|--------------|---------|
| `NotFound` | 404 | Return error message string | Memory ID doesn't exist |
| `Duplicate` | 409 | Return "already exists" message | Teaching a fact identical to existing |
| `Validation` | 400 | Return validation errors | Empty content, invalid project slug |
| `Internal` | 500 | Return generic error; log details | DB connection failure |
| `ServiceUnavailable` | 503 | Throw exception (MCP client retries) | Embedding API down |

### 7.2 MCP Error Handling Pattern

```csharp
// MCP tools return strings — errors are communicated as descriptive messages
[McpServerTool("memory_teach")]
public async Task<string> Teach(string content, string? project, string[]? tags)
{
    if (string.IsNullOrWhiteSpace(content))
        return "Error: content cannot be empty";

    try
    {
        var memory = await _memoryService.TeachAsync(content, project, tags);
        return $"Stored memory {memory.Id}: \"{memory.Content}\"";
    }
    catch (DuplicateMemoryException ex)
    {
        return $"Already known (similar to memory {ex.ExistingId}): \"{ex.ExistingContent}\"";
    }
}
```

---

## 8. Configuration & Extensibility

### 8.1 Configuration Schema

```json
{
  "AiMemory": {
    "Database": {
      "Path": "~/.ai-memory/memory.db",
      "WalMode": true,
      "MaxConnections": 5
    },
    "Embeddings": {
      "Provider": "openai",
      "Model": "text-embedding-3-small",
      "Dimensions": 1536,
      "ApiKey": "${AI_MEMORY_OPENAI_KEY}",
      "BatchSize": 50
    },
    "Search": {
      "DefaultLimit": 10,
      "MaxLimit": 100,
      "MmrLambda": 0.7,
      "RrfK": 60,
      "FtsWeight": 0.5,
      "VectorWeight": 0.5
    },
    "Consolidation": {
      "PromotionThreshold": 0.7,
      "NearThreshold": 0.5,
      "FrequencyWeight": 0.40,
      "DiversityWeight": 0.35,
      "RelevanceWeight": 0.25,
      "MinRecallsForPromotion": 2,
      "AutoTriggerAfterEpisodes": 50
    },
    "Server": {
      "HttpPort": 5280,
      "EnableSwagger": true
    }
  }
}
```

### 8.2 Dependency Injection Registration

```csharp
// ServiceCollectionExtensions.cs
public static IServiceCollection AddAiMemory(this IServiceCollection services, IConfiguration config)
{
    services.Configure<AiMemoryOptions>(config.GetSection("AiMemory"));

    // Core services
    services.AddSingleton<IMemoryRepository, SqliteMemoryRepository>();
    services.AddSingleton<IEmbeddingService, OpenAiEmbeddingService>();
    services.AddSingleton<ISearchEngine, HybridSearchEngine>();
    services.AddSingleton<IMemoryService, MemoryService>();
    services.AddSingleton<IConsolidationPipeline, ConsolidationPipeline>();

    return services;
}
```

---

## 9. Security Considerations

### 9.1 Local-First Threat Model

Since this is a local service on a developer's laptop:

| Concern | Mitigation |
|---------|------------|
| **Network exposure** | Bind to `localhost` only by default |
| **API key storage** | Environment variables or OS credential store, never in config files |
| **Database access** | File permissions on the .db file (user-read-only) |
| **MCP transport** | stdio is process-isolated; HTTP is localhost-only |
| **Sensitive content** | Memories may contain code snippets or build secrets — encrypt at rest is optional future enhancement |

### 9.2 No Authentication by Default

For a single-user local service, authentication adds friction without benefit. If/when the service goes multi-user:
- API key per agent/client
- Project-level access control
- Rate limiting

---

## 10. Testing Strategy for Interfaces

### 10.1 Test Levels

| Level | Scope | Tools |
|-------|-------|-------|
| **Unit** | Service layer in isolation (mocked repository) | xUnit, NSubstitute |
| **Integration** | Service + real SQLite (in-memory DB) | xUnit, WebApplicationFactory |
| **API contract** | REST endpoint shapes, status codes | xUnit, `HttpClient` |
| **MCP protocol** | Tool invocations via MCP client | Official MCP C# client SDK |
| **E2E** | Full flow: MCP call → search → DB → response | Integration test with real DB |

### 10.2 Key Integration Test Example

```csharp
[Fact]
public async Task TeachAndSearch_RoundTrip()
{
    await using var app = new WebApplicationFactory<Program>();
    var client = app.CreateClient();

    // Teach a fact
    var teachResponse = await client.PostAsJsonAsync("/api/v1/memories", new
    {
        content = "zoom uses CMake 3.25+",
        project = "zoom",
        tags = new[] { "cmake", "build" }
    });
    teachResponse.EnsureSuccessStatusCode();

    // Search for it
    var searchResponse = await client.GetAsync("/api/v1/memories/search?q=cmake+version+zoom");
    var results = await searchResponse.Content.ReadFromJsonAsync<SearchResponse>();

    Assert.Contains(results.Data, m => m.Content.Contains("CMake 3.25"));
}
```

---

## 11. Project Structure

```
src/
├── AiMemory.Core/                 # Domain models, interfaces, service logic
│   ├── Models/
│   │   ├── SemanticMemory.cs
│   │   ├── EpisodicMemory.cs
│   │   ├── RecallEvent.cs
│   │   └── Project.cs
│   ├── Interfaces/
│   │   ├── IMemoryService.cs
│   │   ├── IMemoryRepository.cs
│   │   ├── ISearchEngine.cs
│   │   └── IEmbeddingService.cs
│   ├── Services/
│   │   ├── MemoryService.cs
│   │   ├── HybridSearchEngine.cs
│   │   └── ConsolidationPipeline.cs
│   └── AiMemory.Core.csproj
│
├── AiMemory.Data/                 # SQLite implementation of repository
│   ├── SqliteMemoryRepository.cs
│   ├── Migrations/
│   ├── Extensions/
│   └── AiMemory.Data.csproj
│
├── AiMemory.Embeddings/           # Embedding provider abstraction
│   ├── OpenAiEmbeddingService.cs
│   ├── OnnxEmbeddingService.cs    # Future local alternative
│   └── AiMemory.Embeddings.csproj
│
├── AiMemory.Server/               # ASP.NET Core host (REST + MCP)
│   ├── Program.cs
│   ├── Endpoints/                 # REST Minimal API groups
│   │   ├── MemoryEndpoints.cs
│   │   ├── EpisodeEndpoints.cs
│   │   ├── ConsolidationEndpoints.cs
│   │   └── ProjectEndpoints.cs
│   ├── Mcp/                       # MCP tool/resource definitions
│   │   ├── MemoryTools.cs
│   │   ├── MemoryResources.cs
│   │   └── MemoryPrompts.cs
│   ├── appsettings.json
│   └── AiMemory.Server.csproj
│
└── AiMemory.Tests/                # All test projects
    ├── Unit/
    ├── Integration/
    └── AiMemory.Tests.csproj
```

---

## 12. Open Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | **Should MCP and REST run in same process?** | Same (simpler) vs Separate (isolated scaling) | Deployment complexity |
| 2 | **MCP tool return format?** | Plain text vs JSON vs Markdown | Agent parsing quality |
| 3 | **Should search results include recall_event_id?** | Yes (enables feedback) vs No (simpler) | Feedback loop completeness |
| 4 | **OpenAPI / Swagger in production?** | Enabled vs disabled | Discoverability vs attack surface |
| 5 | **Rate limiting for consolidation?** | Debounce vs queue vs none | Prevent accidental spam |

---

## 13. Recommendations

1. **Same process for MCP + REST** — Simpler deployment, shared DI container, no inter-process communication needed at our scale.
2. **MCP tools return formatted text** — Agents interpret natural language better than raw JSON. Include IDs for follow-up operations.
3. **Include recall_event_id in search results** — Essential for the feedback loop that drives consolidation quality.
4. **Enable Swagger in dev, disable in service mode** — Useful during development, unnecessary overhead in background service.
5. **Start with HTTP transport** — stdio requires careful lifecycle management; HTTP is easier to debug and supports multiple simultaneous clients.

---

## 14. Next Steps

1. Scaffold the solution structure (`.sln`, project references)
2. Implement `IMemoryRepository` with SQLite + FTS5
3. Implement `IEmbeddingService` with OpenAI
4. Implement `ISearchEngine` with RRF + MMR
5. Wire up REST endpoints
6. Add MCP tools as facade
7. Integration tests for round-trip flows
