
Given the direction of the work in AWCP, what is the implications of the following report from an agent summarizing a news article

Codex now exposes the control surface an external workflow manager actually needs
OpenAI's Codex app-server documentation⁠� describes the interface used by rich Codex clients and explicitly exposes authentication, conversation history, approval requests and streamed agent events. The implementation is also open source. Separately, OpenAI's current cookbook now includes recipes for per-run spending control and agent improvement loops using traces and evals. �
OpenAI Developers +1
Why it matters: This is more concrete than the provider-integration patterns covered previously. An external control plane does not necessarily need to own the terminal or poll processes; it can potentially consume provider-native lifecycle events while leaving execution with Codex.
Worth testing: Prototype the thinnest possible integration: Codex app-server → normalized session/event adapter → workflow state. Specifically test whether you can reliably derive running / waiting-for-approval / completed / failed / resumable without AWCP becoming the Codex session host. This could answer an important architectural question before building generic terminal management.


Worked for 52s
This report is materially important for AWCP, and after checking the current Codex documentation I would strengthen its conclusion:

Generic terminal/session management should no longer be the assumed primary architecture for AWCP. Provider-native session adapters should be. Terminal/process integration becomes a fallback capability for providers that lack a proper control surface.

There is one important caveat: the report slightly overstates how completely this solves the problem today.

What is now confirmed
Codex App Server is explicitly intended for deep client integrations and exposes authentication, persisted conversation history, approvals, and streamed agent events. Threads can be created, read, resumed, forked and archived. 

More importantly for AWCP, the protocol already contains almost exactly the operational vocabulary we have been trying to derive:

thread/status/changed, with states including notLoaded, idle, systemError, and active.
An active thread can explicitly report waitingOnApproval.
turn/started and turn/completed, where completion distinguishes completed, interrupted, and failed.
Server-initiated approval and user-input requests.
thread/list can discover persisted sessions by cwd and explicitly distinguishes sources including cli, vscode, appServer, and various sub-agent types. 
So the proposed state derivation is not speculative. running, waiting-for-approval, failed, idle and resumable have native evidence behind them.

There is even a native persisted thread goal containing an objective, token budget, tokens consumed and execution time. 
 This has obvious future implications for AWCP execution budgets and loop governance.

And OpenAI's Symphony work independently demonstrates almost exactly the architectural split that would suit AWCP: an App Server client forwards normalized events such as session_started, turn_completed, turn_failed and turn_input_required upstream into an orchestrator. 

The major architectural consequence for AWCP
I would formalize the boundary as:

AWCP owns workflow state. Providers own execution state.

AWCP should own things like:

Project → Work Item → Execution/Session references → Evidence → Attention → Decisions

Codex should continue owning:

Thread → Turn → Tool execution → Sandbox → Approval mechanics → Conversation persistence

AWCP then projects provider events into workflow operations rather than trying to recreate the provider runtime.

That is highly consistent with the direction already established in ST-084: Workflow Operations remains its own operational domain, with semantic memory optional rather than central to the transaction. This new development makes the provider boundary much clearer. 

For example:

Codex App Server
      │
      │ native events
      ▼
Codex Session Adapter
      │
      │ normalized provider events
      ▼
AWCP Workflow Operations
      │
      ├── execution state
      ├── attention
      ├── evidence
      ├── work-item association
      └── provenance
The adapter should not translate everything into a lowest-common-denominator protocol. OpenAI themselves explicitly warn that cross-provider protocols tend to lose richer provider-specific session semantics. 

I would therefore use a small normalized core plus provider-specific capabilities, something like:

ProviderSession
  provider
  provider_session_id
  workspace
  repository
  runtime_node

  lifecycle:
    discovered
    idle
    active
    error

  active_reasons:
    waiting_for_approval
    waiting_for_input
    ...

  current_execution:
    running
    completed
    interrupted
    failed

  capabilities:
    resume
    steer
    interrupt
    approvals
    history
    usage
    goals
    ...

  provider_state:
    <opaque/native data>
There is an important semantic separation here: turn/completed must not mean work item completed.

A Codex turn might finish after saying "I found the problem; shall I implement it?". The thread becomes idle but the Jira feature or AWCP workflow remains in progress.

That distinction is exactly the sort of thing AWCP should own.

It also simplifies deterministic attention
The provider event stream maps remarkably cleanly onto AWCP's attention mechanism.

For example:

waitingOnApproval
        ↓
decision-required attention

tool/requestUserInput
        ↓
input-required attention

turn failed
        ↓
execution-failed attention

turn completed
        ↓
possibly ready-for-review
        ↓
but only if AWCP workflow policy says so
The last distinction matters. Codex reports what happened to the agent execution. AWCP determines what that means to the workflow.

That reinforces the earlier decision not to conflate "blocking" or execution state directly with arbitrary workflow transitions.

The biggest unresolved issue
This is where I would amend the agent's suggested experiment.

It proposes testing whether AWCP can derive lifecycle state:

without AWCP becoming the Codex session host.

That is close, but the actual question should be:

Can AWCP observe and control a Codex session that was initiated independently of AWCP?

Those are different questions.

The documentation says thread/list can discover persisted CLI and VS Code sessions. But runtime status notifications apply to loaded threads, and thread/loaded/list specifically describes threads loaded into the current App Server's memory. 

So imagine:

Terminal A
    │
    └── Codex CLI
           │
           └── App Server process A

AWCP
    │
    └── App Server process B
Process B may discover the persisted thread from A but potentially see it as:

notLoaded
even while process A is actively running it.

The documentation I found does not prove that a second App Server can obtain authoritative live state for a thread hosted in another App Server process.

That is now the single most important spike question.

There are therefore three integration levels
I think AWCP should explicitly recognize these.

Mode	Meaning	AWCP capability
Discovered	Existing provider session found from persistence/history	association, history, resumability
Attached	AWCP has a live connection to the provider runtime hosting it	observe state, attention, usage
Managed runtime	AWCP started or registered the provider runtime	full observe/steer/resume/interrupt
Notice that managed runtime does not mean managed terminal.

That is the major simplification.

Previously we were considering AWCP potentially needing to host a PTY, interpret /exit, capture resume commands, manage shell lifetime and deal with terminal sandboxing.

With App Server:

AWCP
   │
   └── provider runtime endpoint
           │
           ├── Codex thread A
           ├── Codex thread B
           └── Codex thread C

Terminal
   │
   └── merely another client/UI
That is substantially cleaner.

This may also solve the Z2 / shutdown problem differently
Codex now documents remote TUI operation:

codex app-server --listen ...
codex --remote ...
and OpenAI describes the architecture specifically in terms of keeping execution near the compute so work can continue while a laptop disconnects. 

That suggests a much better long-term pattern for Z2:

Z2
 └─ Codex provider runtime
      ├─ persistent threads
      └─ execution

        ▲             ▲
        │             │
      AWCP         Codex TUI
Your laptop terminal becomes just a view/control client.

You therefore potentially don't need the previous:

inspect terminal
→ determine idle
→ send /exit
→ scrape resume command
→ save resume command
→ shut down
workflow at all.

AWCP could instead know:

thread: thr_xyz
node: z2
state: idle
resumable: true
work_item: ST-084
and reconnect later through the native session ID.

There is currently a qualification: the App Server WebSocket transport is documented as experimental and not supported for production workloads, so I would use this only as an architectural spike for now, possibly over localhost/SSH forwarding rather than designing AWCP's permanent remote transport around it. 

What I would change in the AWCP roadmap
I would not build generic terminal management next.

I would insert a narrow provider-native integration spike before it:

Spike: Codex provider session adapter
The experiment should answer five questions.

Discovery

Start Codex normally from the CLI, outside AWCP.

Can another App Server instance discover the thread and correctly associate its cwd, source and history?

Live-state visibility

While that CLI thread is actively working, can AWCP's connection determine:

active
waiting-on-approval
idle
failed
without having launched the original runtime?

Attachment

Can AWCP subscribe to an already-running provider runtime/thread, or must it have established the App Server connection before execution begins?

Control

Test:

resume
turn/start
turn/steer
turn/interrupt
approval response
especially following AWCP restart.

Crash/reconnect semantics

Kill:

AWCP
client terminal
app-server connection
independently and establish exactly which combinations allow the Codex execution to continue and later be recovered.

That produces a very useful architectural decision matrix:

                        discovered   observed   controllable
Existing CLI session        ?           ?           ?
AWCP-started app-server     yes         yes         yes
Remote app-server           yes         yes         yes
After AWCP restart           ?           ?           ?
After client disconnect      ?           ?           ?
The likely outcome
My expectation is that the answer will be:

AWCP does not need to own terminals, but for reliable live orchestration it probably needs sessions to run through a provider runtime endpoint that AWCP knows about.

That would change the role of AWCP from:

"Find all the agent processes I'm already running and somehow control them."

toward:

"Maintain a registry of provider-native execution runtimes and sessions, while allowing the provider's own CLI/IDE to remain the human interface."

That is a much better architectural fit for AWCP.

It also scales naturally to Claude Code, Copilot, OpenCode, local models, etc.:

                  AWCP
                   │
           Provider Session API
          ┌────────┼─────────┐
          ▼        ▼         ▼
       Codex    Claude    OpenCode
       adapter  adapter   adapter
          │        │         │
       native    hooks/    native/
       server    SDK?      process
Providers without a native lifecycle surface can fall back through progressively weaker adapters:

native protocol
    ↓
hooks / telemetry
    ↓
structured CLI
    ↓
process monitoring
    ↓
PTY / terminal management
Terminal hosting becomes the bottom of the capability ladder, not AWCP's foundational abstraction.

The Codex development therefore doesn't undermine the work already done in AWCP. It actually makes the separation we've been converging on more defensible: AWCP should be the durable cross-provider workflow/control plane, not another agent harness. The next meaningful architectural experiment is now quite sharply defined: prove the boundary between discovering a Codex thread and attaching to its live runtime.




Sources
How does the codex interface then impact the design of AWCP given it has to support Claude Code and GitHub Copilot CLI

Mm, I think it makes it clearer that AWCP should not try to be a generic terminal manager, but as a workflow control plane pluggable execution providers. Treat Codex, Claude Code, and Copilot as execution providers with different integration depths, and let AWCP own only what it must: work items, attention, evidence, provenance, and cross-provider orchestration. Then, map each provider's native model onto a small set of AWCP concepts. Execution, session, attention, capabilities. Don't force a lowest common denominator. Allow richer provider-specific state where available. That way, as Claude or Copilot evolve you upgrade adapters, not your whole workflow model.

Understood Paused. Yeah

Pausing.




Sources

Unlocking the Codex harness: how we built the App Server | OpenAI

Codex App Server | ChatGPT Learn

An open-source spec for Codex orchestration: Symphony. | OpenAI

View all
