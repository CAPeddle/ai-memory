import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  agentKeyCollidesWithOperatorKey,
  ensureRequiredEnv,
  findMissingRequiredEnv,
} from "../src/startupValidation.ts";

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
    // AWCP_AGENT_API_KEY is deliberately excluded from the blanket "present": it is
    // OPTIONAL, and a readEnv that answered "present" for literally every name
    // (this one included) would make it identical to MEMORY_API_KEY's "present" and
    // trip the new agentKeyCollidesWithOperatorKey fail-closed check below — a false
    // collision manufactured by this mock's own shape, not a real one. Leaving it
    // undefined is also the documented default deployment shape this test means to
    // describe: every required var present, agent key not configured.
    readEnv: (name) => (name === "AWCP_AGENT_API_KEY" ? undefined : "present"),
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

// ---------------------------------------------------------------------------
// agentKeyCollidesWithOperatorKey / the fail-closed AWCP_AGENT_API_KEY check
// ---------------------------------------------------------------------------
//
// See startupValidation.ts's docblock on agentKeyCollidesWithOperatorKey: if the two
// keys are equal, the composition root's middleware classifies every presented
// credential as "operator" and the agent/operator split silently collapses into no
// split at all. This must never boot.

/** A readEnv baseline that satisfies findCapabilityConflicts and findMissingRequiredEnv,
 * so these tests exercise only the collision check, not the other two gates. */
function baseEnv(overrides: Record<string, string | undefined>): (name: string) => string | undefined {
  const values: Record<string, string | undefined> = {
    MEMORY_API_KEY: "operator-secret",
    OPENROUTER_API_KEY: "present",
    ...overrides,
  };
  return (name) => values[name];
}

Deno.test("agentKeyCollidesWithOperatorKey: false when AWCP_AGENT_API_KEY is unset", () => {
  assertEquals(
    agentKeyCollidesWithOperatorKey(baseEnv({ AWCP_AGENT_API_KEY: undefined })),
    false,
  );
});

Deno.test("agentKeyCollidesWithOperatorKey: false when the two keys differ", () => {
  assertEquals(
    agentKeyCollidesWithOperatorKey(
      baseEnv({ MEMORY_API_KEY: "operator-secret", AWCP_AGENT_API_KEY: "agent-secret" }),
    ),
    false,
  );
});

Deno.test("agentKeyCollidesWithOperatorKey: true when the two keys are identical", () => {
  assertEquals(
    agentKeyCollidesWithOperatorKey(
      baseEnv({ MEMORY_API_KEY: "same-value", AWCP_AGENT_API_KEY: "same-value" }),
    ),
    true,
  );
});

Deno.test("startup validation: identical MEMORY_API_KEY and AWCP_AGENT_API_KEY refuse to start (exit 1, named message)", () => {
  let fatalMessage = "";
  let exitCode: number | null = null;

  assertThrows(
    () =>
      ensureRequiredEnv({
        readEnv: baseEnv({ MEMORY_API_KEY: "same-value", AWCP_AGENT_API_KEY: "same-value" }),
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
  assertEquals(fatalMessage.includes("AWCP_AGENT_API_KEY"), true, fatalMessage);
  assertEquals(fatalMessage.includes("MEMORY_API_KEY"), true, fatalMessage);
  assertEquals(fatalMessage.startsWith("FATAL:"), true, fatalMessage);
});

Deno.test("startup validation: distinct MEMORY_API_KEY and AWCP_AGENT_API_KEY start cleanly", () => {
  let fatalCalled = false;
  let exitCalled = false;

  ensureRequiredEnv({
    readEnv: baseEnv({ MEMORY_API_KEY: "operator-secret", AWCP_AGENT_API_KEY: "agent-secret" }),
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

Deno.test("startup validation: AWCP_AGENT_API_KEY unset starts cleanly (discrimination control)", () => {
  // Without this control, a version of agentKeyCollidesWithOperatorKey that treated
  // "unset" as colliding (e.g. comparing undefined === undefined somewhere upstream)
  // would still pass the two tests above and only be caught here.
  let fatalCalled = false;
  let exitCalled = false;

  ensureRequiredEnv({
    readEnv: baseEnv({ AWCP_AGENT_API_KEY: undefined }),
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
