### 3.4 Projects Registry

```sql
CREATE TABLE projects (
    slug            TEXT PRIMARY KEY,  -- e.g., 'zoom', 'bcf-managers', 'conan-libs'
    display_name    TEXT NOT NULL,
    description     TEXT,
    build_system    TEXT,             -- 'cmake' | 'msbuild' | 'xcode'
    languages       TEXT,             -- JSON array: ["c++", "c#"]
    created_at      TEXT NOT NULL
);
```

---

