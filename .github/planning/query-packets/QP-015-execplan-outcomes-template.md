# Query Packet — QP-015: Improve ExecPlan template to show outcomes up front

**Story:** ST-015  
**Title:** Improve ExecPlan template to show outcomes up front  
**Status:** Seed packet ready for `/plan`  
**Created:** 2026-05-04  
**Parent:** PO feedback during ST-014 review  

---

## Problem Statement

When an ExecPlan is marked Done/In Review, the PO or a future reader opening the document cannot see at a glance what was actually achieved. The current template buries the outcomes in §7b (far above the detailed execution sections) and does not have structured fields for:

- Completion status (full? partial?)
- Key discoveries or learnings (spikes)
- Requirements met vs. unmet
- Architectural decisions supported/challenged
- Evidence backing conclusions
- Downstream story or documentation changes

Example: [ST-014 ExecPlan](./exec-plan-ST-014.md) as executed shows extensive task detail and verification, but a reviewer cannot quickly answer: "OK, what do I actually know now that I didn't before?"

---

## PO Intent

Improve the template so that **right after Background (§1), there is an Outcomes & Conclusions section that summarizes:**

- What was delivered (full/partial story completion)
- Key findings/discoveries (especially for spikes and investigations)
- Did all requirements get met?
- What architectural decisions were supported or questioned?
- Supporting evidence and where to find it
- Any downstream changes (board edits, doc updates, follow-on stories triggered)

The section must be **type-aware:**
- **Spikes:** Emphasize discoveries, learnings, and recommendations
- **Features:** Emphasize delivery, test coverage, and observable behaviour  
- **Infrastructure/debt:** Emphasize risk improvements, maintainability gains, and technical debt resolution

---

## Research Findings

### Current Template Structure

- §1 Background & Context — sets expectations
- §2 Definition of Done — acceptance criteria
- §4 Task Definitions — detailed execution steps
- §5 State Recovery — for interrupted sessions
- §6 Execution Log + Surprises + Decisions — during execution
- §7b Outcomes & Retrospective — **at the very end**

**Gap:** §7b comes after all the execution noise. A reader must scroll through tasks, logs, and decisions to find what was actually achieved.

### Precedent: ST-014 Execution

ST-014 was marked In Review on 2026-05-04 and includes tightly-packed task details, decision logs, and workarounds. The investigation doc (`memsearch-applicability-review.md`) holds the actual learnings, but the ExecPlan itself does not lead with them. When the PO looks at the board and opens the ST-014 ExecPlan, the structure does not immediately answer: "What recommendations came from this spike?"

### Type-Specific Outcomes

- **Spike example** (ST-014): "Investigated memsearch ONNX + Milvus Lite. Findings: ONNX `bge-m3` is viable for local embedding; Milvus Lite not credible on Windows; progressive disclosure pattern worth adapting. Recommendation: No architecture change now; recommend ST-004 spike to test ONNX locally."
- **Feature example** (ST-001): "Scaffolded solution with 3 projects, builds with `dotnet build`, includes C# 12 + .NET 8 config. All acceptance criteria met. Ready for downstream stories."
- **Infrastructure example** (ST-011): "Established recurring governance-review workflow in prompts and planning. Query packet template now includes 'Surprises & Compound Effects' section. No architecture risk. Unblocks ST-012 and ST-013."
- **Worked example** (ST-014): "See .github\planning\execplans\supporting_material\exec-plan-ST-014-outcomes-worked-example.md for an Example created in the session active at the completion of ST-014."

---

## Acceptance Criteria (Provisional)

These will be confirmed during `/plan`:

- [ ] Template has a new §1b "Outcomes & Conclusions" section immediately after Background, before Definition of Done
- [ ] The section template includes type-specific guidance (spike vs feature vs infrastructure)
- [ ] Section documents: completion (full/partial), key findings, unmet requirements, architectural impact, evidence, downstream changes
- [ ] A worked example ExecPlan (e.g., ST-014 updated) shows how the new section is populated in practice
- [ ] When a reader opens a completed ExecPlan, the outcomes are the third thing they see (after title/status and background)

---

## Known Dependencies & Blockers

- No blocking stories
- Does not affect active work (ST-014 is in Review; ST-011 is in Review; no stories currently In Progress)
- Can be planned and executed independently

---

## Open Questions for `/plan`

1. Should the Outcomes section appear as §1b (between Background and Definition of Done, shifting the current numbering) or in a new number slot?
2. Should this include creating a companion guidance doc, or is template documentation enough?
3. Should we retrofit the new section into completed ExecPlans (ST-001, ST-002, etc.) as worked examples, or do a single worked-example document?

---

## Recommended Next Step

Run `/plan` for this story to:
- Refine the template structure and required fields
- Create a worked-example ExecPlan showing the new section in context
- Define a clear narrative arc from intent → requirements → delivery → lessons learned
