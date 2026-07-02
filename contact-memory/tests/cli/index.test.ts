import type {
  AgentRuntime,
  GenerateStructuredRequest,
} from "../../runtime/agent.ts";
import { runContactMemoryCli, type TerminalIO } from "../../cli/index.ts";

class FakeRuntime implements AgentRuntime {
  generateStructured(request: GenerateStructuredRequest): Promise<unknown> {
    const input = JSON.parse(request.userPrompt) as {
      session_id: string;
      chat_kind: "one_to_one" | "group" | "unknown";
      messages: Array<{ message_id: string }>;
    };
    return Promise.resolve({
      extraction_id: "extraction-1",
      session_id: input.session_id,
      source_chat: { session_id: input.session_id, kind: input.chat_kind },
      items: [
        {
          kind: "commitment",
          item_id: "item-1",
          extraction_id: "extraction-1",
          confidence: 0.91,
          target: { kind: "person", display_name: "Person 2" },
          evidence: [{
            message_ids: [input.messages[0].message_id],
            quote: "hello",
          }],
          summary: "Person 2 said hello.",
        },
      ],
    });
  }
}

Deno.test("CLI smoke approves one item and commits through fake commit", async () => {
  const calls: unknown[] = [];
  const io = scriptedIo(["a", "yes"]);
  const code = await runContactMemoryCli({
    args: [fixturePath(), "Person_1", "--session-id", "session-1"],
    runtime: new FakeRuntime(),
    commit: async (args) => {
      calls.push(args);
      return { ok: true };
    },
    io,
    now: fixedNow,
  });

  if (code !== 0) throw new Error(`Expected success, got ${code}`);
  if (calls.length !== 1) {
    throw new Error(`Expected one commit, got ${calls.length}`);
  }
  if (!io.output.includes("Evidence")) {
    throw new Error("Expected cited evidence display");
  }
  if (!JSON.stringify(calls[0]).includes("project:contact-memory")) {
    throw new Error("Expected default project in commit context");
  }
});

Deno.test("CLI invalid edit stays on same item before approval", async () => {
  const calls: unknown[] = [];
  const io = scriptedIo(["e", "{bad json", "a", "yes"]);
  const code = await runContactMemoryCli({
    args: [fixturePath(), "Person_1", "--session-id", "session-1"],
    runtime: new FakeRuntime(),
    commit: async (args) => {
      calls.push(args);
      return { ok: true };
    },
    io,
    now: fixedNow,
  });

  if (code !== 0) throw new Error(`Expected eventual success, got ${code}`);
  if (!io.output.includes("Invalid edit")) {
    throw new Error("Expected invalid edit message");
  }
  if (countOccurrences(io.output, "Item item-1") < 2) {
    throw new Error(
      "Expected same item to remain in review after invalid edit",
    );
  }
});

Deno.test("CLI cancel before confirmation performs zero commits", async () => {
  const calls: unknown[] = [];
  const code = await runContactMemoryCli({
    args: [fixturePath(), "Person_1", "--session-id", "session-1"],
    runtime: new FakeRuntime(),
    commit: async (args) => {
      calls.push(args);
      return { ok: true };
    },
    io: scriptedIo(["a", "no"]),
    now: fixedNow,
  });

  if (code === 0) throw new Error("Expected cancellation code");
  if (calls.length !== 0) throw new Error("Expected zero commits");
});

Deno.test("CLI sanitizes control characters in the full item JSON dump", async () => {
  class FakeRuntimeWithControlChar implements AgentRuntime {
    generateStructured(request: GenerateStructuredRequest): Promise<unknown> {
      const input = JSON.parse(request.userPrompt) as {
        session_id: string;
        chat_kind: "one_to_one" | "group" | "unknown";
        messages: Array<{ message_id: string }>;
      };
      return Promise.resolve({
        extraction_id: "extraction-1",
        session_id: input.session_id,
        source_chat: { session_id: input.session_id, kind: input.chat_kind },
        items: [
          {
            kind: "commitment",
            item_id: "item-1",
            extraction_id: "extraction-1",
            confidence: 0.91,
            target: { kind: "person", display_name: "Person 2" },
            evidence: [{
              message_ids: [input.messages[0].message_id],
              quote: "hello\x1b[31mdanger\x1b[0m",
            }],
            summary: "Person 2 said hello.",
          },
        ],
      });
    }
  }

  const io = scriptedIo(["a", "yes"]);
  await runContactMemoryCli({
    args: [fixturePath(), "Person_1", "--session-id", "session-1"],
    runtime: new FakeRuntimeWithControlChar(),
    commit: async () => ({ ok: true }),
    io,
    now: fixedNow,
  });

  if (io.output.includes("\x1b")) {
    throw new Error(
      `Expected control characters stripped from item JSON dump, got ${io.output}`,
    );
  }
});

Deno.test("CLI rejects an unparseable --from date before extraction", async () => {
  let called = false;
  class SpyRuntime implements AgentRuntime {
    generateStructured(): Promise<unknown> {
      called = true;
      return Promise.resolve({});
    }
  }

  const io = scriptedIo([]);
  const code = await runContactMemoryCli({
    args: [fixturePath(), "Person_1", "--from", "not-a-date"],
    runtime: new SpyRuntime(),
    commit: async () => ({ ok: true }),
    io,
    now: fixedNow,
  });

  if (code !== 1) throw new Error(`Expected failure code, got ${code}`);
  if (called) {
    throw new Error("Expected extraction not to run for an invalid --from");
  }
  if (!io.output.includes("--from must be a parseable date")) {
    throw new Error(`Expected date validation message, got ${io.output}`);
  }
});

Deno.test("CLI pre-commit summary excludes rejected items", async () => {
  class FakeRuntimeTwoItems implements AgentRuntime {
    generateStructured(request: GenerateStructuredRequest): Promise<unknown> {
      const input = JSON.parse(request.userPrompt) as {
        session_id: string;
        chat_kind: "one_to_one" | "group" | "unknown";
        messages: Array<{ message_id: string }>;
      };
      const messageId = input.messages[0].message_id;
      return Promise.resolve({
        extraction_id: "extraction-1",
        session_id: input.session_id,
        source_chat: { session_id: input.session_id, kind: input.chat_kind },
        items: [
          {
            kind: "commitment",
            item_id: "item-1",
            extraction_id: "extraction-1",
            confidence: 0.9,
            target: { kind: "person", display_name: "Person 2" },
            evidence: [{ message_ids: [messageId] }],
            summary: "Approved fact.",
          },
          {
            kind: "commitment",
            item_id: "item-2",
            extraction_id: "extraction-1",
            confidence: 0.9,
            target: { kind: "person", display_name: "Person 2" },
            evidence: [{ message_ids: [messageId] }],
            summary: "Rejected fact.",
          },
        ],
      });
    }
  }

  const calls: unknown[] = [];
  const io = scriptedIo(["a", "r", "", "yes"]);
  const code = await runContactMemoryCli({
    args: [fixturePath(), "Person_1", "--session-id", "session-1"],
    runtime: new FakeRuntimeTwoItems(),
    commit: async (args) => {
      calls.push(args);
      return { ok: true };
    },
    io,
    now: fixedNow,
  });

  if (code !== 0) throw new Error(`Expected success, got ${code}`);
  if (calls.length !== 1) {
    throw new Error(`Expected exactly one commit, got ${calls.length}`);
  }
  if (!io.output.includes("Candidate item_id=item-1")) {
    throw new Error("Expected approved item in pre-commit summary");
  }
  if (io.output.includes("Candidate item_id=item-2")) {
    throw new Error(
      "Expected rejected item to be excluded from pre-commit summary",
    );
  }
});

Deno.test("CLI reports fake MCP failure by category and item id", async () => {
  const io = scriptedIo(["a", "yes"]);
  const code = await runContactMemoryCli({
    args: [fixturePath(), "Person_1", "--session-id", "session-1"],
    runtime: new FakeRuntime(),
    commit: async () => {
      throw new Error("raw message body should not leak");
    },
    io,
    now: fixedNow,
  });

  if (code === 0) throw new Error("Expected failure code");
  if (!io.output.includes("item_id=item-1 category=mcp_commit_failed")) {
    throw new Error(`Expected redacted MCP failure, got ${io.output}`);
  }
  if (io.output.includes("raw message body should not leak")) {
    throw new Error("MCP error body leaked");
  }
});

function scriptedIo(
  answers: Array<string | null>,
): TerminalIO & { output: string } {
  return {
    output: "",
    write(message: string) {
      this.output += message;
    },
    prompt(_message: string): Promise<string | null> {
      return Promise.resolve(answers.shift() ?? null);
    },
  };
}

function fixturePath(): string {
  return "tests/fixtures/whatsapp/sanitized-chat.txt";
}

function fixedNow(): Date {
  return new Date("2026-07-01T12:00:00.000Z");
}

function countOccurrences(text: string, value: string): number {
  return text.split(value).length - 1;
}
