## Memory Context (zoom, CMake task)

### From zoom project:
- CMake 3.25+ required
- Qt6_DIR must be set before find_package(Qt6)

### Cross-project:
- Conan 2 toolchain auto-sets CMAKE_PREFIX_PATH

### From similar work (bcf-managers):
- BCF Manager had same Qt6 find issue — resolved via CMAKE_FIND_USE_CMAKE_SYSTEM_PATH
```

The agent can immediately see what's local vs cross-pollinated.

---

