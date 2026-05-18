# Query Packet — ST-026: Obsidian storyboard view (C# MCP client storyboard projection)

> Story: ST-026
> Created: 2026-05-18
> Source: PO assessment of storyboard sufficiency (2026-05-18 follow-up to ST-021 closeout)
> Status: Seed packet — refine during `/plan`

---

## Intent

Deliver the second of the "two views" promised in ADR-006 — a kanban-style projection of the project's own storyboard into the local Obsidian vault. Together with ST-019 (the wiki view), this completes the local-projection model: cloud MCP holds memory; the local C# service renders Markdown for both views.

The view is **read-only**. Editing happens via `/plan` and `/continue`, not in Obsidian. Obsidian is the lens through which the developer navigates the board with backlinks and Dataview-style queries that the raw `story-board.md` does not surface.

---

## Current State

- `.github/planning/story-board.md` is the canonical storyboard, edited by `/plan` and `/continue`.
- `.github/planning/execplans/exec-plan-ST-*.md` are the per-story plans.
- `.github/planning/query-packets/QP-*.md` are the per-story query packets.
- ADR-006 specifies a future cloud-side story state machine with `story_claim` / `story_update` MCP tools. That system is **not yet built** — story state lives in markdown today.
- ST-019 (Obsidian wiki view) is the immediate predecessor and provides the C# MCP client + Markdown writer scaffolding this story builds on.
- The project WoW assigns work per profile (`professional`, `personal`) with WIP limit 1 per profile; the storyboard view should respect that scoping when rendering kanban columns.

---

## Research Findings

1. The current `story-board.md` uses HTML comments (`<!-- Phase N — ... -->`) to delimit logical sections within `Backlog`. A parser must treat these as section markers, not just whitespace.
2. Each story block is a `### ST-NNN: Title` heading followed by a fixed metadata list (`Type`, `Source`, `phase`, `Value`, `Blocked by`, `Touches`, `Acceptance criteria`, `ExecPlan`, `Docs`, `Notes`). The metadata list is the parsing contract.
3. `Acceptance criteria` items follow GitHub-flavoured task list syntax (`- [ ]` / `- [x]`). Status of individual ACs is queryable.
4. Story status (Backlog / Refined / In Progress / Review / Done) is encoded by which top-level `##` section the story sits in — not by a per-story field. The parser derives status from position.
5. Obsidian's Dataview plugin enables live queries over frontmatter, which would make the index note dynamic. Without Dataview, the index must be re-rendered each run from the same parsed data.

---

## Design Decisions To Lock In During `/plan`

1. **Source of storyboard state:** read directly from `.github/planning/story-board.md` and exec plan files on a configured local repo path. Defer migration to ADR-006's cloud-side `story_*` MCP tools until those tools exist.
2. **Story-to-note mapping:** one note per story (`storyboard/{profile}/{story-id}.md`) plus one index note (`storyboard/{profile}/index.md`). Index note uses Markdown tables (works without Dataview); Dataview-style queries are an optional enhancement.
3. **Profile partitioning:** each profile (`professional`, `personal`) gets its own directory. Until stories carry a `profile` field, all stories render into the default profile (`professional`).
4. **Backlink behaviour:** `blocked_by: ST-022` renders as `[[ST-022]]`. `touches:` paths render as plain text (they point into the repo, not the vault). `Docs:` paths render as external links to the repo if a `repo_url` is configured, otherwise plain text.
5. **Incremental update:** per-story SHA-256 over the parsed story block stored in `~/.ai-memory/storyboard-state.json`; only re-render notes whose hash changed.
6. **Polling interval:** default 5 minutes (matches ST-019); configurable.

---

## Research Questions

1. Should per-story notes embed the full ExecPlan content, link to it, or render a summary section? (Recommendation: link + summary; embedding bloats the vault.)
2. Should the index note use Obsidian Dataview or vanilla Markdown tables? (Recommendation: vanilla; Dataview is a hard plugin dependency.)
3. Does the C# client read planning artifacts from a local repo clone path (config) or via the cloud MCP if it exposes them in future? (Recommendation: local clone now, MCP-tool-based later.)
4. How does the storyboard view interact with the wiki view — independent renderings, or does the storyboard link to relevant `wiki/{project}` notes per project mentioned in `touches:`? (Recommendation: link if a matching wiki note exists, otherwise plain text.)
5. Profile attribution: do stories need an explicit `profile:` field added to the storyboard, or can phase + project context infer profile? (Recommendation: add `profile:` field via a small storyboard schema extension if more than one profile is ever active.)

---

## Scope Locked

In scope:
- Parse `.github/planning/story-board.md` and exec plan files into structured story records
- Render one Markdown note per story + one kanban index note per profile
- Reuse the ST-019 C# scaffolding (Markdown writer, polling loop, configuration model)
- Profile partitioning (`professional` + `personal`); default profile from config
- Incremental update based on per-story SHA-256
- Unit tests against synthetic story-board fixtures

Out of scope:
- Editing stories from Obsidian (read-only view)
- Implementing cloud-side `story_claim` / `story_update` MCP tools (separate ADR-006 work)
- Triggering `/plan` or `/continue` from Obsidian
- Real-time updates (polling interval is acceptable; default 5 min)
- Dataview plugin dependency (optional enhancement only)

---

## Risks And Watch Points

1. **Parser brittleness.** If the storyboard parser is strict, structural changes to `story-board.md` will break the view. Mitigation: tolerant section-based parser; treat unrecognised sections as opaque pass-through; cover parsing with unit tests using the current `story-board.md` as a fixture.
2. **Dataview lock-in.** If the index relies on Dataview, the user is forced to install a plugin. Mitigation: render plain Markdown tables; treat Dataview as optional enhancement only.
3. **Profile mis-attribution.** Today no story has a `profile:` field; both profile directories will look identical (or one will be empty). Mitigation: document the limitation; recommend adding `profile:` to the storyboard schema if multi-profile work begins.
4. **Disk-coupled source of truth.** Reading planning artifacts directly from disk requires a local repo clone. If synthesis runs on a machine without the repo, the view fails. Mitigation: document the repo-clone requirement; future migration to cloud MCP tools removes the dependency.
5. **Hash drift on cosmetic edits.** A whitespace-only change to a story bumps the SHA-256 and re-renders the note. Mitigation: normalise whitespace before hashing.

---

## Artifacts To Read First During `/plan`

1. `.github/planning/story-board.md` (the parsing target — current schema)
2. `.github/planning/execplans/exec-plan-ST-019.md` (predecessor — once written; scaffolding to reuse)
3. `docs/design/adr/ADR-006-views-architecture.md` (views model; storyboard state machine; pull model)
4. `docs/design/adr/ADR-009-deployment-model.md` (cloud MCP topology; clarifies what `story_*` tools would look like in future)
5. `docs/investigations/openbrain-pivot-evaluation.md` (background for the local-projection model)

---

## Suggested Outcome For ST-026

Produce an ExecPlan that delivers a thin extension to the ST-019 C# solution: a storyboard projector that reads planning artifacts from a configured local repo path, parses them into story records, and writes one Markdown note per story plus a kanban index note into the configured Obsidian vault. Read-only; profile-partitioned; incremental via per-story SHA-256. No Dataview dependency; no cloud-side story tools assumed.
