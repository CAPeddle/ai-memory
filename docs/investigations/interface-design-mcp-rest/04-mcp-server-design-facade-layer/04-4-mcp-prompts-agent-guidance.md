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

