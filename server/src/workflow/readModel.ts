/**
 * ST-086 — the operator read model.
 *
 * One aggregate shaped for the dashboard, assembled from store reads. It holds no SQL
 * of its own (store.ts is the only file with the database handle) and no rules of its
 * own beyond selection and ordering — {@link evaluateAttention} stays the single
 * source of attention truth.
 *
 * **Policy scope is inherited, never copied.** The scope appears exactly once per
 * packet view, read from the packet, and runs/decisions/criteria under it carry none
 * of their own. Duplicating it into each row "for the UI" would create four more
 * places for the boundary value to be wrong, and a row whose copy had gone stale would
 * still render authoritatively. The packet is the only authority; the UI reads it from
 * the packet.
 */

import { evaluateAttention } from "./attention.ts";
import * as store from "./store.ts";
import type {
  AgentRun,
  AttentionItem,
  Checkpoint,
  EvidenceItem,
  OperationalDecision,
  PolicyScope,
  VerificationCriterion,
  WorkPacket,
} from "./types.ts";

/** How many recently-resolved decisions the operator sees alongside the open ones. */
const RECENT_RESOLVED_LIMIT = 5;
const RECENT_CHECKPOINT_LIMIT = 10;

export interface CriterionView {
  criterion: VerificationCriterion;
  evidence: EvidenceItem[];
  satisfied: boolean;
}

export interface PacketView {
  packet: WorkPacket;
  /** Read from the packet. The single authority — see this module's header. */
  policyScope: PolicyScope;
  repository: string | null;
  branch: string | null;
  runs: AgentRun[];
  recentCheckpoints: Checkpoint[];
  openDecisions: OperationalDecision[];
  recentlyResolvedDecisions: OperationalDecision[];
  criteria: CriterionView[];
  attention: AttentionItem[];
}

export interface OverviewView {
  generatedAt: string;
  packets: PacketView[];
  /** Flattened across every active packet, so the operator sees one queue. */
  attention: AttentionItem[];
}

/**
 * Build one packet's view. Returns null when the packet does not exist, so the caller
 * maps absence to 404 rather than rendering an empty shell that looks like a real
 * packet with nothing in it.
 */
export async function buildPacketView(
  packetId: string,
  now = new Date(),
): Promise<PacketView | null> {
  const packet = await store.getPacket(packetId);
  if (packet === null) return null;
  return await assemble(packet, now);
}

/** Build the operator overview across every non-complete packet. */
export async function buildOverview(now = new Date()): Promise<OverviewView> {
  const packets = await store.listActivePackets();
  const views = await Promise.all(packets.map((p) => assemble(p, now)));
  return {
    generatedAt: now.toISOString(),
    packets: views,
    attention: views.flatMap((v) => v.attention),
  };
}

async function assemble(packet: WorkPacket, now: Date): Promise<PacketView> {
  const [runs, allCheckpoints, decisions, criteria, evidence] = await Promise
    .all([
      store.listRuns(packet.id),
      store.listCheckpoints(packet.id),
      store.listDecisions(packet.id),
      store.listCriteria(packet.id),
      store.listEvidenceForPacket(packet.id),
    ]);

  // `listCheckpoints` is ASC by created_at and already fetched above for
  // `evaluateAttention`'s full-history requirement (see comment below); the newest-N,
  // newest-first slice `listRecentCheckpoints` would have queried separately is fully
  // derivable from it: take the tail and reverse. Same resulting order, one fewer
  // query.
  const recentCheckpoints = allCheckpoints.slice(-RECENT_CHECKPOINT_LIMIT)
    .reverse();

  const evidenceByCriterion = new Map<string, EvidenceItem[]>();
  for (const item of evidence) {
    const bucket = evidenceByCriterion.get(item.criterion_id);
    if (bucket === undefined) {
      evidenceByCriterion.set(item.criterion_id, [item]);
    } else bucket.push(item);
  }

  // `evidenceCountsForPacket`'s SQL LEFT JOINs criteria to evidence, so every
  // criterion appears in the map even with zero evidence. Reproduced here by seeding
  // every criterion at 0 before counting, so a criterion with no evidence still has a
  // `.get(c.id)` entry rather than falling through to evaluateAttention's `?? 0`
  // fallback — behaviourally equivalent either way, but kept exact to avoid a subtle
  // divergence between the two paths.
  const counts = new Map<string, number>(criteria.map((c) => [c.id, 0]));
  for (const item of evidence) {
    counts.set(item.criterion_id, (counts.get(item.criterion_id) ?? 0) + 1);
  }

  // Attention is evaluated over the FULL checkpoint history, not the truncated tail
  // the dashboard renders. The `blocked` and `ended-without-checkpoint` rules both
  // reason about a run's latest checkpoint; feeding them a list truncated to the ten
  // most recent across all runs would silently drop the latest checkpoint of a quiet
  // run and change the answer. The display limit is a display concern only.
  const attention = evaluateAttention({
    packet,
    runs,
    checkpoints: allCheckpoints,
    decisions,
    criteria,
    evidenceCountByCriterion: counts,
    now,
  });

  const resolved = decisions
    .filter((d) => d.status === "resolved")
    .sort((a, b) => timeOf(b.resolved_at) - timeOf(a.resolved_at))
    .slice(0, RECENT_RESOLVED_LIMIT);

  return {
    packet,
    policyScope: packet.policy_scope,
    repository: packet.repository,
    branch: packet.branch,
    runs,
    recentCheckpoints,
    openDecisions: decisions.filter((d) => d.status === "open"),
    recentlyResolvedDecisions: resolved,
    criteria: criteria.map((criterion) => {
      const items = evidenceByCriterion.get(criterion.id) ?? [];
      return { criterion, evidence: items, satisfied: items.length > 0 };
    }),
    attention,
  };
}

function timeOf(value: Date | null): number {
  return value === null ? 0 : value.getTime();
}
