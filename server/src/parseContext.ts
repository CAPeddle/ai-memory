export interface ContextScope {
  projects?: string[];
  profile?: "professional" | "personal";
  entities?: string[];
  visibility?: "prefer" | "exclusive" | "cross-only";
  sourceStoryId?: string;
  strict?: boolean;
}

export interface ContextParseError {
  error: true;
  message: string;
  received: string;
  expected: string;
  failedToken?: string;
}

export type ContextParseResult = ContextScope | ContextParseError;

const VALID_KEYS = new Set(["project", "entity", "profile", "visibility", "story", "strict"]);
const VALID_PROFILES = new Set(["professional", "personal"]);
const VALID_VISIBILITIES = new Set(["prefer", "exclusive", "cross-only"]);

export function isContextError(result: ContextParseResult | null): result is ContextParseError {
  return result !== null && "error" in result && result.error === true;
}

export function parseContext(raw: string | undefined): ContextParseResult | null {
  if (!raw) return null;

  const scope: Partial<ContextScope> = {};

  for (const pair of raw.split(",")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    if (trimmed === "strict") {
      scope.strict = true;
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      return {
        error: true,
        message: `Invalid token "${trimmed}" — expected key:value format`,
        received: raw,
        expected: 'Comma-separated key:value pairs. Example: "project:myapp,profile:professional,strict"',
        failedToken: trimmed,
      };
    }

    const k = trimmed.slice(0, colonIdx).trim();
    const v = trimmed.slice(colonIdx + 1).trim();

    if (!VALID_KEYS.has(k)) {
      return {
        error: true,
        message: `Unknown key "${k}" — valid keys: ${[...VALID_KEYS].join(", ")}`,
        received: raw,
        expected: 'Comma-separated key:value pairs. Example: "project:myapp,profile:professional"',
        failedToken: trimmed,
      };
    }

    if (!v) {
      return {
        error: true,
        message: `Key "${k}" has empty value`,
        received: raw,
        expected: `"${k}:<value>"`,
        failedToken: trimmed,
      };
    }

    if (k === "project")         scope.projects   = v.split(";");
    else if (k === "entity")    scope.entities   = v.split(";");
    else if (k === "profile") {
      if (!VALID_PROFILES.has(v)) {
        return {
          error: true,
          message: `Invalid profile "${v}" — must be "professional" or "personal"`,
          received: raw,
          expected: '"profile:professional" or "profile:personal"',
          failedToken: trimmed,
        };
      }
      scope.profile = v as ContextScope["profile"];
    }
    else if (k === "visibility") {
      if (!VALID_VISIBILITIES.has(v)) {
        return {
          error: true,
          message: `Invalid visibility "${v}" — must be "prefer", "exclusive", or "cross-only"`,
          received: raw,
          expected: '"visibility:prefer", "visibility:exclusive", or "visibility:cross-only"',
          failedToken: trimmed,
        };
      }
      scope.visibility = v as ContextScope["visibility"];
    }
    else if (k === "story")      scope.sourceStoryId = v;
    else if (k === "strict") {
      if (v !== "true" && v !== "false") {
        return {
          error: true,
          message: `Invalid strict value "${v}" — must be "true" or "false"`,
          received: raw,
          expected: '"strict:true", "strict:false", or bare "strict"',
          failedToken: trimmed,
        };
      }
      scope.strict = v === "true";
    }
  }

  return scope as ContextScope;
}

export function parseContextOrError(raw: string | undefined): ContextScope | null | { content: Array<{ type: "text"; text: string }>; isError: true } {
  const result = parseContext(raw);
  if (isContextError(result)) {
    return {
      content: [{ type: "text" as const, text: `Context validation error: ${result.message}\nExpected: ${result.expected}\nReceived: "${result.received}"` }],
      isError: true,
    };
  }
  return result;
}
