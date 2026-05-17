### 8.4 Corrections Model

When a user corrects a fact:
```
Old: "zoom uses CMake 3.21+"
New: "zoom uses CMake 3.25+" (supersedes old)
```

The old memory gets `active = 0` and the new memory's `supersedes` field links to it. This preserves history while ensuring search only returns current facts.

---

