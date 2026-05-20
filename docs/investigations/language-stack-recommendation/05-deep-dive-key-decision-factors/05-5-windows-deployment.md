### 5.5 Windows Deployment

.NET wins decisively here:
```csharp
builder.Services.AddWindowsService(options =>
    options.ServiceName = "ai-memory");
```
One line → native Windows service with proper lifecycle management, event log integration, and `sc` command compatibility. No external tooling needed.

---

