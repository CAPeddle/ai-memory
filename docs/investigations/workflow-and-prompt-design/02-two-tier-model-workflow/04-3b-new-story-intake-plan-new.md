### 2.3b New Story Intake (`/plan-new`)

`/plan-new` exists to add a story before full planning begins.

1. Read the board and gather the PO's initial intent through `vscode_askQuestions`
2. Perform targeted research to identify likely impact, touched areas, blockers, and related docs
3. Ask the PO bounded follow-up questions to scope impact, priority, and placement
4. Create the board entry with the next `ST-N` ID
5. Create a seed query packet under `.github/planning/query-packets/`
6. Reserve the future ExecPlan path in the board entry
7. Stop and direct the PO to `/plan` for full collaborative planning

**Phase 2 — ExecPlan Authoring (fresh context)**
1. Read the query packet (sole input)
2. Write full ExecPlan with §2b Definition of Ready
3. Walk PO through plan in iterative review rounds
4. On approval, commit

