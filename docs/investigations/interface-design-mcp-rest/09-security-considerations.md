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

