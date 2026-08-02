/**
 * ST-086 — the operator dashboard, served from the same deployment.
 *
 * A single self-contained HTML string: no framework, no build step, no separate
 * frontend service, no external asset. That is a constraint of the story, and it is
 * also what makes the page honest — everything it shows came from `/api/workflow`
 * on this server, so there is no second source of truth to drift.
 *
 * **The page itself is unauthenticated; every request it makes is not.** The shell is
 * static markup with no operational content, so serving it to an unauthenticated
 * caller discloses nothing. The operator supplies the bearer key in the browser, it is
 * held in `sessionStorage` (cleared when the tab closes), and it is sent on each API
 * call. A key in `sessionStorage` is readable by any script on this origin — acceptable
 * for a local operator tool with no third-party script, and worth restating rather
 * than discovering later.
 *
 * Only three interactions exist, matching the three the slice needs: resolve a
 * decision, attach manual evidence, complete a packet. There is deliberately no
 * status-editing control — completion goes through the gate like every other caller.
 */

export const DASHBOARD_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workflow Operations</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #16181d; --muted: #5c6370; --line: #d8dce3;
    --card: #f7f8fa; --accent: #2a5db0; --warn: #9a5b00; --good: #1e6b3a; --bad: #a32020;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a; --fg: #e6e8ec; --muted: #9aa1ad; --line: #2b3039;
      --card: #1c1f25; --accent: #6f9dee; --warn: #d9a03c; --good: #63c98a; --bad: #e8756b;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 1rem; background: var(--bg); color: var(--fg);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  header { display: flex; flex-wrap: wrap; gap: .75rem; align-items: baseline; margin-bottom: 1rem; }
  h1 { font-size: 1.15rem; margin: 0; }
  h2 { font-size: 1rem; margin: 0 0 .25rem; }
  h3 { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em;
       color: var(--muted); margin: 1rem 0 .35rem; }
  .stamp { color: var(--muted); font-size: .8rem; }
  button {
    font: inherit; padding: .3rem .7rem; border: 1px solid var(--line);
    border-radius: 5px; background: var(--card); color: var(--fg); cursor: pointer;
  }
  button:hover { border-color: var(--accent); }
  button[disabled] { opacity: .5; cursor: default; }
  input, select, textarea {
    font: inherit; padding: .3rem .45rem; border: 1px solid var(--line);
    border-radius: 5px; background: var(--bg); color: var(--fg); max-width: 100%;
  }
  .packet { border: 1px solid var(--line); border-radius: 8px; padding: .9rem 1rem;
            margin-bottom: 1rem; background: var(--card); }
  .meta { display: flex; flex-wrap: wrap; gap: .4rem; margin: .35rem 0 .1rem; }
  .tag { font-size: .75rem; padding: .1rem .5rem; border: 1px solid var(--line);
         border-radius: 999px; color: var(--muted); white-space: nowrap; }
  .tag.scope { color: var(--accent); border-color: var(--accent); font-weight: 600; }
  .tag.done { color: var(--good); border-color: var(--good); }
  ul { margin: .2rem 0; padding-left: 1.1rem; }
  li { margin: .18rem 0; }
  .reason { font-weight: 600; }
  .reason.decision-required, .reason.blocked { color: var(--bad); }
  .reason.stale, .reason.ended-without-checkpoint { color: var(--warn); }
  .reason.ready-for-review { color: var(--good); }
  .row { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; margin: .3rem 0; }
  .muted { color: var(--muted); }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; }
  .met { color: var(--good); } .unmet { color: var(--bad); }
  #banner { padding: .5rem .75rem; border-radius: 6px; margin-bottom: .75rem; display: none; }
  #banner.err { display: block; background: var(--bad); color: #fff; }
  #banner.ok { display: block; background: var(--good); color: #fff; }
  .empty { color: var(--muted); font-style: italic; }
</style>
</head>
<body>
<header>
  <h1>Workflow Operations</h1>
  <span class="stamp" id="stamp"></span>
  <span style="flex:1"></span>
  <button id="refresh">Refresh</button>
  <button id="rekey">Change key</button>
</header>
<div id="banner"></div>
<main id="root"><p class="empty">Loading&hellip;</p></main>

<script>
const KEY_NAME = "awcp.apiKey";
const root = document.getElementById("root");
const banner = document.getElementById("banner");

function apiKey() {
  let k = sessionStorage.getItem(KEY_NAME);
  if (!k) {
    k = prompt("API key (sent as: Authorization: Bearer <key>)");
    if (k) sessionStorage.setItem(KEY_NAME, k);
  }
  return k;
}

let bannerTimer = null;
function say(msg, kind) {
  clearTimeout(bannerTimer);
  banner.textContent = msg;
  banner.className = kind;
  if (kind === "ok") bannerTimer = setTimeout(() => { banner.className = ""; }, 2500);
}

async function call(path, options) {
  const key = apiKey();
  if (!key) throw new Error("no API key supplied");
  const res = await fetch("/api/workflow" + path, Object.assign({
    headers: {
      "Authorization": "Bearer " + key,
      "Content-Type": "application/json",
    },
  }, options || {}));
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = { message: text }; }
  if (!res.ok) {
    // A 401 means the key THIS request sent was rejected -- evict it so the
    // next call re-prompts. The eviction is scoped to the exact key that
    // failed (only removed if sessionStorage still holds that same value)
    // because this call may be a slow, now-stale request: if the operator
    // used "Change key" while it was in flight, sessionStorage already holds
    // a newer, untested key, and an unconditional removeItem here would wipe
    // that valid key out from under them and force a needless re-prompt. Do
    // not "simplify" this back to an unconditional removeItem.
    if (res.status === 401 && sessionStorage.getItem(KEY_NAME) === key) {
      sessionStorage.removeItem(KEY_NAME);
    }
    let detail = (body && body.message) || res.statusText;
    // The completion refusal already names the unmet criteria inside its message.
    // Append the list only when some other error carries them without saying them,
    // so the most important message on the page never reads them out twice.
    if (body && body.unmetCriteria && body.unmetCriteria.length) {
      const named = body.unmetCriteria.join("; ");
      if (String(detail).indexOf(named) === -1) detail = detail + " [" + named + "]";
    }
    throw new Error(res.status + " " + detail);
  }
  return body;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

function when(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function shortCommit(value) {
  return value ? String(value).slice(0, 10) : null;
}

/** Attention grouped by reason, exactly as the server computed it. */
function renderAttention(items) {
  const wrap = el("div");
  wrap.appendChild(el("h3", null, "Attention"));
  if (!items.length) {
    wrap.appendChild(el("p", "empty", "Nothing needs attention."));
    return wrap;
  }
  const byReason = new Map();
  for (const item of items) {
    if (!byReason.has(item.reason)) byReason.set(item.reason, []);
    byReason.get(item.reason).push(item);
  }
  for (const [reason, group] of byReason) {
    const p = el("div", "row");
    p.appendChild(el("span", "reason " + reason, reason));
    p.appendChild(el("span", "muted", "(" + group.length + ")"));
    wrap.appendChild(p);
    const ul = el("ul");
    for (const item of group) ul.appendChild(el("li", null, item.detail));
    wrap.appendChild(ul);
  }
  return wrap;
}

function renderRuns(runs) {
  const wrap = el("div");
  wrap.appendChild(el("h3", null, "Runs"));
  if (!runs.length) { wrap.appendChild(el("p", "empty", "No runs registered.")); return wrap; }
  const ul = el("ul");
  for (const run of runs) {
    const li = el("li");
    li.appendChild(el("span", "mono", run.agent_type + " @ " + run.host));
    li.appendChild(el("span", "tag", run.status));
    if (run.branch) li.appendChild(el("span", "tag", run.branch));
    li.appendChild(el("span", "muted", " last event " + when(run.last_event_at)));
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  return wrap;
}

function renderCheckpoints(checkpoints) {
  const wrap = el("div");
  wrap.appendChild(el("h3", null, "Recent checkpoints"));
  if (!checkpoints.length) {
    wrap.appendChild(el("p", "empty", "No checkpoints recorded."));
    return wrap;
  }
  const ul = el("ul");
  for (const cp of checkpoints) {
    const li = el("li");
    li.appendChild(el("div", null, cp.completed_work));
    li.appendChild(el("div", "muted", "state: " + cp.current_state));
    if (cp.blockers) li.appendChild(el("div", "unmet", "blocked: " + cp.blockers));
    if (cp.next_action) li.appendChild(el("div", "muted", "next: " + cp.next_action));
    const commit = shortCommit(cp.repo_commit);
    if (commit) li.appendChild(el("div", "mono", "commit " + commit));
    li.appendChild(el("div", "muted", when(cp.created_at)));
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  return wrap;
}

function renderDecisions(view, reload) {
  const wrap = el("div");
  wrap.appendChild(el("h3", null, "Unresolved decisions"));
  if (!view.openDecisions.length) {
    wrap.appendChild(el("p", "empty", "None open."));
  }
  for (const d of view.openDecisions) {
    const box = el("div");
    const q = el("div");
    q.appendChild(el("strong", null, d.question));
    if (d.blocking) q.appendChild(el("span", "tag", "blocking"));
    box.appendChild(q);
    if (d.rationale) box.appendChild(el("div", "muted", d.rationale));
    const row = el("div", "row");
    const input = el("input");
    input.placeholder = "resolution";
    input.size = 40;
    const go = el("button", null, "Resolve");
    go.onclick = async () => {
      if (!input.value.trim()) { say("A resolution is required.", "err"); return; }
      go.disabled = true;
      try {
        await call("/decisions/" + d.id + "/resolve", {
          method: "POST",
          body: JSON.stringify({ resolution: input.value.trim() }),
        });
        say("Decision resolved.", "ok");
        reload();
      } catch (e) { say(e.message, "err"); go.disabled = false; }
    };
    row.appendChild(input);
    row.appendChild(go);
    box.appendChild(row);
    wrap.appendChild(box);
  }

  if (view.recentlyResolvedDecisions.length) {
    wrap.appendChild(el("h3", null, "Recently resolved"));
    const ul = el("ul");
    for (const d of view.recentlyResolvedDecisions) {
      const li = el("li");
      li.appendChild(el("span", null, d.question + " -> "));
      li.appendChild(el("span", "met", d.resolution));
      li.appendChild(el("span", "muted", " " + when(d.resolved_at)));
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }
  return wrap;
}

function renderCriteria(view, reload) {
  const wrap = el("div");
  wrap.appendChild(el("h3", null, "Verification criteria"));
  if (!view.criteria.length) {
    wrap.appendChild(el("p", "empty", "No criteria defined - the gate passes immediately."));
  }
  for (const c of view.criteria) {
    const box = el("div");
    const head = el("div", "row");
    head.appendChild(el("span", c.satisfied ? "met" : "unmet", c.satisfied ? "[met]" : "[unmet]"));
    head.appendChild(el("span", null, c.criterion.description));
    head.appendChild(el("span", "tag", c.criterion.required ? "required" : "optional"));
    box.appendChild(head);

    if (c.evidence.length) {
      const ul = el("ul");
      for (const e of c.evidence) {
        const li = el("li", "muted");
        li.appendChild(el("span", "tag", e.kind));
        li.appendChild(el("span", null, " " + e.detail));
        const commit = shortCommit(e.recorded_commit);
        if (commit) li.appendChild(el("span", "mono", " @" + commit));
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }

    const row = el("div", "row");
    const input = el("input");
    input.placeholder = "manual evidence";
    input.size = 40;
    const go = el("button", null, "Attach evidence");
    go.onclick = async () => {
      if (!input.value.trim()) { say("Evidence detail is required.", "err"); return; }
      go.disabled = true;
      try {
        await call("/criteria/" + c.criterion.id + "/evidence", {
          method: "POST",
          body: JSON.stringify({ kind: "manual", detail: input.value.trim() }),
        });
        say("Evidence attached.", "ok");
        reload();
      } catch (e) { say(e.message, "err"); go.disabled = false; }
    };
    row.appendChild(input);
    row.appendChild(go);
    box.appendChild(row);
    wrap.appendChild(box);
  }
  return wrap;
}

function renderPacket(view, reload) {
  const card = el("div", "packet");
  card.appendChild(el("h2", null, view.packet.title));
  card.appendChild(el("div", "muted", view.packet.objective));

  const meta = el("div", "meta");
  meta.appendChild(el("span", "tag scope", "scope: " + view.policyScope));
  meta.appendChild(el("span", view.packet.status === "complete" ? "tag done" : "tag",
    view.packet.status));
  meta.appendChild(el("span", "tag", "repo: " + (view.repository || "-")));
  meta.appendChild(el("span", "tag", "branch: " + (view.branch || "-")));
  card.appendChild(meta);
  card.appendChild(el("div", "mono muted", view.packet.id));

  card.appendChild(renderAttention(view.attention));
  card.appendChild(renderRuns(view.runs));
  card.appendChild(renderDecisions(view, reload));
  card.appendChild(renderCriteria(view, reload));
  card.appendChild(renderCheckpoints(view.recentCheckpoints));

  const actions = el("div", "row");
  const complete = el("button", null, "Complete packet");
  complete.onclick = async () => {
    complete.disabled = true;
    try {
      await call("/packets/" + view.packet.id + "/complete", { method: "POST" });
      say("Packet completed.", "ok");
      reload();
    } catch (e) { say(e.message, "err"); complete.disabled = false; }
  };
  actions.appendChild(complete);
  actions.appendChild(el("span", "muted",
    "Completion is refused while any required criterion lacks evidence."));
  card.appendChild(actions);
  return card;
}

let loadGeneration = 0;

async function load() {
  const generation = ++loadGeneration;
  try {
    const data = await call("/overview");
    // Discard this response if a newer load() has since been issued -- an
    // earlier, slower request must never overwrite a later request's result.
    if (generation !== loadGeneration) return;
    document.getElementById("stamp").textContent = "as of " + when(data.generatedAt);
    root.replaceChildren();
    if (!data.packets.length) {
      root.appendChild(el("p", "empty", "No active work packets."));
      return;
    }
    for (const view of data.packets) root.appendChild(renderPacket(view, load));
  } catch (e) {
    if (generation !== loadGeneration) return;
    say(e.message, "err");
  }
}

document.getElementById("refresh").onclick = load;
document.getElementById("rekey").onclick = () => {
  sessionStorage.removeItem(KEY_NAME);
  load();
};
load();
</script>
</body>
</html>
`;
