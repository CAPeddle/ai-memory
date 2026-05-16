export interface ContextScope {
  projects?: string[];
  profile?: "professional" | "personal";
  entities?: string[];
  visibility?: "prefer" | "exclusive" | "cross-only";
  sourceStoryId?: string;
}

/**
 * Parses the MCP `context` parameter string into a typed ContextScope.
 *
 * Format: comma-separated key:value pairs; multi-value fields use semicolons.
 * Examples:
 *   "project:zoom,profile:professional"
 *     → { projects: ['zoom'], profile: 'professional' }
 *   "project:zoom;bcf-managers,entity:CMake;Boost"
 *     → { projects: ['zoom','bcf-managers'], entities: ['CMake','Boost'] }
 */
export function parseContext(raw: string | undefined): ContextScope | null {
  if (!raw) return null;

  const scope: Partial<ContextScope> = {};

  for (const pair of raw.split(",")) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;

    const k = pair.slice(0, colonIdx).trim();
    const v = pair.slice(colonIdx + 1).trim();

    if (k === "project")         scope.projects   = v.split(";");
    else if (k === "entity")     scope.entities   = v.split(";");
    else if (k === "profile")    scope.profile    = v as ContextScope["profile"];
    else if (k === "visibility") scope.visibility = v as ContextScope["visibility"];
    else if (k === "story")      scope.sourceStoryId = v;
  }

  return scope as ContextScope;
}
