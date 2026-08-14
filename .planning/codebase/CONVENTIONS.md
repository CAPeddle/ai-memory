# Coding Conventions

**Analysis Date:** 2026-08-05

**Note:** This codebase has two distinct technology stacks (Deno/TypeScript server is active; C#/.NET is skeletal). Conventions are documented separately by stack.

---

## Deno/TypeScript Server Stack (Active)

The primary codebase in `server/` is a Deno 2.0 + TypeScript application serving the MCP protocol. Conventions are enforced via `.editorconfig` and project discipline.

### Naming Patterns

**Files:**
- Implementation: `camelCaseFile.ts` or `PascalCaseFile.ts` for modules with exported types
- Tests: `descriptive-name.test.ts` for test files (e.g., `consolidation-scoring.test.ts`)
- Test helpers: `camelCaseHelper.ts` in `server/tests/_helpers/` (e.g., `serverProcess.ts`, `mcpClient.ts`)

**Functions and Methods:**
- Exported functions: `camelCaseFunction()` (e.g., `scoreCandidate()`, `bandFor()`, `logToolInvocation()`)
- Private/internal functions: `camelCaseFunction()` — no prefix convention used
- Async functions: `async functionName()` — `Async` suffix is not required (TypeScript convention differs from .NET)

**Variables:**
- `const` and `let`: `camelCase` (e.g., `consecutivePollFailures`, `batch`, `response`)
- Module-level constants: `UPPER_SNAKE_CASE` (e.g., `POLL_INTERVAL_MS`, `BATCH_SIZE`, `MAX_ATTEMPTS`, `ALLOWED_LABELS`, `ALLOWED_RELS`)

**Types and Interfaces:**
- Exported: `PascalCase` (e.g., `CandidateMetrics`, `BatchMaxima`, `ScoreBreakdown`, `Band`, `ContextScope`)
- Type aliases: `PascalCase` (e.g., `ContextParseResult`, `ExtractionResult`, `EmbeddingLane`)

**Example from `server/src/consolidationScoring.ts`:**
```typescript
export interface CandidateMetrics {
  thoughtId: string;
  recallCount: number;
  distinctProjects: number;
  helpfulCount: number;   // feedback_events rows with verdict='helpful'
  totalFeedback: number;  // total feedback_events rows for this thought
  confidence: number;     // thoughts.confidence (0–1), fallback when no feedback
}

export function scoreCandidate(
  m: CandidateMetrics,
  batch: BatchMaxima,
): ScoreBreakdown {
  // implementation
}
```

### Code Style

**Formatting:**
- 4-space indentation (enforced via `.editorconfig`)
- CRLF line endings (enforced via `.editorconfig`)
- UTF-8 charset
- Trim trailing whitespace
- Insert final newline

**Linting/Type Checking:**
- Deno includes built-in linting via `deno lint`
- TypeScript strict mode enabled in `server/deno.json` (`compilerOptions: { strict: true }`)
- No separate eslint/prettier config; Deno's format and lint are canonical

**Formatting Config (`server/deno.json`):**
```json
{
  "lock": {
    "path": "./deno.lock",
    "frozen": true
  },
  "imports": {
    "@hono/mcp": "npm:@hono/mcp@0.1.1",
    "@modelcontextprotocol/sdk": "npm:@modelcontextprotocol/sdk@1.24.3",
    "hono": "npm:hono@4.9.2",
    "zod": "npm:zod@4.1.13"
  },
  "compilerOptions": {
    "strict": true
  }
}
```

### Import Organization

**Order:**
1. External npm packages: `import { X } from "npm:package@version";`
2. Deno standard library: `import { X } from "https://deno.land/std@VERSION/module.ts";`
3. Local relative imports: `import { X } from "./src/module.ts";` or `import { X } from "./file.ts";`

**Example from `server/index.ts`:**
```typescript
import { McpServer } from "npm:@modelcontextprotocol/sdk@1.24.3/server/mcp.js";
import { StreamableHTTPTransport } from "npm:@hono/mcp@0.1.1";
import { Hono } from "npm:hono@4.9.2";
import { z } from "npm:zod@4.1.13";

import { requireApiKey } from "./src/auth.ts";
import { parseContextOrError, isMcpContextError } from "./src/parseContext.ts";
import { sql } from "./src/db.ts";
// ... more local imports
```

**Path Aliases:**
- Not used in this codebase; all imports are explicit relative paths (e.g., `./src/`, `../src/`)

### Error Handling

**Pattern: Throw Early, Fail Fast**

Errors are thrown as `Error` instances with descriptive messages. No custom error classes are used.

```typescript
// From server/src/auth.ts
export function requireApiKey(req: Request): Response | null {
  const key = Deno.env.get("MEMORY_API_KEY");
  if (!key) {
    throw new Error("MEMORY_API_KEY environment variable is not set");
  }
  // ...
}
```

**Try/Catch Pattern:**
- Used for expected failure modes (network, JSON parsing, type validation)
- Errors caught and re-thrown with additional context
- Example from `server/src/consolidationLLM.ts`:
  ```typescript
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`LLM returned non-JSON response: ${text.slice(0, 200)}`);
  }
  ```

**Validation Errors:**
- Input validation returns error objects (not thrown)
- Example from `server/src/parseContext.ts` — returns `ContextParseError` object rather than throwing:
  ```typescript
  export interface ContextParseError {
    error: true;
    message: string;
    received: string;
    expected: string;
    failedToken?: string;
  }
  
  export type ContextParseResult = ContextScope | ContextParseError;
  ```

### Comments

**JSDoc/Documentation Comments:**
- Used for exported types, functions, and interfaces
- Format: `/** description */` on the line before
- Example from `server/src/consolidationScoring.ts`:
  ```typescript
  /**
   * consolidationScoring.ts — ST-008
   *
   * Pure functions for ADR-007 three-factor consolidation scoring.
   * No side effects; safe to call without DB connection.
   */
  ```

**Inline Comments:**
- Single-line: `// Comment explaining the line(s) below`
- Multi-line: Each line prefixed with `//`
- Example from `server/src/entityWorker.ts`:
  ```typescript
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
  
  // --- Allow-lists (critical injection mitigation) ---
  const ALLOWED_LABELS = new Set(["Person", "Function", "Error", "Topic", "Project"]);
  const ALLOWED_RELS = new Set(["CAUSED_BY", "LIKES", "WORKS_ON", "USES", "RELATED_TO"]);
  ```

**Inline Field Documentation:**
- Trailing comments on field definitions
- Example from `server/src/consolidationScoring.ts`:
  ```typescript
  export interface CandidateMetrics {
    helpfulCount: number;   // feedback_events rows with verdict='helpful'
    totalFeedback: number;  // total feedback_events rows for this thought
    confidence: number;     // thoughts.confidence (0–1), fallback when no feedback
  }
  ```

### Function Design

**Size Guidelines:**
- Pure functions (no side effects) can be longer if logic is straightforward
- Batch normalisation logic spans ~20 lines in `consolidationScoring.ts` and is considered appropriate
- Worker polling and retry loops are extracted to named functions (e.g., `backoffSeconds()`, `getPollBackoffMs()`)

**Parameters:**
- Explicit parameter lists preferred; no object-destructuring in signatures when parameter count is ≤ 2
- Type annotations required for all parameters
- Example: `function scoreCandidate(m: CandidateMetrics, batch: BatchMaxima): ScoreBreakdown`

**Return Values:**
- Type annotations required for all exported functions
- Consistent return types: if returning union types, define a named type alias
- Example from `server/src/parseContext.ts`:
  ```typescript
  export type ContextParseResult = ContextScope | ContextParseError;
  
  export function parseContext(raw: string | undefined): ContextParseResult | null
  ```

### Module Design

**Exports:**
- All public APIs explicitly exported with `export`
- No default exports; use named exports for clarity
- Internal functions use no export keyword

**File Structure:**
- Comments and docstrings at top of file
- Imports below file header
- Type/interface definitions next
- Constants (UPPER_SNAKE_CASE) follow types
- Helper functions follow constants
- Main exported functions at the end
- Example: `server/src/consolidationScoring.ts`

**Barrel Files:**
- Not used in this codebase; all imports are direct file paths
- Example of NOT using barrels: `import { scoreCandidate } from "./consolidationScoring.ts"` rather than `import { scoreCandidate } from "./index.ts"`

---

## C#/.NET Stack (Skeletal)

The placeholder codebase in `src/` and `tests/` is reserved for future ST-019 local synthesis. Conventions are defined in `.editorconfig` and enforced by StyleCop/Roslyn analyzers. Since active development has not started, only the governance model is documented here.

### Naming Patterns

**Files:**
- PascalCase for all `.cs` files, matching primary class name (e.g., `IMemoryService.cs`, `SmokeTests.cs`)

**Functions and Methods:**
- Exported/public: `PascalCase` (e.g., `GetMemory()`, `SaveThought()`)
- Private: `PascalCase` (StyleCop convention, not camelCase like JavaScript)
- Async methods: Must end with `Async` suffix (e.g., `GetMemoryAsync()`)

**Variables:**
- Local variables and parameters: `camelCase` (e.g., `response`, `candidateId`)
- Private fields: `_camelCase` (enforced via `.editorconfig` dotnet_naming_rule)
- Constants: `PascalCase` (enforced via `.editorconfig`)

**Types and Interfaces:**
- Interfaces: `IPascalCase` (e.g., `IMemoryService`)
- Classes: `PascalCase` (e.g., `MemoryService`, `SmokeTests`)
- Enums: `PascalCase` (e.g., `MemoryType`, `VisibilityScope`)

**Example from `.editorconfig`:**
```ini
dotnet_naming_rule.private_fields_must_be_camel_case.symbols = private_fields
dotnet_naming_style.underscore_camel_case.required_prefix = _
dotnet_naming_style.underscore_camel_case.capitalization = camel_case

dotnet_naming_rule.interfaces_must_begin_with_i.symbols = interfaces
dotnet_naming_style.begins_with_i.required_prefix = I
dotnet_naming_style.begins_with_i.capitalization = pascal_case
```

### Code Style

**Formatting:**
- 4-space indentation (enforced via `.editorconfig`)
- CRLF line endings
- UTF-8 charset

**Linting:**
- StyleCop Analyzers (via `.editorconfig` suppression and configuration)
- Roslyn code analyzers enabled
- File-header copyright comments: Deferred to Phase 2 (SA1633 suppressed)
- XML documentation: Deferred to Phase 2 (SA0001 suppressed)
- Underscore test naming: CA1707 suppressed globally (intentional convention)

**Code Style Preferences (from `.editorconfig`):**
```ini
csharp_style_var_for_built_in_types = true:suggestion
csharp_style_var_when_type_is_apparent = true:suggestion
csharp_style_var_elsewhere = true:suggestion
csharp_prefer_braces = true:warning
csharp_style_expression_bodied_methods = when_on_single_line:suggestion
csharp_style_expression_bodied_properties = true:suggestion
csharp_using_directive_placement = outside_namespace:warning
dotnet_sort_system_directives_first = true
```

### Import Organization

**Order:**
1. System imports (e.g., `using System;`)
2. Third-party imports (e.g., `using Xunit;`)
3. Local project imports (e.g., `using AiMemory.Core;`)
4. Placed outside namespace declaration (enforced via `.editorconfig` csharp_using_directive_placement)

### Comments

**XML Documentation (Deferred):**
- Will be added in Phase 2 — currently optional
- Standard `///` format when implemented

### Test Naming Convention

**Pattern: `MethodName_Scenario_ExpectedResult`**

Enforced via analyzer suppression CA1707 (underscores in member names) — the convention is intentional.

Example from `tests/AiMemory.Tests/SmokeTests.cs`:
```csharp
public class SmokeTests
{
    [Fact]
    public void Placeholder_WhenExecuted_Passes()
    {
        true.Should().BeTrue();
    }
}
```

---

*Conventions analysis: 2026-08-05*
