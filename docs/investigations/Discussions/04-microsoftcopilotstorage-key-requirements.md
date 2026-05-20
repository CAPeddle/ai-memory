## Key Requirements

### 1. Multi-Index Representation

Each document or chunk must exist in three forms:

| Retrieval Signal | Required Index Structure |
|----------------|-------------------------|
| BM25           | Inverted index          |
| Vector         | Approximate nearest neighbor (ANN) index |
| Structural     | Graph or hierarchical index |

**Implication:**  
The database must support **multiple representations of the same logical entity**.

---

### 2. Stable Identity Across Indexes

All retrieval systems must use a **shared identifier (doc_id)**:

- Required for RRF fusion
- Enables merging of rankings across systems

**Implication:**  
A **canonical ID mapping layer** is mandatory.

---

### 3. Efficient Top-K Retrieval

Each retrieval lane must return **top-K ranked results efficiently**:

- No full scans
- Optimized index access required

**Implication:**  
Each index must support **native ranking and pagination**.

---

### 4. Parallel Query Execution

Hybrid retrieval requires querying all lanes concurrently:

```

Total latency ≈ max(BM25, Vector, Structural)

```

**Implication:**  
- Queries must be executed in parallel
- Slowest lane determines system latency

---

### 5. Metadata Filtering

All retrieval modes must support filtering:

- Project / model scoping
- Access control
- Domain-specific constraints

**Implication:**  
Filtering must be **consistently implemented across all indices**.

---

### 6. Chunking and Structural Alignment

A major challenge arises from differing granularities:

| Representation | Typical Granularity |
|--------------|--------------------|
| BM25         | Text chunks        |
| Vector       | Text chunks        |
| Structural   | Nodes / entities   |

**Implication:**  
A mapping is required:

```

chunk → node\_id
node → multiple chunks

```

---

