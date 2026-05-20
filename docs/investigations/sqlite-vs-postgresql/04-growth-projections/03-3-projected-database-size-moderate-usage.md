### 4.3 Projected Database Size (Moderate Usage)

| Time | Raw Data | FTS Index | Vector Embeddings* | Total DB File |
|------|:--------:|:---------:|:------------------:|:-------------:|
| 1 year | ~25MB | ~15MB | ~150MB | **~190MB** |
| 3 years | ~75MB | ~45MB | ~450MB | **~570MB** |
| 5 years (if it gets there) | ~125MB | ~75MB | ~750MB | **~950MB** |

*Vector embeddings at 1536 dimensions × 4 bytes × record count. Only relevant when vector search is added.*

