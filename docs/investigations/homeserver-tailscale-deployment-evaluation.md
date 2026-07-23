# Self-Hosted Homeserver (Z2 + Tailscale) vs Supabase — Deployment Evaluation

**Type:** Investigation / architecture-decision evaluation (Tier 2 reference)
**Date:** 2026-07-22
**Question posed:** Critically evaluate hosting the platform — and potentially all products — on a personal Z2 homeserver reached over Tailscale, instead of Supabase, thereby running the latest PostgreSQL and its associated features.
**Client model (confirmed):** Cloud web assistants (ChatGPT, Claude.ai, Gemini) must remain first-class MCP clients — so the MCP edge is exposed publicly via Tailscale Funnel (or an equivalent tunnel), while the database and internal services stay tailnet-private.
**Verdict:** **Adopt for the current single-user deployment.** It is congruent with ADR-009's existing reasoning, fills a host slot ADR-009 deliberately left open, and dissolves both risks from the AGE-divergence analysis. The one genuine cost is availability (a home box is a single point of failure with no SLA); the one strategic caveat is that it leans hard into the single-user assumption. Formalize via a new ADR, not a silent switch.

---

## TL;DR

- This is not "overturn a settled decision." **ADR-009 never selected a production host** — it lists Fly.io/Railway/DigitalOcean/Azure/Render as candidates and defers the pick (`ADR-009:74-86`). The Z2 homeserver is a valid candidate to finally choose.
- It **dissolves both risks** from `age-platform-divergence-product-impact.md`: unify platform + all products on one self-hosted AGE-capable Postgres (**Risk A** gone), on the latest Postgres major → **AGE v1.7.0+** with the `|` operator (**Risk B** gone) — the event that unblocks the deferred **ST-024**.
- It is **congruent with the repo's own logic**: ADR-009 already prefers a "plain Deno server" over self-hosted Supabase Docker (`:131`) and rejects *managed* Supabase because it lacks AGE (`:130`). A homeserver is the same self-hosted Deno + Docker-Postgres+AGE stack, relocated to hardware you own, with the second (Supabase) stack deleted.
- **Because cloud assistants must connect, "private" applies to the DB and internals — not the public MCP edge.** But that edge is *already* a public Bearer-gated `/mcp` in ADR-009 (`:88-96`), so the exposure posture is **identical to any cloud VPS**. The homeserver's privacy win is real but specific: **your data never sits on a third-party managed service**, only a Bearer-gated request endpoint is public.
- **The real cost is availability**: home power + ISP + one box = a SPOF with no managed backups. Mitigable, but you own the pager. Off-site encrypted backups become mandatory.
- **Strategic caveat**: this only stays clean while Christopher is sole user. Tailscale-per-user is awkward, and ADR-011 says multi-user "must not be foreclosed."

---

## 1. What is actually being decided

Two Tier-1 items are in scope:
- **ADR-009 (deployment):** its production-host choice is *explicitly deferred* (`:74` "The production platform is not selected until the spike proves the architecture"). The spike (ST-021) is long done and the architecture is proven, so the host decision is simply **open and overdue** — the homeserver fills it.
- **Contact Memory Decision 7 (Supabase):** `docs/architecture/ai_memory_architecture_decisions.md:86-92` chose Supabase *for Contact Memory only*. If the platform moves to a homeserver with AGE, Contact Memory can build on the **same platform MCP** instead of a separate Supabase stack — which is exactly what removes the divergence (Risk A).

Everything else (the Deno server, the Compose file, the custom Postgres+AGE image, Bearer auth) is unchanged — ADR-009 already notes the Compose stack "runs locally and on any cloud host" (`:114`). The homeserver is "any host."

## 2. The reachability crux and the chosen client model

Tailscale is a private WireGuard mesh: only enrolled devices reach a tailnet service. That splits clients:

- **On-tailnet (fully private):** the database, entity/consolidation workers, and *your own* clients — Claude Code / Cursor on your laptop, and the **Android app with the Tailscale app (works over cellular)**. For these, nothing touches the public internet.
- **Off-tailnet (cannot join your mesh):** cloud web assistants — ChatGPT, Claude.ai, Gemini. Their backends run in vendor clouds.

**Confirmed requirement:** those cloud assistants must keep working. Therefore the MCP edge is exposed publicly via **Tailscale Funnel** (public `*.ts.net` HTTPS on 443/8443/10000) or an equivalent tunnel (e.g. Cloudflare Tunnel). Consequences:

- The **database stays tailnet-only** — never publicly reachable. This is the durable privacy gain.
- The **public surface is exactly `/mcp`, Bearer-gated** — which is *already* what ADR-009 mandates (`:88-96`, `:104`). So choosing "also cloud assistants" does **not** make the homeserver worse than the status-quo VPS on exposure; it is the same endpoint, relocated.
- This directly answers the objection that killed the original design: ADR-009 rejected "Local-first deployment" as "Incompatible with online access from Claude.ai, ChatGPT…" (`:133`). Homeserver **+ Funnel is not that** — it is self-hosted-on-owned-hardware **with** public HTTPS access, satisfying the online-access requirement.
- Caveats to price in: Funnel has fair-use expectations and a fixed port set, and a tunnel adds a dependency. But note what Funnel **does not** do (see §2a): it does not open your router or expose the rest of your network — so classic LAN segmentation is *not* a requirement of using it.

### 2a. What Funnel actually exposes (and why LAN segmentation is not required)

It is worth being precise here, because it changes the security recommendations. **Tailscale Funnel is a scoped reverse tunnel, not a port-forward:**

- **It exposes only the single service you point it at** (`tailscale funnel 3000`) — not the host's other ports, not other devices, not the rest of your tailnet.
- **It opens nothing on your router.** The node makes an *outbound* connection to Tailscale's ingress relays; there is no inbound firewall hole, no NAT port-forward, no listening port on your home perimeter. This is a materially better posture than exposing a box via port-forwarding.
- **TLS terminates on your node** (a Let's Encrypt cert for your `*.ts.net` name). Tailscale's relays route by SNI but do not decrypt the payload, so the data path is not readable by Tailscale either.

So the generic "public ingress ⇒ segment the LAN" heuristic does **not** fit Funnel: Funnel by itself does not place the rest of the home network in the blast radius.

**The residual risk that controls actually address is different** — it is the **exposed app process being compromised** (an RCE/SSRF/auth-bypass in the MCP server), because Funnel faithfully delivers attacker traffic to whatever it fronts. If that process is popped, it runs on a host that sits on both the LAN and the tailnet and could attempt lateral movement. The **proportionate** controls for that are tailnet-native and cheap, not VLANs:

1. **Tailscale ACLs** — restrict what the MCP node may reach on the tailnet; this contains a popped node without touching LAN topology, and is the "segmentation" that actually matters here.
2. **Run the MCP server as an unprivileged container** (it already is, via Compose) — host-level blast-radius limiting.
3. **DB bound tailnet/loopback-only, never `0.0.0.0`** — the DB is never behind Funnel.
4. **App-layer hardening is the front line** — the Bearer auth on `/mcp` and the existing Cypher-injection guards face the attacker directly.

Full L2/L3 VLAN segmentation of the home LAN is *good hygiene* — worth it mainly if the box shares a flat network with high-value or other-people's devices — but it is **optional defense-in-depth, not a Funnel requirement.**

## 3. What it wins (steelman — strong)

- **Dissolves Risk B (frozen AGE):** you own the Postgres major → PG17/PG18 → **AGE v1.7.0+**, unlocking the `|` multi-relationship-type selector (`[:LIKES|INTERESTED_IN*1..3]`) that v1.6.0-rc0 lacks, plus async I/O / skip scan. This is the concrete trigger ST-024 waits for.
- **Dissolves Risk A (divergence):** platform + all products on one AGE-capable Postgres. No Supabase-without-AGE fork, no graph-stranding, one backup, one auth model, one dev/prod parity story.
- **Privacy / data residency:** intimate contact data + WhatsApp exports live only on your hardware. For a product built on personal relationship data, this is arguably the most values-aligned option available.
- **Cost:** ~€0 marginal (you own the box; electricity), beating ADR-009's €0 *soft* target (`:27`) — which no cloud host meets.
- **Congruence:** ADR-009 already leans to plain-Deno-self-host over Supabase-Docker (`:131`); this extends that logic rather than fighting it.
- **Latest-Postgres features** beyond AGE: PG18 async I/O, better planner/vacuum — though honestly marginal for a ~350 MB single-user store (noted in `turbopuffer-storage-evaluation.md`); the AGE unlock is the real prize.

## 4. What it costs (critical — do not wave away)

Scored against ADR-009's own decision criteria (`:86` — cost, Compose support, persistent volume, always-on availability, HTTPS termination):

| Criterion | Homeserver + Tailscale/Funnel |
|---|---|
| Cost | ✓✓ ~€0 marginal |
| Docker Compose support | ✓ identical Compose stack |
| Persistent volume | ✓ local disk, full control |
| **Always-on availability** | ✗ **home power + ISP + one box = SPOF, no SLA** |
| HTTPS termination | ✓ via Funnel/tunnel |

The decisive weakness is **availability**. A $6 DigitalOcean droplet wins here; the homeserver trades managed uptime for cost, privacy, and capability. Concrete costs:

- **SPOF / uptime:** if you depend on commitment/upcoming-date reminders, home outages bite. Mitigate with UPS + monitoring, but you own it.
- **Backups / DR:** no managed backups; consolidating everything onto one box raises the stakes of losing it. **Off-site encrypted backups become mandatory**, not the optional cron ADR-011 currently suggests (`ADR-011` Negative/Trade-offs).
- **Host-compromise blast radius** (not "home-network exposure" — see §2a): Funnel doesn't open your LAN, so the control is containing a *popped app process*, not firewalling ingress. Proportionate measures: Tailscale ACLs on the MCP node, unprivileged container, DB tailnet/loopback-only, keep the app patched. VLAN segmentation is optional hygiene, not required.
- **Single-user lock-in (strategic):** this is clean *because* Christopher is sole user. If multi-user/sharing returns — which ADR-011 says "must not foreclose" — enrolling other people's devices into *your* tailnet is a privacy/trust problem, and you'd likely need public managed hosting after all. This choice leans harder into single-user than the platform ADRs formally commit to.

## 5. Contact Memory specifics — what re-homing off Supabase actually loses

Contact Memory's Supabase pulls (`ai_memory_architecture_decisions.md:86-92`) and their homeserver replacements:

- **Edge Functions (Deno runtime parity):** you already run `deno serve`; running it directly is *simpler* and preserves the "same runtime, no drift" principle. Net simplification.
- **Storage (WhatsApp `.txt` exports):** replace with the filesystem or Postgres large objects — trivial at single-user scale (MinIO if S3-compatibility is ever wanted).
- **Auth (GoTrue) for Android → Contact API:** a genuine gap — but ADR-010 already marks Android→Contact auth *unresolved* and warns against copying the platform Bearer model blindly (`ADR-010`), so it is a design item **either way**, not a regression caused by this move. On a homeserver, the Android app on the tailnet can even reach the Contact API privately, changing the auth calculus favorably.
- **Managed backups / dashboard:** the real losses — folded into §4's availability/DR cost.
- **Android reach-from-anywhere:** the Tailscale app on the phone routes over cellular into the tailnet, so the "reach my Contact API anywhere" need Supabase-cloud served is met — for your own device.

Net: the Supabase-specific losses are **modest and replaceable** for single-user scale; the only hard loss is managed availability, already counted.

## 6. Verdict and recommendation

**Adopt the homeserver for the current single-user deployment.** It fills ADR-009's open host slot, is congruent with its stated preferences, dissolves Risk A and Risk B, maximizes data privacy, and costs almost nothing. The exposure posture is identical to the status-quo public VPS (Bearer-gated `/mcp`), so the "cloud assistants must connect" constraint does not undermine it — it only means the *edge*, not the *data*, is public.

Concrete recommendations:
1. **Write a new ADR** (e.g. ADR-014 "Production host: self-hosted homeserver + Tailscale, MCP edge via Funnel") that *fills* ADR-009's deferred host decision rather than silently superseding it; cross-reference Contact Decision 7 and ST-024.
2. **Unblock ST-024** (PG17/PG18 + AGE v1.7.0) — the homeserver is the demonstrated requirement its deferral waited for.
3. **Revisit Contact Memory Decision 7:** with an AGE-capable platform on owned hardware, Contact Memory should build on the platform MCP (removing the divergence) unless a Contact-specific reason to stay on Supabase survives.
4. **Make off-site encrypted backups a hard requirement**, not a suggestion — consolidation raises the blast radius of losing the box.
5. **Keep the public surface minimal, but scope the controls to the real threat (§2a):** DB + workers tailnet-only; only Bearer-gated `/mcp` via Funnel/tunnel; **Tailscale ACLs + unprivileged container** to contain a compromised app process. LAN/VLAN segmentation is optional defense-in-depth, **not** a Funnel requirement — Funnel opens no router port and exposes only the one service.
6. **Record the single-user dependency explicitly** so a future multi-user pivot re-opens this decision rather than inheriting it blindly.

## 7. Open decisions to nail down in the ADR

- **Funnel vs Cloudflare Tunnel vs a small public reverse proxy** for the `/mcp` edge — pick one and note the fair-use/availability implications.
- **Availability target** for a home box (best-effort? UPS? failover to a cheap VPS during outages?).
- **Backup destination and cadence** (off-site, encrypted) and a restore drill.
- **Whether to move Contact Memory now or after the platform is stable on the homeserver** (staged migration reduces risk).
- **Postgres major** target (PG17 vs PG18) and the AGE tag in that namespace (per the ST-078 per-major tag-namespace constraint).

---

## Sources

- `docs/design/adr/ADR-009-deployment-model.md` (`:21` clients, `:23-28` requirements incl. public HTTPS + €0/€10 cost, `:74-86` **deferred host selection** + candidates + criteria, `:88-96` public Bearer `/mcp`, `:130-133` alternatives incl. rejected local-first and Supabase)
- `docs/design/adr/ADR-010-authentication.md` (`:112` self-hosted Deno, Supabase auth not used; Android→Contact auth unresolved)
- `docs/design/adr/ADR-011-storage-strategy.md` (`:55` per-major AGE tag-namespace constraint; `:130` Supabase AGE policy barrier; backups trade-off)
- `docs/architecture/ai_memory_architecture_decisions.md` (`:86-92` Contact Memory Decision 7 — Supabase)
- `docs/investigations/age-platform-divergence-product-impact.md` (Risk A / Risk B this move dissolves)
- `docs/investigations/turbopuffer-storage-evaluation.md` (PG18 feature cost/benefit at this scale)
- `.github/planning/story-board.md` — ST-024 (deferred PG17 + AGE v1.7.0 upgrade)
