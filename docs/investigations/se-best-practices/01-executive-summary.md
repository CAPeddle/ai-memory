## Executive Summary

This document captures the research rationale for six software engineering practice categories selected for adoption in the ai-memory project. The categories were chosen to complement the existing baseline in `.github/instructions/coding-standards.instructions.md` and to prepare the codebase for high-quality implementation work starting at ST-002. Each category is assessed for its specific applicability to ai-memory's architecture (Core/Server separation, SQLite direct access, constructor injection, async-first I/O) and an enforcement approach — advisory docs, CI-enforced analyzers, or both — is recommended. All six categories are adopted in Phase 1 (this story); rule tightening and coverage thresholds are deferred to later phases.

---

