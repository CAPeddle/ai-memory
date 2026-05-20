## §6c — Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Single-table discriminator for memory tiers | Simpler RRF queries; no JOIN overhead at spike scale |
| D2 | Use OB1's entity-extraction trigger pattern directly | Battle-tested, idempotent; no reason to redesign |
| D3 | `Authorization: Bearer` replaces OB1's `x-brain-key` | More standard; consistent with ADR-010 |
| D4 | `postgres` npm package for DB access (not Supabase client) | Direct SQL; no ORM overhead; full AGE multi-statement support via `sql.unsafe()` |
| D5 | `registerTool` API (not `server.tool`) | OB1's tested API shape; `server.tool` appears in older SDK versions |
| D6 | Fire-and-forget embedding update in `capture_thought` | Keeps tool response latency low; embedding is async and not needed for the capture confirmation |
| D7 | `MERGE` for AGE writes (not `CREATE`) | Idempotent entity writes; re-processing the same thought doesn't create duplicate nodes |

---

