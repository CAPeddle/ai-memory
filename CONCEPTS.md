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

A Decision is either blocking or not; only an unresolved blocking Decision demands attention. Blocking describes intent and drives notice — it does not gate a Work Packet's completion, which turns on Evidence alone.

Resolution is once and final. Re-resolving with the same answer returns the stored record unchanged, preserving when the answer was originally given; a different answer is refused as a conflict rather than overwriting the first. Resolving may trigger Promotion, and a Decision remains authoritative whether or not its Promotion succeeds.

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

An attempt does not resolve to success or failure. It resolves to one of four outcomes, because what the caller should do next differs in each: the projection exists and its reference is recorded; it exists but the reference was not recorded, so it must be reconciled rather than repeated; it demonstrably never happened, which is the only case where simply repeating it is safe; or its status is unknown, because the attempt was abandoned or the far side never said — and an unknown attempt may still succeed after the caller has given up on it. Since unknown is unavoidable rather than exceptional, the Decision's own identity serves as the idempotency key: repeated attempts carrying it must yield at most one projection.

## Delivery Workflow

### Story
The tracked unit of deliverable work, identified by a stable label that appears in its board entry, in its Plan, and in the trailer of every commit made for it.

Stories move across a continuous-flow board — backlog, in progress, in review, done — under strict limits on how many may occupy the working states at once, rather than through sprint boundaries. Implementation is gated: a Story needs a board entry and a written Plan before work on it begins.

The commit trailer is load-bearing rather than decorative. Because a Plan records no progress, the trailer is the only thing that makes a Story's shipped work retrievable from history — so a commit that omits it still ships code, but becomes invisible to the Story that owns it.

### Plan
The written decision artifact for a Story, carrying its product contract, requirements, and implementation units.
*Avoid:* ExecPlan — the retired predecessor format, kept only as historical record.

A Plan records decisions, not progress: execution state is derived from commit history rather than written back into the document body. A Plan and its Story cross-reference each other, and neither is considered ready without that link.

## Boundaries

### Memory Domain
The semantic-memory half of the system — the durable store of captured knowledge, together with the search and graph structures built over it — as distinct from Workflow Operations.

The separation is structural, not conventional: operational records live in their own schema, carry no foreign key into the Memory Domain, and the whole operational flow completes with the Memory Domain absent rather than merely degraded.

## Verification Practice

These name a distinction this project draws sharply and relies on in code comments as well
as prose: whether a check can actually fail for the reason it claims to exist — and, once a
suite of such checks exists, how its result is judged from one run to the next.

### Red/Green Control
A test whose subject is *another* check's mechanism rather than the system under test — it establishes that the check fires when it should and stays quiet when it should not.

Narrower than the general test-first sense of red/green. Here it names a companion test written specifically to prove that a scan, guard, or assertion is capable of failing at all. A check that has never been observed to fail is not yet known to work, and one that cannot fail is indistinguishable from one that found nothing.

### Non-Vacuity Guard
An assertion that a check examined something, kept separate from the assertion about what it found.

A scan over an empty input set passes every claim made about its contents. The guard makes that case loud rather than green — it asserts that the inspected set was non-empty, so a scan that silently stopped matching cannot masquerade as a clean result.

### Discrimination
The property that a check produces different outcomes for the compliant and non-compliant cases.

Distinct from Non-Vacuity, and the two are independent: a check can genuinely inspect its input and still pass regardless of what it finds. Discrimination is what a Red/Green Control demonstrates, and it is proven by removing the thing under test and confirming the check goes red — not by reasoning about what it ought to do. Two constraints on that removal are load-bearing and easy to lose: it must be minimal, touching only the behaviour under test, and the resulting red must be an assertion failure on the specific claim. A removal that also changes the subject's surface, or a red that arrived before the assertion executed, demonstrates nothing about discrimination — see Wrong-Reason Red.

### Wrong-Reason Red
A control that failed, but for something other than the defect it was written to demonstrate — so its red is not evidence about its subject.

Two forms recur. The failure arrives *before* the assertion runs — the harness would not build, a symbol was never imported, a revert removed more than the behaviour under test — and so reports on the module surface or the wiring instead. Or the assertion runs but would have failed identically had the defect never existed, which is the Discrimination failure seen from the other side. Both are indistinguishable from a genuine control in a run log, and in any record that cites one, which is what makes the condition expensive rather than merely untidy: the record launders a non-proof into evidence, and the next reader has no way to tell. The remedy is to predict the failure before producing it — which assertion, which observed value — and accept the red only when the observed one matches. A third form carries no red at all: over a mechanism whose outcome depends on scheduling, a passing run reports the schedule the runtime happened to pick, not the property, so neither its green nor a single contrasting run supports a causal claim.

### Fails Open / Fails Closed
Whether a check's own malfunction permits the thing it guards, or refuses it.

A boundary check that fails open is worse than none, because its passing result is read as enforcement. The failure is usually one level below the rule itself — a sound predicate applied to an input set that was never complete.

### Baseline
The set of tests currently accepted as failing for known environmental reasons, against which a new run is judged.

A Baseline names *which* tests fail and why — characteristically, credentials that CI supplies and a local machine does not — so a run is read by comparing failure sets rather than totals. A pass count is deliberately not a Baseline: it is invalidated whenever anyone adds a test, so recording one trains a reader either to ignore genuine drift or to chase a number that was never the invariant. Where a total is still wanted, it is stated as a reconciliation identity over its parts, which recomputes as the suite grows instead of going stale.

### Point-in-Time Result
A verification observed once by hand, valid only for the tree state it ran against.

Unlike a check that re-runs, nobody re-observes a Point-in-Time Result, so it expires silently the moment the surface it covered changes — by any hand, not only its author's. It is therefore recorded with the commit it was taken at and the paths it covered, so a later reader can ask the tree whether it has expired instead of trusting it. A date records only when someone looked; a commit records what they looked at. Expired does not mean wrong — it means unobserved, which is the state a verification record exists to rule out.

### Review Lane
One external reviewer enlisted for an independent read, addressed as a declared unit rather than an ad-hoc invocation.

A Lane is selected, and then either runs or is dropped — there is no partial state. Lanes named explicitly by the requester and Lanes picked up by a "whatever is available" selection differ in exactly one respect: an explicitly named Lane that cannot run is an error, while an unavailable Lane nobody asked for is ordinary. The asymmetry is deliberate — not finding a reviewer nobody requested is normal; failing to run one somebody requested is not.

### Dropped Lane
A Lane that was selected but whose output cannot be counted as a review.

The obvious case is an empty return, which after a long run means the Lane was killed rather than that it crashed. The harder case is a Lane that returns fluent, well-formed prose answering a question nobody asked — the signature of a prompt that never reached the model. Both are the same condition and are read the same way: the Lane did not review. A Dropped Lane's output is never folded into a consensus, and a review that quietly proceeds with fewer Lanes than it reports is the failure this term exists to name. Compare Non-Vacuity Guard: a Lane that inspected nothing must not pass for one that found nothing.

### Source-Grounded
Of a review: verified against the tree it describes, rather than against the text of the artifact under review.

A Source-Grounded review cites the specific lines it checked, which is what makes its claims falsifiable by a later reader; an ungrounded one can only restate what the artifact already asserts about itself. The distinction is load-bearing when several reviews are combined, because a reviewer that could not read the tree contributes an open question rather than a finding, and weighting it equally manufactures agreement that was never reached. Grounding is a property of what the reviewer actually did, not of what it was asked to do — so it is confirmed from the output, not assumed from the request.

## Event Delivery

### Spool
A node's durable on-disk queue of events awaiting delivery, held between the moment an event is produced and the moment the far side confirms it.

The Spool is bounded, and an overflowing one evicts its oldest entries rather than refusing new ones — a producer is never blocked by a delivery problem, and the count of what was dropped is recorded rather than lost. An entry leaves the Spool only when the far side names it as received; a response that cannot be verified to name it is not a confirmation, so nothing is removed on one. This is what makes loss visible instead of silent: an event is either delivered, still queued, or counted as dropped, and never merely absent.

### Terminal Outcome
A delivery result meaning the same batch will fail the same way if sent again, as distinct from a deferred one, which is worth retrying.

The distinction exists to decide what the caller does next, so it is only worth drawing where a caller acts on it: a Terminal Outcome must stop a retry loop and must not be reported as success, while a deferred one leaves the Spool intact for a later attempt. Both leave events undelivered, which is why an exit code that separates only success from authentication failure conveys neither. Adding a new Terminal Outcome is therefore never a local change — every caller that dispatches on the outcome already encodes an assumption about how many there are. See [Fails Open / Fails Closed](#fails-open--fails-closed).

## Search Quality & Testing

### Corpus
A seeded dataset of known thoughts used to establish search-quality baselines and golden-set membership expectations.

The corpus is bulk-inserted into the database as seed data before tests run, with synthetic embeddings of known topic structure. It serves as the ground truth for validating search results, incident baselines, and hybrid query behavior. Corpus rows are marked with explicit `memory_type = 'shard'` and are distinct from ad-hoc test data.

### Consolidation Queue
An auto-populated work queue that enqueues shard thoughts for async consolidation processing.

The queue is populated by the `trg_queue_consolidation` database trigger, which fires AFTER INSERT on any shard thought. Each queued shard is claimed and processed by the Consolidation Worker, which consolidates it into a wiki entry and marks the source shard `active = false`. Test fixtures that seed corpus data must disable this trigger during seeding to prevent background processing from interfering with baseline assertions.

### Consolidation Worker
A background service that claims and processes entries from the Consolidation Queue.

The worker reads queued shards, synthesizes them into consolidated wiki entries via an LLM, and updates the source shards to `active = false`. It runs asynchronously and independently of foreground tests, so test isolation is critical: tests that seed corpus must either disable the trigger (preventing queue entries) or empty the queue before making assertions about shard counts or active status.

### Golden-Set
A predetermined membership baseline for search queries, used to validate that hybrid BM25 + vector search returns expected results.

A golden-set query has a known list of exact result UUIDs expected to appear within a fixed result cutoff. The test asserts that all expected UUIDs are present in the actual result. Hybrid queries with vector-embedding components are not deterministic in shared CI environments where real embeddings from other tests contaminate the vector lane, so only BM25-only queries are included in the deterministic baseline; hybrid queries that depend on embedding stability are excluded or marked as non-deterministic.

## Governance

### Governance Asset
A tracked documentation file — an ADR, instruction file, prompt, or specification — that carries structured YAML frontmatter declaring its title, type, status, owners, and related metadata.

A Governance Asset becomes part of the project's searchable documentation record once its frontmatter is complete and it appears in the Asset Catalog. Assets with `status: retired` are excluded from the catalog and from validation requirements; all others must carry the full required field set. The mandatory field set is enforced by the validation tooling rather than by convention alone.

### Asset Catalog
The committed, regenerated index of all active Governance Assets: one JSON file and one Markdown file, both checked into the repository.

The catalog is a point-in-time snapshot, not a live query. After any frontmatter change, the catalog must be explicitly rebuilt (`build` command) and the regenerated files committed alongside the frontmatter change. The `validate` command checks for drift between the committed catalog and the current asset set — passing validation means the catalog accurately reflects the active assets; drift means the catalog is stale and needs a rebuild. CI enforces this check, so unreconciled drift fails the build.
