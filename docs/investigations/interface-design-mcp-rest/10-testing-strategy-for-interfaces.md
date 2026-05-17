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

