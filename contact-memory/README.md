# Contact Memory

Local MVP tooling for turning a WhatsApp `.txt` export into reviewed Contact
Memory shards committed through the platform MCP.

## Local MVP

Required environment:

- `ANTHROPIC_API_KEY`: provider key for extraction.
- `ANTHROPIC_MODEL`: optional, defaults to `claude-sonnet-5`.
- `MEMORY_API_KEY`: Bearer token for the platform MCP.
- `CONTACT_MCP_BASE_URL`: optional MCP base URL, defaults to `MCP_BASE_URL` or
  `http://localhost:3000`.

Running extraction sends transcript data to the configured provider. Do not run
this on exports you are not prepared to share with that provider.

Run the local review CLI from `contact-memory/`:

```bash
deno run --allow-read --allow-env --allow-net cli/index.ts <export.txt> <contact-name> --project contact-memory --from 2026-01-01 --to 2026-12-31 --message-cap 250
```

Useful flags:

- `--project`: platform project scope for committed shards, default
  `contact-memory`.
- `--from` / `--to`: optional date range filters applied before extraction.
- `--message-cap`: maximum filtered messages for the MVP single-pass extractor.
- `--session-id`: stable parser session id for repeatable message IDs; otherwise
  derived from the file path.

The CLI parses the export, extracts review-only Contact items, shows each item
with cited WhatsApp sender/body evidence, records approve/edit/reject decisions,
shows a pre-commit summary, and requires typing `yes` before any MCP writes.

## Verification Checklist

- Parse succeeds without exposing raw transcript content in errors.
- Extraction validates as `ContactExtraction` and does not contain platform
  fields.
- Each review item shows cited sender/body evidence before approval.
- Rejecting an item produces no commit.
- Editing an item revalidates before commit and preserves item
  identity/evidence.
- Final confirmation gates all writes.
- Approved or edited items commit through `capture_thought` with
  `memory_type: "shard"`.
- Claude.ai can retrieve the committed shard by contact-name query and by a
  fact-specific query; both should show the shard in top results.

Embeddings are fire-and-forget in the platform MCP, so BM25/text recall may work
before vector recall catches up.

Raw MCP calls must include Bearer auth plus
`Accept: application/json, text/event-stream`; streamable HTTP responses may
arrive as SSE `data:` frames rather than bare JSON.
