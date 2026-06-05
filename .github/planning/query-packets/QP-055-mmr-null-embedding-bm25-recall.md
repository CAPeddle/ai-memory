# QP-055: MMR null-embedding BM25 recall preservation

> Story: ST-055
> Status: Scoped — ready for /plan Phase 2
> Created: 2026-06-05
> Source: ST-046 plan-review resolution after Task 4.3 e2e failure

---

## PO Intent

ST-046 added four seeded `build_failure` rows for the search-quality harness. During the next
planned step, `/continue` attempted the behaviour-preserving `rrfFuse` extraction and ran
`tests/e2e.test.ts`. The existing e2e test `capture_thought → search_thoughts returns via BM25 lane`
failed: a freshly captured thought with a unique BM25 keyword did not appear in the returned top-3.

The PO decision for plan-review resolution is to split the revealed runtime issue out of ST-046.
ST-046 remains the eval-harness story; this new story fixes the `search_thoughts` behavior so
BM25-only, null-embedding candidates remain returnable when their fused score merits inclusion.

## Problem Statement

The failing e2e path captures a thought and immediately searches for a unique keyword. BM25 is
synchronous because `search_vector` is a generated column, but embedding generation is fire-and-forget,
so the captured row can temporarily have `embedding = NULL`.

Current `search_thoughts` behavior:

1. BM25 and vector lanes are fused with RRF scores.
2. The top fused ids are fetched and passed to `mmrRerank`.
3. `mmrRerank` filters candidates with embeddings into `withEmb`, null-embedding candidates into
   `noEmb`, fills the requested `k` from `withEmb`, then appends `noEmb` after that and slices to `k`.

When the seeded corpus grew by four axis-5 embedded rows, there were enough embedded candidates to fill
the requested result count before the BM25-only captured row was appended. The captured row could be
inside the fused candidate set and still be omitted from the final results solely because its embedding
was not ready yet.

## PO Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Split from ST-046 into ST-055 | ST-046 should remain an eval-harness story; the runtime recall behavior is a separate product bug revealed by the harness corpus. |
| Fix direction | Preserve score order for null embeddings | MMR may rerank embedded candidates for diversity, but null-embedding candidates should not be automatically demoted below every embedded candidate. Strong BM25-only hits must remain returnable. |
| ST-046 dependency | ST-046 blocked by ST-055 | ST-046 Task 4.3 should not reattempt the `rrfFuse` extraction until the current e2e suite is green with the expanded corpus. |

## In Scope

1. Add a focused failing test showing that a high-scoring BM25-only/null-embedding candidate is included
   in the final top-k when its fused score merits inclusion.
2. Update `mmrRerank` or the caller-side merge logic so null-embedding candidates are merged back with
   embedded MMR selections by score before the final `k` slice, rather than appended after the slice can
   already be full.
3. Keep MMR diversity behavior for embedded candidates intact.
4. Keep null-embedding rows returnable for existing e2e coverage.
5. Prove the original ST-046 blocker is gone by running `tests/e2e.test.ts` inside `mcp-test` against the
   expanded seeded corpus.

## Out of Scope

- Extracting `rrfFuse` for ST-046.
- Adding the ST-046 golden-set test file.
- Changing RRF `k`, MMR `λ`, project boost, BM25 SQL, vector SQL, or embedding generation timing.
- Making capture wait synchronously for embeddings.
- Raising the e2e test limit as the primary fix.

## Acceptance Criteria

- [ ] A deterministic unit test proves a null-embedding candidate with a higher fused score than at least
  one embedded candidate remains in the final top-k.
- [ ] Existing MMR diversity tests/coverage still pass; embedded candidates continue to be diversity-ranked.
- [ ] `e2e: capture_thought → search_thoughts returns via BM25 lane` passes with the ST-046 expanded corpus.
- [ ] Full `mcp-test` server tests pass, or any unrelated pre-existing failure is documented with evidence.
- [ ] Cross-model critical review passes before the story moves to Review.

## Required Reading for /plan Phase 2

- `.github/planning/execplans/exec-plan-ST-046.md` §2c and §5b for the failed Task 4.3 evidence.
- `server/src/searchQuality.ts` (`mmrRerank`).
- `server/index.ts` `search_thoughts` flow from RRF fusion through MMR.
- `server/tests/e2e.test.ts` test `capture_thought → search_thoughts returns via BM25 lane`.

## Recommended Next Step

Run `/plan ST-055` Phase 2 to author a Ready ExecPlan. After ST-055 is complete and accepted, clear
ST-055 from ST-046's `Blocked by:` field and resume ST-046 at Task 4.3.