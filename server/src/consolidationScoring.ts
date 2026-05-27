/**
 * consolidationScoring.ts — ST-008
 *
 * Pure functions for ADR-007 three-factor consolidation scoring.
 * No side effects; safe to call without DB connection.
 *
 * Formula: score = 0.40 × frequency_norm + 0.35 × diversity_norm + 0.25 × relevance
 * where relevance = helpful/total from feedback_events when available,
 *       else thoughts.confidence (fallback).
 *
 * Batch normalisation: all factors normalised against the current batch's
 * maximum so that the best candidate in the batch scores 1.0 on each axis.
 */

export interface CandidateMetrics {
  thoughtId: string;
  recallCount: number;
  distinctProjects: number;
  helpfulCount: number;   // feedback_events rows with verdict='helpful'
  totalFeedback: number;  // total feedback_events rows for this thought
  confidence: number;     // thoughts.confidence (0–1), fallback when no feedback
}

export interface BatchMaxima {
  maxRecallCount: number;
  maxDistinctProjects: number;
}

export interface ScoreBreakdown {
  score: number;
  frequency_norm: number;
  diversity_norm: number;
  relevance: number;
  relevance_source: "feedback" | "confidence_fallback";
}

export type Band = "promote" | "flag" | "skip";

export function computeBatchMaxima(metrics: CandidateMetrics[]): BatchMaxima {
  return {
    maxRecallCount: Math.max(1, ...metrics.map((m) => m.recallCount)),
    maxDistinctProjects: Math.max(1, ...metrics.map((m) => m.distinctProjects)),
  };
}

export function scoreCandidate(
  m: CandidateMetrics,
  batch: BatchMaxima,
): ScoreBreakdown {
  const frequency_norm = m.recallCount / batch.maxRecallCount;
  const diversity_norm = m.distinctProjects / batch.maxDistinctProjects;

  let relevance: number;
  let relevance_source: "feedback" | "confidence_fallback";
  if (m.totalFeedback > 0) {
    relevance = m.helpfulCount / m.totalFeedback;
    relevance_source = "feedback";
  } else {
    relevance = m.confidence;
    relevance_source = "confidence_fallback";
  }

  const score = 0.40 * frequency_norm + 0.35 * diversity_norm + 0.25 * relevance;

  return { score, frequency_norm, diversity_norm, relevance, relevance_source };
}

export function bandFor(score: number): Band {
  if (score >= 0.7) return "promote";
  if (score >= 0.5) return "flag";
  return "skip";
}
