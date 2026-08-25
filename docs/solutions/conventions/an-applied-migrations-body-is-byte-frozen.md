---
title: "An applied migration's body is byte-frozen — correcting a comment inside one is an operational act"
date: 2026-08-22
category: conventions
module: server
problem_type: convention
component: database
severity: high
applies_when:
  - "Editing anything inside a `.sql` file under `server/db/workflow/`, including a comment or an EOL normalisation"
  - "Writing a comment that cites another file by line number, states a count, or reports another document's status"
  - "Reviewing a diff whose only change is comment text inside a migration"
  - "Deciding whether a self-describing stamp (SPIKE, TODO, DEPRECATED) can be corrected in place"
  - "Adding any checksum-verified artifact to this repo"
symptoms:
  - "A migration's SQL comment cites server/index.ts line numbers that no longer match the current file"
  - "A one-comment edit to an applied migration changes the raw-byte checksum computed in server/src/workflow/schema.ts"
  - "The pre-apply drift check aborts the whole migration run once the ledger's stored checksum no longer matches"
  - "With FEATURE_WORKFLOW=true the server logs FATAL and exits 1 before Deno.serve, so the port never opens"
tags:
  - migrations
  - checksum
  - drift
  - postgres
  - workflow-schema
  - applied-migration
  - stale-citation
  - fail-startup
related_components:
  - server/src/workflow/schema.ts
  - server/index.ts
  - server/db/workflow/001_workflow_schema.sql
---

# An applied migration's body is byte-frozen — correcting a comment inside one is an operational act

## Context

Knowledge track: this is a constraint to know before you edit, not a defect that
was fixed. Nothing here broke in production. The value is that a trap was found
and mapped before someone walked into it.

The Workflow Operations module runs its own migrations, separately from the
memory domain's boot chain. `server/src/workflow/schema.ts` is that runner, and
its ledger is `workflow.schema_migrations` — deliberately inside the schema it
manages, so `DROP SCHEMA workflow CASCADE` is the whole teardown
(`server/src/workflow/schema.ts:36-40`).

The runner identifies a migration by a SHA-256 over its **raw file bytes**:

- `server/src/workflow/schema.ts:98` (`checksumOf`) digests a `Uint8Array`
  directly.
- `server/src/workflow/schema.ts:184-190` (inside `discoverMigrations`) reads
  each file with `Deno.readFile` and checksums the bytes it got, decoding to
  text separately for execution.
- `server/src/workflow/schema.ts:117-118` (`checksumOfText`) is the same
  function over `new TextEncoder().encode(text)` — exported only so tests can
  derive a synthetic migration's checksum honestly.

There is no normalisation anywhere in that path. No trimming, no line-ending
canonicalisation, no comment stripping, no SQL parsing. A byte is a byte. The
runner's own docblock says so and names the local hazard:

> **Checksums hash raw file BYTES.** A line-ending change therefore reads as
> drift. That is intentional here (a `.sql` file whose bytes changed is a file
> that may no longer apply identically) but it is a real trap in this repo
> specifically, where `.gitattributes` normalises EOLs […] If a migration trips
> `MigrationDriftError` after nothing but a checkout, suspect EOLs before
> suspecting a bad edit.
> — `server/src/workflow/schema.ts:41-46`

Drift is not a warning and not a per-file skip. It is checked **before anything
is applied** and aborts the entire run: `server/src/workflow/schema.ts:260` is
the pre-apply loop, and `:265` throws `MigrationDriftError` out of it. A second
checksum comparison runs inside the advisory lock
(`MIGRATION_LOCK_KEY` at `server/src/workflow/schema.ts:68`) and throws at
`:310`, covering the case where two runners start from an empty ledger holding
different bytes for the same version.

The composition root turns that into a boot failure. `server/index.ts:77` calls
`bootstrapWorkflow()` (defined at `server/src/workflow/bootstrap.ts:60`); on
failure `server/index.ts:88` logs FATAL and `server/index.ts:91` calls
`Deno.exit(1)`. That happens at line 77 of a file whose `Deno.serve` is at
`server/index.ts:1310` — so with `FEATURE_WORKFLOW=true`, a drifted migration
means **the port never opens**. There is no degraded mode where workflow routes
500 and the rest of the server serves.

**Proof, not inference.** The dev database's ledger row for version 1 carries
exactly the digest of the committed file:

```bash
$ docker compose exec -T db psql -U ai_memory -d ai_memory \
    -c "SELECT version, filename, checksum FROM workflow.schema_migrations ORDER BY version;"
 version |          filename        |                            checksum
---------+--------------------------+------------------------------------------------------------------
       1 | 001_workflow_schema.sql  | 4b06c5833ceea60b9e36a9791cfba11f5b0726ffc98365f9000435abdb72e029
       …

$ sha256sum server/db/workflow/001_workflow_schema.sql
4b06c5833ceea60b9e36a9791cfba11f5b0726ffc98365f9000435abdb72e029  server/db/workflow/001_workflow_schema.sql
```

Byte-identical. Now change two numbers in one comment line and nothing else:

```bash
$ sed 's|server/index.ts:941, :997|server/index.ts:1033, :1089|' \
    server/db/workflow/001_workflow_schema.sql | sha256sum
2ead70f5778957e038103ec28381e3fafde2d2b1d468f3247f302e5ffd7b7584  -
```

Different digest, therefore `MigrationDriftError`, therefore exit 1 before the
port opens — on every database that already holds the `4b06c583…` row.

**A freeze vector that is not a restart, and not on the test database.** Several
workflow end-to-end tests boot a *real* server child process with the workflow feature
enabled, and that child reads `DATABASE_URL` from the environment it inherits — not from
anything the test pins. The test-database guard does not cover this: it is called only by
the two files that perform their own destructive teardown, and never on the server-boot
path. So running one of those e2e files **natively**, against the shared dev Postgres this
repo's own inner-loop documentation says native tests use, applies and permanently freezes
every pending migration there. It looks like a test run, not a deployment.

Before querying the dev ledger to decide whether a file is still editable, account for
that: a test run, not only a server restart, may already have applied it.

*(Checked and does not hold: starting the dev server alone is not a freeze vector. The
documented dev env file does not enable the workflow feature, and the bootstrap defaults
it off, so a bare dev start never touches the workflow schema.)*

**Why the trap is quiet — in CI, and in a freshly recreated test stack.**
`db-test` is tmpfs (`docker-compose.yml:86-87`), and tmpfs is wiped when its
**container** stops, not between commands run against it — CLAUDE.md documents
`db-test` itself as "shared and accumulating," which is the same fact stated
the other way round. A `db-test` recreated for this session (a fresh
`--profile test up`, or CI's clean runner) starts with no ledger row and
cannot reproduce the drift; CI is always this case
(`.github/workflows/ci.yml`: `docker compose --profile test up -d --build
--wait`, torn down with `down -v`). But a `db-test` a developer leaves running
across a checkout change keeps whatever ledger row it already had in that live
tmpfs — unless something in between drops it: `workflow-mvp-e2e.test.ts` runs
`DROP SCHEMA IF EXISTS workflow CASCADE` against whatever `DATABASE_URL`
points at (guarded to test databases only by
`server/tests/_helpers/testDatabaseGuard.ts`), and a run of that suite against
`db-test` wipes and re-migrates the `workflow` schema from the current files —
which also cannot reproduce a stale-checksum drift, because the schema it
lands with matches whatever is on disk *now*. So a comment edit inside an
applied migration is green in CI and in any freshly recreated or
just-workflow-tested `db-test`, and red on the dev database, on a `db-test`
left running with an older ledger row still in it, and on any other hub
deployment that already applied the migration. Do not assume `db-test` is safe
from this just because it is tmpfs — ask what has run against it since the
edit, not just whether the container restarted.

## Guidance

### 1. Decide whether the file is byte-frozen *before* you open it

Three questions, in order. Any "yes" chain means frozen.

**Is there a runner that reads this file?** For `server/db/workflow/*.sql` the
answer is `server/src/workflow/schema.ts`. Find the general case with:

```bash
grep -rn "readFile\|readTextFile" server/src --include=*.ts | grep -i "db/\|migration\|schema"
```

**Does that runner checksum it?** Look for a digest over what it read, and
check what it digests — bytes or a normalised form:

```bash
grep -n "checksum\|digest\|SHA-256" server/src/workflow/schema.ts
```

**Is there a ledger row for this exact file, on a database that will boot
again?** This is the question that decides it. A migration with no row anywhere
is still editable.

```bash
docker compose exec -T db psql -U ai_memory -d ai_memory \
  -c "SELECT version, filename, checksum, applied_at FROM workflow.schema_migrations ORDER BY version;"

sha256sum server/db/workflow/*.sql
```

Match by **version**, not filename: `applyMigrations` keys the ledger by
`version` (`const ledger = new Map(ledgerRows.map((r) => [r.version, r]))`,
`server/src/workflow/schema.ts`) and compares checksums for that version only —
the ledger's `filename` column is stored for operator legibility but plays no
part in the identity check. So if a **version number** in the query output
matches a version number among your local files and the two checksums agree,
that file's bytes are frozen for as long as that database lives, even if the
file has since been renamed; matching by filename alone would wrongly call a
renamed-but-unedited migration editable. Run the query against every hub
deployment that has ever booted with `FEATURE_WORKFLOW=true`, not just the one
on your machine — the dev database and any other Postgres a workflow-enabled
server boots against both count. Execution nodes do not: in the hub-and-client
topology (ADR-016 §2), a node holds no database credential and no ledger to
enumerate. Neither the dev database nor any other hub deployment is visible
from the test stack.

### 2. Treat the freeze as a feature, not an obstacle to route around

The temptation is to read `MigrationDriftError` as an over-strict check that
should have ignored comments. It should not. The runner cannot tell a comment
from a statement without parsing SQL, and a parser that is wrong once is a
parser that silently lets a real DDL change through. Hashing bytes is the
version of this check that cannot be fooled. A `.sql` file whose bytes changed
is a file that **may** no longer apply identically, and the runner is correct to
refuse rather than to guess.

Do not add comment-stripping, whitespace normalisation, or an "only comments
changed" escape hatch. Each of those trades a loud, early, total failure for a
quiet divergence between what the database holds and what the repo claims it
holds.

### 3. Know the real cost before you decide a change is worth it — and know what a checksum rewrite does not do

**This procedure only ever rewrites the ledger's record of the bytes — it never
replays the statements.** `applyMigrations` keys the ledger by `version` and,
for any version already present, skips straight to `report.skipped` without
running `migration.statements` again (`server/src/workflow/schema.ts`). So
updating the checksum on an already-applied database does not apply the edited
SQL to it: the objects that migration created stay exactly what the *original*
statements produced, while a database migrating from scratch reads the edited
file and gets different objects. That makes the sequence below sound for
exactly one class of edit — a byte change you can prove is behaviourally inert,
such as a comment or a line-ending normalisation, where nothing needs to
actually happen inside the database because the checksum was the only thing
wrong. It is not a way to apply a behavioural fix: doing that with only a
checksum update leaves already-migrated databases silently holding schema they
do not match the repo's claim of, which is precisely the divergence the
checksum exists to prevent, now produced on purpose instead of by accident.

Changing an applied migration's bytes is a **coordinated operational change**,
not a commit. The full sequence, for a provably inert byte change:

1. Enumerate every hub deployment that has applied the migration (the dev
   database, and any other Postgres a workflow-enabled server boots against —
   not execution nodes, which hold no database credential or ledger; see §1
   above).
2. For each, before its next boot, update the ledger row:
   `UPDATE workflow.schema_migrations SET checksum = '<new>' WHERE version = N;`
3. Verify the new digest matches `sha256sum` of the committed file on the exact
   commit those databases will run.
4. Only then merge, and sequence the merge against those restarts.

Miss any database and it fails to start — not degrade, fail — with a FATAL log
naming a checksum mismatch nobody caused that day.

A wrong **behaviour** is exactly the case this procedure cannot handle — the
skip means there is no checksum-only path that makes an already-applied
database's schema match a corrected statement. The normal answer for a wrong
statement is a new numbered migration; the normal answer for wrong prose is to
put the prose somewhere editable. This sequence exists only for the case where
the migration's behaviour was never wrong — only the record of its bytes was.

### 4. Do not put drift-prone content inside a file you cannot edit

This is the design conclusion, and it generalises past migrations to any
checksum-verified or otherwise frozen artifact.

Drift-prone content is anything whose truth depends on something outside this
file:

- **Line-number citations** (`server/index.ts:941`) — the cited file moves.
- **Counts** ("four sites", "six modules") — the set grows.
- **Status claims about other documents** ("ADR-016 is Proposed") — the
  document changes.
- **Self-descriptions with a shelf life** (`SPIKE / DISPOSABLE`, `TODO`,
  `DEPRECATED — remove in v2`) — the shelf life expires.

Inside a frozen file, write instead:

- **Anchor to symbol names, not lines.** `the bare SET search_path in
  graph_traverse and graph_search, and in entityWorker's two AGE helpers`
  survives every refactor that renumbers lines. A grep for the symbol finds the
  site; a line number just misdirects.
- **State the invariant, not the census.** "Any bare `SET search_path` on a
  pooled connection makes `workflow` non-implicit" stays true as sites are
  added or removed; "four sites" is wrong the moment a fifth lands.
- **Keep the prose editable and leave a pointer.** One durable line —
  `-- Rationale and current call sites: docs/solutions/conventions/schema-qualify-sql-age-search-path-pollution.md`
  — costs nothing to keep accurate, because the file it points at is a file you
  can still edit.

**A note on this document's own citations.** It cites line numbers freely, which
looks like it violates the rule above. It does not: the prohibition is scoped to
files you cannot edit. This file is editable, so when a citation here rots,
someone can fix it — that is the whole distinction the rule turns on. The
census table below is here for the same reason, and pointedly not in the
`store.ts` docblock it describes.

### 5. "It's only a comment" is not a safety argument when the checksum is over bytes

The phrase to distrust, in a handoff or a PR description, is any variant of
*"the smallest correct fix: two numbers in a SQL comment, no behaviour
change."* Every clause is locally true and the conclusion is wrong. There is no
behaviour change **in the SQL**; the behaviour change is that the server stops
booting. Safety is a property of the whole system that reads the file, not of
the characters you typed.

Apply the same suspicion to anything else with a recorded fingerprint:
lockfiles, vendored tarballs (see CLAUDE.md's Docker section), signed
artifacts, and fixture files whose hash a test asserts.

### 6. When you cannot correct a frozen self-description, say so where the reader will be

Leaving a known-false stamp in place is defensible; leaving it in place silently
is not. Put the correction in the nearest editable file the reader is likely to
reach, state plainly that the frozen copy still says the old thing, and explain
why it could not be changed. Otherwise the module carries two self-descriptions
and the reader has no way to tell which one is current.

**Provenance of the design.** The byte-level checksum and the docblock that
explains it arrived together in a single squash — `094b141`, PR #34
(ST-084 Stage 1) — and a session-history probe over the seven days of prior
work in this repository found no session that debates the tradeoff. There is no
record of normalisation being considered and rejected; the runner was authored
whole, with its rationale written into the docblock at the time. So the
docblock is the primary source for *why*, and this document is the first record
of what it costs. (session history)

## Why This Matters

**The freeze does not cause comment rot. It removes your ability to fix it.**
That distinction is the whole lesson, and the tree proves it right now.

The stale citation `server/index.ts:941, :997` — those lines are now
`server/index.ts:1033` and `:1089`, both still `SET search_path = ag_catalog,
"$user", public` — existed, when this document was drafted, in **six** places:

| Location | Editable? | State |
|---|---|---|
| `server/db/workflow/001_workflow_schema.sql:17` | **No** — applied, checksummed | stale, permanently |
| `server/src/workflow/store.ts:7` | Yes | **fixed in PR #53**, after this was drafted |
| `docs/solutions/conventions/schema-qualify-sql-age-search-path-pollution.md:33` | Yes | stale on `main` |
| `docs/investigations/ST-084-awcp-host-spike-findings.md:207` | Yes | stale |
| `.planning/phases/02-remote-node-identity-hub/02-RESEARCH.md:100` | Yes | stale |
| `.planning/phases/02-remote-node-identity-hub/02-PATTERNS.md:497` | Yes | stale (writes it `L941`, so `:941` greps miss it) |

One copy is unfixable. **Four remain simply unfixed.** The sixth is the sharpest
evidence in this document, and it was found by the code review of PR #53 rather
than by the author: `server/src/workflow/store.ts` had its docblock edited by
that PR — line 13, the disposability stamp — while the stale citation **six
lines above it** survived the edit untouched. The author was editing that exact
comment block, in a PR whose entire subject was correcting stale comments, and
did not see it. It has since been corrected on the same branch; the miss is
recorded rather than quietly fixed, because the miss is the lesson.

Note also that `02-PATTERNS.md` writes the citation as `L941` rather than
`:941`, so the obvious grep does not find it — a census of copies is itself
drift-prone. And the one correction that does exist —
`schema-qualify-sql-age-search-path-pollution.md:33` reading `1033`/`1089` — is
stranded on the branch `docs/refresh-conventions-learnings`, which has no open
PR; `main` and PR #53's branch both still read `941`/`997`.

*(Note for anyone re-reading the brief that produced this document: it asserted
that a `ce-compound-refresh` pass "corrected the identical citation" in that
learnings doc. Verified against the tree, the correction exists only on that
unmerged branch. Writing it as done would have planted exactly the class of
stale cross-document claim this doc exists to warn about.)*

So the honest conclusion is not "frozen files rot." It is: **line-number
citations rot everywhere, and most copies never get fixed even when fixing them
is free.** The checksum's contribution is to convert one instance of ordinary,
tolerable rot into a permanent, load-bearing contradiction — and to make the
attempt to fix it an outage.

**The second-order cost is visible in the module's self-description.** PR #53
(open, `chore/conventions-refresh-code-followups`) corrected six
`SPIKE / DISPOSABLE` stamps across
`server/src/workflow/{types,service,attention,ports,store,schema}.ts`, because
the module has grown well past what that stamp assumes — PR #53's commit
message (`be46218`) records 12 source files, 4 migrations and 11 test files,
exercised by the ST-086/087/088/092 suites. (The 4 migrations are verified by
`ls server/db/workflow/`; the other two counts are that message's, quoted rather
than re-measured — a doc about rotting counts should say which of its own it
checked.) Deleting the module is no longer the cheap act the stamp assumes. The stamps were corrected rather than removed, since
ADR-016 is still Proposed — Conditional.

A **seventh** stamp, `server/db/workflow/001_workflow_schema.sql:4`, could not
be. So the module now carries two contradictory self-descriptions, and the
newer one has to spend ten lines explaining the older one
(`server/src/workflow/types.ts:19-27`): *"A seventh stamp survives, and not by
oversight… Correcting it means updating the ledger checksum on every database
that has already applied it. That is an operational act, not a comment fix."*

That explanation is the tax. Every future reader of the migration reads a claim
the module has retired, and every future reader of `types.ts` reads a paragraph
that exists only to neutralise it. Frozen files accumulate exactly this kind of
divergence, and the accumulation is one-way.

**The failure mode reaches the learnings corpus too.** Two learnings quote the
now-retired stamp as a hedge —
`docs/solutions/conventions/fix-the-assumption-not-the-symptom.md:97` and
`docs/solutions/conventions/verification-mechanisms-need-adversarial-review.md:102`
— both saying, in effect, "the module is stamped `SPIKE / DISPOSABLE`, so read
these citations as historical if the spike is disposed of." Their *reasoning*
still holds (the module is still provisional), but the quoted string is stale.
Nothing about those two files is frozen; they are just two more copies nobody
has reached yet.

**And the blast radius is inverted from where you would test.** Green in CI and
in a freshly recreated (or just-workflow-tested) `db-test`, red on the dev
database, on a `db-test` left running with an older ledger row, and on any
other hub deployment — see "Why the trap is quiet" above for the `db-test`
nuance. A change that looks fully verified is verified only in the
environments structurally incapable of showing the problem — and per
CLAUDE.md, a PR into an integration branch runs no CI at all, so the local run
is the only gate anyway.

## When to Apply

Apply this before you touch:

- **Any file under `server/db/workflow/`**, for any reason including a typo, a
  comment, a reflow, or an EOL normalisation. Check the ledger first.
- **Any file whose content a runner fingerprints**, in this repo or a future
  one: migrations, lockfiles, vendored tarballs under `docker/`, fixtures whose
  hash a test asserts.
- **Any comment you are about to write that cites another file by line
  number**, states a count of anything, or reports another document's status —
  whether or not the file is frozen. Prefer symbol anchors and invariants; if
  the file *is* frozen, treat drift-prone content as forbidden rather than
  discouraged.
- **Any self-describing stamp** (`SPIKE`, `TODO`, `DEPRECATED`, "temporary")
  you are about to place in a file that may become frozen. Put it in a sibling
  you can edit and point at it.

Apply it also when **reviewing**: a diff touching a `.sql` file under
`server/db/workflow/` deserves the ledger question even when the diff is
whitespace, and a handoff note describing a migration edit as small deserves
the same question before it is believed.

It does **not** apply to migrations that have never been applied anywhere —
a new `005_*.sql` on a branch is an ordinary file until the first database
records it. Edit it freely, and get the comments right before it lands.

## Examples

### The trap, stated as it was almost walked into

A session handoff described the remaining work as:

> the smallest correct fix: two numbers in a SQL comment. No behaviour change.

The file was `server/db/workflow/001_workflow_schema.sql`, ledger row present,
digest `4b06c583…`. What that edit would actually have produced:

```
[server] FATAL: Workflow Operations was enabled (FEATURE_WORKFLOW=true) but its
migrations failed: MigrationDriftError: …
```

from `server/index.ts:88`, followed by `Deno.exit(1)` at `server/index.ts:91`,
1233 lines before `Deno.serve` at `server/index.ts:1310` — on the dev database
and on any other hub deployment that already applied the migration, while a
freshly recreated `db-test` and CI stayed green.

### Checking before editing — the three commands

```bash
# 1. Is there a checksumming runner for this directory?
grep -n "checksum\|SHA-256" server/src/workflow/schema.ts
#   98: async function checksumOf(bytes: Uint8Array)          ← raw bytes
#  189:       checksum: await checksumOf(bytes),
#  260-265: pre-apply drift loop -> throw MigrationDriftError
#  310:     under-lock drift throw

# 2. What does the ledger hold?
docker compose exec -T db psql -U ai_memory -d ai_memory \
  -c "SELECT version, filename, checksum FROM workflow.schema_migrations ORDER BY version;"

# 3. Does the committed file still match?
sha256sum server/db/workflow/*.sql
```

Matching pair in (2) and (3) => frozen. All four current migrations match:
`001` `4b06c583…`, `002` `999d98ac…`, `003` `a63c371b…`, `004` `2841f724…`.

### Bad comment / good comment, same fact

Frozen file, `server/db/workflow/001_workflow_schema.sql:15-18` as it stands:

```sql
-- requirement, not a style preference: four sites in the memory domain issue a
-- bare `SET search_path = ag_catalog, "$user", public` inside a multi-statement
-- sql.unsafe() on a POOLED connection (server/index.ts:941, :997;
-- server/src/entityWorker.ts:115, :125). That SET is session-scoped and sticky,
```

Two drift-prone constructs in four lines: a count ("four sites") and four line
numbers, two of which are now wrong. A version that would still be true today:

```sql
-- requirement, not a style preference: the memory domain issues bare
-- `SET search_path = ag_catalog, "$user", public` inside multi-statement
-- sql.unsafe() calls on POOLED connections — see the AGE paths in
-- server/index.ts (graph_traverse, graph_search) and
-- server/src/entityWorker.ts. That SET is session-scoped and sticky, so
-- `workflow` is NEVER implicitly on the path. Current call sites and the
-- full rationale: docs/solutions/conventions/schema-qualify-sql-age-search-path-pollution.md
```

Symbol anchors survive renumbering; the invariant survives a fifth site
appearing; the census lives in a file that can still be corrected.

**That is what it should have said before it was ever applied. Do not now edit
`001` to match** — that is the coordinated operational change described above,
not a cleanup.

### The seventh stamp, and why `grep` appears to disagree

```bash
$ grep -rn "SPIKE / DISPOSABLE" server/
server/src/workflow/types.ts:20: * server/db/workflow/001_workflow_schema.sql still opens `SPIKE / DISPOSABLE`,
server/db/workflow/001_workflow_schema.sql:4:-- SPIKE / DISPOSABLE. Full teardown:

$ grep -rln "PROVISIONAL" server/src/workflow/
server/src/workflow/attention.ts
server/src/workflow/service.ts
server/src/workflow/store.ts
server/src/workflow/ports.ts
server/src/workflow/schema.ts
```

Five files, not six — because `types.ts` carries the long-form note
(`server/src/workflow/types.ts:19-27`) instead of the one-line
`PROVISIONAL — not a throwaway spike; gated on ADR-016. See types.ts.` marker
the other five carry. PR #53 changed six `.ts` files; the sixth is the one doing
the explaining. The only surviving `SPIKE / DISPOSABLE` assertion is the frozen
one at `001_workflow_schema.sql:4`; the other hit is `types.ts` quoting it in
order to retire it.

### Known-stale, deliberately not fixed here

Recorded so the next person does not have to rediscover them. All four are
editable; none is urgent; each should be fixed on a branch that is not already
touching the same lines (commit `be46218` declined to fix two of them for
exactly that reason, to avoid manufacturing a conflict with
`docs/refresh-conventions-learnings`):

- `docs/investigations/ST-084-awcp-host-spike-findings.md:207` — same citation.
- `.planning/phases/02-remote-node-identity-hub/02-PATTERNS.md:497` — same
  citation, written `L941`/`L997`, so a `:941` grep misses it.
- `.planning/phases/02-remote-node-identity-hub/02-RESEARCH.md:100` — same
  citation. (Its "four sites" count is still accurate — `entityWorker.ts:115`,
  `:125`, `index.ts:1033`, `:1089`. Drift-*prone* is not drifted; only the line
  numbers are wrong today.)
- `docs/solutions/conventions/fix-the-assumption-not-the-symptom.md:97` and
  `docs/solutions/conventions/verification-mechanisms-need-adversarial-review.md:102`
  — both quote the retired `SPIKE / DISPOSABLE` string as a hedge; the
  reasoning holds, the quoted string does not.

And the one that cannot be fixed without an operational change:
`server/db/workflow/001_workflow_schema.sql:17`.

## Related

- `docs/solutions/conventions/schema-qualify-sql-age-search-path-pollution.md`
  — the underlying `search_path` constraint the frozen comment is trying to
  explain, and the editable home its prose should have had.
- `docs/solutions/conventions/fix-the-assumption-not-the-symptom.md` — reaches
  the same runner from the other side: its worked example is the drift check
  that was added before the advisory lock while the re-check under the lock
  still compared only the version.
- CLAUDE.md § "Line endings — non-trivial" — why byte-level checksums are a
  sharper hazard in this repo than elsewhere.
- ADR-016 (`docs/design/adr/ADR-016-awcp-consolidation-host-topology.md`) —
  the acceptance gate that keeps the module PROVISIONAL rather than accepted.
