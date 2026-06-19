import { sql } from "./db.ts";
import { logWorkerEvent } from "./workerLogger.ts";

// --- Configuration ---
const POLL_INTERVAL_MS = 10_000; // 10 seconds
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;
const MAX_INPUT_CHARS = 16_000; // ~4000 tokens at 4 chars/token
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

// --- Allow-lists (critical injection mitigation) ---
const ALLOWED_LABELS = new Set(["Person", "Function", "Error", "Topic", "Project"]);
const ALLOWED_RELS = new Set(["CAUSED_BY", "LIKES", "WORKS_ON", "USES", "RELATED_TO"]);

// --- String sanitisation for Cypher interpolation ---
function escapeForCypher(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$\$/g, "");
}

// --- Exponential backoff ---
function backoffSeconds(attemptCount: number): number {
  return Math.min(Math.pow(2, attemptCount - 1), 128);
}

let consecutivePollFailures = 0;
const MAX_POLL_BACKOFF_MS = 60_000;

function getPollBackoffMs(): number {
  if (consecutivePollFailures === 0) return POLL_INTERVAL_MS;
  return Math.min(POLL_INTERVAL_MS * Math.pow(2, consecutivePollFailures - 1), MAX_POLL_BACKOFF_MS);
}

// --- Types ---
interface ExtractedNode {
  label: string;
  name: string;
}
interface ExtractedEdge {
  from: string;
  to: string;
  rel: string;
}
interface ExtractionResult {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
}

// --- LLM call ---
const SYSTEM_PROMPT = `Extract entities and relationships from the following thought. Return a JSON object with exactly two keys:
- "nodes": array of objects with "label" (one of: Person, Function, Error, Topic, Project) and "name" (string, the entity's canonical name)
- "edges": array of objects with "from" (node name), "to" (node name), and "rel" (one of: CAUSED_BY, LIKES, WORKS_ON, USES, RELATED_TO)

Rules:
- Only use the allowed labels and relationship types listed above
- Extract only entities and relationships explicitly stated or strongly implied in the text
- Use singular, title-case names for entities (e.g., "TypeScript" not "typescript")
- If no entities or relationships are found, return {"nodes": [], "edges": []}`;

async function callLLM(content: string): Promise<ExtractionResult> {
  // Test stub: caller inserts content with this prefix to exercise the fail-hard path.
  if (content.startsWith("__TEST_LLM_FAIL__")) {
    throw new Error("LLM failure simulated by __TEST_LLM_FAIL__ content prefix");
  }

  const truncated = content.slice(0, MAX_INPUT_CHARS);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: truncated },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return JSON.parse(text) as ExtractionResult;
}

// --- Allow-list filtering ---
function filterExtraction(raw: ExtractionResult): ExtractionResult {
  const nodes = (raw.nodes ?? []).filter(
    (n) => ALLOWED_LABELS.has(n.label) && typeof n.name === "string" && n.name.length > 0
  );
  const validNames = new Set(nodes.map((n) => n.name));
  const edges = (raw.edges ?? []).filter(
    (e) =>
      ALLOWED_RELS.has(e.rel) &&
      typeof e.from === "string" &&
      typeof e.to === "string" &&
      validNames.has(e.from) &&
      validNames.has(e.to)
  );
  return { nodes, edges };
}

// --- AGE graph writes ---
async function writeToGraph(extraction: ExtractionResult, thoughtId: string): Promise<void> {
  for (const node of extraction.nodes) {
    // Label and name are allow-list–validated; name is escaped
    await sql.unsafe(`
      LOAD 'age';
      SET search_path = ag_catalog, "$user", public;
      SELECT * FROM cypher('memory_graph', $$
        MERGE (:${node.label} {name: '${escapeForCypher(node.name)}'})
      $$) AS t(v agtype);
    `);
  }
  for (const edge of extraction.edges) {
    // Relationship type is allow-list–validated; node names are escaped
    await sql.unsafe(`
      LOAD 'age';
      SET search_path = ag_catalog, "$user", public;
      SELECT * FROM cypher('memory_graph', $$
        MATCH (a {name: '${escapeForCypher(edge.from)}'}), (b {name: '${escapeForCypher(edge.to)}'})
        MERGE (a)-[:${edge.rel}]->(b)
      $$) AS t(v agtype);
    `);
  }
  // Entity mentions back-link (spec §4.4: delete-then-insert on every
  // extraction so mentions reflect current content, not a historical union).
  await sql`DELETE FROM entity_mentions WHERE thought_id = ${thoughtId}`;
  if (extraction.nodes.length > 0) {
    const labels = extraction.nodes.map((n) => n.label);
    const names = extraction.nodes.map((n) => n.name);
    await sql`
      INSERT INTO entity_mentions (thought_id, entity_label, entity_name)
      SELECT ${thoughtId}, label, name
      FROM unnest(${labels}::text[], ${names}::text[]) AS t(label, name)
      ON CONFLICT (thought_id, entity_label, entity_name) DO NOTHING
    `;
  }
}

// --- Queue processing ---
async function processQueue(): Promise<void> {
  // Claim a batch of pending rows (skip rows not yet eligible for retry)
  const rows = await sql`
    UPDATE entity_extraction_queue
    SET status = 'processing', started_at = now(), attempt_count = attempt_count + 1
    WHERE thought_id IN (
      SELECT thought_id FROM entity_extraction_queue
      WHERE status = 'pending'
        AND (retry_after IS NULL OR retry_after <= now())
      ORDER BY queued_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING thought_id
  `;

  if (!rows.length) return;

  const runId = crypto.randomUUID();
  await sql`
    INSERT INTO worker_runs (run_id, worker, started_at)
    VALUES (${runId}, 'entity', now())
  `;
  logWorkerEvent({
    ts: new Date().toISOString(),
    level: "info",
    worker: "entity",
    run_id: runId,
    event: "run_started",
  });
  const runStartTime = Date.now();
  let errorCount = 0;
  let errorSummary: unknown = null;

  for (const { thought_id } of rows) {
    try {
      // Fetch thought content
      const [thought] = await sql`
        SELECT content FROM thoughts WHERE id = ${thought_id}
      `;
      if (!thought) {
        await sql`
          UPDATE entity_extraction_queue
          SET status = 'failed', last_error = 'Thought not found', processed_at = now()
          WHERE thought_id = ${thought_id}
        `;
        continue;
      }

      // Call LLM
      const raw = await callLLM(thought.content as string);
      const extraction = filterExtraction(raw);

      // Write to graph (may produce zero writes if LLM found nothing)
      await writeToGraph(extraction, thought_id);

      // Mark done
      await sql`
        UPDATE entity_extraction_queue
        SET status = 'done', processed_at = now(), last_error = NULL
        WHERE thought_id = ${thought_id}
      `;

      logWorkerEvent({
        ts: new Date().toISOString(),
        level: "info",
        worker: "entity",
        run_id: runId,
        event: "item_processed",
        items_processed: 1,
      });
    } catch (err) {
      const errorMsg = (err as Error).message?.slice(0, 500) ?? "Unknown error";
      errorCount++;
      if (!errorSummary) errorSummary = { error: errorMsg };
      // Check attempt count
      const [row] = await sql`
        SELECT attempt_count FROM entity_extraction_queue WHERE thought_id = ${thought_id}
      `;
      const attempts = Number(row?.attempt_count ?? MAX_ATTEMPTS);

      if (attempts >= MAX_ATTEMPTS) {
        await sql`
          UPDATE entity_extraction_queue
          SET status = 'failed', last_error = ${errorMsg}, processed_at = now()
          WHERE thought_id = ${thought_id}
        `;
        console.error(`[entityWorker] FAILED permanently (${attempts} attempts): ${thought_id} — ${errorMsg}`);
      } else {
        const delaySec = backoffSeconds(attempts);
        await sql`
          UPDATE entity_extraction_queue
          SET status = 'pending',
              last_error = ${errorMsg},
              retry_after = now() + ${delaySec + " seconds"}::interval
          WHERE thought_id = ${thought_id}
        `;
        console.warn(`[entityWorker] retryable failure (attempt ${attempts}/${MAX_ATTEMPTS}, retry in ${delaySec}s): ${thought_id}`);
      }
    }
  }

  const itemsAttempted = rows.length;
  const itemsSucceeded = itemsAttempted - errorCount;

  await sql`
    UPDATE worker_runs
    SET ended_at = now(), items_processed = ${itemsSucceeded}, errors = ${errorCount}, error_summary = ${errorSummary ? sql.json(errorSummary as Record<string, unknown>) : null}
    WHERE run_id = ${runId}
  `;

  logWorkerEvent({
    ts: new Date().toISOString(),
    level: errorCount > 0 ? "error" : "info",
    worker: "entity",
    run_id: runId,
    event: "run_completed",
    duration_ms: Date.now() - runStartTime,
    items_processed: itemsSucceeded,
    errors: errorCount,
    error_summary: errorSummary,
  });

  await sql`
    DELETE FROM worker_runs
    WHERE ended_at < now() - interval '30 days'
       OR (ended_at IS NULL AND started_at < now() - interval '30 days')
  `;
}

interface SafePollDeps {
  runQueue?: () => Promise<void>;
  onError?: (msg: string) => void;
  onRecover?: (msg: string) => void;
  schedule?: (next: () => void, delayMs: number) => void;
}

async function safePoll(deps: SafePollDeps = {}): Promise<void> {
  const runQueue = deps.runQueue ?? processQueue;
  const onError = deps.onError ?? ((msg: string) => console.error(msg));
  const onRecover = deps.onRecover ?? ((msg: string) => console.log(msg));
  const schedule = deps.schedule ?? ((next: () => void, delayMs: number) => setTimeout(next, delayMs));

  try {
    await runQueue();
    if (consecutivePollFailures > 0) {
      onRecover(`[entityWorker] recovered after ${consecutivePollFailures} consecutive failures`);
    }
    consecutivePollFailures = 0;
  } catch (err) {
    consecutivePollFailures++;
    const msg = (err as Error).message?.slice(0, 300) ?? "Unknown error";
    if (consecutivePollFailures >= 5) {
      onError(`[entityWorker] ALERT: ${consecutivePollFailures} consecutive failures — ${msg}`);
    } else {
      onError(`[entityWorker] poll failed (attempt ${consecutivePollFailures}, next retry in ${getPollBackoffMs()}ms): ${msg}`);
    }
  }

  schedule(() => {
    void safePoll(deps);
  }, getPollBackoffMs());
}

export const __entityWorkerTestHooks = {
  processQueue,
  safePoll,
  resetWorkerState(): void {
    consecutivePollFailures = 0;
  },
  getConsecutiveFailures(): number {
    return consecutivePollFailures;
  },
};

// --- Public entry point ---
export function startEntityWorker(): void {
  if (Deno.env.get("ENTITY_WORKER_DISABLED") === "true") {
    console.log("[entityWorker] auto-start disabled (ENTITY_WORKER_DISABLED=true)");
    return;
  }
  if (!OPENROUTER_API_KEY) {
    console.warn("[entityWorker] OPENROUTER_API_KEY not set — entity extraction disabled");
    return;
  }

  console.log(`[entityWorker] started (base interval ${POLL_INTERVAL_MS}ms, batch ${BATCH_SIZE})`);
  void safePoll();
}
