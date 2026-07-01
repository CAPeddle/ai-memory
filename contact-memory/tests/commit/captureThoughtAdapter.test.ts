import {
  type CaptureThoughtArguments,
  commitContactShardCandidates,
  CONTACT_PROVENANCE_DELIMITER,
  createMcpCaptureThoughtCommitter,
  toCaptureThoughtArguments,
} from "../../commit/captureThoughtAdapter.ts";
import {
  type ContactExtraction,
  type ContactShardCandidate,
  createContactShardCandidates,
  type ReviewDecision,
} from "../../parser/types.ts";

Deno.test("toCaptureThoughtArguments maps candidate to capture_thought args", () => {
  const candidate = candidateFixture();
  const args = toCaptureThoughtArguments(candidate, "contact-memory");

  if (args.memory_type !== "shard") {
    throw new Error("Expected shard memory_type");
  }
  if (!args.context.startsWith("project:contact-memory,tags:")) {
    throw new Error(`Unexpected context: ${args.context}`);
  }
  for (const tag of candidate.tags) {
    if (!args.context.includes(tag)) throw new Error(`Missing tag ${tag}`);
  }
});

Deno.test("toCaptureThoughtArguments embeds fact before cmv1 provenance", () => {
  const args = toCaptureThoughtArguments(candidateFixture(), "contact-memory");
  const [fact, provenance] = args.content.split(
    `\n${CONTACT_PROVENANCE_DELIMITER}\n`,
  );

  if (!fact.includes("bring dessert")) {
    throw new Error("Expected rendered fact first");
  }
  for (
    const key of [
      "source",
      "session_id",
      "extraction_id",
      "item_id",
      "item_kind",
      "review_decision_id",
      "review_outcome",
      "evidence_message_ids",
    ]
  ) {
    if (!provenance.includes(`${key}:`)) {
      throw new Error(`Missing metadata key ${key}`);
    }
  }
});

Deno.test("toCaptureThoughtArguments embeds only first evidence reference", () => {
  const candidate = candidateFixture({
    evidence: [
      { message_ids: ["m1"], quote: "first" },
      { message_ids: ["m2"], quote: "second" },
    ],
  });
  const args = toCaptureThoughtArguments(candidate, "contact-memory");

  if (!args.content.includes("evidence_message_ids:m1")) {
    throw new Error("Expected first evidence id");
  }
  if (args.content.includes("m2")) {
    throw new Error("Expected only first evidence id");
  }
});

Deno.test("commitContactShardCandidates reports oversized content per item", async () => {
  const candidate = candidateFixture({ content: "x".repeat(32_100) });
  const results = await commitContactShardCandidates([candidate], {
    project: "contact-memory",
    commit: async () => ({ ok: true }),
  });

  if (results[0].ok) throw new Error("Expected oversized content failure");
  if (results[0].category !== "content_too_large") {
    throw new Error(`Unexpected category: ${results[0].category}`);
  }
});

Deno.test("commitContactShardCandidates preserves per-item MCP failure", async () => {
  const calls: CaptureThoughtArguments[] = [];
  const candidates = [
    candidateFixture(),
    candidateFixture({ item_id: "item-2", content: "Person 2 likes hiking." }),
  ];
  const results = await commitContactShardCandidates(candidates, {
    project: "contact-memory",
    commit: async (args) => {
      calls.push(args);
      if (calls.length === 2) throw new Error("body should not leak");
      return { id: "ok" };
    },
  });

  if (!results[0].ok || results[1].ok) {
    throw new Error("Expected partial success");
  }
  if (results[1].item_id !== "item-2") {
    throw new Error("Expected failed item id");
  }
  if (results[1].category !== "mcp_commit_failed") {
    throw new Error(`Unexpected category: ${results[1].category}`);
  }
});

Deno.test("MCP committer sends capture_thought over streamable HTTP", async () => {
  let body: Record<string, unknown> | undefined;
  const commit = createMcpCaptureThoughtCommitter({
    apiKey: "test-key",
    baseUrl: "http://mcp.test",
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      const headers = new Headers(init?.headers);
      if (!headers.get("accept")?.includes("text/event-stream")) {
        throw new Error("Missing SSE Accept header");
      }
      return new Response(
        `event: message\ndata: ${
          JSON.stringify({ id: body?.id, result: { ok: true } })
        }\n\n`,
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      );
    },
  });

  await commit({
    content: "fact",
    memory_type: "shard",
    context: "project:test",
  });
  const params = body?.params as
    | { name?: string; arguments?: unknown }
    | undefined;
  if (params?.name !== "capture_thought") {
    throw new Error("Expected capture_thought tool call");
  }
});

Deno.test("MCP committer treats a 200 OK tool-level isError as a failure", async () => {
  const commit = createMcpCaptureThoughtCommitter({
    apiKey: "test-key",
    baseUrl: "http://mcp.test",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body?.id,
          result: { isError: true, content: [{ text: "content_too_large" }] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  let threw = false;
  try {
    await commit({
      content: "fact",
      memory_type: "shard",
      context: "project:test",
    });
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(
      "Expected tool-level isError to be reported as a failure",
    );
  }
});

Deno.test("MCP committer treats a JSON-RPC error on 200 OK as a failure", async () => {
  const commit = createMcpCaptureThoughtCommitter({
    apiKey: "test-key",
    baseUrl: "http://mcp.test",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body?.id,
          error: { code: -32602, message: "invalid params" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  let threw = false;
  try {
    await commit({
      content: "fact",
      memory_type: "shard",
      context: "project:test",
    });
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(
      "Expected JSON-RPC error on 200 OK to be reported as a failure",
    );
  }
});

function candidateFixture(
  overrides: Partial<ContactShardCandidate> = {},
): ContactShardCandidate {
  const extraction: ContactExtraction = {
    extraction_id: "extraction-1",
    session_id: "session-1",
    items: [
      {
        kind: "commitment",
        item_id: overrides.item_id ?? "item-1",
        extraction_id: "extraction-1",
        confidence: 0.9,
        target: { kind: "person", display_name: "Person 2" },
        evidence: overrides.evidence ?? [
          { message_ids: ["m1"], quote: "I will bring dessert" },
        ],
        summary: "Person 2 will bring dessert.",
      },
    ],
  };
  const decisions: ReviewDecision[] = [
    {
      decision_id: "decision-1",
      extraction_id: "extraction-1",
      item_id: overrides.item_id ?? "item-1",
      outcome: "approve",
      reviewed_at: "2026-07-01T12:00:00.000Z",
      reviewer_context: "local-cli",
    },
  ];
  const result = createContactShardCandidates({
    extraction,
    decisions,
    source: "whatsapp_export",
    agent_context: "contact-memory-cli",
  });
  if (!result.ok) throw new Error(result.message);
  return { ...result.value[0], ...overrides };
}
