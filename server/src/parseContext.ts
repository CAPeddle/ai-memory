export interface ContextScope {
  projects?: string[];
  tags?: string[];
  /** Parsed but not yet consumed by any tool handler. Reserved for future graph-expanded search. */
  entities?: string[];
  visibility?: "prefer" | "exclusive" | "cross-only";
  /** Parsed but not yet consumed by any tool handler. Reserved for future story-scoped recall. */
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

const VALID_KEYS = new Set(["project", "entity", "tags", "visibility", "story", "strict"]);
const VALID_VISIBILITIES = new Set(["prefer", "exclusive", "cross-only"]);
const TAG_PATTERN = /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?$/;
const MAX_TAGS = 16;
const MAX_TAG_LENGTH = 64;

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
        expected: 'Comma-separated key:value pairs. Example: "project:myapp,tags:developer;contact,strict"',
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
        expected: 'Comma-separated key:value pairs. Example: "project:myapp,tags:developer;contact"',
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
    else if (k === "tags") {
      const parsedTags = parseTags(v);
      if ("error" in parsedTags) {
        return {
          ...parsedTags,
          received: raw,
          failedToken: trimmed,
        };
      }
      scope.tags = parsedTags;
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

function parseTags(rawTags: string): string[] | ContextParseError {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const tag of rawTags.split(";")) {
    if (!tag) {
      return {
        error: true,
        message: "Invalid tags value — empty tag segments are not allowed",
        received: rawTags,
        expected: 'Tags separated by semicolons. Example: "tags:developer;contact"',
      };
    }
    if (tag !== tag.trim()) {
      return {
        error: true,
        message: `Invalid tag "${tag}" — tags must not include surrounding whitespace`,
        received: rawTags,
        expected: 'Lowercase tags matching /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?$/',
      };
    }
    if (tag.length > MAX_TAG_LENGTH || !TAG_PATTERN.test(tag)) {
      return {
        error: true,
        message: `Invalid tag "${tag}" — tags must be lowercase and may include one namespace separator`,
        received: rawTags,
        expected: 'Lowercase tags matching /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?$/',
      };
    }
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }

  if (tags.length > MAX_TAGS) {
    return {
      error: true,
      message: `Too many tags — maximum is ${MAX_TAGS}`,
      received: rawTags,
      expected: `At most ${MAX_TAGS} semicolon-separated tags`,
    };
  }

  return tags;
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

export function isMcpContextError(
  result: ContextScope | null | { content: Array<{ type: "text"; text: string }>; isError: true },
): result is { content: Array<{ type: "text"; text: string }>; isError: true } {
  return result !== null && "isError" in result && result.isError === true;
}
