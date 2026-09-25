---
name: project-git-eol-semantics
description: "How Git's eol attributes actually behave on Windows checkouts — common AC mistakes to avoid in ExecPlans"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1e807240-f859-451f-bfbc-553a4f7f2a7a
---

When writing ExecPlans that assert `git ls-files --eol` output, get the semantics right:

- **`i/` column is the INDEX encoding.** Git **always** stores text files as LF in the index, regardless of `eol=crlf` attributes. There is no way to make `i/crlf` for a text file. Asserting `i/crlf` is Git-impossible.
- **`w/` column is the WORKING TREE encoding.** This is what's actually on disk. `eol=crlf` controls this on checkout. `eol=lf` also controls this on checkout.
- **`git add --renormalize .` only updates the index.** It does NOT rewrite the working tree. After a renormalize + commit, `w/crlf` can persist for text files under `eol=lf` until they're explicitly re-checked-out (`del && git checkout`, or `git rm --cached -r . && git reset --hard`).
- **`git status` clean is the real success indicator.** Because `.gitattributes` makes Git's comparison EOL-aware, `git status` correctly reports clean even when `i/lf w/crlf` mismatches the visual on disk. Working-tree LF for `eol=lf` files is cosmetic — index encoding is what matters for cross-platform consistency.

**Why this is in memory:** ST-030 (2026-05-20) escalated to plan-review because the ExecPlan asserted `i/crlf w/crlf` for `.ps1` files under `*.ps1 text eol=crlf`. The executor correctly observed `i/lf w/crlf` and halted. The plan was wrong. Resolution: revise ACs to assert only `i/lf` in the index for `eol=lf` files (allow `w/lf` or `w/crlf`) and `i/lf w/crlf` for `eol=crlf` files.

**How to apply:** When authoring an ExecPlan task involving line-ending normalization or `.gitattributes`:
- Assert `i/lf` for ALL text files (this is the index reality)
- Assert `w/` based on the `eol=` attribute, but treat `w/lf` vs `w/crlf` for `eol=lf` files as acceptable (force-checkout to make them match is cosmetic, not required)
- Primary success indicator is `git status --porcelain` returning empty
