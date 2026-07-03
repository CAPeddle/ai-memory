export interface GenerateStructuredRequest {
  systemPrompt: string;
  userPrompt: string;
  schema: Record<string, unknown>;
  toolName: string;
  toolDescription?: string;
}

export interface AgentRuntime {
  generateStructured(request: GenerateStructuredRequest): Promise<unknown>;
}

export type AgentRuntimeErrorCategory =
  | "provider_config"
  | "provider_request"
  | "structured_output";

export class AgentRuntimeError extends Error {
  readonly category: AgentRuntimeErrorCategory;

  constructor(category: AgentRuntimeErrorCategory, message?: string) {
    super(message ?? category);
    this.name = "AgentRuntimeError";
    this.category = category;
  }
}
