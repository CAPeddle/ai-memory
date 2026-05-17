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

