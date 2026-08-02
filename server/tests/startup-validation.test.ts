import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { ensureRequiredEnv, findMissingRequiredEnv } from "../src/startupValidation.ts";

Deno.test("startup validation: reports OPENROUTER_API_KEY when missing", () => {
  const missing = findMissingRequiredEnv((name) => {
    if (name === "MEMORY_API_KEY") return "present";
    return undefined;
  });

  assertEquals(missing, ["OPENROUTER_API_KEY"]);
});

Deno.test("startup validation: reports MEMORY_API_KEY when missing", () => {
  const missing = findMissingRequiredEnv((name) => {
    if (name === "OPENROUTER_API_KEY") return "present";
    return undefined;
  });

  assertEquals(missing, ["MEMORY_API_KEY"]);
});

Deno.test("startup validation: reports both required variables when both are missing", () => {
  const missing = findMissingRequiredEnv(() => undefined);

  assertEquals(missing, ["OPENROUTER_API_KEY", "MEMORY_API_KEY"]);
});

Deno.test("startup validation: reports none when both required variables are present", () => {
  const missing = findMissingRequiredEnv(() => "present");

  assertEquals(missing, []);
});

Deno.test("startup validation: ensureRequiredEnv logs fatal and exits with code 1", () => {
  let fatalMessage = "";
  let exitCode: number | null = null;

  assertThrows(
    () => ensureRequiredEnv({
      readEnv: (name) => (name === "MEMORY_API_KEY" ? "present" : undefined),
      logFatal: (message) => {
        fatalMessage = message;
      },
      exit: (code) => {
        exitCode = code;
        throw new Error("EXIT_CALLED");
      },
    }),
    Error,
    "EXIT_CALLED",
  );

  assertEquals(exitCode, 1);
  assertEquals(fatalMessage.includes("FATAL: Required environment variable OPENROUTER_API_KEY is not set. Exiting."), true);
});

Deno.test("startup validation: ensureRequiredEnv is a no-op when all required vars are present", () => {
  let fatalCalled = false;
  let exitCalled = false;

  ensureRequiredEnv({
    readEnv: () => "present",
    logFatal: () => {
      fatalCalled = true;
    },
    exit: () => {
      exitCalled = true;
    },
  });

  assertEquals(fatalCalled, false);
  assertEquals(exitCalled, false);
});

// findCapabilityConflicts (and the FATAL branch it feeds inside ensureRequiredEnv) had
// zero coverage before this pair. The EnvReader injection point exists precisely so
// this fail-closed path can be driven without touching real process env.

Deno.test(
  "startup validation: MODEL_PROVIDER_ENABLED=false with a provider-dependent capability ENABLED is a conflict",
  () => {
    let fatalMessage = "";
    let exitCode: number | null = null;

    assertThrows(
      () =>
        ensureRequiredEnv({
          readEnv: (name) => {
            if (name === "MEMORY_API_KEY") return "present";
            if (name === "MODEL_PROVIDER_ENABLED") return "false";
            // Explicit "true" for clarity, even though the flag's default (absent)
            // is also enabled — this test is about the conflict rule, not the flag's
            // default polarity.
            if (name === "FEATURE_ENTITY_WORKER") return "true";
            if (name === "FEATURE_CONSOLIDATION_WORKER") return "false";
            if (name === "FEATURE_EMBEDDING_BACKFILL") return "false";
            return undefined;
          },
          logFatal: (message) => {
            fatalMessage = message;
          },
          exit: (code) => {
            exitCode = code;
            throw new Error("EXIT_CALLED");
          },
        }),
      Error,
      "EXIT_CALLED",
    );

    assertEquals(exitCode, 1);
    assertEquals(
      fatalMessage.includes("entity extraction worker"),
      true,
      `expected the fatal message to name the conflicting capability, got: ${fatalMessage}`,
    );
  },
);

Deno.test(
  "startup validation: MODEL_PROVIDER_ENABLED=false with every provider-dependent capability disabled has NO conflict (discrimination control)",
  () => {
    // Control for the test above: with the provider off but every worker that would
    // need it also off, there is nothing to conflict about, and startup must proceed.
    let fatalCalled = false;
    let exitCalled = false;

    ensureRequiredEnv({
      readEnv: (name) => {
        if (name === "MEMORY_API_KEY") return "present";
        if (name === "MODEL_PROVIDER_ENABLED") return "false";
        if (name === "FEATURE_ENTITY_WORKER") return "false";
        if (name === "FEATURE_CONSOLIDATION_WORKER") return "false";
        if (name === "FEATURE_EMBEDDING_BACKFILL") return "false";
        return undefined;
      },
      logFatal: () => {
        fatalCalled = true;
      },
      exit: () => {
        exitCalled = true;
      },
    });

    assertEquals(fatalCalled, false);
    assertEquals(exitCalled, false);
  },
);
