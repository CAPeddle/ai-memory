import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  IDENTIFIER_NORMALIZER_VERSION,
  normalizeIdentifiers,
} from "../src/identifierNormalization.ts";

Deno.test("normalizeIdentifiers strips Jira tickets and bare build numbers into facets", () => {
  assertEquals(normalizeIdentifiers("build 65008 PRI-5751 pipeline failure"), {
    retrievalText: "build pipeline failure",
    facets: {
      tickets: ["PRI-5751"],
      builds: ["65008"],
    },
    normalizerVersion: IDENTIFIER_NORMALIZER_VERSION,
  });
});

Deno.test("normalizeIdentifiers preserves UUIDs unchanged", () => {
  const normalized = normalizeIdentifiers(
    "incident 123e4567-e89b-42d3-a456-426614174000 pipeline failure",
  );

  assertEquals(normalized.retrievalText, "incident 123e4567-e89b-42d3-a456-426614174000 pipeline failure");
  assertEquals(normalized.facets, { tickets: [], builds: [] });
});

Deno.test("normalizeIdentifiers preserves semantic versions unchanged", () => {
  const normalized = normalizeIdentifiers("deploy v1.2.3 pipeline failure");

  assertEquals(normalized.retrievalText, "deploy v1.2.3 pipeline failure");
  assertEquals(normalized.facets, { tickets: [], builds: [] });
});

Deno.test("normalizeIdentifiers preserves error-code-like tokens unchanged", () => {
  const normalized = normalizeIdentifiers("service reported E0123 during startup");

  assertEquals(normalized.retrievalText, "service reported E0123 during startup");
  assertEquals(normalized.facets, { tickets: [], builds: [] });
});

Deno.test("normalizeIdentifiers handles empty and identifier-only input", () => {
  assertEquals(normalizeIdentifiers(""), {
    retrievalText: "",
    facets: { tickets: [], builds: [] },
    normalizerVersion: IDENTIFIER_NORMALIZER_VERSION,
  });

  assertEquals(normalizeIdentifiers("65008 PRI-5751"), {
    retrievalText: "",
    facets: {
      tickets: ["PRI-5751"],
      builds: ["65008"],
    },
    normalizerVersion: IDENTIFIER_NORMALIZER_VERSION,
  });
});

Deno.test("normalizeIdentifiers is idempotent", () => {
  const once = normalizeIdentifiers("build 65008 PRI-5751 pipeline failure");
  const twice = normalizeIdentifiers(once.retrievalText);

  assertEquals(twice, {
    retrievalText: once.retrievalText,
    facets: { tickets: [], builds: [] },
    normalizerVersion: IDENTIFIER_NORMALIZER_VERSION,
  });
});