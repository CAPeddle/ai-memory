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
 *
 * **ST-097 B5 added a second lane: the WorkItem projection.** The same two rules hold
 * one layer up and are worth stating in this header rather than only at the type, because
 * both are decisions that a helpful addition would quietly reverse. Scope stays per
 * packet — a WorkItem may own several packets with different scopes and this module
 * reduces them to nothing. And a WorkItem gets no aggregate status of any kind
 * (ADR-017 §6): its components are presented separately and neither client synthesises
 * one, which is what makes the web UI and the CLI unable to disagree.
 */

import { evaluateAttention } from "./attention.ts";
import * as store from "./store.ts";
import type {
  AgentRun,
  AttentionItem,
  Checkpoint,
  ClaimedObservedSession,
  EvidenceItem,
  OperationalDecision,
  PolicyScope,
  SourceSystem,
  VerificationCriterion,
  WorkItem,
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

/**
 * One packet as it appears UNDER a WorkItem (ST-097 B5).
 *
 * **Deliberately narrower than {@link PacketView}, on two grounds.** ADR-017 §3 says
 * a WorkItem *"is not an attention surface"* — it defines no attention semantics, no
 * reasons and no rendering — so reusing `PacketView` here would put an attention
 * queue under a WorkItem and make it one by accident. And the packet lane's own
 * views cost five reads apiece; a WorkItem listing does not need runs, checkpoints,
 * decisions and criteria to say which packets exist and what governs each of them.
 * A caller wanting the full packet reads `GET /packets/:packetId`, which is where
 * that projection lives.
 *
 * `policyScope` repeats {@link PacketView}'s convention exactly: read from the
 * packet, once, per packet.
 */
export interface WorkItemPacketView {
  packet: WorkPacket;
  /** Read from this packet. Per packet, never across the set — see below. */
  policyScope: PolicyScope;
}

/**
 * One WorkItem's state, presented component by component (ADR-017 §6, KTD-D6).
 *
 * **There is no aggregate status here, and there is nothing to add later.** §6
 * settles that a WorkItem has no aggregate status field, no derived status and no
 * status projection: requested-work status stays authoritative at its source, and
 * deriving one from packets whose own status cannot leave `open` would manufacture a
 * signal the server does not hold. A `status`, `state` or `phase` key added to this
 * interface is a reversal of a settled decision, not a gap being filled.
 *
 * **Policy scope is per packet and is never aggregated across the set.** A WorkItem
 * may own several packets with different scopes; reducing them to one WorkItem-level
 * value — most-restrictive-wins, first-wins, any rule — would be choosing the
 * boundary implicitly, which is the silent widening ADR-017 §3 exists to bar. Each
 * entry in {@link packets} carries its own, and this interface carries none.
 *
 * **The two lanes are separate keys with disjoint shapes, and that is the observed /
 * authoritative distinction made structural.** {@link packets} is supervised work: a
 * packet, its scope, its own status. {@link observedSessions} is an observation: no
 * packet, no run, no scope, no status. Nothing converts one into the other, and a
 * consumer cannot mistake one for the other without ignoring which key it read from.
 */
export interface WorkItemView {
  workItem: WorkItem;
  /** AUTHORITATIVE: supervised work under this item, each with its own scope. */
  packets: WorkItemPacketView[];
  /** OBSERVED: sessions an operator explicitly claimed. Never supervised work. */
  observedSessions: ClaimedObservedSession[];
}

export interface OverviewView {
  generatedAt: string;
  packets: PacketView[];
  /**
   * Every WorkItem, under the same projection the three `/work-items` GETs return.
   *
   * **Unfiltered, unlike {@link packets}.** The packet lane can show only the active
   * ones because a packet has a status column; a WorkItem has none (ADR-017 §6), so
   * there is nothing to filter on and any liveness rule invented here would be the
   * aggregate state §6 settles does not exist.
   */
  workItems: WorkItemView[];
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
  const [packets, workItems] = await Promise.all([
    store.listActivePackets(),
    buildWorkItemOverview(),
  ]);
  const views = await Promise.all(packets.map((p) => assemble(p, now)));
  return {
    generatedAt: now.toISOString(),
    packets: views,
    workItems,
    attention: views.flatMap((v) => v.attention),
  };
}

/**
 * Build one WorkItem's view by its primary identity. Null when it does not exist, so
 * the caller maps absence to 404 rather than rendering an empty shell.
 */
export async function buildWorkItemView(id: string): Promise<WorkItemView | null> {
  const item = await store.getWorkItem(id);
  if (item === null) return null;
  return (await assembleWorkItems([item]))[0];
}

/**
 * Build one WorkItem's view from its ADR-017 §2 provenance pair — resolution by an
 * external reference, with no UUID in hand.
 */
export async function buildWorkItemViewByProvenance(
  sourceSystem: SourceSystem,
  sourceRef: string,
): Promise<WorkItemView | null> {
  const item = await store.findWorkItemByProvenance(sourceSystem, sourceRef);
  if (item === null) return null;
  return (await assembleWorkItems([item]))[0];
}

/** Build every WorkItem's view — the listing, and the overview's WorkItem lane. */
export async function buildWorkItemOverview(): Promise<WorkItemView[]> {
  return await assembleWorkItems(await store.listWorkItems());
}

/**
 * The ONE builder behind all four WorkItem surfaces — the overview lane, the
 * listing, the id lookup and the provenance lookup.
 *
 * Keeping it single is what makes "the web UI and the CLI cannot disagree" (ADR-017
 * §6) true by construction rather than by two projections happening to agree; it is
 * also what makes B6's UI/agent read parity a property of the field set rather than
 * of two code paths staying in step.
 *
 * Two batched reads regardless of how many items are being assembled, so the
 * overview's WorkItem lane does not grow a query per row.
 */
async function assembleWorkItems(items: WorkItem[]): Promise<WorkItemView[]> {
  if (items.length === 0) return [];
  const ids = items.map((item) => item.id);
  const [packets, sessions] = await Promise.all([
    store.listPacketsForWorkItems(ids),
    store.listClaimedSessionsForWorkItems(ids),
  ]);

  const packetsByItem = groupBy(packets, (p) => p.work_item_id);
  const sessionsByItem = groupBy(sessions, (s) => s.work_item_id);

  return items.map((workItem) => ({
    workItem,
    packets: (packetsByItem.get(workItem.id) ?? []).map((packet) => ({
      packet,
      // Read from the packet, exactly as `assemble` does for a PacketView. The
      // packet is the only authority for its own scope, and a WorkItem-level value
      // derived from the set would be a boundary chosen implicitly.
      policyScope: packet.policy_scope,
    })),
    observedSessions: sessionsByItem.get(workItem.id) ?? [],
  }));
}

function groupBy<T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k === null) continue;
    const bucket = grouped.get(k);
    if (bucket === undefined) grouped.set(k, [row]);
    else bucket.push(row);
  }
  return grouped;
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
