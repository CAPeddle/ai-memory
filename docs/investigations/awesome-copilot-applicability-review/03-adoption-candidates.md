## 3. Adoption Candidates

| Pattern | Evidence in awesome-copilot | Fit for ai-memory | Recommended Timing |
|--------|------------------------------|-------------------|--------------------|
| **Metadata-backed asset contracts** | `CONTRIBUTING.md` and `AGENTS.md` require frontmatter and naming conventions for agents, instructions, skills, hooks, workflows, and plugins | High. ai-memory already relies on prompts and instructions, but lacks a normalized metadata contract for them and for future extensions such as repo-local agents or skills | Now |
| **Bundled skill folders with references/assets** | `docs/README.skills.md` and `AGENTS.md` define skills as folders with `SKILL.md` plus optional scripts, templates, and references | Medium-high. This matches future dogfooding patterns for ai-memory, especially once the service can power reusable memory or governance workflows | Next, not immediately |
| **Generated discovery surfaces** | Generated README tables, category docs, and `llms.txt` provide human-readable and machine-readable discovery | High. ai-memory needs a concise inventory of prompts, instructions, planning assets, and future reusable artifacts | Now |
| **Explicit contribution acceptance/rejection rules** | `CONTRIBUTING.md` defines both "What We Accept" and "What We Don't Accept" | High. ai-memory has governance instructions but lacks explicit repository-level acceptance criteria for future prompt/instruction/skill-style contributions | Now |
| **Validation-first contributor workflow** | `AGENTS.md` and `CONTRIBUTING.md` require build/validate steps that regenerate inventories and catch drift | High. This would reduce silent divergence between instructions, prompts, inventories, and future generated docs | Now |
| **Hooks for governance audit, secrets scanning, and tool guardrails** | `docs/README.hooks.md` documents `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, and `postToolUse` automation patterns | Medium-high. Selective hooks align with session resilience and governance goals, but should be piloted narrowly to avoid introducing brittle automation | Next |
| **Markdown-first workflow sources compiled to automation** | `docs/README.workflows.md` defines workflows as `.md` sources compiled by `gh aw compile` | Medium. The pattern is attractive for periodic governance reports and stale-doc checks, but ai-memory does not yet need workflow compilation infrastructure | Later |
| **Cookbook and learning-hub style onboarding** | `cookbook/README.md` plus the site learning hub turn patterns into runnable recipes and explainers | High later. ai-memory will need onboarding guides once the service and dogfooding flows exist | Later, after first end-to-end vertical slice |

### 3.1 Highest-Value Immediate Adoptions

The external repository consistently treats metadata as the source of truth and generated indexes as publishable views. That is the single most transferable idea for ai-memory.

The immediate subset worth adopting is:

1. A small metadata contract for prompts, instructions, and planned future AI-governance assets
2. One machine-readable inventory for those assets
3. One human-readable inventory or index derived from the same source data
4. A contributor rule set explaining what is accepted, rejected, or deferred
5. Validation guidance or automation that checks metadata completeness and inventory drift

### 3.2 Valuable, But Second Wave

Bundled skill folders and hook-based governance automation are both good fits, but only after the asset catalog exists. Without the catalog and validation layer first, those additions would expand surface area faster than the repo can govern it.

---

