# Story ID allocator

**This file is the authoritative set of allocated `ST-NNN` story identifiers, and the only
operation that writes to it is a mint append performed by [`story-id.sh`](../../story-id.sh).**
Nothing else allocates an ID. Identity is *not* derived from the story board, from `docs/plans/`,
from commit trailers, or from any other record of completed work — those record delivery, this
records allocation, and an ID that was reserved and never shipped exists only here.

The authoritative set is the **union of the `ST-NNN` lines in this file across every ref** — local
branches, remote-tracking branches, and the working tree — not just the copy on `main`. That union
is what `./story-id.sh --mint` scans, and it is why an ID reserved on an unmerged branch cannot be
handed out a second time.

**Allocation is provisional until its line reaches `main`.** An `ST-NNN` minted on a branch may not
be used anywhere else — not in a commit trailer, a plan filename, a board entry, or a document —
until the commit carrying its allocator line is merged to `main`. If two branches somehow claim the
same ID (only possible by bypassing `story-id.sh`), the losing branch is reallocated and its
references updated before it is accepted; the append-only, one-line-per-allocation shape below is
what makes that collision surface as a merge conflict rather than a silent duplicate.

Format — four columns, two spaces between each:

```
ST-NNN  YYYY-MM-DD  branch:<branch-name>  <purpose>
```

Lines are **append-only**. Never edit, renumber, reorder, or delete one — a deleted line is an ID
that gets handed out twice. Lines normally ascend, but two branches minting at the same time
legitimately leave a temporary gap (branch Y holds `ST-099` while `ST-098` is still provisional on
branch X), and merging them can leave the two lines out of sequence. Neither is an error and neither
risks a duplicate, because a mint takes `max(every ref) + 1` and refuses any other explicit ID.
Mint with:

```bash
./story-id.sh --mint "short purpose"          # takes the next unused ID
./story-id.sh --mint --id ST-NNN "purpose"    # asks for a specific ID; refuses if it is taken
./story-id.sh --check                         # read-only integrity + coverage check
```

## Seed

`ST-001`…`ST-097` are seeded as a single contiguous block, dated the day the allocator was created.
Contiguity is deliberate. Seven IDs in that range had **no** `### ST-NNN` entry on the story board when
this file was seeded —
`ST-023`, `ST-025`, `ST-027`, `ST-033`, `ST-046`, `ST-069`, `ST-095` — yet five of them are
demonstrably real allocations (`ST-069` has its own plan file and a merged PR; `ST-046` has an
ExecPlan and merged commits; `ST-023` and `ST-033` are cross-referenced from board rows that remain;
`ST-095` was live on the then-unmerged branch `docs/gsd-ce-drive-direction`, and its board entry
reached `docs/awcp-strategy-baseline` by merge later the same day). A board-derived seed
would therefore under-reserve and re-issue an ID already in use. The two with no trace at all
(`ST-025`, `ST-027`) are reserved rather than reclaimed, because absence of evidence is not evidence
that they were never handed out.

## Allocations

ST-001  2026-08-24  branch:main  seed:board — story-board.md entry
ST-002  2026-08-24  branch:main  seed:board — story-board.md entry
ST-003  2026-08-24  branch:main  seed:board — story-board.md entry
ST-004  2026-08-24  branch:main  seed:board — story-board.md entry
ST-005  2026-08-24  branch:main  seed:board — story-board.md entry
ST-006  2026-08-24  branch:main  seed:board — story-board.md entry
ST-007  2026-08-24  branch:main  seed:board — story-board.md entry
ST-008  2026-08-24  branch:main  seed:board — story-board.md entry
ST-009  2026-08-24  branch:main  seed:board — story-board.md entry
ST-010  2026-08-24  branch:main  seed:board — story-board.md entry
ST-011  2026-08-24  branch:main  seed:board — story-board.md entry
ST-012  2026-08-24  branch:main  seed:board — story-board.md entry
ST-013  2026-08-24  branch:main  seed:board — story-board.md entry
ST-014  2026-08-24  branch:main  seed:board — story-board.md entry
ST-015  2026-08-24  branch:main  seed:board — story-board.md entry
ST-016  2026-08-24  branch:main  seed:board — story-board.md entry
ST-017  2026-08-24  branch:main  seed:board — story-board.md entry
ST-018  2026-08-24  branch:main  seed:board — story-board.md entry
ST-019  2026-08-24  branch:main  seed:board — story-board.md entry
ST-020  2026-08-24  branch:main  seed:board — story-board.md entry
ST-021  2026-08-24  branch:main  seed:board — story-board.md entry
ST-022  2026-08-24  branch:main  seed:board — story-board.md entry
ST-023  2026-08-24  branch:main  seed:history — no board entry; cross-referenced by ST-019/ST-028/ST-029/ST-037 board rows and QP-028/QP-036/QP-037
ST-024  2026-08-24  branch:main  seed:board — story-board.md entry
ST-025  2026-08-24  branch:(none)  seed:reserved — no trace in tree or history; reserved so it can never be re-minted
ST-026  2026-08-24  branch:main  seed:board — story-board.md entry
ST-027  2026-08-24  branch:(none)  seed:reserved — no trace in tree or history; reserved so it can never be re-minted
ST-028  2026-08-24  branch:main  seed:board — story-board.md entry
ST-029  2026-08-24  branch:main  seed:board — story-board.md entry
ST-030  2026-08-24  branch:main  seed:board — story-board.md entry
ST-031  2026-08-24  branch:main  seed:board — story-board.md entry
ST-032  2026-08-24  branch:main  seed:board — story-board.md entry
ST-033  2026-08-24  branch:main  seed:history — no board entry; reserved as ST-032's follow-on implementation story (exec-plan-ST-032.md)
ST-034  2026-08-24  branch:main  seed:board — story-board.md entry
ST-035  2026-08-24  branch:main  seed:board — story-board.md entry
ST-036  2026-08-24  branch:main  seed:board — story-board.md entry
ST-037  2026-08-24  branch:main  seed:board — story-board.md entry
ST-038  2026-08-24  branch:main  seed:board — story-board.md entry
ST-039  2026-08-24  branch:main  seed:board — story-board.md entry
ST-040  2026-08-24  branch:main  seed:board — story-board.md entry
ST-041  2026-08-24  branch:main  seed:board — story-board.md entry
ST-042  2026-08-24  branch:main  seed:board — story-board.md entry
ST-043  2026-08-24  branch:main  seed:board — story-board.md entry
ST-044  2026-08-24  branch:main  seed:board — story-board.md entry
ST-045  2026-08-24  branch:main  seed:board — story-board.md entry
ST-046  2026-08-24  branch:main  seed:history — no board entry; .github/planning/execplans/exec-plan-ST-046.md plus merged commits a6a0823/590a0c6
ST-047  2026-08-24  branch:main  seed:board — story-board.md entry
ST-048  2026-08-24  branch:main  seed:board — story-board.md entry
ST-049  2026-08-24  branch:main  seed:board — story-board.md entry
ST-050  2026-08-24  branch:main  seed:board — story-board.md entry
ST-051  2026-08-24  branch:main  seed:board — story-board.md entry
ST-052  2026-08-24  branch:main  seed:board — story-board.md entry
ST-053  2026-08-24  branch:main  seed:board — story-board.md entry
ST-054  2026-08-24  branch:main  seed:board — story-board.md entry
ST-055  2026-08-24  branch:main  seed:board — story-board.md entry
ST-056  2026-08-24  branch:main  seed:board — story-board.md entry
ST-057  2026-08-24  branch:main  seed:board — story-board.md entry
ST-058  2026-08-24  branch:main  seed:board — story-board.md entry
ST-059  2026-08-24  branch:main  seed:board — story-board.md entry
ST-060  2026-08-24  branch:main  seed:board — story-board.md entry
ST-061  2026-08-24  branch:main  seed:board — story-board.md entry
ST-062  2026-08-24  branch:main  seed:board — story-board.md entry
ST-063  2026-08-24  branch:main  seed:board — story-board.md entry
ST-064  2026-08-24  branch:main  seed:board — story-board.md entry
ST-065  2026-08-24  branch:main  seed:board — story-board.md entry
ST-066  2026-08-24  branch:main  seed:board — story-board.md entry
ST-067  2026-08-24  branch:main  seed:board — story-board.md entry
ST-068  2026-08-24  branch:main  seed:board — story-board.md entry
ST-069  2026-08-24  branch:main  seed:history — no board entry; docs/plans/2026-07-03-002-feat-contact-memory-ci-coverage-plan.md, merged PR #22 (89648d3)
ST-070  2026-08-24  branch:main  seed:board — story-board.md entry
ST-071  2026-08-24  branch:main  seed:board — story-board.md entry
ST-072  2026-08-24  branch:main  seed:board — story-board.md entry
ST-073  2026-08-24  branch:main  seed:board — story-board.md entry
ST-074  2026-08-24  branch:main  seed:board — story-board.md entry
ST-075  2026-08-24  branch:main  seed:board — story-board.md entry
ST-076  2026-08-24  branch:main  seed:board — story-board.md entry
ST-077  2026-08-24  branch:main  seed:board — story-board.md entry
ST-078  2026-08-24  branch:main  seed:board — story-board.md entry
ST-079  2026-08-24  branch:main  seed:board — story-board.md entry
ST-080  2026-08-24  branch:main  seed:board — story-board.md entry
ST-081  2026-08-24  branch:main  seed:board — story-board.md entry
ST-082  2026-08-24  branch:main  seed:board — story-board.md entry
ST-083  2026-08-24  branch:main  seed:board — story-board.md entry
ST-084  2026-08-24  branch:main  seed:board — story-board.md entry
ST-085  2026-08-24  branch:main  seed:board — story-board.md entry
ST-086  2026-08-24  branch:main  seed:board — story-board.md entry
ST-087  2026-08-24  branch:main  seed:board — story-board.md entry
ST-088  2026-08-24  branch:main  seed:board — story-board.md entry
ST-089  2026-08-24  branch:main  seed:board — story-board.md entry
ST-090  2026-08-24  branch:main  seed:board — story-board.md entry
ST-091  2026-08-24  branch:main  seed:board — story-board.md entry
ST-092  2026-08-24  branch:main  seed:board — story-board.md entry
ST-093  2026-08-24  branch:main  seed:board — story-board.md entry
ST-094  2026-08-24  branch:main  seed:board — story-board.md entry
ST-095  2026-08-24  branch:docs/gsd-ce-drive-direction  seed:branch — allocated on an unmerged branch; main has never seen it; its board entry was carried onto docs/awcp-strategy-baseline by merge on 2026-08-24, so that branch holds it too
ST-096  2026-08-24  branch:main  seed:board — story-board.md entry
ST-097  2026-08-24  branch:main  seed:board — story-board.md entry
ST-098  2026-08-25  branch:main  st097 followups: observed-session restart-pinning fix, store.ts split, pre-existing test triage, browser-check refresh
ST-099  2026-08-25  branch:chore/st098-observed-session-follow-ups  restore authenticated OpenRouter egress from dev/test containers
ST-100  2026-08-27  branch:main  score the standalone AWCP peer-service topology against the six host criteria
ST-101  2026-08-27  branch:main  migrate prism-llm-wiki curated knowledge into ai-memory via capture tooling
