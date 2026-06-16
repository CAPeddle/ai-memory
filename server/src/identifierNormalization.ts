export const IDENTIFIER_NORMALIZER_VERSION = 1;

type IdentifierFacets = {
  tickets: string[];
  builds: string[];
};

type NormalizedIdentifiers = {
  retrievalText: string;
  facets: IdentifierFacets;
  normalizerVersion: number;
};

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const SEMVER_PATTERN = /\bv?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/g;
const ERROR_CODE_PATTERN = /\b[A-Z]\d{3,}\b/g;
const TICKET_PATTERN = /\b[A-Z]{2,}-\d+\b/g;
const BUILD_PATTERN = /\b\d{4,}\b/g;

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function protectMatches(input: string, pattern: RegExp): { text: string; protectedValues: Map<string, string> } {
  const protectedValues = new Map<string, string>();
  let index = 0;

  const text = input.replace(pattern, (match) => {
    const placeholder = `ZZPROTECTED${index}TOKENZZ`;
    protectedValues.set(placeholder, match);
    index += 1;
    return placeholder;
  });

  return { text, protectedValues };
}

function restoreMatches(input: string, protectedValues: Map<string, string>): string {
  let restored = input;

  for (const [placeholder, original] of protectedValues.entries()) {
    restored = restored.replaceAll(placeholder, original);
  }

  return restored;
}

export function normalizeIdentifiers(input: string): NormalizedIdentifiers {
  const facets: IdentifierFacets = { tickets: [], builds: [] };

  const protections = [UUID_PATTERN, SEMVER_PATTERN, ERROR_CODE_PATTERN];
  let working = input;
  const protectedValues = new Map<string, string>();

  for (const pattern of protections) {
    const result = protectMatches(working, pattern);
    working = result.text;
    for (const [placeholder, original] of result.protectedValues.entries()) {
      protectedValues.set(placeholder, original);
    }
  }

  working = working.replace(TICKET_PATTERN, (match) => {
    facets.tickets.push(match);
    return " ";
  });

  working = working.replace(BUILD_PATTERN, (match) => {
    facets.builds.push(match);
    return " ";
  });

  working = restoreMatches(working, protectedValues);

  return {
    retrievalText: collapseWhitespace(working),
    facets,
    normalizerVersion: IDENTIFIER_NORMALIZER_VERSION,
  };
}