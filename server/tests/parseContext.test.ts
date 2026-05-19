/**
 * Unit tests for parseContext — strict flag extension (ST-005).
 *
 * Run inside the mcp container:
 *   docker compose exec mcp deno test --allow-env tests/parseContext.test.ts
 */

import { parseContext } from "../src/parseContext.ts";

Deno.test("parseContext: strict:true sets scope.strict = true", () => {
  const s = parseContext("project:zoom,strict:true");
  if (s?.strict !== true) throw new Error(`Expected strict=true, got ${JSON.stringify(s)}`);
  if (s?.projects?.[0] !== "zoom") throw new Error(`Expected projects=[zoom], got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: strict:false sets scope.strict = false", () => {
  const s = parseContext("project:zoom,strict:false");
  if (s?.strict !== false) throw new Error(`Expected strict=false, got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: omitted strict leaves scope.strict undefined", () => {
  const s = parseContext("project:zoom");
  if (s?.strict !== undefined) throw new Error(`Expected strict=undefined, got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: null input returns null (regression check)", () => {
  if (parseContext(undefined) !== null) throw new Error("undefined → null broken");
  if (parseContext("") !== null) throw new Error("empty → null broken");
});
