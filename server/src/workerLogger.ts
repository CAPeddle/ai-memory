export interface WorkerLogEvent {
  ts: string;
  level: "info" | "warn" | "error";
  worker: "entity" | "consolidation";
  run_id: string;
  event: "run_started" | "item_processed" | "run_completed" | "run_failed";
  duration_ms?: number;
  items_processed?: number;
  errors?: number;
  error_summary?: unknown;
}

export function logWorkerEvent(event: WorkerLogEvent): void {
  console.log("[worker]", JSON.stringify({ ts: new Date().toISOString(), ...event }));
}
