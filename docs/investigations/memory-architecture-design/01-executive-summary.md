## 1. Executive Summary

This document defines the architecture for **ai-memory** — a general-purpose memory service that AI agents (primarily GitHub Copilot) use to retain and recall facts about development across C++/C# projects. The service is accessible via MCP (Model Context Protocol) and REST API.

The core philosophy: **memories never decay**. Unlike systems inspired by cognitive science forgetting curves (e.g., the Alfred architecture), ai-memory treats all stored knowledge as permanently valuable. Recency serves only as a tiebreaker, never as a penalty.

---

