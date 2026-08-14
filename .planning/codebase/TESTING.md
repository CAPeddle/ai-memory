# Testing Patterns

**Analysis Date:** 2026-08-05

**Note:** This codebase has two distinct testing stacks (Deno/TypeScript tests are active; C#/.NET tests are skeletal placeholder only).

---

## Deno/TypeScript Server Tests (Active)

Tests for the MCP server live in `server/tests/` and use Deno's built-in test runner with standard library assertions.

### Test Framework

**Runner:**
- Deno test runner (built-in, no external runner needed)
- Version: Deno 2.0

**Assertion Library:**
- Deno standard library assertions: `https://deno.land/std@0.224.0/assert/mod.ts`
- Provides: `assertEquals`, `assertNotEquals`, `assert`, `assertArrayIncludes`, `assertExists`, `assertStringIncludes`

**Run Commands:**

```bash
# Run all server tests (from repo root)
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/

# Run a single test file
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/consolidation-scoring.test.ts

# Watch mode (during development)
# Not commonly used with Docker compose test stack; direct Deno development uses `deno test --watch`

# Coverage (not enforced in this project)
# Can be generated with `deno test --coverage` but target is not configured
```

**Important Permission Grants:**
- `--frozen`: deno.lock must match checked-in state (prevents dependency drift)
- `--allow-net`: Tests make network calls (HTTP to embeddings API, gRPC to Postgres)
- `--allow-env`: Tests read environment variables (API keys, feature flags)
- `--allow-read`: Tests read fixtures (SQL, embeddings)
- `--allow-write=/tmp`: Two test files (ST-086, ST-087) write to `/tmp` for throwaway git repos
- `--allow-run=deno,git`: ST-086 (`workflow-mvp-e2e.test.ts`) spawns real server process; ST-087 (`awcp-cli.test.ts`) spawns git CLI

### Test File Organization

**Location:**
- `server/tests/*.test.ts` for test files (co-located naming convention)
- `server/tests/_helpers/` for shared test helpers (underscore prefix marks directory as internal)

**Naming:**
- Test files: `descriptive-test-name.test.ts` (e.g., `consolidation-scoring.test.ts`, `health-check.unit.test.ts`, `workflow-boundary.test.ts`)
- Test suites match file name (no nested directories per test function)

**Helper Functions:**
- `server/tests/_helpers/serverProcess.ts` — spawn and manage a real server process
- `server/tests/_helpers/mcpClient.ts` — MCP client transport helpers
- `server/tests/_helpers/recall.ts` — recall/search operation helpers
- `server/tests/_helpers/awcpCli.ts` — CLI invocation wrappers
- `server/tests/_helpers/thoughts.ts` — thought fixture builders

**Fixtures:**
- `server/tests/fixtures/search-quality-corpus.sql` — deterministic test corpus with stub embeddings
- `server/tests/fixtures/build-search-quality-corpus.ts` — script to regenerate the corpus (run once, commit `.sql`)

### Test Structure

**Test Suite Organization:**

Tests use Deno.test() with a descriptive string naming pattern. No explicit describe/it hierarchy; each test is flat.

```typescript
/**
 * Unit tests for consolidationScoring.ts — ST-008 Task 4.3
 *
 * Run (from repo root):
 *   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/consolidation-scoring.test.ts
 */

import {
  computeBatchMaxima,
  scoreCandidate,
  bandFor,
  type CandidateMetrics,
} from "../src/consolidationScoring.ts";

const BASE: CandidateMetrics = {
  thoughtId: "test-id",
  recallCount: 5,
  distinctProjects: 3,
  helpfulCount: 0,
  totalFeedback: 0,
  confidence: 0.8,
};

Deno.test("scoring: computeBatchMaxima — single candidate gives maxima equal to its own values", () => {
  const batch = computeBatchMaxima([BASE]);
  if (batch.maxRecallCount !== 5) throw new Error(`Expected maxRecallCount=5, got ${batch.maxRecallCount}`);
  if (batch.maxDistinctProjects !== 3) throw new Error(`Expected maxDistinctProjects=3, got ${batch.maxDistinctProjects}`);
});

Deno.test("scoring: scoreCandidate — confidence fallback used when totalFeedback=0", () => {
  const batch = computeBatchMaxima([BASE]);
  const result = scoreCandidate(BASE, batch);
  if (result.relevance_source !== "confidence_fallback") {
    throw new Error(`Expected confidence_fallback, got ${result.relevance_source}`);
  }
  if (result.relevance !== 0.8) throw new Error(`Expected relevance=0.8 (from confidence), got ${result.relevance}`);
});
```

**Patterns:**

1. **Top-level doc comment**: Explains what the file tests, references the story (ST-NNN), and includes the run command
2. **Shared test data via `const BASE`**: Common test object that tests mutate or extend
3. **Assertion via throw**: Tests throw errors with contextual messages; Deno catches and reports
4. **Test naming**: `scope: verb — expected behavior` (e.g., "scoring: computeBatchMaxima — single candidate…")

### Mocking

**Framework:** Manual mocking (no external library like Sinon)

**Pattern for Dependencies Injection:**

Tests pass mock implementations of dependencies to the code under test. Example from `server/tests/health-check.unit.test.ts`:

```typescript
interface HealthDeps {
  fetch: NonNullable<HealthDeps["fetch"]>;
  sql: NonNullable<HealthDeps["sql"]>;
  now: () => number;
  env: (name: string) => string | undefined;
}

function mockFetchReturn(status: number): NonNullable<HealthDeps["fetch"]> {
  return (() => Promise.resolve(new Response(null, { status }))) as unknown as NonNullable<HealthDeps["fetch"]>;
}

function mockFetchReject(): NonNullable<HealthDeps["fetch"]> {
  return (() => Promise.reject(new Error("network failure"))) as unknown as NonNullable<HealthDeps["fetch"]>;
}

function baseSql(now: number, recent: string) {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("#");
    if (q.includes("SELECT 1") || q.includes("SELECT 2")) {
      return queryResult([]);
    }
    if (q.includes("extname = #")) {
      return queryResult([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
    }
    // ...
  }) as unknown as NonNullable<HealthDeps["sql"]>;
}

Deno.test("deepHealthCheck: all probes pass → healthy", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: baseSql(now, recent),
    fetch: mockFetchReturn(200),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "healthy");
});
```

**Pattern for Real Server Process:**

Integration tests that need a real server process use `server/tests/_helpers/serverProcess.ts`:

```typescript
// From server/tests/workflow-mvp-e2e.test.ts (ST-086)
export async function startProviderSentinel(): Promise<ProviderSentinel> {
  const hits: SentinelHit[] = [];
  const ac = new AbortController();
  let resolvePort: (p: number) => void;
  const portReady = new Promise<number>((r) => {
    resolvePort = r;
  });

  const server = Deno.serve({
    port: 0,
    hostname: "127.0.0.1",
    signal: ac.signal,
    onListen: ({ port }) => resolvePort(port),
  }, (req) => {
    // Record requests and return 200 with plausible model list
  });

  return {
    baseUrl: `http://127.0.0.1:${await portReady}`,
    hits,
    close: async () => ac.abort(),
  };
}
```

**What to Mock:**
- HTTP dependencies (embedding API, provider API) → mock fetch responses
- Database queries → mock sql tagged template return values
- Time-based logic → mock `now()` function
- Feature flags → mock `Deno.env.get()`

**What NOT to Mock:**
- Pure functions (e.g., `scoreCandidate()`) → call directly
- Cypher graph queries for entity extraction → use real db-test with seeded corpus
- MCP protocol validation → test with real `Client` and `StreamableHTTPClientTransport`
- CLI spawning — see `awcp-cli.test.ts` for real subprocess patterns

### Fixtures and Factories

**Test Data:**

Fixtures are built in-place via test setup or loaded from SQL files.

**Pattern 1: Inline Base Object**

```typescript
const BASE: CandidateMetrics = {
  thoughtId: "test-id",
  recallCount: 5,
  distinctProjects: 3,
  helpfulCount: 0,
  totalFeedback: 0,
  confidence: 0.8,
};

// In individual tests, spread and mutate
const m: CandidateMetrics = { ...BASE, helpfulCount: 3, totalFeedback: 4 };
```

**Pattern 2: Generated SQL Fixtures**

`server/tests/fixtures/search-quality-corpus.ts` is a Deno script that generates a deterministic 40-thought corpus with topic-clustered stub embeddings:

```typescript
// Run once (committed result lives in search-quality-corpus.sql):
// deno run --allow-write tests/fixtures/build-search-quality-corpus.ts

// Generates corpus with:
// - 40 rows across multiple topics (zoom, typescript, postgres, java, etc.)
// - Deterministic MD5-based embeddings (512-dim vectors with noise)
// - Seed queries with expected IDs for search-quality validation
```

Test loads this fixture during `docker compose --profile test up`:

```bash
# docker-compose.yml service "seed"
seed:
  image: postgres:15-alpine
  entrypoint: |
    sh -c "
    PGPASSWORD=$POSTGRES_PASSWORD psql -h db-test -U $POSTGRES_USER -d $POSTGRES_DB < /sql/search-quality-corpus.sql
    "
  depends_on:
    db-test:
      condition: service_healthy
```

**Location:**
- Inline test data: In test file at module level (e.g., `const BASE`)
- SQL fixtures: `server/tests/fixtures/search-quality-corpus.sql` (committed, regenerated rarely)
- Helper factories: `server/tests/_helpers/*.ts` (e.g., `thoughts.ts` for building thought objects)

### Coverage

**Requirements:** No coverage target enforced in this project

**View Coverage:**

Coverage can be generated but is not gated:

```bash
docker compose --profile test exec mcp-test deno test --coverage=./coverage tests/
# Output directory: ./coverage/

# Generate coverage report (requires deno_coverage tool or IDE integration)
# This is optional; continuous integration does not gate on coverage %
```

**Test Coverage Gaps:**

Coverage is comprehensive for:
- Unit functions (scoring, validation, parsing)
- Health check probes (all probe types)
- Worker restart/isolation (entity worker, consolidation worker)
- Workflow migrations (bootstrap, storage)
- MCP protocol validation (tool descriptions, resource metadata)

Gaps (accepted risk, not blocking):
- Integration tests with real cloud embeddings API (mocked instead)
- End-to-end contact-specific workflows (deferred to Contact Memory product)

### Test Types

**Unit Tests:**
- Scope: Pure functions with no side effects (scoring, validation, parsing)
- Approach: Direct function call with mock dependencies injected
- Example: `consolidation-scoring.test.ts` (no DB, no network)
- Run time: <100ms per test

**Integration Tests:**
- Scope: Full server stack with test database and mock external services
- Approach: Start real server process, make HTTP/gRPC calls, verify database state
- Examples: `workflow-mvp-e2e.test.ts` (ST-086), `entity-worker-crash-isolation.test.ts`
- Run time: 5–30s per test
- Isolation: Uses ephemeral `db-test` container (wiped when stopped, NOT between runs)

**E2E Tests:**
- Scope: None currently deployed (E2E with real cloud would require secrets)
- Pattern: Would use `server/tests/_helpers/serverProcess.ts` with real provider credentials
- Current substitutes: Integration tests with provider sentinel (mock HTTP server)

### Common Patterns

**Async Testing:**

```typescript
Deno.test("async operation: success case", async () => {
  const result = await someAsyncFunction();
  assertEquals(result.status, "success");
});

Deno.test("async operation: timeout rejection", async () => {
  try {
    await Promise.race([
      someAsyncFunction(),
      new Promise((_r, rej) => setTimeout(() => rej(new Error("timeout")), 100)),
    ]);
    throw new Error("should have timed out");
  } catch (e) {
    assertEquals((e as Error).message, "timeout");
  }
});
```

**Error Testing:**

```typescript
Deno.test("error: invalid input throws", () => {
  try {
    parseContext("invalid::");
    throw new Error("should have thrown");
  } catch (e) {
    const err = e as ContextParseError;
    assertEquals(err.error, true);
    assert(err.message.includes("Invalid token"));
  }
});

Deno.test("error: returns error object instead of throwing", () => {
  const result = parseContext("invalid::");
  if (!isContextError(result)) throw new Error("expected ContextParseError");
  assertEquals(result.message, `Invalid token "invalid::" — expected key:value format`);
});
```

**Database Isolation:**

```typescript
// Before each test, verify you're connected to db-test, not db:
Deno.test("database: inserts into test schema", async () => {
  const connStr = Deno.env.get("DATABASE_URL");
  assert(connStr?.includes("5433"), "Must connect to db-test (port 5433), not db (5432)");
  
  // Execute test
});
```

**Provider Sentinel Pattern (Mock Upstream HTTP):**

```typescript
// From workflow-mvp-e2e.test.ts
Deno.test("server: does not call embedding provider when not needed", async () => {
  const sentinel = await startProviderSentinel();
  const serverProc = await startServerProcess({
    OPENROUTER_BASE_URL: sentinel.baseUrl,
    FEATURE_WORKFLOW: "true",
  });
  
  // Run workflow that should NOT call provider
  
  assertEquals(sentinel.hits.length, 0, "Provider should not be called");
  
  await serverProc.stop();
  await sentinel.close();
});
```

---

## C#/.NET Stack Tests (Skeletal)

The C#/.NET test suite in `tests/AiMemory.Tests/` is a placeholder (skeletal, ST-003 scoped).

### Test Framework

**Runner:**
- xUnit (installed via NuGet)
- Version: Deferred to ST-019

**Assertion Library:**
- FluentAssertions (installed via NuGet)
- Provides: `.Should().Be()`, `.Should().BeTrue()`, `.Should().Throw<>()`, etc.

### Test File Organization

**Location:**
- `tests/AiMemory.Tests/` directory

**Naming:**
- Placeholder: `SmokeTests.cs`
- Convention (when populated): `ComponentNameTests.cs` (e.g., `MemoryServiceTests.cs`, `ParseContextTests.cs`)

### Test Structure

**Current Placeholder:**

```csharp
using FluentAssertions;
using Xunit;

namespace AiMemory.Tests;

public class SmokeTests
{
    [Fact]
    public void Placeholder_WhenExecuted_Passes()
    {
        true.Should().BeTrue();
    }
}
```

**Planned Structure (ST-019):**

```csharp
public class IMemoryServiceTests
{
    // Arrange, Act, Assert structure
    // Follows MethodName_Scenario_ExpectedResult naming
    
    [Fact]
    public void GetMemory_WithValidId_ReturnsThought()
    {
        // Setup
        var service = new MemoryService();
        var id = Guid.NewGuid();
        
        // Act
        var result = service.GetMemory(id);
        
        // Assert
        result.Should().NotBeNull();
    }
}
```

### Mocking

**Framework:** NSubstitute (planned)

**Pattern (deferred to ST-019):**

```csharp
// When populated:
var mockRepo = Substitute.For<IMemoryRepository>();
mockRepo.GetThought(Arg.Any<Guid>()).Returns(x => null);

var service = new MemoryService(mockRepo);
var result = service.GetMemory(Guid.NewGuid());

result.Should().BeNull();
mockRepo.Received(1).GetThought(Arg.Any<Guid>());
```

### Coverage

**Requirements:** Deferred to ST-019

No coverage target is currently enforced on the skeletal .NET codebase.

---

## Gotchas & Known Issues

### Deno/TypeScript

1. **Test Database Accumulation:**
   - `db-test` is wiped when its container stops, NOT between successive `docker compose exec` runs
   - Sequential test runs against the same ephemeral DB pollute each other
   - **Mitigation:** Either restart the container between runs or use isolated test data (different UUIDs, test prefixes)

2. **Provider Hardcoding (ST-085 pending):**
   - `server/src/entityWorker.ts` and `server/src/consolidationLLM.ts` hardcode `https://openrouter.ai/api/v1/...` URLs
   - They do not respect `OPENROUTER_BASE_URL` environment variable
   - **Impact:** Provider sentinel mocks in tests do not intercept these calls
   - **Current workaround:** Tests document this limitation; changes deferred to ST-085

3. **No Fixtures Cleanup:**
   - Deno tests do not have a built-in cleanup hook (no teardown, no after-each)
   - Tests must manage their own cleanup (close servers, abort signals)
   - Example from `workflow-mvp-e2e.test.ts`: manual `await serverProc.stop()` and `await sentinel.close()`

4. **Frozen Deno Lock:**
   - `--frozen` flag is required and enforced in CI
   - New dependencies must be added via `deno add` and `deno.lock` must be committed
   - Offline test runs will fail if deno.lock is out of sync

### C#/.NET

- Entire test suite is a placeholder; conventions and gotchas TBD in ST-019

---

*Testing analysis: 2026-08-05*
