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
