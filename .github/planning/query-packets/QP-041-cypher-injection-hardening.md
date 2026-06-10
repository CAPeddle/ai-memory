# QP-041: Cypher Injection Hardening

> Story: ST-041  
> Status: Scoped packet from /plan  
> Created: 2026-06-10  
> Source: ST-041 board item + QP-038 AC-12 follow-up

---

## PO Intent

Harden graph_traverse so it is reliably read-only even when a caller sends crafted Cypher. The PO confirmed this story stays narrowly scoped to graph_traverse validation and tests only.

## Confirmed Story Metadata

| Field | Value |
|---|---|
| Title | Cypher injection hardening |
| Type | security |
| Placement | Backlog |
| Value | 5 |
| Blocked by | none |
| Future ExecPlan | .github/planning/execplans/exec-plan-ST-041.md |

## Scoped Decisions Locked In /plan

1. Keyword validation policy: token-aware deny-list.
- Reject mutation keywords outside quoted strings/comments.
- Do not reject keywords that only appear inside literals/comments.

2. Max query length cap: 4096 characters.

3. Scope boundary: graph_traverse hardening only.
- In scope: MATCH-only enforcement, deny-list enforcement, length cap, focused tests.
- Out of scope: rate limiting (ST-051), graph_search changes, other MCP tools, migration/framework work.

## Triggering Risk

Current validation accepts queries that begin with MATCH but contain mutation keywords later in the text. This allows attempts such as MATCH ... DELETE and MATCH ... SET to pass first-line checks and reach execution.

## Acceptance Criteria (Story-Level)

1. graph_traverse rejects mutation keywords (CREATE, SET, DELETE, REMOVE, MERGE, DETACH, DROP, CALL, LOAD) when they appear as executable tokens.
2. graph_traverse rejects queries longer than 4096 characters.
3. graph_traverse preserves MATCH-only gate.
4. Valid read-only MATCH ... RETURN queries continue to execute.
5. Focused tests cover rejected mutations, length cap, non-MATCH rejection, and accepted read-only queries.
6. Cross-model critical review passes before story moves to Review.

## Open Technical Direction For ExecPlan

1. Implement a lightweight scanner for quoted string/comment regions before applying the deny-list, so literals/comments do not trigger false positives.
2. Preserve existing dollar-quote stripping defense in depth before sql.unsafe composition.
3. Keep error responses explicit (which rule was violated) without leaking internal SQL details.

## Relationship To Existing Artifacts

- Seed source: QP-038 section 4.15 and AC-12.
- This packet narrows and updates that seed for a dedicated ST-041 execution path.

## Recommended Next Step

Run Phase 2 /plan for ST-041 using this packet as sole input, update .github/planning/execplans/exec-plan-ST-041.md to Ready, then move ST-041 Backlog -> Refined in the board and commit both artifacts together.