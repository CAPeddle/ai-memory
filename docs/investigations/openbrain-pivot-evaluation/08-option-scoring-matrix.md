## §8 Option Scoring Matrix

Scoring rubric: 1 = poor / 2 = below average / 3 = average / 4 = good / 5 = excellent.

| Dimension | Weight | A — Adopt OB1 | B — Fork OB1 | C — Stay Current | D — Build Fresh (C#) |
|-----------|--------|:---:|:---:|:---:|:---:|
| Per-ingest synthesis feasibility | 30% | 2 | 3 | **5** | 4 |
| Graph/structural similarity feasibility | 25% | 2 | 3 | 3 | **4** |
| Stack fit for current solo C# developer | 20% | 2 | 2 | **5** | 3 |
| Local-first / zero cost potential | 15% | 2 | 2 | **5** | 3 |
| Adoption friction | 10% | 3 | 2 | **5** | 3 |
| **Weighted score** | | **2.10** | **2.55** | **4.50** | **3.55** |

**Scoring notes:**
- Option A now scores 2, not 1, on Local-first / zero cost potential because Supabase Free can support hobby-scale use and a remote synthesis worker at near-zero hosting cost. It remains low because it is still cloud-first and inherits the 1-week inactivity pause.
- No scores moved in the OpenRouter revision. OpenRouter materially improves the narrative for A/B by reducing model-lock-in and improving hosted-worker resilience, but those benefits were not strong enough to change the weighted dimensions that still drive this matrix: stack fit for a solo C# developer, local-first behavior, and adoption complexity.
- Option C scores 3 on graph because structural fingerprints are a viable pragmatic approach even without full AGE; the migration path to Postgres + AGE is documented.
- Option D-C# scores 4 on graph because it can use self-hosted Postgres + AGE, and 3 on stack fit (keep C# but must set up Postgres infrastructure from scratch vs. SQLite simplicity).
- Option B scores 2 on forking adoption because maintaining divergence from upstream is high friction for a solo developer.

---

