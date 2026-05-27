/**
 * Unit tests for consolidationScoring.ts — ST-008 Task 4.3
 *
 * Run (from repo root):
 *   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/consolidation-scoring.test.ts
 */

import {
  computeBatchMaxima,
  scoreCandidate,
  bandFor,
  type CandidateMetrics,
} from "../src/consolidationScoring.ts";

const BASE: CandidateMetrics = {
  thoughtId: "test-id",
  recallCount: 5,
  distinctProjects: 3,
  helpfulCount: 0,
  totalFeedback: 0,
  confidence: 0.8,
};

Deno.test("scoring: computeBatchMaxima — single candidate gives maxima equal to its own values", () => {
  const batch = computeBatchMaxima([BASE]);
  if (batch.maxRecallCount !== 5) throw new Error(`Expected maxRecallCount=5, got ${batch.maxRecallCount}`);
  if (batch.maxDistinctProjects !== 3) throw new Error(`Expected maxDistinctProjects=3, got ${batch.maxDistinctProjects}`);
});

Deno.test("scoring: computeBatchMaxima — honours minimum of 1 on empty-ish inputs", () => {
  const batch = computeBatchMaxima([{ ...BASE, recallCount: 0, distinctProjects: 0 }]);
  if (batch.maxRecallCount !== 1) throw new Error(`Expected maxRecallCount=1 floor, got ${batch.maxRecallCount}`);
  if (batch.maxDistinctProjects !== 1) throw new Error(`Expected maxDistinctProjects=1 floor, got ${batch.maxDistinctProjects}`);
});

Deno.test("scoring: scoreCandidate — confidence fallback used when totalFeedback=0", () => {
  const batch = computeBatchMaxima([BASE]);
  const result = scoreCandidate(BASE, batch);
  if (result.relevance_source !== "confidence_fallback") {
    throw new Error(`Expected confidence_fallback, got ${result.relevance_source}`);
  }
  if (result.relevance !== 0.8) throw new Error(`Expected relevance=0.8 (from confidence), got ${result.relevance}`);
});

Deno.test("scoring: scoreCandidate — feedback used when totalFeedback>0", () => {
  const m: CandidateMetrics = { ...BASE, helpfulCount: 3, totalFeedback: 4 };
  const batch = computeBatchMaxima([m]);
  const result = scoreCandidate(m, batch);
  if (result.relevance_source !== "feedback") {
    throw new Error(`Expected feedback relevance_source, got ${result.relevance_source}`);
  }
  const expectedRel = 3 / 4;
  if (Math.abs(result.relevance - expectedRel) > 0.001) {
    throw new Error(`Expected relevance=${expectedRel}, got ${result.relevance}`);
  }
});

Deno.test("scoring: scoreCandidate — AC6 exact value (freq=1.0, div=1.0, confidence=0.5 → 0.875)", () => {
  const m: CandidateMetrics = { ...BASE, recallCount: 3, distinctProjects: 3, confidence: 0.5 };
  const batch = computeBatchMaxima([m]); // sole candidate → norms = 1.0
  const result = scoreCandidate(m, batch);
  const expected = 0.40 * 1.0 + 0.35 * 1.0 + 0.25 * 0.5; // = 0.875
  if (Math.abs(result.score - expected) > 0.001) {
    throw new Error(`Expected score=${expected}, got ${result.score}`);
  }
});

Deno.test("scoring: bandFor — threshold bands are correct", () => {
  if (bandFor(0.7) !== "promote") throw new Error("0.7 should be promote");
  if (bandFor(0.95) !== "promote") throw new Error("0.95 should be promote");
  if (bandFor(0.5) !== "flag") throw new Error("0.5 should be flag");
  if (bandFor(0.69) !== "flag") throw new Error("0.69 should be flag");
  if (bandFor(0.499) !== "skip") throw new Error("0.499 should be skip");
  if (bandFor(0.0) !== "skip") throw new Error("0.0 should be skip");
});

Deno.test("scoring: scoreCandidate — mixed batch normalises correctly", () => {
  const a: CandidateMetrics = { ...BASE, recallCount: 5, distinctProjects: 3, confidence: 0.8 };
  const b: CandidateMetrics = { ...BASE, thoughtId: "b", recallCount: 3, distinctProjects: 2, confidence: 0.5 };
  const c: CandidateMetrics = { ...BASE, thoughtId: "c", recallCount: 2, distinctProjects: 1, confidence: 0.2 };
  const batch = computeBatchMaxima([a, b, c]);

  const ra = scoreCandidate(a, batch);
  const rb = scoreCandidate(b, batch);
  const rc = scoreCandidate(c, batch);

  // a should promote (≥0.7)
  if (bandFor(ra.score) !== "promote") {
    throw new Error(`Expected a to promote, score=${ra.score}, band=${bandFor(ra.score)}`);
  }
  // b should flag (0.5–0.69)
  if (bandFor(rb.score) !== "flag") {
    throw new Error(`Expected b to flag, score=${rb.score}, band=${bandFor(rb.score)}`);
  }
  // c should skip (<0.5)
  if (bandFor(rc.score) !== "skip") {
    throw new Error(`Expected c to skip, score=${rc.score}, band=${bandFor(rc.score)}`);
  }
});
