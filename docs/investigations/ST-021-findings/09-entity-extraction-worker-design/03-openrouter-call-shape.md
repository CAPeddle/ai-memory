### OpenRouter call shape

```typescript
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "openai/gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract entities and relationships. Return JSON: { "nodes": [{"label": "Person|Function|Error|Topic|Project", "name": "...", "props": {}}], "edges": [{"from": "...", "to": "...", "rel": "CAUSED_BY|LIKES|WORKS_ON|USES|RELATED_TO"}] }`,
      },
      { role: "user", content: thought.content },
    ],
  }),
});
```

