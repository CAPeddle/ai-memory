import { AgentRuntimeError, type GenerateStructuredRequest } from "../agent.ts";

interface AnthropicRuntimeOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface AnthropicContentBlock {
  type?: string;
  name?: string;
  input?: unknown;
}

const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_BASE_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 120_000;

export class AnthropicStructuredRuntime {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AnthropicRuntimeOptions = {}) {
    this.apiKey = options.apiKey ?? Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    this.model = options.model ??
      Deno.env.get("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateStructured(
    request: GenerateStructuredRequest,
  ): Promise<unknown> {
    if (!this.apiKey) {
      throw new AgentRuntimeError(
        "provider_config",
        "ANTHROPIC_API_KEY is required for contact extraction",
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 8192,
          system: request.systemPrompt,
          tools: [
            {
              name: request.toolName,
              description: request.toolDescription ??
                "Return the requested structured object.",
              input_schema: request.schema,
            },
          ],
          tool_choice: { type: "tool", name: request.toolName },
          messages: [{ role: "user", content: request.userPrompt }],
        }),
      });
    } catch {
      throw new AgentRuntimeError("provider_request");
    }

    if (!response.ok) {
      throw new AgentRuntimeError("provider_request");
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new AgentRuntimeError("structured_output");
    }

    const content = (data as { content?: AnthropicContentBlock[] }).content;
    const toolUse = content?.find((block) =>
      block.type === "tool_use" && block.name === request.toolName
    );
    if (!toolUse || toolUse.input === undefined) {
      throw new AgentRuntimeError("structured_output");
    }

    return toolUse.input;
  }
}
