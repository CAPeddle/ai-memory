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

