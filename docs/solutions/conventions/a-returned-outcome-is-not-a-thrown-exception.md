---
title: "A returned outcome is not a thrown exception — every caller must be updated"
date: 2026-08-21
category: conventions
module: server
problem_type: convention
component: service_object
severity: high
applies_when:
  - "Converting a function that could throw into one that returns a result/outcome value for every response shape"
  - "Adding a new outcome variant to a type that callers already dispatch on by exact match"
  - "Reviewing a switch/if-chain over an outcome value that falls through to a default 'success' branch"
  - "Fixing an over-narrow outcome dispatch at one call site while a sibling call site nearby has the identical shape"
  - "A long-running loop or CLI exit code driven by matching one specific enum value out of several"
symptoms:
  - "A CLI command prints success and exits 0 while the spooled work it just tried to send is still queued"
  - "A daemon loop never terminates against a persistent error response, re-queuing and retrying it forever"
  - "The code logs the exact failure detail to stderr immediately before returning a success exit code"
  - "The test suite stays fully green over the defect because no test asserts the exit code for the newly added outcome variant"
  - "An automated code reviewer catches it; no test in the suite does"
resolution_type: code_fix
tags:
  - exception-handling
  - outcome-types
  - error-propagation
  - fall-through-default
  - silent-failure
  - cli
  - awcp
  - node-client
related_components:
  - "server/scripts/awcp-node-client.mjs"
---

# A returned outcome is not a thrown exception — every caller must be updated

## Context

`server/scripts/awcp-node-client.mjs` is the remote execution node's event producer: a
single-file, dependency-free Node script (`.mjs` because this repo tracks no
`package.json` at any level — `git ls-files | grep package.json` returns nothing, so
there is no `"type": "module"` to inherit). Its one job is to spool execution events
durably on disk and deliver them to the hub exactly once, surviving disconnection and
restarts.

Its delivery function, `flush()`, is written as an **outcome union** rather than as a
function that throws. Its docblock
([`awcp-node-client.mjs:1145-1183`](../../../server/scripts/awcp-node-client.mjs)) maps
each per-request result onto what `flush()` does about it; the set `flush()` itself
returns has six members, and those are best read off the returns rather than the
docblock: `acked` and `deferred` returned directly (`:1332` and the `deferred()` helper
at `:1230`), plus the four terminal ones routed through `stopTerminal` —
`terminal_auth`, `unknown_node`, `too_large`, `malformed` (`:1299`, `:1324`).

The design is deliberate and stated: callers are supposed to branch on `outcome`
explicitly rather than catch exceptions. During ST-092, commit `4f5e8e8`
("make flushOnce total over every response shape") took that promise one step further.
Two `await res.json()` calls — the 400 branch and the 200 branch — could **reject**, and
a rejection escaped `flushOnce` and came out of `flush()` as a thrown exception rather
than as a declared outcome. The commit routed both through a new `parseJsonBody` helper
that cannot reject, and made a parse failure return `{outcome: "malformed"}`. It also
made a 200 whose `acknowledged` array cannot be validated return `malformed` rather than
`acked`, so an unverifiable 200 could no longer delete events the hub never confirmed.

Every word of that is an improvement. It is also how the bug got its traffic.

**A throw propagates by default. A returned value does not.** Converting the first into
the second moved failure detection out of the language and into the callers — and no
caller was updated. The count is checkable: `malformed` return sites went from **2 to 5**
across that one commit.

```
$ git show main:server/scripts/awcp-node-client.mjs \
    | grep -c 'outcome: "malformed"\|stopTerminal("malformed")'
2
$ grep -c 'outcome: "malformed"\|stopTerminal("malformed")' \
    server/scripts/awcp-node-client.mjs
5
```

What the callers did with those outcomes is the finding. The standalone `flush` command
matched three of the six and let the other three fall through to success
(`git show main:server/scripts/awcp-node-client.mjs`, lines 876-885):

```js
    // Exit codes so a shell transcript records the outcome without parsing stdout:
    // 0 success, 75 deferred (retryable exhaustion, spool intact), 77 terminal auth
    // failure. `process.exitCode`, never `process.exit()`, so pending stream writes
    // flush before the process ends (T-03-04-06) — an exit code that arrives with a
    // truncated transcript defeats the point of capturing one.
    if (result.outcome === "terminal_auth") {
      process.exitCode = 77;
    } else if (result.outcome === "deferred") {
      process.exitCode = 75;
    } else {
      process.exitCode = 0;
    }
```

`unknown_node`, `too_large`, and `malformed` all landed in that `else`. The daemon,
`runAgent`, had the same shape in a different form: it checked only `terminal_auth`, so a
terminal outcome bought another lap of the loop instead of a shutdown.

The sharpest detail is what the process printed on the way to exit 0. `stopTerminal`
([`:1200-1206`](../../../server/scripts/awcp-node-client.mjs)) reads the spool, reports its
length, and says so on stderr:

```js
  const stopTerminal = (outcome, lineReason = outcome) => {
    const spooled = readSpool(config).length;
    write(
      `awcp-node-client: terminal reason=${lineReason} spooled_events=${spooled}\n`,
    );
    return { outcome, acked: delivered, delivered, remaining: spooled };
  };
```

**The code knew the events were still queued, printed that it knew, and then exited 0.**
An operator's transcript held both halves of the contradiction and the exit code — the
part a shell, a CI step, or a wrapper actually reads — carried the wrong one.

For the daemon the consequence was unbounded rather than merely misleading. Against a hub
returning 404 it queued events forever. That was observed, not theorised: the red control
for the regression test records the loop running **21 iterations and stopping only
because the test's own safety valve stopped it**
([`docs/verification/ST-092-declared-test-identity-delta.md:335`](../../verification/ST-092-declared-test-identity-delta.md)) —
`took 21 ticks and only stopped because the test's safety valve stopped it`.

**Two attribution facts that matter for how this is read.**

First, the hole **predated this branch**. `main` already has the `malformed` outcome and
already has the 77/75/0 dispatch. `4f5e8e8` widened the traffic into an existing hole
rather than opening it. An earlier session note in this repo called the finding "code this
PR authored"; that was wrong, and the correction is recorded in `e2109a1`'s message and in
the delta doc's *Attribution correction* section. The correction is part of the learning:
"this change made an existing latent path reachable" is a materially different claim from
"this change introduced a bug", and only the first one tells you where to look.

Second, **the same PR had already fixed the sibling instance**. Commit `0108a76` ("stop
lying about exit 0") changed `runAgent`'s final flush from
`flushResult.outcome === "terminal_auth" ? 77 : 0` to `flushResult.outcome === "acked" ? 0 : 75`
— the identical over-narrow match, correctly diagnosed and correctly inverted — while
leaving the CLI dispatch **seventy lines below it in the same file** untouched
(`:1449` and `:1519` at head `7c23444`; they were 37 lines apart on `main`). One file, two
dispatch sites, one fixed and one missed, in the same commit series.

And it was found by an automated code reviewer (Codex, on [PR #52](https://github.com/CAPeddle/ai-memory/pull/52)),
not by the test suite. The suite was fully green over the defect the entire time.

**Citation durability.** Every `file:line` below resolves on branch
`feat/st-092-node-client-hardening` at head `32cde90`, with PR #52 open and unmerged. The
branch SHAs cited (`4f5e8e8`, `0108a76`, `7c23444`, `e2109a1`) are branch commits and a
squash merge will rewrite them; the `main` citations are given as
`git show main:server/scripts/awcp-node-client.mjs` line numbers, which is the state the
defect existed in before this branch. Nothing in the guidance depends on these particular
lines still existing.

They are cited as SHAs anyway, and deliberately. The mechanical claims validator flags all
five as branch-local and advises replacing them with the PR number; that advice is correct
in general and **declined here**, because this learning turns on *which commit within one
PR* did what — one fixed a dispatch, another missed its sibling seventy lines away, a third
widened the traffic reaching both. Collapsing them to "PR #52" would name the container and
lose the finding. Read each as "the commit that did X", and link the PR when you need
something durable.

## Guidance

Three rules, in the order they would have caught this.

### 1. When you convert a throw into a returned value, enumerate the callers as part of the change

A thrown exception propagates by default: every frame between the throw and the nearest
`catch` fails automatically, whether or not its author thought about it. A returned
outcome value propagates only where a caller was written to propagate it. Converting one
into the other transfers the responsibility for failure propagation from the language to a
list of call sites, and **in JavaScript nothing will tell you the list is incomplete** —
no exhaustiveness check, no compiler warning, no lint rule.

So `grep` the function's call sites in the same change that widens its return type, not
afterwards:

```bash
grep -rn 'flush(' server/scripts/ server/tests/
```

Read each one and ask the concrete question: *given the new value, what does this caller
now do?* Not *does it compile* — it compiles either way. That is the whole hazard.

**Corollary, for when the closed set and its members live in different files.** Rule 1
assumes the thing to sweep is a *caller*. Sometimes it is an independent classifier over
a surface defined elsewhere, and then nothing links the two at all — not the type system,
not a call graph, not a grep for the function name. A permissive-default classifier is
safe only when its enumeration is mechanically derived from, or asserted against, the
real surface it classifies. A second hand-written table proves the classifier is
internally consistent, never that it is complete: it is the same-enumeration trap
described under *Why This Matters*, one file further out. When you add a member to the
real surface, the question is not "did I update the callers" but "what else independently
enumerates this set, and how would it have known?"

### 2. A fall-through `else` in an outcome dispatch must default to failure

This is the rule that would have made the miss loud instead of silent.

```js
// Before — the default is success
if (result.outcome === "terminal_auth")      process.exitCode = 77;
else if (result.outcome === "deferred")      process.exitCode = 75;
else                                          process.exitCode = 0;
```

`else { exitCode = 0 }` classifies *"an outcome I have never heard of"* as success. Every
outcome added after this code was written inherits that classification automatically, and
the addition looks harmless in review because the dispatch was not part of the diff.

Invert it so only the known-good outcome earns success:

```js
// After — server/scripts/awcp-node-client.mjs:1064-1067
function flushExitCode(outcome) {
  if (outcome === "acked") return 0;
  return outcome === "terminal_auth" ? 77 : 75;
}
```

Now an outcome nobody has thought of yet exits 75, which is wrong-but-loud rather than
wrong-and-silent, and a future seventh outcome fails visibly on its first run instead of
being quietly absorbed.

The asymmetry is the point: the set of things that mean "it worked" is small, closed, and
known at authoring time. The set of things that mean "it didn't" is open. Enumerate the
small closed set and let everything else fall to the other side.

This is [Fails Open / Fails Closed](../../../CONCEPTS.md) applied to an exit code rather
than to a boundary check. That entry's warning transfers exactly — *"a boundary check that
fails open is worse than none, because its passing result is read as enforcement"* — with
`exitCode = 0` as the passing result, and every shell, CI step, and supervisor reading it
as the enforcement being trusted.

### 3. Centralise the outcome-to-exit-code mapping so two callers cannot drift

Both callers now go through the same function — the CLI at `:1590`, and the daemon at
`:1485`, `:1502`, `:1509`, and `:1516`, which additionally consults a shared set of the
outcomes that mean *stop*:

```js
// server/scripts/awcp-node-client.mjs:1037-1042
const TERMINAL_FLUSH_OUTCOMES = new Set([
  "terminal_auth",
  "unknown_node",
  "too_large",
  "malformed",
]);
```

The drift this prevents was not hypothetical — it was already visible in the tree, with
`runAgent` saying `acked ? 0 : 75` and the CLI seventy lines away saying `terminal_auth ? 77 : 0`.
Two sites implementing one policy will disagree, and the disagreement is invisible because
each site reads correctly on its own.

### Sub-rule: a comment enumerating N cases beside a dispatch handling N cases is a staleness tripwire

The broken dispatch carried a comment that named exactly three outcomes — *"0 success, 75
deferred (retryable exhaustion, spool intact), 77 terminal auth failure."* That comment was
**true when it was written**. The dispatch was correct when `flush()` had three outcomes.
Outcomes were added underneath it over subsequent stories and the comment was never
revisited, so it kept asserting completeness for a set that had doubled.

When you widen an enum, `grep` for prose that enumerates it. A comment listing the members
is a load-bearing index of the places that assume the old count, and it is precisely the
thing nobody updates.

### Sub-rule: after fixing an over-narrow match, grep the same file for the same shape

`0108a76` diagnosed `terminal_auth ? 77 : 0` correctly and fixed one of the two places it
appeared. The remedy is mechanical and takes seconds — search the file for the *shape*
(`outcome ===`, `exitCode =`, the outcome names themselves) before considering the fix
done. This is the local, same-file case of
[fix the assumption, not the symptom](./fix-the-assumption-not-the-symptom.md); what makes
it worth restating is that the sibling here was in the same file, in the same commit
series, after several rounds of review, and still survived.

### On choosing an existing code over inventing a new one

`75` (EX_TEMPFAIL) is a slight abuse for `too_large` and `unknown_node`, since retrying
those will not help. It was still the right choice here, and the reason it is defensible is
that both of its preconditions are **written into the code so they can be re-checked**
(`:1049-1062`):

- Nothing in this repo restarts on an exit code, so 75 cannot become a poison-pill retry
  loop. Checked, and re-checkable: `git ls-files | grep -iE '\.service$|systemd'` finds no
  unit files — its single hit is `docs/design/SystemDesign.md`, which matches only because
  the lowercased filename contains the letters "systemd", a coincidence rather than a
  mention. `docker-compose.yml:112` is `restart: "no"`, and no wrapper script invokes the
  client — the only tracked non-doc references are the tests and planning artifacts.
- `stopTerminal`'s stderr line already names the precise reason, so a fourth exit code
  would buy discrimination the transcript already provides.

Record the conditions a judgement rests on, in the code, next to the judgement. A future
reader adding a `Restart=on-failure` unit needs to find that note; a note in a commit
message will not be found.

## Why This Matters

**The failure is silent, and silence here is worse than a crash.** Before `4f5e8e8`, an
unparseable hub response threw. A thrown exception is loud: a stack trace, a non-zero exit,
an obvious place to start. After the conversion the same condition produced a tidy JSON
line on stdout, a `terminal reason=... spooled_events=1` line on stderr, and **exit 0**.
Every automated consumer of that exit code — a shell `&&`, a CI step, a supervisor — reads
it as success. The change made the system's behaviour under a broken hub strictly harder to
notice while making its internal handling strictly more correct.

**A green suite is not evidence here, and it was actively misleading.** The pre-existing
exit-code test
([`server/tests/awcp-node-client.test.ts:1006-1055`](../../../server/tests/awcp-node-client.test.ts))
is named `main(["flush"]) sets process.exitCode to 0 on success, 77 on terminal auth, 75 on
exhausted retry`, and it asserts exactly those three cases. That is not coincidence — it is
**exactly the three outcomes the broken dispatch already handled**. The test and the
dispatch were written from the same three-outcome mental model, so the test could never
fail on the three outcomes that model omitted. A test derived from the same enumeration as
the code under test cannot detect that the enumeration is incomplete.

**For the daemon, the consequence was unbounded, not merely inaccurate.** A misreported
exit code on a one-shot CLI invocation is a wrong line in a transcript. The same over-narrow
match inside a loop is an infinite loop: 21 ticks in the recorded red run, and it would have
kept going. Against a hub that has forgotten this node (404), the client's spool grows
without bound while the process reports itself healthy via heartbeats.

**And the review path is the part that should change behaviour.** This got past a human
author who had *just fixed the identical bug seventy lines away*, past several review
rounds, and past a full green suite. It was found by an automated reviewer reading the file
as a whole. That is the signature of this defect class: it is invisible in a diff, because
the broken code is not in the diff. What changed was the *set of values flowing into* code
that stayed byte-identical. Diff-scoped review — human or automated — structurally cannot
see it. Only enumerating the callers at the moment you widen the return type can.

## When to Apply

Run the caller enumeration when a change has any of these shapes:

- **A `throw` becomes a returned value** — an outcome union, a result object, a
  `{ok, error}` pair, a nullable return, an error-as-value. The propagation guarantee you
  had for free is gone, and it is gone at every call site simultaneously.
- **A new member is added to an existing outcome union, status enum, or error-code set.**
  This is the cheaper and far more common version. The new member's *own* handling gets
  reviewed carefully; what needs checking is every existing dispatch that predates it.
- **A function's failure surface widens without its signature changing.** In an untyped or
  loosely-typed language this is every such change; even in TypeScript a widened string
  union only helps where the caller actually narrows exhaustively.
- **You are writing or reading a dispatch with a fall-through branch.** Ask what the
  default arm classifies an unknown value as. If the answer is "success", invert it —
  regardless of whether anything is currently wrong.
- **You just fixed an over-narrow match.** Grep the file, then the module, for the same
  shape before closing the thread.

Do **not** bother when the returned value's consumers are exhaustively type-checked and the
compiler fails on a missing case — a TypeScript discriminated union consumed via an
exhaustive `switch` with a `never` default already provides this mechanically.

**Be strict about what earns that exemption, though: the language does not, only the
construct does.** A pattern review of this repo's TypeScript found exactly one `switch`
statement in the whole server surface, over a CLI command string, and no `never`-default
exhaustiveness check anywhere. What actually recurs is an **if/else chain over a closed
union** — which TypeScript does *not* exhaustiveness-check, so the safety net the
exemption implies is not present. `server/src/consolidationWorker.ts:284-291` dispatching
on `Band` (`"promote" | "flag" | "skip"`) is the local example: a fourth band would
compile clean and fall into the `else`. It happens to fall toward *more* human review
rather than less, so it is restrictive-by-luck rather than dangerous — but the luck is
what is doing the work, not the type system.

The rule therefore applies to plain `.mjs` scripts and to typed if/else dispatch alike.

## Examples

### The dispatch that reported success while printing the opposite

Before, on `main` (`git show main:server/scripts/awcp-node-client.mjs`, lines 876-885) —
three of six outcomes handled, three falling through to 0:

```js
    if (result.outcome === "terminal_auth") {
      process.exitCode = 77;
    } else if (result.outcome === "deferred") {
      process.exitCode = 75;
    } else {
      process.exitCode = 0;
    }
```

After (`server/scripts/awcp-node-client.mjs:1582-1590`), the dispatch is one call and the
comment records what it used to do rather than re-enumerating outcomes that will change
again:

```js
    // Exit codes so a shell transcript records the outcome without parsing stdout —
    // see `flushExitCode` for the mapping and why only `acked` earns 0. This used to
    // enumerate the three outcomes it knew about and let the rest fall through to 0,
    // which is how a hub-rejected batch came to report success.
    //
    // `process.exitCode`, never `process.exit()`, so pending stream writes flush
    // before the process ends (T-03-04-06) — an exit code that arrives with a
    // truncated transcript defeats the point of capturing one.
    process.exitCode = flushExitCode(result.outcome);
```

The daemon's four sites (`:1485`, `:1502`, `:1509`, `:1516`) now ask
`TERMINAL_FLUSH_OUTCOMES.has(flushResult.outcome)` and derive the code from the same
`flushExitCode`, so neither surface can answer differently from the other.

### The sibling that survived its own fix

`0108a76` changed `runAgent`'s final flush and stated the reasoning correctly in its
message — *"A `deferred` result … returned exit 0. It now returns 75, the code `main`'s
`flush` command already uses for exactly this state, so the two surfaces agree."*

```diff
-      exitCode: flushResult.outcome === "terminal_auth" ? 77 : 0,
-      terminal: flushResult.outcome === "terminal_auth",
+      exitCode: flushResult.outcome === "acked" ? 0 : 75,
+      terminal: false,
```

That is the correct inversion, arrived at from the correct principle. The CLI dispatch
seventy lines below it in the same file kept its three-outcome `if`/`else if`/`else` chain
for another two commits.

The commit message's phrase — *"so the two surfaces agree"* — is the part worth dwelling on,
because it was **true as scoped**. That change was about `deferred`, and on `deferred` the
two surfaces really did now agree: `runAgent` went 0 → 75, and the CLI already mapped
`deferred` → 75. The author checked agreement on the outcome in front of them, found it, and
wrote it down truthfully. What never got asked was whether the two surfaces agreed on the
*other five* outcomes — and on three of them they did not. A narrowly-true verification is
exactly what makes this gap invisible: it produces a genuine, checkable, correct statement
that a reader will reasonably generalise into a claim nobody made.

### Tests written to fail first, and pinned to the caller rather than the outcome

Both regression guards were written before the fix and observed failing on their own
assertions (auto memory [claude]: *write the failing test before the fix, and make sure it
fails on its assertion*). The header above them states why they are aimed where they are
(`server/tests/awcp-node-client.test.ts:2770-2777`):

```
// Neither is observable from the outcome-level tests above: `flush()` already
// returns the right outcome in every case here. What is wrong is what the two
// CALLERS do with it — the CLI turns it into exit 0, and the daemon turns it
// into another lap of the loop. So these tests are deliberately pinned to
// caller-visible effects (process.exitCode, whether the loop terminates,
// whether the stop checkpoint reaches the spool) rather than to a returned
// `outcome` string, which was never the broken part.
```

That is the general lesson for testing this defect class. Asserting `flush()` returns
`malformed` would have passed against the broken code, because it did. The property under
test is the caller's *effect*.

`PR52-F1a` (`:2787-2833`) drives `main(["flush"])` through each terminal outcome and asserts a
non-zero exit — with a non-vacuity guard that the event really is still spooled, since if it
had been delivered a non-zero exit would be the wrong answer. Its recorded red output:
`malformed: reported exit 0 with 1 event still spooled`.

`PR52-F1b` (`:2835-2879`) proves the daemon terminates. It cannot simply assert termination,
because the unfixed loop does not terminate — it hangs, and a hanging test fails on a
timeout rather than on its assertion. So it installs a counting `sleepImpl` that stops the
controller after 20 ticks and converts the hang into a readable failure:

```js
    // A safety valve, not part of the property under test. Without it this test
    // cannot fail — it hangs, because the unfixed loop never terminates against a
    // 404. `safetyTripped` converts that hang into a readable assertion.
    const sleepImpl = () => {
      ticks += 1;
      if (ticks > 20) {
        safetyTripped = true;
        box.controller!.stop();
      }
      return Promise.resolve();
    };
```

Recorded red output:
`runAgent kept looping after a terminal unknown_node — it took 21 ticks and only stopped because the test's safety valve stopped it`.

## Related

- [Fix the assumption, not the symptom — the same flaw usually lives one branch over](./fix-the-assumption-not-the-symptom.md)
  — the general rule this is a violation of, and the reason this doc earns separate space:
  there, the sibling instance was found *one review round later*; here it was in the same
  file, seventy lines from a fix that had correctly diagnosed the identical shape, and it
  survived anyway. That doc is about searching after a fix; this one is about the specific
  construct — a widened return type meeting an unwidened dispatch — that makes the search
  necessary and the omission silent.
- [`CONCEPTS.md` › Fails Open / Fails Closed](../../../CONCEPTS.md) — the existing term for
  what the `else { exitCode = 0 }` branch does. Referenced rather than restated.
- [A control that fails for the wrong reason is not a control](./a-control-that-fails-for-the-wrong-reason-is-not-a-control.md)
  — why `PR52-F1b`'s safety valve is written the way it is: a test that hangs has not
  demonstrated the property, it has only failed to finish.
