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

