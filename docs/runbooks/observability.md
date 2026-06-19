# Observability Runbook: Worker Logs & Stats

> **Target consumers:** ST-019 (local Obsidian synthesis), ST-026 (dashboard/health UI), ST-023 (alerting).

---

## 1. Worker Log Event Schema

Every worker log event is a single JSON line prefixed with `[worker]`. The envelope shape is defined in [`server/src/workerLogger.ts`](../../server/src/workerLogger.ts):

```typescript
export interface WorkerLogEvent {
  ts: string;            // ISO 8601 timestamp (set at serialization time)
  level: "info" | "warn" | "error";
  worker: "entity" | "consolidation";
  run_id: string;        // UUID — correlates all events for one run
  event: "run_started" | "item_processed" | "run_completed" | "run_failed";
  duration_ms?: number;  // present on run_completed, run_failed
  items_processed?: number;
  errors?: number;
  error_summary?: unknown;
}
```

## 2. Worker Log Event Levels

| Level   | Meaning                                                         |
|---------|-----------------------------------------------------------------|
| `info`  | Normal lifecycle events (run_started, run_completed).           |
| `warn`  | Partial degradation (item_processed with errors > 0).           |
| `error` | Run failure or unexpected condition (run_failed).               |

## 3. Worker Log Event Details

### `run_started`

Emitted when a worker begins a new polling cycle.

| Field   | Always present | Notes                      |
|---------|----------------|----------------------------|
| `level` | yes            | `"info"`                   |
| `event` | yes            | `"run_started"`            |
| `run_id`| yes            | UUID assigned at start     |

### `item_processed`

Emitted after each item in the queue is handled (one per item per run).

| Field            | Always present | Notes                                              |
|------------------|----------------|----------------------------------------------------|
| `level`          | yes            | `"info"` (or `"warn"` when errors > 0)             |
| `event`          | yes            | `"item_processed"`                                 |
| `run_id`         | yes            | matches the enclosing run_started                   |
| `duration_ms`    | yes            | time spent on this single item                     |
| `items_processed`| yes            | cumulative count within this run                   |
| `errors`         | yes            | errors encountered processing this item             |
| `error_summary`  | sometimes      | details when errors > 0; omitted otherwise          |

### `run_completed`

Emitted when a worker finishes a cycle with no fatal error.

| Field             | Always present | Notes                                  |
|-------------------|----------------|----------------------------------------|
| `level`           | yes            | `"info"`                               |
| `event`           | yes            | `"run_completed"`                      |
| `run_id`          | yes            | matches run_started                     |
| `duration_ms`     | yes            | wall-clock time of the entire run       |
| `items_processed` | yes            | total items in this run                 |
| `errors`          | yes            | total errors across all items           |

### `run_failed`

Emitted when a worker catches an unexpected exception during a cycle.

| Field             | Always present | Notes                                  |
|-------------------|----------------|----------------------------------------|
| `level`           | yes            | `"error"`                              |
| `event`           | yes            | `"run_failed"`                         |
| `run_id`          | yes            | matches run_started                     |
| `duration_ms`     | yes            | wall-clock until the failure            |
| `items_processed` | yes            | items completed before the failure      |
| `errors`          | yes            | errors before the failure               |
| `error_summary`   | sometimes      | top-level exception info                |

## 4. Example Log Lines

**run_started (entity worker):**
```
[worker] {"ts":"2026-06-18T12:00:00.000Z","level":"info","worker":"entity","run_id":"a1b2c3d4-...","event":"run_started"}
```

**item_processed (consolidation worker, success):**
```
[worker] {"ts":"2026-06-18T12:00:01.200Z","level":"info","worker":"consolidation","run_id":"e5f6g7h8-...","event":"item_processed","duration_ms":450,"items_processed":3,"errors":0}
```

**item_processed with errors:**
```
[worker] {"ts":"2026-06-18T12:00:02.100Z","level":"warn","worker":"entity","run_id":"a1b2c3d4-...","event":"item_processed","duration_ms":820,"items_processed":5,"errors":1,"error_summary":"OpenRouter rate-limited; retry in 2s"}
```

**run_completed:**
```
[worker] {"ts":"2026-06-18T12:00:05.500Z","level":"info","worker":"entity","run_id":"a1b2c3d4-...","event":"run_completed","duration_ms":5500,"items_processed":12,"errors":0}
```

**run_failed:**
```
[worker] {"ts":"2026-06-18T12:05:00.000Z","level":"error","worker":"entity","run_id":"f9a8b7c6-...","event":"run_failed","duration_ms":3200,"items_processed":3,"errors":0,"error_summary":"Connection pool exhausted"}
```

## 5. Event Contract Stability

- The `WorkerLogEvent` interface and event enum (`run_started`, `item_processed`, `run_completed`, `run_failed`) are **stable**.
- New fields may be added as optional (`?`) properties. Breaking changes (renaming or removing fields, changing types) will be **coordinated** with known downstream consumers (ST-019, ST-026, ST-023) before release.
- The `[worker]` prefix and JSON-on-stdout format will not change without a major version bump.

## 6. `stats` Tool Response Schema

The `stats` MCP tool (registered in [`server/index.ts`](../../server/index.ts) around line 588) returns a JSON object with the following top-level keys:

### Top-level shape

```typescript
interface StatsResponse {
  queues: {
    entity_extraction_pending: number;  // rows in entity_extraction_queue with status = 'pending'
    consolidation_pending: number;      // rows in consolidation_queue with status = 'pending'
  };
  workers: Record<string, {
    runs_24h: number;                   // runs started in the last 24 hours
    errors_24h: number;                 // total errors across those runs
    last_run_at: string | null;         // ISO 8601 timestamp of last completed run, or null
    last_status?: "ok" | "error";       // 'ok' if errors === 0 on last run; absent if no completed runs
  }>;
  recall: {
    events_24h: number;                 // recall_events created in the last 24 hours
  };
  content: {
    total: number;                      // active thought count (thoughts.active = true)
    by_type: Record<string, number>;    // per-memory_type breakdown
  };
}
```

### Field semantics

| Path                         | Source table(s)                   | Semantics |
|------------------------------|-----------------------------------|-----------|
| `queues.*_pending`           | `entity_extraction_queue`, `consolidation_queue` | Count of rows with `status = 'pending'`. |
| `workers.*.runs_24h`         | `worker_runs.started_at`          | Rows where `started_at > now() - interval '24 hours'`, grouped by worker. |
| `workers.*.errors_24h`       | `worker_runs.errors`              | `COALESCE(SUM(errors), 0)` for those runs. |
| `workers.*.last_run_at`      | `worker_runs.ended_at`            | `DISTINCT ON (worker)` ordered by `ended_at DESC`. Null when no runs have completed. |
| `workers.*.last_status`      | `worker_runs.errors`              | `'ok'` when `errors = 0` on the last completed run; `'error'` otherwise. Absent when no runs have completed. |
| `recall.events_24h`          | `recall_events.created_at`        | Rows where `created_at > now() - interval '24 hours'`. |
| `content.total`              | `thoughts.active`                 | `COUNT(*) WHERE active = true`. |
| `content.by_type`            | `thoughts.memory_type`            | Grouped count of active thoughts per memory type. |

> **`error_summary` exclusion:** Raw error details (e.g., `error_summary`) are **not** exposed in the `stats` response. They are operational internals logged on the worker's stdout. Only aggregate error counts (`errors_24h`) appear in the stats response.

## 7. `stats` Example Response

```json
{
  "queues": {
    "entity_extraction_pending": 0,
    "consolidation_pending": 2
  },
  "workers": {
    "entity": {
      "runs_24h": 48,
      "errors_24h": 0,
      "last_run_at": "2026-06-18T12:00:00Z",
      "last_status": "ok"
    },
    "consolidation": {
      "runs_24h": 24,
      "errors_24h": 3,
      "last_run_at": "2026-06-18T11:55:00Z",
      "last_status": "error"
    }
  },
  "recall": {
    "events_24h": 127
  },
  "content": {
    "total": 450,
    "by_type": {
      "shard": 412,
      "wiki": 38
    }
  }
}
```

## 8. Note on `thought_stats`

The `thought_stats` tool is **maintained for backward compatibility** only. New consumers should use `stats` as the primary endpoint. `thought_stats` returns a subset of the data available in `stats` and may be deprecated in a future release.
