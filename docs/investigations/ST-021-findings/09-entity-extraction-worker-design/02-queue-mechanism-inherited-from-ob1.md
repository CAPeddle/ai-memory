### Queue mechanism (inherited from OB1)

A PostgreSQL trigger on `thoughts` (`trg_queue_entity_extraction`) queues every new/updated thought for extraction. The trigger skips thoughts with `metadata->>'generated_by'` set (system-generated artifacts). The queue entry is idempotent on `thought_id`, re-queuing only when `content_fingerprint` changes.

