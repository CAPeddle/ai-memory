---
title: "Fix the assumption, not the symptom — the same flaw usually lives one branch over"
date: 2026-07-31
category: conventions
module: server
problem_type: convention
component: service_object
severity: high
applies_when:
  - "Fixing a defect a reviewer or test reported at one specific call site or code path"
  - "Reclassifying an outcome (succeeded / failed / indeterminate) inside one catch or conditional branch"
  - "Hardening one enforcement point of an invariant that is enforced in more than one place"
  - "Tightening or inverting a predicate that runs over an enumerated input set"
  - "Concluding that a lock, retry, or timeout is the narrowest fix that closes a window"
symptoms:
  - "A port timeout was correctly reclassified as indeterminate; the very next catch branch still called every other rejection a definite non-event"
  - "A checksum drift check was added before the advisory lock, but the re-check under the lock still compared only the migration version"
  - "FOR UPDATE alone could not close the completion gate — a criterion arriving after commit is not a race, so a frozen-contract status check was also needed"
  - "An import allowlist was sound but ran over a hardcoded file list, so new module files were never scanned at all"
  - "Three review rounds, each finding the same shared assumption one branch over from the fix accepted in the round before"
resolution_type: code_fix
tags:
  - code-review
  - fix-scope
  - sibling-branches
  - invariants
  - error-handling
  - concurrency
  - migrations
  - boundary-checks
related_components:
  - "server/src/workflow/ports.ts"
  - "server/src/workflow/service.ts"
  - "server/src/workflow/schema.ts"
  - "server/src/workflow/store.ts"
  - "server/tests/workflow-boundary.test.ts"
  - "docs/solutions/conventions/verification-mechanisms-need-adversarial-review.md"
---

# After a fix, go looking for the assumption — not the symptom

## Context

The ST-084 spike ([PR #34](https://github.com/CAPeddle/ai-memory/pull/34), branch
`claude/st-084-awcp-host-spike`) went through three rounds of external review. Each round
produced fixes that were correct. Two of those rounds produced fixes that left the
identical defect alive one branch over, and the *next* round found it.

That asymmetry is the whole finding. The reviewer did not re-find the original bug — the
original bug was genuinely fixed. It found the second copy of the flawed **assumption**,
sitting in a sibling code path that the reported symptom had never touched.

§13a of [the spike findings](../../investigations/ST-084-awcp-host-spike-findings.md)
records the sequence:

| Round | Fix that landed | What round N+1 found in a sibling path |
|---|---|---|
| 2 | A port **timeout** is `indeterminate`, not a failure | The *next catch branch in the same function* still returned `failed` for every other rejection |
| 2 | Module owns its own ordered migrations, with a pre-lock drift scan | The re-check **under** the advisory lock compared only `version`, so a two-runner race reported a clean skip |

Both were found by the reviewer, one round after the fix that should have covered them.
The author wrote the fix, read the diff, and moved on.

A third case has the same shape but a different discovery path, and it is the one worth
copying. Inverting the boundary test's import blocklist to an allowlist (round 1) hardened
the *predicate*; the file **enumeration underneath** the predicate stayed a hardcoded
six-name array, so newly added workflow files were never scanned at all. The author found
that one — not from a review comment, but from deliberately re-reading the post-fix file
and asking what the hardened check iterated over. That is the practice working, one round
earlier than a reviewer would have got to it.

A fourth case is included below because it shows the failure mode's near neighbour: a fix
that is correct *and* insufficient, where no sibling search would have helped because the
second gap needs a structurally different mechanism.

**This pattern predates ST-084 in this repo**, which is why it is worth a convention rather
than a spike footnote. The clearest prior instance is six weeks older: one unguarded
`"isError" in` narrowing replicated across three MCP handlers
([parseContext null safety](../runtime-errors/parsecontext-null-safety-in-operator-crash-2026-06-23.md)),
whose own write-up records the sibling sweep being performed *and then rejected in review as
insufficient*. Its Related Findings add two more second-enforcement-site defects:
`detectBootstrapVersions` probed migrations 1–4 but not 5, and `feedback_events` landed in
`005` but not in `schema.sql`.

**Why ordinary review does not catch this.** Four automated security-review passes ran over
these same diffs on 2026-07-30 and landed directly on three of the four defect regions —
`service.ts`/`ports.ts`, the `ensureWorkflowSchema` → `tx.unsafe(ddl)` path, and the
`addCriterion` lock — returning clean verdicts on all of them. They could not have caught
these: every pass scoped itself to the supplied diff and asked *"is the new code safe?"*,
never *"does the assumption this code just corrected also hold in the adjacent path?"* The
sibling instance is by definition outside the diff. (session history)

**Citation durability.** Every `file:line` below resolved on branch
`claude/st-084-awcp-host-spike` as of 2026-07-31, with PR #34 still open against a feature
branch. Line numbers are pinned to the PR rather than to a commit SHA deliberately — the
branch SHAs are local-only and a squash merge rewrites them. PR #34 has since merged as
`094b141`, so these resolve on `main`. Whether they keep resolving turns on the module's
governance status rather than on any marker in its source: acceptance is gated on ADR-016,
Proposed — Conditional at its revision 1.3. If that gate resolves against the module, read the
citations as historical illustration. **(2026-08-26: the gate resolved, and it did go against the
module as a co-tenant — ADR-016 is **Accepted** at rev 1.5 with **Candidate A rejected**, making
this an extraction donor for a standalone AWCP peer service. But do **not** yet read the citations
as historical: ADR-016's Consequences state that nothing moves in the tree, so the module is stable
and supported in place until an extraction plan retires it. Re-read this hedge when that plan
lands.)** This deliberately no longer rests on the module's
`SPIKE / DISPOSABLE` stamps — a hedge anchored to a comment string expires whenever someone
edits the comment. Nothing in the guidance depends on that code still existing.

## Guidance

**When a fix changes how a belief is represented, the fix is not done until you have
enumerated the other places that hold the same belief.** The defect was reported at one
site because that is where a symptom happened to be observable. The assumption is usually
wider than the observation.

Concretely, after landing a fix, spend the five minutes to walk this list:

1. **The other arms of the same `catch` / `switch` / `if`.** If you reclassified one
   rejection, read every other rejection path in the same function and ask whether the
   reclassification's *reason* applies to it. In instance 1 the reason was "the signature
   cannot express whether a side effect occurred" — which is a property of the signature,
   not of timeouts.
2. **The second place the same invariant is enforced — especially pre-lock vs under-lock.**
   Any check that runs twice for correctness reasons (an optimistic pass and an
   authoritative pass) has two implementations of one rule, and they drift. Ask directly:
   *does the second copy compare everything the first one compares?* In instance 2 it did
   not, and the pre-lock copy **could not** cover the gap by construction — the ledger row
   did not exist when it ran.
3. **The layer beneath a predicate you just hardened.** A sound predicate over an unsound
   input set is still unsound
   ([`server/tests/workflow-boundary.test.ts:41`](../../../server/tests/workflow-boundary.test.ts)).
   Ask what the check *iterates over*, not just what it asserts.
4. **The inverse operation.** If you added a lock-and-refuse to a writer, the deleter of the
   same rows is the sibling. This one is live and unfixed in the tree:
   `completePacket`'s docblock records that a concurrent evidence DELETE is a different
   writer on a different table that the packet lock does not cover, and that closing it
   generally needs SERIALIZABLE "or the same lock-and-refuse treatment on `attachEvidence`'s
   inverse" (`server/src/workflow/store.ts:543-548`). Found by applying this rule; recorded
   as a residual rather than papered over.

### Sub-rule: sweeping the siblings is the floor, not the ceiling

Where the duplicated assumption can be collapsed to a **single enforcement site**, that
removes the sweep from all future work instead of repeating it. The prior parseContext
incident is the cautionary version: the sibling sweep was done, all three handlers were
fixed, and review still rejected it — the durable fix collapsed the assumption into one
importable type guard.

The best example in this PR went the right way and is easy to miss because nothing broke.
When promotion was found to hardcode `policyScope: "personal"` for every packet — silently
widening the boundary the field exists to enforce — the fix did **two** things: it read the
packet's real scope, *and* narrowed `PromotionInput.policyScope` from an open `string` to
the closed `PolicyScope` union (`server/src/workflow/ports.ts:151-163`), so any future
caller passing a wrong scope fails at compile time rather than at runtime in some sibling
path nobody swept. (session history)

Ranked, cheapest durable remedy first: a **database constraint**, a **closed type**, a
**single shared guard**, then — only when none of those fit — a sibling sweep plus a test on
each site. This mirrors the sibling learning's rule that where a constraint can replace an
assertion, prefer the constraint.

### Sub-rule: invert the default to fail-safe rather than document a requirement

Instance 1 offered two fixes. The reviewer's suggestion was to document in the port contract
that an adapter "may reject only before any side effect." That was **rejected**, and the
rejection is recorded in the code that shipped:

> Requiring "reject only before any side effect" in the port docs would be an invariant
> neither the type system nor the network can enforce, which is the kind of prose-only claim
> this PR keeps having to retract. Fail safe instead: silence costs precision, never
> correctness.
> — `server/src/workflow/service.ts:153-160`

The shipped fix inverted the default instead. `failed` became **opt-in**: an adapter must
throw `PromotionNotAttemptedError` (`server/src/workflow/ports.ts:50`) to declare that
nothing was committed, and everything else classifies as `indeterminate`. A prose
requirement makes the sibling instance reappear the first time someone writes an adapter
without reading the docblock. A fail-safe default makes silence cost precision instead of
correctness.

## Why This Matters

A partial fix is worse than an obvious gap, because it **retires the suspicion**.

When the symptom is unfixed, it stays visible: the thread is open, the finding is unresolved,
and the next reviewer starts from "this is broken." When the reported site is fixed, all of
that closes. The review thread resolves, the finding gets a green row in the disposition
table, a test lands that proves the reported case, and the sibling instance now sits behind
a passing test and a closed comment. Nobody looks there again, because the area has been
marked *handled*.

Instance 1 is the sharpest version. After round 2, `resolveAndPromoteDecision` had a
correct, tested, commented timeout branch — and eight lines below it, a branch that returned
`status: "failed"` with a comment asserting the projection "definitely did not happen." A
caller reading the fixed function would reasonably conclude the outcome vocabulary was
sound. The four-valued status made the vocabulary *look* rigorous while one of its four
values was still being handed out on no evidence.

Instance 2 is worse in kind, because the sibling was the authoritative copy. The pre-lock
drift scan was correct and could never have caught the race; the under-lock recheck was the
only code that could, and it compared the wrong thing. Two runners in a mid-rollout deploy
would both report a clean, successful, zero-error migration run while the database held one
of their two schemas.

## When to Apply

Run the sibling search when the fix has any of these shapes:

- **The fix changes how a *belief* is represented** — a classification, a status enum, an
  invariant, a check — rather than correcting a localized value. Values are local; beliefs
  are held in more than one place.
- **The fix touches one arm of a conditional.** Read the other arms before you close the
  thread. This is the cheapest item on the list and it caught nothing in this PR only because
  nobody did it.
- **The fix touches a check that exists in more than one place.** Optimistic-then-
  authoritative, pre-lock-then-under-lock, client-side-then-server-side: two copies of one
  rule, and only one of them was in the traceback.
- **The fix hardens a predicate.** Then ask what feeds it.
- **The fix adds a guard to a writer.** Then ask about the deleter, the updater, and the
  cascade.

Do **not** run it for a value fix (a wrong constant, an off-by-one, a typo'd column name) —
those have no assumption to propagate.

One practical note on where to look: a review method that excludes test files from its
findings gives up the cheapest available signal for this class, because the sibling instance
is usually *proved* by the absence of a test on the sibling branch rather than by anything
visible in the production diff. (session history)

## Examples

### Instance 1 — the branch eight lines below the fix

Round 2 correctly reclassified a timeout. `withPortTimeout` uses `Promise.race`, which
abandons the losing promise without cancelling it, so the adapter's request is still in
flight (`server/src/workflow/ports.ts:71-100`):

```ts
// server/src/workflow/ports.ts:88-100
export function withPortTimeout<T>(
  port: string,
  op: Promise<T>,
  timeoutMs: number = PORT_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new PortTimeoutError(port, timeoutMs)), timeoutMs);
  });
  return Promise.race([op, bound]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}
```

So a timeout became `indeterminate` (`server/src/workflow/service.ts:143-151`). The
assumption that fix invalidated was *"a rejection proves the side effect did not happen."*
That assumption was also holding up the very next branch, which still returned:

```ts
// Before round 3 — the sibling instance
return { status: "failed", ref: null, error: (err as Error).message, decision };
// with a comment stating the projection definitely did not happen
```

A remote adapter can commit and then reject: response lost, connection reset, payload
undecodable. `promoteDecision(): Promise<string>` cannot express the difference
(`server/src/workflow/ports.ts:139-146`).

Round 3 inverted the default (`server/src/workflow/service.ts:153-173`):

```ts
    if (!(err instanceof PromotionNotAttemptedError)) {
      return {
        status: "indeterminate",
        ref: null,
        error: `${(err as Error).message}; the adapter did not declare whether a ` +
          "projection was committed, so whether one exists is unknown",
        decision,
      };
    }

    // ...unless the adapter DECLARED it never projected, which is the only basis on
    // which this can be called a definite non-event.
    return { status: "failed", ref: null, error: (err as Error).message, decision };
```

Two adapters make the two cases real rather than hypothetical:
`CommitThenRejectMemoryAdapter` pushes to `mintedRefs` and *then* rejects with a plain
`Error` (`server/src/workflow/ports.ts:215-231`), proving the conservative default;
`LateSuccessMemoryAdapter` mints its ref after the caller's bound has elapsed
(`server/src/workflow/ports.ts:260-289`), proving the orphaned projection a timeout leaves
behind. `FailingMemoryAdapter` throws `PromotionNotAttemptedError`
(`server/src/workflow/ports.ts:200-202`), keeping `failed` reachable so the vocabulary is
four-valued in fact and not just in name.

**On what `indeterminate` costs the caller:** asking again is the only recovery available,
and the port contract names `decisionId` as the idempotency key that would make that safe —
while stating plainly that nothing in this spike proves any adapter honours it, so no retry
here may be described as safe (`server/src/workflow/ports.ts:120-137`).

### Instance 2 — the same rule, enforced twice, compared differently

`applyMigrations` checks drift twice, deliberately. The pre-lock scan compares checksums for
every version the ledger already records (`server/src/workflow/schema.ts:260-272`):

```ts
  // 1. Drift, before anything is applied.
  for (const migration of migrations) {
    const recorded = ledger.get(migration.version);
    if (recorded === undefined) continue;
    if (recorded.checksum !== migration.checksum) {
      throw new MigrationDriftError(/* ... */);
    }
  }
```

The re-check inside the per-migration transaction, after `pg_advisory_xact_lock`, originally
selected only `version` and returned "skipped" if a row existed. Two runners starting from an
**empty** ledger with different bytes for the same version both pass the pre-scan — there is
no row to compare against — the winner applies, and the loser reports a clean skip while the
database holds the winner's contents. The pre-lock scan cannot cover this by construction.

```ts
// server/src/workflow/schema.ts:303-319 — after
        const already = await tx.unsafe<{ filename: string; checksum: string }[]>(
          `SELECT filename, checksum FROM ${ledgerTable} WHERE version = $1`,
          [migration.version],
        );
        const recorded = already[0];
        if (recorded !== undefined) {
          if (recorded.checksum !== migration.checksum) {
            throw new MigrationDriftError(
              migration.version,
              migration.filename,
              recorded.checksum,
              migration.checksum,
              recorded.filename,
            );
          }
          return false;
        }
```

The checksum is the only thing raised on. The recorded filename is carried for diagnosis
only — a rename with identical content is not drift
(`server/src/workflow/types.ts:181-184`). A second defect surfaced while fixing this: the
surrounding `catch` would have wrapped `MigrationDriftError` in `MigrationApplyError`,
collapsing the distinction the subclasses exist for, so drift is now re-thrown untouched
(`server/src/workflow/schema.ts:332-338`).

The proof is a two-runner race using a held-lock barrier
(`server/tests/workflow-migrations.test.ts:230-316`), with a non-vacuity guard that refuses
to let the test pass unless runner B genuinely blocked:

```ts
// server/tests/workflow-migrations.test.ts:278-288
        let blocked = false;
        for (let i = 0; i < 100 && !blocked; i++) {
          const [{ n }] = await sql<{ n: string }[]>`
            SELECT count(*) AS n FROM pg_locks
            WHERE locktype = 'advisory' AND NOT granted
              AND objid = ${MIGRATION_LOCK_KEY}
          `;
          if (Number(n) > 0) blocked = true;
          else await new Promise((r) => setTimeout(r, 20));
        }
        assert(blocked, "runner B never blocked on the advisory lock — test is vacuous");
```

### Instance 3 — one mechanism made the race deterministic without making it safe

The near neighbour: a fix that is correct and insufficient, where no sibling search helps
because the remaining gap is not another instance of the same assumption — it needs a
structurally different mechanism.

`addCriterion` was a bare INSERT, so a required criterion could land between the completion
gate's criteria read and its UPDATE. Adding `FOR UPDATE` serialises it against
`completePacket` on the same `work_packets` row. It does nothing about a criterion arriving
*after* completion commits — which is not a race at all, and which no lock prevents. The
shipped `addCriterion` does both, and its docblock says so outright
(`server/src/workflow/store.ts:431-434`):

> Locking alone is not sufficient, which is easy to get wrong: it makes the race
> deterministic without making it safe, because a criterion inserted *after* completion
> commits is not a race at all and still breaks the invariant. Hence the status check — once
> a packet is complete its verification contract is frozen.

```ts
// server/src/workflow/store.ts:444-450
  return await sql.begin(async (tx: SqlExecutor) => {
    const packets = await tx<WorkPacket[]>`
      SELECT * FROM workflow.work_packets WHERE id = ${packetId} FOR UPDATE
    `;
    const packet = packets[0];
    if (packet === undefined) throw new WorkflowNotFoundError("work packet", packetId);
    if (packet.status === "complete") throw new CriteriaFrozenError(packetId);
```

Both orderings are then safe: criterion first and the gate sees the unmet requirement and
refuses; gate first and the criterion is refused. The lock and the freeze landed in a single
commit — the insufficiency was caught on the review thread before the fix shipped, not a
round later. The generalisable part is the diagnostic question: *does this mechanism close
the window, or only make it deterministic?* Serialising two operations does not constrain
what either of them is allowed to do once it wins.

### Instance 4 — the layer beneath the predicate

Round 1 inverted the boundary test's import blocklist to an allowlist
(`server/tests/workflow-boundary.test.ts:80-96`) — the right fix, and covered in detail by
[Review the verification mechanism as adversarially as the code](./verification-mechanisms-need-adversarial-review.md).
The enumeration the predicate ran over stayed a hardcoded six-name array, so a new file in
`server/src/workflow/` was never scanned and nothing noticed. The check failed **open** one
level above the rule it enforced.

```ts
// server/tests/workflow-boundary.test.ts:34-51 — after
/**
 * Enumerate the module's `.ts` files from the DIRECTORY, never a literal list.
 * ...
 * Inverting the import blocklist to an allowlist did not fix the enumeration underneath it —
 * a sound predicate over an unsound input set is still unsound.
 */
async function readTsSources(dir: URL): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    out.set(entry.name, await Deno.readTextFile(new URL(entry.name, dir)));
  }
  if (out.size === 0) throw new Error(`source enumeration found no .ts files in ${dir}`);
  return out;
}
```

The control points the same function at a different real directory and requires it to return
that directory's contents (`server/tests/workflow-boundary.test.ts:191-220`) — an
in-CI-runnable substitute for an earlier probe-file version that needed `--allow-write` and
therefore only ran on one machine.

## Related

- [A returned outcome is not a thrown exception — every caller must be updated](./a-returned-outcome-is-not-a-thrown-exception.md)
  — the sharpest recorded instance of this rule, and the one that argues hardest for it. There
  the sibling was **seventy lines away in the same file**, in the same commit series, and the
  commit that fixed one site said "so the two surfaces agree" — true as scoped, about the one
  outcome it had checked, and silently generalised into a claim nobody had verified. It also
  adds the construct this doc does not name: a fall-through `else` that defaults to *success*,
  which is what turns a missed sibling from loud into silent.
- [Review the verification mechanism as adversarially as the code — especially when the
  deliverable is evidence](./verification-mechanisms-need-adversarial-review.md) — the
  sibling learning from this same PR, covering allowlist-vs-blocklist, non-vacuity and
  discrimination controls, and prose-only invariants. This doc is the *follow-through*: that
  one is about writing a check that can fail, this one is about what to search after a check
  has been fixed. Its Residual section now defers the general rule here and records the
  instance as closed.
- [parseContext null safety in operator crash](../runtime-errors/parsecontext-null-safety-in-operator-crash-2026-06-23.md)
  — the strongest prior instance in this repo, six weeks older than ST-084: one unguarded
  `"isError" in` narrowing across three MCP handlers. Read its *What Didn't Work*, which is
  the sibling sweep being done and still judged insufficient, and its Related Findings for two
  further second-enforcement-site defects.
- [Schema-qualify SQL against AGE search_path pollution](./schema-qualify-sql-age-search-path-pollution.md)
  — the same enumerated-sites shape from the other end: four call paths carrying one
  identical bare-`SET search_path` assumption, with an explicit warning that a fifth site
  extends the blast radius.
- [ST-084 spike findings §13a](../../investigations/ST-084-awcp-host-spike-findings.md) —
  the per-round disposition table this learning was extracted from, including the round-3
  entries for instances 1 and 2.
