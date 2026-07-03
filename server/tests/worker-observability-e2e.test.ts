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

import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mcpCall, extractText, sleep } from "./_helpers/mcpClient.ts";
import { sql } from "../src/db.ts";

function parseStats(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

Deno.test({
  name: "worker-observability: worker failure reflected in stats",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const thoughtId = crypto.randomUUID();
    let baselineErrors = 0;

    try {
      const baselineText = extractText(await mcpCall("stats", {}));
      const baseline = parseStats(baselineText);
      baselineErrors = (baseline.workers as Record<string, { errors_24h: number }>)?.entity?.errors_24h ?? 0;

      await sql`
        INSERT INTO thoughts (id, content, memory_type, source, content_fingerprint)
        VALUES (
          ${thoughtId}::uuid,
          ${`__TEST_LLM_FAIL__ ObservabilityE2E${suffix}`},
          'shard', 'user-taught',
          ${`fp-obs-e2e-${suffix}`}
        )
      `;

      // The AFTER INSERT trigger on thoughts (trg_queue_entity_extraction)
      // already enqueues this thought, so upsert instead of a plain INSERT
      // to avoid colliding on the entity_extraction_queue primary key.
      await sql`
        INSERT INTO entity_extraction_queue (thought_id, status, source_fingerprint)
        VALUES (${thoughtId}::uuid, 'pending', ${`fp-obs-e2e-${suffix}`})
        ON CONFLICT (thought_id) DO UPDATE
          SET status = 'pending', source_fingerprint = EXCLUDED.source_fingerprint
      `;

      const { __entityWorkerTestHooks } = await import("../src/entityWorker.ts");
      await __entityWorkerTestHooks.processQueue();
      await sleep(500);

      const afterText = extractText(await mcpCall("stats", {}));
      const after = parseStats(afterText);
      const afterErrors = (after.workers as Record<string, { errors_24h: number }>)?.entity?.errors_24h ?? 0;

      assert(
        afterErrors > baselineErrors,
        `Expected entity worker errors_24h to increase after failed extraction ` +
          `(baseline=${baselineErrors}, after=${afterErrors})`,
      );
    } finally {
      await sql`DELETE FROM entity_extraction_queue WHERE thought_id = ${thoughtId}::uuid`;
      await sql`DELETE FROM thoughts WHERE id = ${thoughtId}::uuid`;
    }
  },
});

Deno.test({
  name: "worker-observability: stats returns queue depths accurately",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const thoughtId = crypto.randomUUID();
    let baselineDepth = 0;

    try {
      const baselineText = extractText(await mcpCall("stats", {}));
      const baseline = parseStats(baselineText);
      baselineDepth = (baseline.queues as Record<string, number>)?.entity_extraction_pending ?? 0;

      await sql`
        INSERT INTO thoughts (id, content, memory_type, source, content_fingerprint)
        VALUES (
          ${thoughtId}::uuid,
          ${`QueueDepthE2E${suffix}`},
          'shard', 'user-taught',
          ${`fp-queue-depth-${suffix}`}
        )
      `;

      // The AFTER INSERT trigger on thoughts (trg_queue_entity_extraction)
      // already enqueues this thought, so upsert instead of a plain INSERT
      // to avoid colliding on the entity_extraction_queue primary key.
      await sql`
        INSERT INTO entity_extraction_queue (thought_id, status, source_fingerprint)
        VALUES (${thoughtId}::uuid, 'pending', ${`fp-queue-depth-${suffix}`})
        ON CONFLICT (thought_id) DO UPDATE
          SET status = 'pending', source_fingerprint = EXCLUDED.source_fingerprint
      `;

      const afterText = extractText(await mcpCall("stats", {}));
      const after = parseStats(afterText);
      const afterDepth = (after.queues as Record<string, number>)?.entity_extraction_pending ?? 0;

      assertEquals(
        afterDepth,
        baselineDepth + 1,
        `Expected entity_extraction_pending to increase by 1 ` +
          `(baseline=${baselineDepth}, after=${afterDepth})`,
      );
    } finally {
      await sql`DELETE FROM entity_extraction_queue WHERE thought_id = ${thoughtId}::uuid`;
      await sql`DELETE FROM thoughts WHERE id = ${thoughtId}::uuid`;
    }
  },
});

Deno.test({
  name: "stats response contract — all expected keys and types are present",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    try {
      const result = await mcpCall("stats", {});
      const text = extractText(result);
      const stats = JSON.parse(text) as {
        queues: Record<string, number>;
        workers: Record<string, { runs_24h: number; errors_24h: number; last_run_at: string | null; last_status?: string }>;
        recall: Record<string, number>;
        content: { total: number; by_type: Record<string, number> };
      };

      assertExists(stats.queues, "queues key");
      assertEquals(typeof stats.queues.entity_extraction_pending, "number");
      assertEquals(typeof stats.queues.consolidation_pending, "number");

      assertExists(stats.workers, "workers key");
      assertExists(stats.workers.entity, "workers.entity key");
      assertExists(stats.workers.consolidation, "workers.consolidation key");
      assertEquals(typeof stats.workers.entity.runs_24h, "number");
      assertEquals(typeof stats.workers.entity.errors_24h, "number");

      assertExists(stats.recall, "recall key");
      assertEquals(typeof stats.recall.events_24h, "number");

      assertExists(stats.content, "content key");
      assertEquals(typeof stats.content.total, "number");
      assertExists(stats.content.by_type, "content.by_type");
    } finally {
      // no cleanup needed — read-only test
    }
  },
});
