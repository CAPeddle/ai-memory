# QP-030 — `.gitattributes` and Line-Ending Normalization

## Story

**ST-030** — Add `.gitattributes` and normalize line endings repo-wide

Board entry: [story-board.md (Backlog)](../story-board.md) — added during /plan closeout 2026-05-19

## Summary

Add a `.gitattributes` file at the repo root so Git enforces line-ending policy on every checkout and commit, then run a one-time renormalization. Today the repo has no `.gitattributes`, `core.autocrlf=false`, and four `server/` files have already drifted to CRLF in the working tree while the index holds LF — a benign-but-noisy false-positive in `git status` that muddies every `/plan` and `/continue` invocation on Windows.

The story exists to (a) silence the recurring false-positive churn on Windows checkouts, and (b) lock a documented line-ending policy so future drift is impossible.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Line-ending policy | LF for source (`* text=auto eol=lf`); CRLF for Windows scripts (`*.bat`/`*.cmd`/`*.ps1` → `text eol=crlf`); binary detected automatically via `text=auto` heuristic |
| 2 | Scope | Repo-wide. Narrow-to-`server/`-only was offered and rejected — would leave docs/, .github/, tools/ at risk of future drift |
| 3 | Renormalization mechanism | Single commit containing `.gitattributes` + all renormalized files via `git add --renormalize .`. No two-commit split — repo is small and a single atomic commit is cleaner to revert if needed |
| 4 | Verification strategy | `git status` clean + `git ls-files --eol` reports expected `i/lf`/`i/crlf` for representative files + Deno test suite still passes |
| 5 | Out-of-scope cleanup | `tools/fix-crlf.ps1` (misnamed — actually a blank-line stripper) stays untouched; renaming is a separate cosmetic concern |

## In Scope

### `.gitattributes` (new at repo root)

Exact content to write:

```
# Default: detect binary vs text automatically; text files use LF in working tree
* text=auto eol=lf

# Windows scripts must remain CRLF
*.bat text eol=crlf
*.cmd text eol=crlf
*.ps1 text eol=crlf
```

Rationale:
- `text=auto` enables Git's binary heuristic so explicit `binary` patterns are not required for common binary formats. Git inspects the first 8000 bytes and falls back to binary if it sees a NUL byte.
- `eol=lf` overrides any future `core.autocrlf` change and matches the policy of the Deno/TypeScript server code and Docker images (Linux containers).
- `.bat`/`.cmd`/`.ps1` ride on the Windows convention. Today the repo has 0 `.bat`, 0 `.cmd`, and 8 tracked `.ps1` files; the rules apply prophylactically to future additions and immediately to the existing `.ps1` files.

### Renormalization commit

One commit on `main`:
- Adds `.gitattributes`
- Renormalizes every text file whose index blob disagrees with the new policy
- Commit message: `build: add .gitattributes and normalize line endings`

Predicted file changes when renormalize runs (from `git ls-files --eol` snapshot today):
- 4 files in `server/` flip from `w/crlf` → `w/lf` (already `i/lf`), staging will record no semantic diff
- 8 `.ps1` files will be inspected; any currently at LF flip to CRLF
- All other text files: no change (already match `text=auto eol=lf`)

### Verification suite

1. `git status` after renormalize: clean (no modified files)
2. `git ls-files --eol -- server/Dockerfile server/db/graph.sql server/db/schema.sql server/src/parseContext.ts` → all show `i/lf w/lf`
3. `git ls-files --eol -- '*.ps1'` → all show `i/crlf w/crlf`
4. `cd server && deno test --allow-net --allow-env --allow-read` → all tests pass (proves no semantic regression)

## Out of Scope

- Renaming or replacing `tools/fix-crlf.ps1` (misnamed but not broken)
- Adding pre-commit hooks to enforce policy (`.gitattributes` alone is sufficient)
- Adjusting `core.autocrlf` git config (`.gitattributes` overrides; no need)
- Touching any source code semantically — pure whitespace operation

## Risks

| Risk | Mitigation |
|---|---|
| Renormalize produces a huge commit that's hard to review | Single commit is acceptable; PR description should explicitly note "whitespace-only" and reviewers can use `git log --stat` to confirm zero substantive change |
| A `.ps1` file relies on LF endings (unlikely on PowerShell 7+) | Verification step #4 runs the test suite — if anything regresses, revert |
| Future PRs from non-Windows contributors re-introduce CRLF | `.gitattributes` makes this nearly impossible — Git will normalize at commit time |

## Acceptance Criteria

Phrased as observable behaviour:

1. After `git checkout` on a fresh clone, `git status` reports no modified files.
2. After running `git ls-files --eol`, every file listed by the four ST-008-relevant paths (`server/Dockerfile`, `server/db/graph.sql`, `server/db/schema.sql`, `server/src/parseContext.ts`) shows `i/lf w/lf`.
3. After running `git ls-files --eol -- '*.ps1'`, every tracked `.ps1` shows `i/crlf w/crlf`.
4. After `cd server && deno test --allow-net --allow-env --allow-read`, all tests pass with the same outcome as before this story.
5. The file `.gitattributes` exists at the repo root with the exact content specified in §"In Scope".

## Open Questions for PO

- **Value rating** — proposed Value=2 (low; debt-class hygiene story). PO to confirm during ExecPlan review.
- Anything else? (none anticipated)
