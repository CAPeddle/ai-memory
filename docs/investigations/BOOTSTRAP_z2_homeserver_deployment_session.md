# Bootstrap: Z2 Homeserver Deployment Session

**Origin:** Claude Code session (remote), 2026-07-23 — TurboPuffer → AGE reconcile → homeserver deployment evaluation arc
**Destination:** Fresh Claude Code session **running on the Z2 homeserver**
**Purpose:** Orient a fresh agent with all decisions locked, then execute **ST-080** — author ADR-014 and stand up the self-hosted platform on Z2.
**Read this whole file first, then read the canonical docs in §7 before acting.**

---

## 1. One-line orientation

> You are on the **Z2 homeserver** to make the self-hosted-homeserver + Tailscale deployment real: author **ADR-014**, provision the latest PostgreSQL + Apache AGE (v1.7.0+) + pgvector + Deno, wire the **Bearer-gated `/mcp` edge through Tailscale Funnel** while keeping the DB + workers tailnet-private, validate the graph (including the `|` operator that PG15 lacked), and revisit Contact Memory's Supabase decision. This is board story **ST-080**.

---

## 2. How we got here (decision trail — accept, do not re-litigate)

Five pieces of analysis led here, all merged to `main`:

1. **TurboPuffer evaluation** (PR #24) → **do not adopt.** Object-storage vector DB solves scale/multi-tenancy problems this single-user service doesn't have, and doesn't replace the AGE graph. Not relevant now except as the origin of the AGE-version finding.
2. **ST-078 — AGE version reconcile** (PRs #25/#26) → the ADRs claimed AGE `v1.7.0` on PG15, but PG15's ceiling is `v1.6.0-rc0` (AGE uses **per-Postgres-major tag namespaces**; `PG15/v1.7.0` never existed). Corrected across ADR-002/003/005/009/011.
3. **AGE divergence analysis + ST-079** (PR #27) → no platform move away from AGE; the real exposure is **Risk A** (unanalyzed Postgres+AGE vs Supabase-no-AGE divergence) and **Risk B** (frozen `v1.6.0-rc0` lacks the `|` multi-type traversal operator). ST-079 filed a governance guardrail (products inherit AGE by default).
4. **Homeserver + Tailscale evaluation + ST-080** (PR #28) → **adopt for the single-user deployment.** This is the current work.
5. **Funnel security correction** (in PR #28) → LAN segmentation is **not** a Funnel requirement (see §5).

---

## 3. Locked decisions (do NOT re-open)

- **Adopt the Z2 homeserver** as the production host for the platform (and, staged, the products). It *fills* ADR-009's deliberately-deferred host slot (`ADR-009:74-86`) — it does not overturn a settled decision.
- **Client model:** cloud web assistants (ChatGPT / Claude.ai / Gemini) **must** connect. Therefore the **Bearer-gated `/mcp` edge is exposed via Tailscale Funnel** (or an equivalent tunnel); the **database + entity/consolidation workers stay tailnet-only**.
- **Exposure posture = identical to the status-quo VPS.** `/mcp` is already a public Bearer-gated endpoint in ADR-009 (`:88-96`). The homeserver's privacy win is that **the data** never sits on a third party — only a request endpoint is public.
- **AGE stays core to the platform.** Unifying products on one AGE-capable Postgres dissolves **Risk A**.
- **Latest Postgres major → AGE v1.7.0+** unlocks the `|` operator, dissolving **Risk B**. This is the demonstrated requirement that **un-defers ST-024**.
- **Off-site encrypted backups are a HARD requirement** — a home box is a single point of failure with no SLA. Availability is the one genuine weakness of this design; own it, don't assume managed durability.
- **Single-user is load-bearing.** This is clean only while Christopher is sole user; a multi-user pivot (ADR-011 "must not foreclose") re-opens the whole decision.

---

## 4. Your task — ST-080

1. **Author ADR-014** "Production host: self-hosted homeserver + Tailscale, MCP edge via Funnel/tunnel." *Fill* (do not silently supersede) ADR-009's deferred host decision; cross-reference ADR-009/010/011, Contact Memory Decision 7, and ST-024. Status `proposed` until the PO accepts.
2. **Resolve + record the open decisions** (from the investigation §7): Funnel vs Cloudflare Tunnel vs reverse proxy; **PG17 vs PG18**; the exact AGE tag for that major (**verify — see §6**); availability target; backup destination + cadence + a restore drill.
3. **Provision + validate on Z2** (checklist §6).
4. **Revisit Contact Memory Decision 7** (`ai_memory_architecture_decisions.md:86-92`): build on the platform MCP vs stay on Supabase. Recommend a **staged migration** — platform first, Contact after the platform is stable on Z2.
5. **On acceptance, move ST-024 out of `deferred`** (its trigger is now met).

---

## 5. Security posture (the corrected reasoning — build on this)

**Tailscale Funnel is a scoped reverse tunnel, not a port-forward.** It opens **no** inbound router port (outbound-initiated to Tailscale relays), exposes **only the one service** you point it at, and TLS terminates on the node (Tailscale routes by SNI, does not decrypt payload). So the generic "public ingress ⇒ segment the LAN" heuristic does **not** apply.

The real threat the controls address is a **compromised app process** (RCE/SSRF/auth-bypass in the MCP server), since Funnel delivers attacker traffic straight to the app. Proportionate, tailnet-native controls:

- **Tailscale ACLs** restricting what the MCP node may reach (the "segmentation" that matters).
- **Run the MCP server as an unprivileged container** (already the Compose model).
- **DB bound tailnet/loopback-only, never `0.0.0.0`**; never behind Funnel.
- **App-layer hardening** — Bearer auth on `/mcp` + the existing Cypher-injection guards are the front line.

L2/L3 VLAN segmentation is **optional defense-in-depth, not required.** (Full reasoning: `homeserver-tailscale-deployment-evaluation.md §2a`.)

---

## 6. Provisioning / validation checklist (run on Z2)

- [ ] **Choose the Postgres major (17 or 18)** and record the rationale in ADR-014. PG18 gets AGE `v1.7.0-rc0` + async I/O; confirm pgvector packaging for the chosen major.
- [ ] **⚠ Verify the AGE release tag for that major EXISTS** at <https://github.com/apache/age/releases> **before building.** Do NOT trust the ADRs or older ST-021 notes for this — AGE uses per-Postgres-major tag namespaces and versions do not carry across majors (this is the exact trap ST-078 fixed: `PG15/v1.7.0` never existed). Pin the real tag, e.g. `PG18/v1.7.0-rc0`.
- [ ] **Build the Postgres image:** base + pgvector + AGE from source. Repo precedent: `docker/postgres-age/` (currently PG15 + `age-v1.6.0-rc0.tar.gz`). NOTE: the vendored-tarball / no-`git clone` pattern exists because of a **corporate SSL proxy** (`CLAUDE.md §Docker`) — on the personal Z2 network you can likely fetch the AGE tarball directly; keep the tarball-COPY pattern if you prefer reproducibility.
- [ ] **Bring up the stack** — `docker-compose.yml` is host-agnostic (`ADR-009:114`); run migrations via `server/src/migrate.ts`.
- [ ] **Validate the graph unlock:** run `graph_search` / `graph_traverse`; **confirm the `|` multi-relationship-type selector now parses** (`[:LIKES|INTERESTED_IN*1..3]`) — this is ST-024's acceptance criterion and the whole point of the version bump.
- [ ] **Tailscale:** install + enroll Z2; `tailscale status` / MagicDNS up; set ACLs restricting the MCP node.
- [ ] **Funnel:** expose ONLY the MCP port (`tailscale funnel <mcp-port>`); confirm the DB is **not** reachable off-tailnet (bind tailnet/loopback only).
- [ ] **End-to-end:** point one cloud assistant at the `https://<name>.ts.net/mcp` URL with the Bearer token; confirm a `search`/`capture_thought` round-trip.
- [ ] **Backups:** configure off-site **encrypted** backup of the Postgres volume; **do a restore drill** before declaring done.

---

## 7. Canonical docs to read first

- `docs/investigations/homeserver-tailscale-deployment-evaluation.md` — the decision + rationale (esp. **§2a** Funnel security, **§6–§7** recommendation + open decisions)
- `docs/investigations/age-platform-divergence-product-impact.md` — Risk A / Risk B this move dissolves
- `docs/design/adr/ADR-009-deployment-model.md` — the **deferred host slot** (`:74-86`), public `/mcp` (`:88-96`), rejected local-first (`:133`)
- `docs/design/adr/ADR-011-storage-strategy.md` — **`:55` per-major AGE tag-namespace constraint** (read before touching AGE versions)
- `docs/design/adr/ADR-010-authentication.md` — Bearer model; Android→Contact auth still unresolved
- `docs/architecture/ai_memory_architecture_decisions.md` — `:86-92` Contact Memory Decision 7 (Supabase)
- `.github/planning/story-board.md` — **ST-080** (this work), **ST-024** (un-defer), ST-079 (guardrail)
- `CLAUDE.md` — workflow gate, per-major AGE tag gotcha, no-`git clone`-in-Docker rule

---

## 8. Workflow gate + housekeeping

- **Move ST-080 Backlog → In Progress** first (respect **WIP: 1 In Progress, 1 in Review** — check the board's current In Progress/Review before moving; do not bump existing items).
- **Cross-link** ADR-014 ↔ the board entry (`story:` / `Plan:` point at each other).
- **Conventional commits** with a `Story: ST-080` trailer.
- **Branch discipline** per the session's configured branch; open a **draft PR** and let the PO merge.
- **Verify before trusting memory:** re-check any cited file/line/flag still exists before acting on it — this doc freezes in time.
- **Session handoff:** update `FollowUpSessionLog.txt` (replace, ≤40 lines, parseable by a fresh agent) when you pause.

---

## 9. Ready-to-paste opening prompt

Paste this into the fresh Z2 session:

```
Read docs/investigations/BOOTSTRAP_z2_homeserver_deployment_session.md and follow it.

We are continuing the ai-memory homeserver deployment (board story ST-080).
Goal this session: author ADR-014 (production host = self-hosted Z2 homeserver
+ Tailscale, Bearer-gated /mcp edge via Funnel, DB + workers tailnet-only) and
provision/validate the stack on this machine — latest PostgreSQL + Apache AGE
v1.7.0+ + pgvector + Deno.

Start by:
1. Moving ST-080 Backlog → In Progress on .github/planning/story-board.md
   (respect the WIP limit — check current In Progress/Review first).
2. Choosing the Postgres major (17 or 18) and VERIFYING the exact Apache AGE
   release tag for that major exists at github.com/apache/age/releases BEFORE
   building (per-Postgres-major tag namespaces — do not trust the ADRs/old
   notes; this is the trap ST-078 fixed).
3. Drafting ADR-014, then working the provisioning checklist in the bootstrap §6.

Locked decisions (do not re-open): adopt homeserver for single-user; cloud
assistants must connect so /mcp is public via Funnel while the DB stays
tailnet-only; Funnel does NOT require LAN segmentation; off-site encrypted
backups are mandatory. On ADR-014 acceptance, un-defer ST-024.
```
