import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mcpCall, extractText } from "./_helpers/mcpClient.ts";
import { captureThought, cleanupThought } from "./_helpers/thoughts.ts";
import { sql } from "../src/db.ts";

Deno.test({
  name: "report_feedback: capture → search → report_feedback → row visible in feedback_events",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const keyword = `fbtest${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const content = `Feedback e2e test thought ${keyword} for integration test`;
    const thoughtId = await captureThought(content);

    try {
      const searchResult = await mcpCall("search_thoughts", { query: keyword, limit: 5 });
      const searchText = extractText(searchResult);
      const searchPayload = JSON.parse(searchText) as { results: Array<{ id: string }> };
      assertEquals(
        searchPayload.results.some((r) => r.id === thoughtId),
        true,
        "search_thoughts should return the captured thought",
      );

      const query = keyword;
      const verdict = "helpful";
      const result = await mcpCall("report_feedback", { thought_id: thoughtId, query, verdict });
      const text = extractText(result);

      assertMatch(text, /Feedback recorded: helpful/);
      assertMatch(text, new RegExp(thoughtId));
      assertMatch(text, new RegExp(keyword));

      const rows = await sql`
        SELECT thought_id, query, verdict
        FROM feedback_events
        WHERE thought_id = ${thoughtId}::uuid
      `;
      assertEquals(rows.length, 1, "Should have exactly one feedback row");
      assertEquals(rows[0].thought_id, thoughtId);
      assertEquals(rows[0].query, query);
      assertEquals(rows[0].verdict, "helpful");
    } finally {
      await cleanupThought(thoughtId);
    }
  },
});

Deno.test({
  name: "report_feedback: irrelevant verdict is accepted",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const content = `Feedback irrelevant test ${Date.now()}`;
    const thoughtId = await captureThought(content);

    try {
      const result = await mcpCall("report_feedback", {
        thought_id: thoughtId,
        query: "irrelevant test query",
        verdict: "irrelevant",
      });
      const text = extractText(result);
      assertMatch(text, /Feedback recorded: irrelevant/);

      const rows = await sql`
        SELECT verdict
        FROM feedback_events
        WHERE thought_id = ${thoughtId}::uuid
      `;
      assertEquals(rows.length, 1);
      assertEquals(rows[0].verdict, "irrelevant");
    } finally {
      await cleanupThought(thoughtId);
    }
  },
});

Deno.test({
  name: "report_feedback: duplicate feedback for same thought+query is allowed",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const content = `Feedback duplicate test ${Date.now()}`;
    const thoughtId = await captureThought(content);

    try {
      await mcpCall("report_feedback", {
        thought_id: thoughtId,
        query: "duplicate test",
        verdict: "helpful",
      });

      await mcpCall("report_feedback", {
        thought_id: thoughtId,
        query: "duplicate test",
        verdict: "irrelevant",
      });

      const rows = await sql`
        SELECT verdict
        FROM feedback_events
        WHERE thought_id = ${thoughtId}::uuid
        ORDER BY id
      `;
      assertEquals(rows.length, 2, "Should have two feedback rows for same thought+query");
      assertEquals(rows[0].verdict, "helpful");
      assertEquals(rows[1].verdict, "irrelevant");
    } finally {
      await cleanupThought(thoughtId);
    }
  },
});

Deno.test({
  name: "report_feedback: non-existent thought_id fails with FK violation",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const nonExistentId = "00000000-0000-4000-8000-000000000099";
    const result = await mcpCall("report_feedback", {
      thought_id: nonExistentId,
      query: "fk violation test",
      verdict: "helpful",
    }) as { result?: { isError?: boolean; content?: Array<{ text?: string }> } };
    const text = extractText(result);
    assertMatch(text, /foreign key/i, `Expected FK violation error, got: ${text.slice(0, 200)}`);
    assertEquals(result.result?.isError, true, "FK violation should set isError: true");

    const rows = await sql`
      SELECT id FROM feedback_events WHERE thought_id = ${nonExistentId}::uuid
    `;
    assertEquals(rows.length, 0, "No feedback row should exist for non-existent thought");
  },
});

Deno.test({
  name: "report_feedback: ON DELETE CASCADE removes feedback when thought is deleted",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const content = `Feedback cascade test ${Date.now()}`;
    const thoughtId = await captureThought(content);

    try {
      await mcpCall("report_feedback", {
        thought_id: thoughtId,
        query: "cascade test",
        verdict: "helpful",
      });

      const [beforeDelete] = await sql`SELECT count(*)::int AS cnt FROM feedback_events WHERE thought_id = ${thoughtId}::uuid`;
      assertEquals(beforeDelete.cnt, 1, "Feedback row should exist before thought deletion");

      await sql`DELETE FROM thoughts WHERE id = ${thoughtId}::uuid`;

      const [afterDelete] = await sql`SELECT count(*)::int AS cnt FROM feedback_events WHERE thought_id = ${thoughtId}::uuid`;
      assertEquals(afterDelete.cnt, 0, "Feedback row should be cascade-deleted with thought");
    } finally {
      await sql`DELETE FROM thoughts WHERE id = ${thoughtId}::uuid`.catch(() => {});
    }
  },
});

Deno.test({
  name: "report_feedback: invalid verdict returns error",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("report_feedback", {
      thought_id: "00000000-0000-4000-8000-000000000001",
      query: "test",
      verdict: "maybe",
    }) as { result?: { isError?: boolean; content?: Array<{ text?: string }> } };
    const text = extractText(result);
    assertEquals(result.result?.isError, true, "Invalid verdict should set isError: true");
    assertMatch(text, /verdict|invalid|enum/i, `Expected verdict validation error, got: ${text.slice(0, 200)}`);
  },
});

Deno.test({
  name: "report_feedback: invalid thought_id format returns error",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("report_feedback", {
      thought_id: "not-a-uuid",
      query: "test",
      verdict: "helpful",
    }) as { result?: { isError?: boolean; content?: Array<{ text?: string }> } };
    const text = extractText(result);
    assertEquals(result.result?.isError, true, "Invalid UUID should set isError: true");
    assertMatch(text, /uuid|invalid/i, `Expected UUID validation error, got: ${text.slice(0, 200)}`);
  },
});

Deno.test({
  name: "report_feedback: query at exactly 4096 bytes is accepted",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const content = `Feedback boundary test ${Date.now()}`;
    const thoughtId = await captureThought(content);

    try {
      const exactQuery = "x".repeat(4096);
      const result = await mcpCall("report_feedback", {
        thought_id: thoughtId,
        query: exactQuery,
        verdict: "helpful",
      });
      const text = extractText(result);
      assertMatch(text, /Feedback recorded/, `Expected success at 4096 bytes, got: ${text.slice(0, 200)}`);

      const rows = await sql`SELECT id FROM feedback_events WHERE thought_id = ${thoughtId}::uuid`;
      assertEquals(rows.length, 1, "Feedback row should exist for 4096-byte query");
    } finally {
      await cleanupThought(thoughtId);
    }
  },
});

Deno.test({
  name: "report_feedback: query exceeding 4096 bytes is rejected",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const content = `Feedback query limit test ${Date.now()}`;
    const thoughtId = await captureThought(content);

    try {
      const longQuery = "x".repeat(4097);
      const result = await mcpCall("report_feedback", {
        thought_id: thoughtId,
        query: longQuery,
        verdict: "helpful",
      }) as { result?: { isError?: boolean; content?: Array<{ text?: string }> } };
      const text = extractText(result);
      assertEquals(result.result?.isError, true, "Oversized query should set isError: true");
      assertMatch(text, /4096/i, `Expected size limit error mentioning 4096, got: ${text.slice(0, 200)}`);

      const rows = await sql`SELECT id FROM feedback_events WHERE thought_id = ${thoughtId}::uuid`;
      assertEquals(rows.length, 0, "No feedback row should exist for oversized query");
    } finally {
      await cleanupThought(thoughtId);
    }
  },
});

Deno.test({
  name: "report_feedback: multibyte query exceeding 4096 bytes is rejected by handler",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const content = `Feedback multibyte test ${Date.now()}`;
    const thoughtId = await captureThought(content);

    try {
      // 1366 × 'あ' = 1366 UTF-16 code units (well under z.string() default)
      // but 1366 × 3 = 4098 UTF-8 bytes (exceeds the 4096 byte limit)
      const multibyteQuery = "あ".repeat(1366);
      const result = await mcpCall("report_feedback", {
        thought_id: thoughtId,
        query: multibyteQuery,
        verdict: "helpful",
      }) as { result?: { isError?: boolean; content?: Array<{ text?: string }> } };
      const text = extractText(result);
      assertEquals(result.result?.isError, true, "Multibyte query over 4096 bytes should set isError: true");
      assertMatch(text, /4096/i, `Expected size limit error mentioning 4096, got: ${text.slice(0, 200)}`);

      const rows = await sql`SELECT id FROM feedback_events WHERE thought_id = ${thoughtId}::uuid`;
      assertEquals(rows.length, 0, "No feedback row should exist for multibyte oversized query");
    } finally {
      await cleanupThought(thoughtId);
    }
  },
});
