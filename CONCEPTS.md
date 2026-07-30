# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Relationships

A Work Packet owns everything beneath it. It has many Agent Runs, many Operational Decisions, and many Verification Criteria. An Agent Run has many Checkpoints. A Verification Criterion has many Evidence Items. Every one of those relationships is contained — nothing under a Work Packet points into the Memory Domain, and the single link that does point outward, Promotion, is a nullable, non-authoritative pointer rather than a dependency.

## Workflow Operations

### Work Packet
The unit of supervised agent work: one objective, with its scope, constraints, an optional repository and branch binding, and a Policy Scope.

A Work Packet is the only authority for its own Policy Scope — nothing beneath it carries one independently. Lifecycle: open, in progress, blocked, complete. It reaches complete only through the Completion Gate.

### Agent Run
One agent's working session against a Work Packet.

A Run records whether it executed locally or on a remote execution node. It is running until it ends or fails, and it carries a last-activity time that Attention reads to judge staleness.

### Checkpoint
A narrated progress record within an Agent Run: what was completed, the current state, and optionally what is blocking and what comes next.

A Checkpoint is a meaningful event — recording one refreshes its Run's activity and clears a staleness signal. A Run that ends after its last Checkpoint has left its final state un-narrated, which Attention surfaces.

### Operational Decision
A question raised during execution that someone must answer before the work can be considered settled.

A Decision is either blocking or not; only an unresolved blocking Decision demands attention. Resolving one records the answer and may trigger Promotion. A Decision remains authoritative whether or not its Promotion succeeds.

### Verification Criterion
A named condition a Work Packet must satisfy, marked required or optional.

### Evidence Item
A record attached to a Verification Criterion that satisfies it — a manual note, a command result, or an external build reference.

Evidence is what the Completion Gate counts. A Criterion with no Evidence is unmet regardless of how obviously true it may seem.

### Completion Gate
The refusal that prevents a Work Packet reaching complete while any required Verification Criterion lacks Evidence.

The Gate is a refusal, not a warning: it rejects the completion outright and names the unmet criteria. Optional Criteria are ignored. A Packet carrying no required Criteria passes immediately.

### Attention
The derived set of reasons a Work Packet currently needs human notice.

Attention is computed from state on demand and never stored, so it cannot drift from the state it describes. It is decided by fixed rules rather than model inference, and its reasons are additive — a Packet can be blocked and stale at once. Reasons cover an unresolved blocking Decision, an explicit blocker, a run idle past a threshold, a run that ended without a final Checkpoint, and the one positive signal: every required Criterion satisfied and the Packet not yet complete.

### Policy Scope
A closed, controlled set of values on a Work Packet governing how far its content may travel.

Policy Scope is deliberately not a descriptive tag: the set is fixed, enforced at the database, and has no default, so every write must state a scope rather than inherit a permissive one. Anything derived from a Work Packet must carry that Packet's real scope — substituting a default silently widens the boundary the field exists to enforce.

### Promotion
Projecting a resolved Operational Decision into the Memory Domain as durable knowledge.

Promotion is optional, one-way, and non-authoritative. It happens outside the operational transaction, so a failure leaves the Decision intact and resolved; the resulting reference is a nullable pointer, and the Memory Domain may lose it without invalidating anything.

## Boundaries

### Memory Domain
The semantic-memory half of the system — the durable store of captured knowledge, together with the search and graph structures built over it — as distinct from Workflow Operations.

The separation is structural, not conventional: operational records live in their own schema, carry no foreign key into the Memory Domain, and the whole operational flow completes with the Memory Domain absent rather than merely degraded.
