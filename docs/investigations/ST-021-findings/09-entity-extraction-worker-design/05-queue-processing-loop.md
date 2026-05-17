### Queue processing loop

```typescript
async function processQueue() {
  const rows = await sql`
    UPDATE entity_extraction_queue
    SET status = 'processing', started_at = now(), attempt_count = attempt_count + 1
    WHERE thought_id IN (
      SELECT thought_id FROM entity_extraction_queue
      WHERE status = 'pending'
      LIMIT 10 FOR UPDATE SKIP LOCKED
    )
    RETURNING thought_id
  `;
  for (const { thought_id } of rows) {
    // ... extract, write to AGE, mark complete or failed
  }
}
```

`FOR UPDATE SKIP LOCKED` ensures safe concurrent processing if multiple workers run.

---

