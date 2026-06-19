export interface ToolLogEntry {
  ts: string;
  tool: string;
  duration_ms: number;
  status: "ok" | "error";
  error?: string;
}

export function logToolInvocation(entry: ToolLogEntry): void {
  console.log("[tool]", JSON.stringify(entry));
}

export function withTiming<T, R>(toolName: string, fn: (args: T) => Promise<R>): (args: T) => Promise<R> {
  return async (args: T) => {
    const start = Date.now();
    try {
      const result = await fn(args);
      const resultObj = result as { isError?: boolean; content?: Array<{ text?: string }> };
      const isError = resultObj?.isError === true;
      logToolInvocation({
        ts: new Date().toISOString(),
        tool: toolName,
        duration_ms: Date.now() - start,
        status: isError ? "error" : "ok",
        error: isError ? extractErrorText(resultObj.content) : undefined,
      });
      return result;
    } catch (err) {
      logToolInvocation({
        ts: new Date().toISOString(),
        tool: toolName,
        duration_ms: Date.now() - start,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

function extractErrorText(content?: Array<{ text?: string }>): string | undefined {
  if (!content || !content.length) return undefined;
  for (const item of content) {
    if (item.text && typeof item.text === "string") return item.text;
  }
  return undefined;
}
