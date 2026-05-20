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

