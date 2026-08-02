#!/usr/bin/env -S deno run --allow-net --allow-env --allow-sys=hostname --allow-run=git
/**
 * ST-086 — `awcp`, the local event producer.
 *
 * Reports a real development session into Workflow Operations **through the HTTP
 * API**, never by connecting to Postgres. That is the point of the tool, not an
 * implementation detail: everything it can do, the API can do, so the CLI cannot drift
 * into a privileged back channel with its own rules. It has no database credential and
 * no SQL.
 *
 * **On shell execution.** This runs `git`, and only `git`, and only with argument
 * arrays fixed in {@link GIT_COMMANDS} below. It accepts no command text from the
 * user, builds no argument from user input, and never invokes a shell — `Deno.Command`
 * execs the binary directly, so there is no string for a metacharacter to live in. The
 * grant in the shebang is `--allow-run=git`, narrowed to that one binary: the
 * permission itself is the evidence, checkable without reading this file.
 *
 * Usage:
 *   awcp packet    --title T --objective O --policy-scope personal [--scope S]
 *                  [--constraints C] [--repo R] [--branch B]
 *   awcp run       --packet ID [--agent-type T] [--host H]
 *   awcp checkpoint --run ID --completed W --state S [--blockers B] [--next N]
 *                  [--commit SHA | --no-commit]
 *   awcp decision  --packet ID --question Q [--rationale R] [--run ID] [--advisory]
 *   awcp end-run   --run ID [--status ended|failed]
 *
 * Environment: AWCP_AGENT_API_KEY, else MEMORY_API_KEY (one of the two required —
 * see below), AWCP_BASE_URL (default http://127.0.0.1:3000), AWCP_TIMEOUT_MS
 * (default 30000).
 *
 * **Credential.** This CLI prefers `AWCP_AGENT_API_KEY` when it is set, falling
 * back to `MEMORY_API_KEY` otherwise. Every subcommand this file exposes is a
 * reporting/read route the agent key is allowed to call — `server/src/workflow/
 * policy.ts`'s `requiresOperator` names the four routes (resolve a decision, attach
 * evidence, author a criterion, complete a packet) that require the operator key,
 * and the server enforces that regardless of which key this script happens to send.
 * `MEMORY_API_KEY` still works here too — it is the operator key and can call
 * everything — but exporting the narrower agent key for this CLI, when one has been
 * issued, is the safer default: a leaked or logged agent key cannot resolve
 * decisions, attach evidence, author criteria, or complete packets, unlike a leaked
 * operator key.
 *
 * `--allow-sys=hostname` is granted for the default `--host` of a run, narrowed to
 * that one syscall. `defaultHost` below degrades to a literal if it is withheld, so
 * running with a tighter grant costs a default rather than the subcommand.
 */

const BASE_URL = (Deno.env.get("AWCP_BASE_URL") ?? "http://127.0.0.1:3000")
  .replace(/\/$/, "");
const API_ROOT = `${BASE_URL}/api/workflow`;

/**
 * The complete set of subprocesses this tool may run. Fixed argument arrays, resolved
 * by name — there is no path by which caller input becomes an argument.
 */
const GIT_COMMANDS = {
  repoRoot: ["rev-parse", "--show-toplevel"],
  branch: ["branch", "--show-current"],
  head: ["rev-parse", "HEAD"],
} as const;

type GitCommand = keyof typeof GIT_COMMANDS;

/**
 * The machine name, or a literal when the permission is withheld.
 *
 * `Deno.hostname()` throws `PermissionDenied` without `--allow-sys=hostname`, and an
 * unguarded call made the whole `run` subcommand die on a permission error while
 * reporting nothing useful. A default value is not worth a hard failure — a run whose
 * host reads "unknown-host" is still a run.
 */
function defaultHost(): string {
  try {
    return Deno.hostname();
  } catch {
    return "unknown-host";
  }
}

/** Run one allow-listed git command. Returns null when git fails or is absent. */
async function git(command: GitCommand): Promise<string | null> {
  try {
    const { code, stdout } = await new Deno.Command("git", {
      args: [...GIT_COMMANDS[command]],
      stdout: "piped",
      stderr: "null",
    }).output();
    if (code !== 0) return null;
    const value = new TextDecoder().decode(stdout).trim();
    return value === "" ? null : value;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Argument parsing — long flags only, no positional values beyond the subcommand
// ---------------------------------------------------------------------------

interface Args {
  command: string;
  flags: Map<string, string>;
  bools: Set<string>;
}

const BOOLEAN_FLAGS = new Set(["advisory", "no-commit", "help"]);

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  const bools = new Set<string>();
  const command = argv[0] ?? "";
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      die(`unexpected argument ${JSON.stringify(token)}`);
    }
    const name = token.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      bools.add(name);
      continue;
    }
    const value = argv[++i];
    if (value === undefined) die(`--${name} requires a value`);
    flags.set(name, value);
  }
  return { command, flags, bools };
}

function die(message: string): never {
  console.error(`awcp: ${message}`);
  Deno.exit(2);
}

function required(args: Args, name: string): string {
  const value = args.flags.get(name);
  if (value === undefined || value.trim() === "") die(`--${name} is required`);
  return value;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/** Default request timeout in milliseconds. Overridable via AWCP_TIMEOUT_MS env var. */
const DEFAULT_TIMEOUT_MS = 30_000;

function resolveTimeoutMs(): number {
  const raw = Deno.env.get("AWCP_TIMEOUT_MS");
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * Prefer the narrower agent key when one has been issued; fall back to the
 * operator key so this CLI still works in the (documented, default) deployment
 * shape where AWCP_AGENT_API_KEY was never set.
 */
function resolveApiKey(): string {
  const agentKey = Deno.env.get("AWCP_AGENT_API_KEY");
  if (agentKey) return agentKey;
  const operatorKey = Deno.env.get("MEMORY_API_KEY");
  if (!operatorKey) die("neither AWCP_AGENT_API_KEY nor MEMORY_API_KEY is set");
  return operatorKey;
}

async function post(path: string, body: unknown): Promise<unknown> {
  const key = resolveApiKey();

  const timeoutMs = resolveTimeoutMs();
  let res: Response;
  try {
    res = await fetch(`${API_ROOT}${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      die(`timed out after ${timeoutMs}ms waiting for ${API_ROOT}${path}`);
    }
    die(
      `could not reach ${API_ROOT} — is the server running? (${
        (err as Error).message
      })`,
    );
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text === "" ? null : JSON.parse(text);
  } catch {
    parsed = { message: text };
  }

  if (!res.ok) {
    const detail = parsed as
      | { message?: string; unmetCriteria?: string[] }
      | null;
    const unmet = detail?.unmetCriteria?.length
      ? ` [${detail.unmetCriteria.join("; ")}]`
      : "";
    die(`${res.status} ${detail?.message ?? res.statusText}${unmet}`);
  }
  return parsed;
}

function emit(label: string, record: Record<string, unknown>): void {
  console.log(`${label} ${record.id}`);
  console.log(JSON.stringify(record, null, 2));
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

const USAGE =
  `awcp — report a local development session into Workflow Operations

  awcp packet     --title T --objective O --policy-scope personal|corporate|mixed|public
                  [--scope S] [--constraints C] [--repo R] [--branch B]
  awcp run        --packet ID [--agent-type T] [--host H] [--working-dir D]
  awcp checkpoint --run ID --completed W --state S
                  [--blockers B] [--next N] [--commit SHA] [--no-commit]
  awcp decision   --packet ID --question Q [--rationale R] [--run ID] [--advisory]
  awcp end-run    --run ID [--status ended|failed]

Environment:
  AWCP_AGENT_API_KEY  bearer key for /api/workflow, preferred when set — grants
                      reporting/read routes only; the server refuses it on
                      resolve/evidence/criteria/complete with 403
  MEMORY_API_KEY      bearer key for /api/workflow, used when AWCP_AGENT_API_KEY
                      is unset — the operator key, grants every route
  AWCP_BASE_URL       server base URL (default http://127.0.0.1:3000)
  AWCP_TIMEOUT_MS     request timeout in milliseconds (default 30000)

--repo, --branch and --commit default to this checkout, read via fixed git commands.
--policy-scope has no default: it is a boundary value and must be stated.`;

async function main(): Promise<void> {
  const args = parseArgs(Deno.args);
  // `command` is `argv[0]`, and the flag-parsing loop below starts at `i = 1` — so
  // when `--help`/`-h` is the FIRST argument it is never classified into `bools` and
  // lands in `command` instead. Checked here explicitly so `awcp --help` prints usage
  // and exits 0 rather than falling through to the "unknown subcommand" branch.
  if (
    args.command === "" || args.bools.has("help") || args.command === "help" ||
    args.command === "--help" || args.command === "-h"
  ) {
    console.log(USAGE);
    return;
  }

  switch (args.command) {
    case "packet": {
      // policy-scope is REQUIRED with no fallback. The API would reject an absent one
      // with a 400, and defaulting here would hide that behind a value the operator
      // never chose — a boundary value inherited by accident is the failure the column
      // exists to prevent.
      const record = await post("/packets", {
        title: required(args, "title"),
        objective: required(args, "objective"),
        scope: args.flags.get("scope"),
        constraints: args.flags.get("constraints"),
        repository: args.flags.get("repo") ?? await git("repoRoot"),
        branch: args.flags.get("branch") ?? await git("branch"),
        policyScope: required(args, "policy-scope"),
      }) as Record<string, unknown>;
      emit("packet", record);
      return;
    }

    case "run": {
      const record = await post(
        `/packets/${encodeURIComponent(required(args, "packet"))}/runs`,
        {
          agentType: args.flags.get("agent-type") ?? "local-cli",
          host: args.flags.get("host") ?? defaultHost(),
          workingDir: args.flags.get("working-dir") ?? await git("repoRoot"),
          repository: args.flags.get("repo") ?? await git("repoRoot"),
          branch: args.flags.get("branch") ?? await git("branch"),
        },
      ) as Record<string, unknown>;
      emit("run", record);
      return;
    }

    case "checkpoint": {
      // The commit defaults to this checkout's HEAD, which is what makes a checkpoint
      // commit-bearing without the operator restating it. `--no-commit` is an explicit
      // opt-out rather than a magic empty string.
      const commit = args.bools.has("no-commit")
        ? null
        : args.flags.get("commit") ?? await git("head");
      const record = await post(
        `/runs/${encodeURIComponent(required(args, "run"))}/checkpoints`,
        {
          completedWork: required(args, "completed"),
          currentState: required(args, "state"),
          blockers: args.flags.get("blockers"),
          nextAction: args.flags.get("next"),
          repoCommit: commit,
        },
      ) as Record<string, unknown>;
      emit("checkpoint", record);
      return;
    }

    case "decision": {
      const record = await post(
        `/packets/${encodeURIComponent(required(args, "packet"))}/decisions`,
        {
          question: required(args, "question"),
          rationale: args.flags.get("rationale"),
          runId: args.flags.get("run"),
          // Blocking is the default; `--advisory` is the way to say otherwise. That
          // matches the store's default and keeps the noisier choice the automatic one.
          blocking: !args.bools.has("advisory"),
        },
      ) as Record<string, unknown>;
      emit("decision", record);
      return;
    }

    case "end-run": {
      const status = args.flags.get("status") ?? "ended";
      if (status !== "ended" && status !== "failed") {
        die("--status must be ended or failed");
      }
      const record = await post(
        `/runs/${encodeURIComponent(required(args, "run"))}/end`,
        {
          status,
        },
      ) as Record<
        string,
        unknown
      >;
      emit("run", record);
      return;
    }

    default:
      die(
        `unknown subcommand ${JSON.stringify(args.command)} — try: awcp help`,
      );
  }
}

// Resolving a decision, attaching evidence, authoring a criterion and completing a
// packet are deliberately NOT here. They are supervision actions belonging to the
// operator at the dashboard, not to the agent-side reporter, and the CLI is the
// agent's voice.
//
// That used to be enforced only by this CLI choosing not to expose those four
// subcommands — which meant it was not actually enforced at all: every route sat
// behind the one MEMORY_API_KEY the docs told an agent to export, so any caller
// holding that key could reach them directly over HTTP regardless of what this
// script does. The server now enforces the split itself: `server/src/workflow/
// policy.ts`'s `requiresOperator`, applied by the composition root's
// /api/workflow middleware in server/index.ts, refuses an AWCP_AGENT_API_KEY on
// exactly those four routes with 403, whether the request comes from this CLI,
// a different client, or a raw curl. Omitting the subcommands here keeps this
// CLI honest about which key it needs; it is no longer what does the enforcing.

await main();
