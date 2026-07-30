# ST-084: Validate ai-memory as the AWCP Host

## Status

Proposed architecture spike.

This spike tests Candidate A from ADR-016. It does not assume that ai-memory is already the accepted AWCP host.

## Decision to be made

Determine whether AWCP can be implemented inside the ai-memory codebase and central deployment while remaining a separately modelled Workflow Operations product.

The spike must end with exactly one recommendation:

1. Accept ai-memory as the host.
2. Accept ai-memory with specified architectural changes.
3. Reject ai-memory as the host and recommend a clean umbrella application.

## Hypothesis

AWCP can reuse ai-memory’s runtime, database infrastructure, authentication, MCP plumbing, provenance, and optional retrieval capabilities without representing operational state as thoughts, shards, graph entities, or promoted memories.

A single central deployment can also supervise agent activity on a remote Ubuntu execution node through a lightweight authenticated client, without creating a second authoritative AWCP deployment.

## Fixed constraints

* Christopher is permanently the only human user.
* The system may contain both personal and professional information.
* A person may legitimately have both personal and professional observations.
* One central deployment owns authoritative agent-operational state.
* The remote Ubuntu server is an execution node, not another authoritative deployment.
* Operational records must remain usable when semantic memory capabilities are disabled.
* Corporate external writes are out of scope.
* No Jira, Confluence, or Azure DevOps mutation may be performed.
* Prism wiki content migration is out of scope.
* Prism lineage and drift mechanisms may be inspected for later extraction or reuse.
* The spike is disposable and must not silently become the production AWCP implementation.

## Architecture under test

```text
Central ai-memory deployment
│
├── Shared platform infrastructure
│   ├── database connection and migrations
│   ├── authentication
│   ├── provenance
│   ├── MCP/API infrastructure
│   └── optional retrieval and graph services
│
├── Workflow Operations product
│   ├── WorkPackets
│   ├── AgentRuns
│   ├── Checkpoints
│   ├── OperationalDecisions
│   ├── AttentionItems
│   ├── VerificationCriteria
│   └── Evidence
│
├── Memory adapter boundary
│   ├── KnowledgeSearchPort
│   └── KnowledgePromotionPort
│
└── Execution-node interface
    └── authenticated remote event protocol
            ↑
Remote Ubuntu client
├── session registration
├── heartbeat
├── checkpoint submission
├── repository-state summary
└── offline event spool
```

## Dependency rule

Workflow Operations may depend on generic runtime infrastructure and explicitly defined memory ports.

It must not depend directly on:

* the `thoughts` or shard representation;
* vector indexes;
* RRF or MMR implementation;
* Apache AGE queries;
* consolidation workers;
* wiki promotion logic;
* Contact Memory entities or services.

Memory and Contact products must not own or reconstruct authoritative Workflow Operations state.

## Provisional persistence model

Use the existing Postgres instance but create a logically separate `workflow` schema or equivalent migration boundary.

Minimum tables:

```text
workflow.work_packets
workflow.repository_bindings
workflow.agent_runs
workflow.checkpoints
workflow.operational_decisions
workflow.attention_items
workflow.verification_criteria
workflow.evidence_items
workflow.run_events
workflow.execution_nodes
```

Required invariants:

* No workflow table requires a memory shard to exist.
* No memory row is authoritative for an operational record.
* Knowledge projections reference operational records, not the reverse.
* Workflow migrations can be reasoned about and tested independently.
* Deleting an optional promoted memory item cannot damage operational history.

## Minimal vertical slice

### 1. Work packet

Create a WorkPacket containing:

* identifier;
* title;
* objective;
* scope;
* repository bindings;
* constraints;
* policy scope;
* status;
* one manual verification criterion.

### 2. Local run

Register a synthetic or real local Claude Code run against the packet.

Record:

* agent type;
* host;
* working directory;
* repository and branch;
* start time;
* run status.

### 3. Remote Ubuntu run

Install and start a lightweight execution-node client on the Ubuntu server.

The implementing agent may use SSH over Tailscale to install, configure, start, stop, and inspect this client.

The client shall:

* authenticate to the central deployment;
* register the execution node;
* report one AgentRun;
* submit a heartbeat;
* submit one checkpoint;
* report repository branch and commit;
* spool events locally while disconnected;
* replay spooled events idempotently after reconnection.

The product spike shall not implement a general-purpose remote shell.

Permitted control messages are narrowly typed, such as:

* request status;
* request checkpoint;
* request repository rescan;
* pause reporting;
* resume reporting.

### 4. Checkpoint

Record a structured checkpoint with:

* completed work;
* current state;
* blockers;
* next action;
* repository commit;
* timestamp.

### 5. Operational decision

Record a decision that blocks execution.

The decision shall be first-class operational state and shall cause a deterministic `decision-required` attention item.

### 6. Completion gate

Attempt to complete the WorkPacket before its verification criterion has evidence.

Completion must fail.

Attach manual evidence and repeat completion.

Completion must then succeed.

### 7. Optional memory projection

Promote one completed decision through `KnowledgePromotionPort`.

The promoted memory shall reference the WorkPacket and OperationalDecision identifiers.

Failure of promotion must not roll back or corrupt packet completion.

## Attention logic

Use deterministic rules only:

* `decision-required`: an unresolved blocking OperationalDecision exists;
* `blocked`: an explicit blocker exists;
* `stale`: no meaningful event within a configured threshold;
* `ended-without-checkpoint`: a run ended after its last checkpoint;
* `ready-for-review`: required evidence is present and the packet awaits review.

No LLM-based attention inference is permitted in this spike.

## Policy-scope model

Descriptive tags are not the policy boundary.

Add a controlled policy-scope value to source observations and operational records, initially supporting:

* `personal`;
* `corporate`;
* `mixed`;
* `public`.

A person or Contact may span scopes. Individual observations retain their own scope and provenance.

The spike must demonstrate:

* personal retrieval excludes corporate-only observations;
* corporate retrieval excludes personal-only observations when requested;
* mixed Contact identity remains shared;
* missing scope fails closed;
* provider routing can reject corporate content before an external model call;
* lexical search, vector search, graph traversal, context assembly, and exports cannot bypass the scope rule.

Where a capability cannot yet enforce scope, it must be disabled for that scoped request and documented in the findings.

## Memory-disabled mode

Run the complete vertical slice with the following unavailable:

* OpenRouter;
* embeddings;
* entity extraction;
* Apache AGE;
* hybrid semantic ranking;
* consolidation workers;
* knowledge promotion.

WorkPacket, AgentRun, Checkpoint, OperationalDecision, AttentionItem, Evidence and completion behaviour must remain operational.

## Failure-isolation experiments

Deliberately cause:

1. Knowledge search failure.
2. Knowledge promotion failure.
3. Graph service unavailability.
4. Remote-node disconnection.
5. Duplicate remote event delivery.
6. Invalid remote authentication.
7. Central service restart after event acknowledgement.

Expected outcomes:

* authoritative operational state remains consistent;
* failed optional operations are visible and retryable;
* remote events replay without duplication;
* invalid clients cannot submit events;
* no memory failure rolls back a workflow transaction.

## Tests proving the module boundary

Automated tests shall prove:

* WorkPackets are not stored as thoughts or shards.
* AgentRuns do not depend on memory tables.
* OperationalDecision is authoritative after memory projection.
* Deleting the projection leaves the operational decision intact.
* Workflow code accesses memory only through declared ports.
* A no-op memory adapter passes all core workflow tests.
* Workflow migrations do not modify memory-domain tables.
* Policy-scope enforcement applies to every enabled retrieval path.
* Remote replay is idempotent.
* A remote execution node cannot become an authoritative state store.

## Reuse assessment

The findings shall list every reused ai-memory capability and classify it as:

* directly reusable;
* reusable behind an adapter;
* reusable only after modification;
* unnecessary for AWCP;
* actively harmful coupling.

At minimum assess:

* Postgres connection and migration system;
* authentication;
* MCP transport;
* event or worker infrastructure;
* provenance fields;
* hybrid retrieval;
* graph storage;
* consolidation;
* existing context scoping;
* logging and diagnostics.

## Remote-server implementation evidence

The findings shall record:

* central host used for the spike;
* remote Ubuntu host role;
* Tailscale communication path;
* installation and startup commands;
* authentication mechanism;
* spool location and format;
* disconnection and replay result;
* any manual operator effort;
* any assumptions that would prevent deployment on a replacement machine.

Do not commit secrets, Tailscale credentials, machine-specific private information, or corporate content.

## Non-goals

The spike shall not implement:

* Jira, Confluence, or Azure DevOps writes;
* automatic one-pager decomposition;
* Prism content migration;
* full Prism lineage migration;
* production backup or disaster recovery;
* a complete web dashboard;
* a VS Code extension;
* full Claude Code hook coverage;
* Copilot lifecycle automation;
* arbitrary remote command execution;
* event sourcing;
* Developer Memory redesign;
* Contact Memory redesign;
* production deployment hardening.

## Deliverables

1. Board story `ST-084`.
2. This approved plan.
3. Provisional Workflow Operations module.
4. Provisional workflow persistence migration.
5. Minimal CLI or test harness.
6. Remote Ubuntu execution-node client.
7. Automated boundary and failure-isolation tests.
8. `docs/investigations/ST-084-awcp-host-spike-findings.md`.
9. Dependency diagram.
10. Recommended ADR-016 disposition.

## Acceptance gate

### Accept ai-memory as host only when

* Core operational behaviour works with memory disabled.
* Workflow data is independently persisted.
* Memory and graph failures do not corrupt workflow state.
* The remote Ubuntu node is managed through one central authority.
* Offline replay is reliable and idempotent.
* Policy scope prevents unintended cross-scope retrieval and provider use.
* Existing ai-memory infrastructure materially reduces work or risk.
* Module boundaries can be enforced by tests and dependency rules.
* A later extraction of the Workflow Operations module remains possible.

### Reject or redesign when

* WorkPackets must become generic thoughts or shards.
* Ordinary workflow queries require semantic retrieval or graph traversal.
* Memory workers are required for operational correctness.
* Workflow and memory transactions cannot fail independently.
* The remote node requires its own authoritative database.
* Policy scope depends only on user-generated descriptive tags.
* Most platform infrastructure remains mandatory but unused.
* A clean standalone operational application would be materially simpler.

## Decision report

The findings document shall end with:

```text
Recommendation:
- Accept ai-memory
- Accept with conditions
- Reject and use an umbrella application

Evidence:
- boundary tests passed/failed
- reused components
- unwanted coupling
- remote-node result
- policy-scope result
- estimated production migration
- unresolved risks
```

ADR-016 shall remain Proposed or Conditional until this report is reviewed by Christopher.
