/**
 * E2E integration tests for worker observability (ST-028).
 *
 * Verifies that worker failures are visible via the `stats` MCP tool
 * and that queue depths are reflected accurately.
 *
 * Run:
 *   docker compose --profile test exec mcp-test deno test \
 *     --allow-net --allow-env --allow-read tests/worker-observability-e2e.test.ts
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mcpCall, extractText, sleep } from "./_helpers/mcpClient.ts";
import { sql } from "../src/db.ts";

Deno.test({
  name: "worker-observability: worker failure reflected in stats",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // -----------------------------------------------------------------------
    // Baseline: capture current errors_24h for the entity worker
    // -----------------------------------------------------------------------
    const baselineResult = await mcpCall("stats", {});
    const baselineText = extractText(baselineResult);
    const baseline = JSON.parse(baselineText) as {
      workers: Record<string, { errors_24h: number }>;
    };
    const baselineErrors = baseline.workers?.entity?.errors_24h ?? 0;

    // -----------------------------------------------------------------------
    // Insert a test thought that will fail LLM extraction
    // (OPENROUTER_API_KEY may not be available in the test container)
    // -----------------------------------------------------------------------
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const thoughtId = crypto.randomUUID();

    await sql`
      INSERT INTO thoughts (id, content, memory_type, source, content_fingerprint)
      VALUES (
        ${thoughtId}::uuid,
        ${`ObservabilityTestThought${suffix} — this should fail LLM extraction`},
        'shard', 'user-taught',
        ${`fp-obs-e2e-${suffix}`}
      )
    `;

    await sql`
      INSERT INTO entity_extraction_queue (thought_id, status, source_fingerprint)
      VALUES (${thoughtId}::uuid, 'pending', ${`fp-obs-e2e-${suffix}`})
    `;

    // -----------------------------------------------------------------------
    // Trigger processQueue directly (background worker is disabled)
    // -----------------------------------------------------------------------
    const { __entityWorkerTestHooks } = await import("../src/entityWorker.ts");
    await __entityWorkerTestHooks.processQueue();

    // Allow worker_runs INSERT/UPDATE to settle
    await sleep(500);

    // -----------------------------------------------------------------------
    // Assert: stats reflects the error
    // -----------------------------------------------------------------------
    const afterResult = await mcpCall("stats", {});
    const afterText = extractText(afterResult);
    const after = JSON.parse(afterText) as {
      workers: Record<string, { errors_24h: number }>;
    };
    const afterErrors = after.workers?.entity?.errors_24h ?? 0;

    assert(
      afterErrors > baselineErrors,
      `Expected entity worker errors_24h to increase after failed extraction ` +
        `(baseline=${baselineErrors}, after=${afterErrors})`,
    );

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------
    await sql`DELETE FROM entity_extraction_queue WHERE thought_id = ${thoughtId}::uuid`;
    await sql`DELETE FROM thoughts WHERE id = ${thoughtId}::uuid`;
  },
});

Deno.test({
  name: "worker-observability: stats returns queue depths accurately",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // -----------------------------------------------------------------------
    // Baseline: capture current entity_extraction_pending queue depth
    // -----------------------------------------------------------------------
    const baselineResult = await mcpCall("stats", {});
    const baselineText = extractText(baselineResult);
    const baseline = JSON.parse(baselineText) as {
      queues: { entity_extraction_pending: number };
    };
    const baselineDepth = baseline.queues?.entity_extraction_pending ?? 0;

    // -----------------------------------------------------------------------
    // Insert a test thought and a corresponding pending queue row
    // -----------------------------------------------------------------------
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const thoughtId = crypto.randomUUID();

    await sql`
      INSERT INTO thoughts (id, content, memory_type, source, content_fingerprint)
      VALUES (
        ${thoughtId}::uuid,
        ${`QueueDepthTest${suffix} — temporary thought for queue depth test`},
        'shard', 'user-taught',
        ${`fp-queue-depth-${suffix}`}
      )
    `;

    await sql`
      INSERT INTO entity_extraction_queue (thought_id, status, source_fingerprint)
      VALUES (${thoughtId}::uuid, 'pending', ${`fp-queue-depth-${suffix}`})
    `;

    // -----------------------------------------------------------------------
    // Assert: queue depth increased by 1
    // -----------------------------------------------------------------------
    const afterResult = await mcpCall("stats", {});
    const afterText = extractText(afterResult);
    const after = JSON.parse(afterText) as {
      queues: { entity_extraction_pending: number };
    };
    const afterDepth = after.queues?.entity_extraction_pending ?? 0;

    assertEquals(
      afterDepth,
      baselineDepth + 1,
      `Expected entity_extraction_pending to increase by 1 ` +
        `(baseline=${baselineDepth}, after=${afterDepth})`,
    );

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------
    await sql`DELETE FROM entity_extraction_queue WHERE thought_id = ${thoughtId}::uuid`;
    await sql`DELETE FROM thoughts WHERE id = ${thoughtId}::uuid`;
  },
});
