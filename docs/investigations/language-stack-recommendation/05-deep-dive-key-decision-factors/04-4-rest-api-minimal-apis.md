### 5.4 REST API — Minimal APIs

.NET 8+ Minimal APIs are concise and fast:

```csharp
app.MapPost("/memories", async (CreateMemoryRequest req, MemoryService svc) =>
    Results.Created($"/memories/{id}", await svc.CreateAsync(req)));

app.MapGet("/memories/search", async (string query, MemoryService svc) =>
    Results.Ok(await svc.SearchAsync(query)));
```

This is comparable in brevity to Express or FastAPI while providing compile-time type safety.

