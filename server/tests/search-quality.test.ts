import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mmrRerank } from "../src/searchQuality.ts";

const axisA = [1, 0, 0];
const axisB = [0, 1, 0];

Deno.test("mmrRerank keeps a high-scoring null-embedding candidate in top-k", () => {
  const result = mmrRerank([
    { id: "embedded-anchor", score: 1.0, embedding: axisA },
    { id: "embedded-redundant", score: 0.99, embedding: axisA },
    { id: "embedded-diverse", score: 0.98, embedding: axisB },
    { id: "fresh-bm25-null", score: 0.97, embedding: null },
  ], 3, 0.7).map((r) => r.id);

  assertEquals(result, ["embedded-anchor", "embedded-diverse", "fresh-bm25-null"]);
});

Deno.test("mmrRerank returns all-null candidates by score order", () => {
  const result = mmrRerank([
    { id: "first", score: 0.9, embedding: null },
    { id: "third", score: 0.7, embedding: null },
    { id: "second", score: 0.8, embedding: null },
  ], 3, 0.7).map((r) => r.id);

  assertEquals(result, ["first", "second", "third"]);
});

Deno.test("mmrRerank documents null-embedding equal-score bias", () => {
  const result = mmrRerank([
    { id: "anchor", score: 1.0, embedding: axisA },
    { id: "redundant-equal", score: 0.8, embedding: axisA },
    { id: "null-equal", score: 0.8, embedding: null },
  ], 2, 0.7).map((r) => r.id);

  assertEquals(result, ["anchor", "null-equal"]);
});

Deno.test("mmrRerank still swaps a redundant embedded row for a diverse embedded row", () => {
  // This low-lambda test isolates the diversity penalty. The production-lambda
  // path is already covered by the high-scoring null-embedding test above,
  // where the diverse embedded row beats the redundant embedded row at λ=0.7.
  const result = mmrRerank([
    { id: "anchor", score: 1.0, embedding: axisA },
    { id: "redundant", score: 0.9, embedding: axisA },
    { id: "diverse", score: 0.5, embedding: axisB },
  ], 2, 0.4).map((r) => r.id);

  assertEquals(result, ["anchor", "diverse"]);
});

Deno.test("mmrRerank handles empty input and k larger than candidate count", () => {
  assertEquals(mmrRerank([], 3, 0.7), []);

  const result = mmrRerank([
    { id: "first", score: 0.9, embedding: null },
    { id: "second", score: 0.8, embedding: null },
  ], 10, 0.7).map((r) => r.id);

  assertEquals(result, ["first", "second"]);
});
