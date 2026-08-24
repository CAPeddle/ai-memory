/**
 * Unit tests for `requiresOperator` (server/src/workflow/policy.ts) — the pure route
 * classification behind the operator/agent credential split.
 *
 * Table-driven, covering every one of the thirteen /api/workflow routes explicitly,
 * both classifications, plus a uuid-segment case. The reporting-route assertions are a
 * discrimination control: a bug that classified everything as operator-only (e.g. a
 * `some()` that always returns true, or a stray `.test(path) || true`) would pass every
 * operator-only assertion below and be caught only by these.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { requiresOperator } from "../src/workflow/policy.ts";

const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

interface Case {
  label: string;
  method: string;
  path: string;
  expected: boolean;
}

const CASES: Case[] = [
  // --- Reporting/read routes — NOT operator-only -------------------------
  { label: "POST /packets", method: "POST", path: "/api/workflow/packets", expected: false },
  {
    label: "POST /packets/:packetId/runs",
    method: "POST",
    path: `/api/workflow/packets/${UUID}/runs`,
    expected: false,
  },
  {
    label: "POST /runs/:runId/checkpoints",
    method: "POST",
    path: `/api/workflow/runs/${UUID}/checkpoints`,
    expected: false,
  },
  {
    label: "POST /runs/:runId/end",
    method: "POST",
    path: `/api/workflow/runs/${UUID}/end`,
    expected: false,
  },
  {
    label: "POST /packets/:packetId/decisions",
    method: "POST",
    path: `/api/workflow/packets/${UUID}/decisions`,
    expected: false,
  },
  { label: "GET /overview", method: "GET", path: "/api/workflow/overview", expected: false },
  {
    label: "GET /packets/:packetId",
    method: "GET",
    path: `/api/workflow/packets/${UUID}`,
    expected: false,
  },

  // --- Operator-only routes ------------------------------------------------
  {
    label: "POST /decisions/:decisionId/resolve",
    method: "POST",
    path: `/api/workflow/decisions/${UUID}/resolve`,
    expected: true,
  },
  {
    label: "POST /criteria/:criterionId/evidence",
    method: "POST",
    path: `/api/workflow/criteria/${UUID}/evidence`,
    expected: true,
  },
  {
    label: "POST /packets/:packetId/complete",
    method: "POST",
    path: `/api/workflow/packets/${UUID}/complete`,
    expected: true,
  },
  {
    label: "POST /packets/:packetId/criteria",
    method: "POST",
    path: `/api/workflow/packets/${UUID}/criteria`,
    expected: true,
  },
  // ST-097 B2a. Both are WRITES INTO the WorkItem layer, and `requiresOperator`
  // returns false by default — so a route merely omitted from OPERATOR_ONLY_ROUTES
  // is silently agent-reachable. These two cases are what makes that omission fail
  // loudly rather than pass quietly.
  {
    label: "POST /work-items",
    method: "POST",
    path: "/api/workflow/work-items",
    expected: true,
  },
  {
    label: "PATCH /packets/:packetId/work-item",
    method: "PATCH",
    path: `/api/workflow/packets/${UUID}/work-item`,
    expected: true,
  },
];

for (const c of CASES) {
  Deno.test(`requiresOperator: ${c.label} -> ${c.expected}`, () => {
    assertEquals(requiresOperator(c.method, c.path), c.expected);
  });
}

Deno.test("requiresOperator: method matters, not just path — GET on an operator-only path is not operator-only", () => {
  // /packets/:packetId/complete is a POST route. Confirms the match is method-aware
  // rather than path-only (a GET can never collide with it in this router, but the
  // function itself must not silently ignore method).
  assertEquals(requiresOperator("GET", `/api/workflow/packets/${UUID}/complete`), false);
});

Deno.test("requiresOperator: the work-item binding is matched on PATCH and on nothing else", () => {
  // The binding route is the module's only non-POST write. A classifier that ignored
  // method, or that was copied from a POST entry without its method being changed,
  // would answer wrongly on one of these two.
  assertEquals(requiresOperator("PATCH", `/api/workflow/packets/${UUID}/work-item`), true);
  assertEquals(requiresOperator("POST", `/api/workflow/packets/${UUID}/work-item`), false);
});

Deno.test("requiresOperator: method comparison is case-insensitive", () => {
  assertEquals(requiresOperator("post", `/api/workflow/decisions/${UUID}/resolve`), true);
  assertEquals(requiresOperator("get", "/api/workflow/overview"), false);
});

Deno.test("requiresOperator: uuid segments of varying real shapes are matched, not just the fixture UUID", () => {
  // A short non-hyphenated id and a mixed-case uuid both still occupy "a single path
  // segment" — the function must not be accidentally anchored to one literal string.
  assertEquals(requiresOperator("POST", "/api/workflow/decisions/abc123/resolve"), true);
  assertEquals(
    requiresOperator("POST", "/api/workflow/criteria/3FA85F64-5717-4562-B3FC-2C963F66AFA6/evidence"),
    true,
  );
});

Deno.test("requiresOperator: an unrelated path under /api/workflow is not operator-only", () => {
  assertEquals(requiresOperator("POST", "/api/workflow/nonexistent"), false);
  assertEquals(requiresOperator("GET", "/api/workflow/"), false);
});

Deno.test("requiresOperator: a path outside /api/workflow never matches (defence in depth)", () => {
  assertEquals(requiresOperator("POST", `/decisions/${UUID}/resolve`), false);
  assertEquals(requiresOperator("POST", `/mcp`), false);
});

// Discrimination control: a deliberately-broken classifier that treats everything as
// operator-only must fail the reporting-route assertions above. This is not a test of
// requiresOperator itself — it is proof that CASES actually distinguishes the two
// classifications rather than happening to pass either way.
Deno.test("control: a classifier that always returns true would fail the reporting-route cases", () => {
  const alwaysOperator = (_method: string, _path: string) => true;
  const reportingCases = CASES.filter((c) => !c.expected);
  const wronglyFlagged = reportingCases.filter((c) => alwaysOperator(c.method, c.path) !== c.expected);
  assertEquals(
    wronglyFlagged.length,
    reportingCases.length,
    "expected every reporting-route case to disagree with an always-true classifier",
  );
});
