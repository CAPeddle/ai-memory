### 3.1 Design Principles

| Principle | Application |
|-----------|-------------|
| **RESTful resource naming** | Nouns not verbs: `/memories`, `/episodes`, `/projects` |
| **Consistent response shape** | All responses use `{ data, meta?, errors? }` envelope |
| **Idempotent where possible** | PUT/PATCH for updates; POST for creates with client-generated ULIDs |
| **Pagination** | Cursor-based for lists (no offset drift on inserts) |
| **Versioned** | `/api/v1/` prefix; new versions coexist during migration |
| **Health & observability** | `/health`, `/ready` endpoints; structured logging |

