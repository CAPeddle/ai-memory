---
title: A cross-AI review lane can answer confidently without ever receiving your prompt
date: 2026-08-19
category: workflow-issues
module: review-workflow
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "Running /gsd-review (or any cross-AI review) and treating each lane's output as a peer review"
  - "Driving an external agent CLI headlessly — --print, -p, --output-format, or any non-interactive mode"
  - "Passing a large prompt to a CLI as a positional argument rather than via stdin or a file"
  - "Adding a new reviewer lane to a host and confirming it works before relying on it"
  - "Writing a REVIEWS.md, verification artifact, or ADR input that cites what a reviewer concluded"
related_components: [tooling, documentation]
tags: [cross-ai-review, gsd-review, antigravity, agy, silent-failure, headless-cli, prompt-loss]
---

# A cross-AI review lane can answer confidently without ever receiving your prompt

## Context

The gsd-review workflow already warns about one lane failure mode: a lane that returns
**empty** output after a long run has been killed by a timeout, not crashed, and must be
treated as a dropped lane rather than diagnosed as a CLI fault. Its exact words are that "a
cross-AI review that silently drops a lane is blind in one eye."

Running `/gsd-review --phase 3 --all` against ST-088 Phase 3 surfaced a worse variant of the
same hazard, and one the workflow does not name: a lane that returns output which is
**non-empty, fluent, well-formatted, and entirely unrelated to the review you asked for**.

Three separate Antigravity CLI (`agy` 1.1.15) invocations returned polished markdown — headed
sections, a formatted table of options, usage examples — explaining what the `--effort` flag
does. Not a review. Not an error. Not a refusal. Roughly 700–1300 bytes of confident,
plausible prose, produced by a run that exited 0.

Had those bytes been pasted into `03-REVIEWS.md` without being read, the artifact would have
carried a "second reviewer" section that reviewed nothing.

## Guidance

**Before you trust any reviewer lane's output, verify two things independently: that the lane
received your prompt, and that it could read what it claims to have read.**

Neither is implied by exit code 0, and neither is implied by output being present and
well-written.

**1. Canary the prompt channel before the real run.** One cheap call with a known answer
proves the transport end to end:

```bash
agy --print 'reply with exactly: CANARY-OK'
```

If the response is anything other than the token — especially if it reads like *documentation
for a flag you passed* — the prompt never reached the model. That signature is the tell:
when the prompt is missing, the agent appears to answer a question about whatever flag was on
the command line. Passing `--effort` produced docs about `--effort`; passing `--input-format`
produced docs about `--input-format`.

**2. Verify grounding from the output itself, not from the invocation.** A review that was
supposed to read the tree should carry `path:line` citations. Check for them, and check for
whatever "I could not read the repo" marker the prompt asked for:

```bash
grep -c "REVIEWED-WITHOUT-REPO-ACCESS" review.md
grep -oE "(server|docs)[A-Za-z0-9_./-]*:[0-9]+" review.md | sort -u | head
```

Then spot-check two or three of those citations against the real file. In this session both
lanes' cited lines were opened and confirmed, which is what made it safe to record their
findings as verified.

**3. Treat an off-topic lane exactly like an empty one** — a dropped lane, re-run with the
cause fixed. Do not fold it into a consensus, and do not report it as a lane that ran.

## Why This Matters

A dropped lane that returns *nothing* is self-announcing; you cannot paste it into a document
by accident. A dropped lane that returns *fluent prose* defeats every check short of reading
it, and review artifacts are exactly where that goes unread — a `REVIEWS.md` section is
skimmed for its verdict, and a verdict is present.

The blast radius is durable. `REVIEWS.md` is committed, feeds `/gsd-plan-phase --reviews`, and
in this case feeds an ADR-016 host decision. A fabricated reviewer section in that chain is
worse than no second reviewer, because it converts a known gap ("only one lane ran") into an
invisible one.

The cost of the check is one CLI call.

## When to Apply

- Before the first real run of any newly added reviewer lane on a host
- After changing invocation flags, even ones that look unrelated to the prompt
- Whenever a lane's output is markedly shorter than a review of that scope should be
- Before quoting any lane in a committed artifact

## Examples

### The `--effort` flag discards the positional prompt (agy 1.1.15)

Verified on a 30-byte prompt, which rules out any size explanation:

```bash
# Broken — returns formatted documentation about the --effort flag
agy --print --effort high 'reply with exactly: EFFORT-OK'

# Works — returns EFFORT-OK
agy --print 'reply with exactly: EFFORT-OK'
```

Every failed run in this session carried `--effort`; every successful one omitted it. The
working recipe for a large review was a **short** positional prompt pointing the agent at a
prompt file on disk, letting it read the file with its own tools:

```bash
agy --print 'Read /tmp/review/prompt.md in full, then perform the review its
"## Review Instructions" section specifies, verifying claims against the source
under /home/cpeddle/projects/ai-memory. Output only the finished markdown review.'
```

That produced a 26KB source-grounded review citing files the other lane never opened.

### A large positional prompt is a separate trap

Passing a 283KB prompt as `"$(cat prompt.md)"` fails loudly:

```
/usr/bin/timeout: Argument list too long
```

This is the per-argument cap (`MAX_ARG_STRLEN`, 128KB on stock Linux), not the total `ARG_MAX`
— so "it fits in ARG_MAX" is not the relevant test. This failure is *loud*, unlike the
`--effort` one. Whether a sub-128KB positional prompt round-trips reliably was **not**
established here: the chunked attempt was confounded by the `--effort` bug and never produced
a clean result either way. Prefer a file reference over a large positional argument.

### Headless permission denial produces zero output, not partial output

`agy` in `--print` mode auto-denies any tool it cannot prompt for, and the whole run then
yields nothing:

```
jetski: no output produced — a tool required the "read_file" permission that headless
mode cannot prompt for, so it was auto-denied.
```

Grants go in `~/.gemini/antigravity-cli/settings.json` under `permissions.allow`. Two things
that cost time here:

- **Path-scoped globs are not honoured.** `read_file(/home/cpeddle/projects/ai-memory/**)`
  and `read_file(/home/cpeddle/projects/ai-memory/*)` were both still denied; only the bare
  wildcard `read_file(*)` worked. There appears to be no way to scope the read grant to one
  directory.
- **It reaches for shell regardless of instructions.** Explicitly telling the agent it had no
  shell permission and must use only its file-reading tool did not stop it requesting
  `command`; the run still produced nothing. Source-grounded review required granting
  `command(*)` — effectively standing unrestricted shell for every future `agy` session.

Do **not** reach for `--dangerously-skip-permissions` as the shortcut. The gsd-review workflow
bans hook-trust bypass flags outright (its #2479 note), and Claude Code's own safety classifier
denies Bash commands carrying the flag — so the "easy" path fails twice before it starts.

## Related

- [Verification expires when the verified surface changes](verification-expires-when-the-verified-surface-changes.md) — the same family of hazard: a recorded result that no longer means what it appears to mean.
- [The GSD commit helper omits the Story trailer](gsd-commit-helper-omits-story-trailer.md) — another case of a generic tool succeeding by its own lights while failing this repo's requirement.
- [Verify a worktree change against the Docker test stack](verify-worktree-change-against-docker-test-stack.md) — a passing command that proved something about code you did not edit.

One adjacent point, kept out of scope here because it is a reporting practice rather than a
tooling failure: when only one lane survives, the "Agreed Concerns" and "Divergent Views"
sections of a `REVIEWS.md` are defined as requiring 2+ reviewers and cannot be filled without
manufacturing cross-validation. Leave them explicitly empty and say the consensus criterion
was not met.
