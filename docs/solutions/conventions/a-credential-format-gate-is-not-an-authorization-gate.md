---
module: server
date: 2026-08-11
problem_type: convention
component: authentication
severity: high
title: "A credential format gate is not an authorization gate — name where the provisioned set lives"
tags:
  - security
  - authentication
  - authorization
  - credentials
  - enrolment
  - trust-on-first-use
  - plan-review
applies_when:
  - "Designing or reviewing any surface that authenticates with a 'pre-provisioned' or 'pre-shared' credential"
  - "Writing a spec, ADR, or plan that names a credential without naming who issues it"
  - "Reviewing code whose test helper can manufacture a valid credential"
  - "Adding an env-var-gated optional module that must never prevent boot"
related_components:
  - server/src/workflow/remoteNodeHub.ts
  - server/src/workflow/store.ts
  - server/tests/workflow-remote-node-hub.test.ts
  - docs/design/adr/ADR-016-awcp-consolidation-host-topology.md
---

# A credential format gate is not an authorization gate

## Context

ST-088 Phase 2 built the hub half of a remote execution-node protocol: an
authorized Ubuntu machine registers itself with a per-node bearer, receives a
`node_id`, and streams execution events to the hub.

The registration endpoint validated the bearer's **shape** —
`^[0-9a-f]{64}$`, the encoding of `openssl rand -hex 32` — and refused anything
that was also the platform operator key. It then upserted the digest into
`workflow.execution_nodes` and returned a real `node_id`.

Nothing established that the hub had ever been told to trust that bearer.
`curl` with any 64 arbitrary hex characters returned 201 and a working node
identity, then wrote unbounded events under it. This is trust-on-first-use,
and every downstream guarantee the phase shipped — ownership, attribution, the
cross-node injection guard — was scoped to a principal any caller could create.

It survived a pre-execution plan review, the implementation, a self-review, and
was caught by an independent code-review pass.

## The gap

The design said "pre-provisioned bearer" and never said **where the provisioned
set lives**. Those are two different statements, and only the second one is
implementable:

| Statement | What it constrains |
|---|---|
| "The bearer is a 32-byte machine secret" | Its **entropy** — how hard it is to guess |
| "The bearer is pre-provisioned" | Its **provenance** — who authorized it |

The format gate enforces the first and reads like it enforces the second. It
does not. `"a".repeat(64)` passes it. A format gate is a floor on encoded
entropy: it rejects shapes that *could not* carry a secret. It says nothing
about whether this particular value was ever issued.

Entropy without provenance is not authentication — it is a password that the
attacker gets to choose.

## Why it survived three reviews

Worth more than the bug itself, because these are the reusable tells:

**1. The invariant was asserted in prose, next to the code that didn't enforce it.**
`remoteNodeHub.ts` opened with a section headed *"Registration takes a
PRE-PROVISIONED bearer. It does not mint one."* Every reader — including two
who were specifically looking for security defects — read the docblock as a
description of the code. It was a description of the intent. A docblock stating
a security property is a claim to verify, never evidence.

**2. The test suite demonstrated the vulnerability and nobody read it that way.**
The suite's own helper was:

```ts
function mintBearer(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

Fifteen tests invented a credential from nothing, presented it, and asserted
**201**. That is the exploit, written down, passing in CI, read as a fixture.

> **The tell:** if your test helper can manufacture a valid credential with no
> reference to any issuing authority, and the system accepts it, the test is not
> a fixture — it is a proof of the hole. Ask of every credential fixture: *what
> in production plays the part this helper is playing?* If the answer is
> "nothing", that is the finding.

**3. The plan named the credential in the request, not the authority behind it.**
The plan specified the header, the format, the hashing, the storage column, the
uniqueness constraint, and the generation command. It never specified an issuer.
Reviewing "is the credential handled correctly?" returns clean; the unasked
question is "who decides this credential is legitimate?"

## The rule

**Any design that says "pre-provisioned", "pre-shared", "allow-listed", or
"authorized" must name the artifact that holds the provisioned set and the
operation that writes to it.** A table, an env var, a config file, an issuing
endpoint — something with a location and a writer. If a spec cannot answer
*"where does the trusted set live, and what puts entries in it?"*, that spec has
an authorization hole regardless of how carefully the credential itself is
handled.

Three checks that catch this class:

- **Separate the shape question from the provenance question** when reviewing.
  They read as one question and are answered by different code.
- **Ask what a fresh, well-formed, never-issued credential does.** If the answer
  is "it works", the system is trust-on-first-use whether or not it says so.
- **Trace each credential to an issuer.** A credential with no issuer named
  anywhere in the design is self-issued by definition.

## What we did

Enrolment now follows the `ssh-copy-id` split, which is also how a GitHub
Actions self-hosted runner joins: a **first** registration must additionally
carry an operator secret (`AWCP_NODE_ENROLMENT_SECRET`, presented in
`X-Node-Enrolment-Secret`); every **later** one needs only the bearer.

The gate sits on the INSERT branch of `upsertExecutionNode` alone. That split is
the design, not an optimisation:

- gating the whole endpoint would force the node to keep the operator's secret
  on disk forever, which is the property ssh keys exist to avoid;
- gating nothing is where this started.

Two supporting decisions worth carrying:

- **Unset means CLOSED.** An absent `AWCP_NODE_ENROLMENT_SECRET` refuses all
  enrolment. The opposite default reintroduces the original hole via a
  forgotten variable, and a forgotten variable is the likeliest deployment
  state. The cost is a quiet failure mode — a hub missing the variable answers
  401 to every registration, indistinguishable from a wrong bearer — so the
  variable must be declared in `.env.example` **and** named explicitly in
  `docker-compose.yml`, which enumerates the container's environment and
  silently drops anything not listed.
- **Read per request, never at boot.** The secret must not join
  `findMissingRequiredEnv`'s set: a deployment running no nodes is ordinary and
  must still start. An optional module may never be the reason a server fails to
  boot. `server/tests/startup-validation.test.ts` enforces this by recording
  every variable `ensureRequiredEnv` consults and asserting none is node-shaped
  — instrumenting `ensureRequiredEnv` rather than `findMissingRequiredEnv`,
  because boot calls three functions and a reader wired into one of them
  observes a third of the boot path.

## Related

- [Verification mechanisms need adversarial review](verification-mechanisms-need-adversarial-review.md)
  — the same failure family: a check that passes because its subject does not
  exist. This case is its sharper form, where the *test fixture* was the
  demonstration.
- [Fix the assumption, not the symptom](fix-the-assumption-not-the-symptom.md)
- [ADR-016 §2](../../design/adr/ADR-016-awcp-consolidation-host-topology.md) —
  the hub-and-client topology this credential exists to protect. Nodes hold no
  authoritative state, so the hub's node table is the only place "which machines
  are legitimate" is recorded, which is why its write path is the whole
  security boundary.
