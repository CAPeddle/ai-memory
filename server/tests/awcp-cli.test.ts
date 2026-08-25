/**
 * ST-087 — the `awcp` CLI, driven as the shipped artifact.
 *
 * `server/scripts/awcp.ts` reached production with zero automated coverage. A code
 * review found two real defects in it by reading alone — `--help` exited 2 instead of
 * printing usage, and path ids were interpolated into URLs unencoded — and neither was
 * caught by anything. This file is the thing that would have caught them.
 *
 * **Why a subprocess rather than an import.** The script runs `main()` at module top
 * level and `die()` calls `Deno.exit(2)`. Importing it would run the CLI; exercising an
 * error path would kill the test runner. More to the point, the properties worth
 * asserting here — exit codes, stderr wording, whether git was actually consulted, and
 * the permission set the script ships with — exist only at the process boundary.
 *
 * **Requires `--allow-run=deno,git`, `--allow-write=/tmp` and `--allow-read`.** The
 * `deno` grant spawns the server and the CLI; the `git` grant builds the throwaway
 * repository the commit-provenance test needs; the write grant is scoped to the temp
 * directory that repository lives in. See CLAUDE.md's test commands.
 *
 * **One server for the whole file.** Roughly fifteen CLI invocations each paying a full
 * server boot would dominate the suite's runtime. The cost is that no step may assume an
 * empty schema — each creates the packet or run it needs, and every assertion locates
 * its row by an id the CLI itself printed.
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import * as store from "../src/workflow/store.ts";
import * as workItemStore from "../src/workflow/workItemStore.ts";
import { startServerProcess } from "./_helpers/serverProcess.ts";
import {
  cliGrants,
  emitted,
  makeThrowawayRepo,
  runAwcp,
} from "./_helpers/awcpCli.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL")!;
const OPERATOR_KEY = Deno.env.get("MEMORY_API_KEY") ?? "test-key";
/** Distinct from the operator key — the server refuses to start when they match. */
const AGENT_KEY = `${OPERATOR_KEY}-st087-agent`;

function serverEnv(): Record<string, string> {
  return {
    DATABASE_URL,
    MEMORY_API_KEY: OPERATOR_KEY,
    AWCP_AGENT_API_KEY: AGENT_KEY,
    FEATURE_WORKFLOW: "true",
    FEATURE_ENTITY_WORKER: "false",
    FEATURE_CONSOLIDATION_WORKER: "false",
    FEATURE_EMBEDDING_BACKFILL: "false",
    MODEL_PROVIDER_ENABLED: "false",
  };
}

/**
 * The environment the CLI needs to reach the server under test, as the operator.
 *
 * ST-092 R7: the base URL comes from the running server's own handle rather than a
 * module-level port constant. This file used to hardcode 3144, which
 * `workflow-agent-key-e2e.test.ts` had also been assigned — the collision the
 * ephemeral-port change removes. `serverBaseUrl` is set once the child has reported
 * the port it actually bound.
 */
let serverBaseUrl = "";

function cliEnv(extra: Record<string, string> = {}): Record<string, string> {
  if (serverBaseUrl === "") {
    throw new Error(
      "cliEnv() was called before the server process reported its port — a CLI " +
        "pointed at an empty base URL would fail for a reason unrelated to its subject",
    );
  }
  return {
    AWCP_BASE_URL: serverBaseUrl,
    MEMORY_API_KEY: OPERATOR_KEY,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// ST-097 B7 — fixtures for `awcp status`
//
// The CLI has no subcommand that creates a WorkItem, binds a packet to one, or
// claims an observed session: all three are operator writes it deliberately does
// not expose. The fixture therefore builds them through the store, exactly as the
// read-model tests do, and the CLI is driven only over the read routes it does
// expose — which is the whole point of the subcommand under test.
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Observe a session into existence through `ingestRunEvents`, not through a
 * hand-written INSERT — a session that never travelled the node lane is not the
 * thing a claim claims.
 */
async function observeSession(): Promise<{ nodeId: string; sessionId: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const bearer = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

  const node = await store.upsertExecutionNode({
    bearerTokenHash: await sha256Hex(bearer),
    hostname: "b7-awcp-status.test",
    platform: "deno-test",
    allowEnrolment: true,
  });
  assert(node !== null, "enrolment must succeed for a fresh bearer");

  const sessionId = `b7-awcp-status-${crypto.randomUUID()}`;
  await store.ingestRunEvents(node.node_id, [{
    client_seq: 1,
    event_type: "session_start",
    payload: { session_id: sessionId, node_id: node.node_id, at: new Date().toISOString() },
  }]);
  return { nodeId: node.node_id, sessionId };
}

/**
 * One WorkItem with TWO packets carrying DIFFERENT policy scopes, plus one claimed
 * observed session.
 *
 * The two scopes are what make the per-packet-scope assertion non-vacuous: a
 * renderer that aggregated to a single WorkItem-level scope — by any rule — could
 * not print both.
 */
async function statusFixture() {
  // Unique, but deliberately NOT uuid-shaped: the by-provenance step asserts that no
  // argument it passes looks like a uuid, and a ref carrying one would defeat that.
  const sourceRef = `ST-097-b7-${crypto.randomUUID().replaceAll("-", "")}`;
  const item = await workItemStore.createWorkItem({
    sourceSystem: "story-board",
    sourceRef,
  });

  const corporate = await store.createPacket({
    title: "B7 probe (corporate)",
    objective: "prove the CLI keeps scope per packet",
    policyScope: "corporate",
  });
  const personal = await store.createPacket({
    title: "B7 probe (personal)",
    objective: "prove the CLI keeps scope per packet",
    policyScope: "personal",
  });
  await workItemStore.bindPacketToWorkItem(corporate.id, item.id);
  await workItemStore.bindPacketToWorkItem(personal.id, item.id);

  const observed = await observeSession();
  await workItemStore.claimSessionForWorkItem(item.id, observed.nodeId, observed.sessionId);

  return { item, sourceRef, corporate, personal, observed };
}

// ---------------------------------------------------------------------------
// Permission grants — no server needed
// ---------------------------------------------------------------------------

Deno.test("ST-087: the CLI's permission grants are read from the shipped shebang", async (t) => {
  await t.step("the grants match what the script declares", () => {
    // Asserted as a set rather than an exact list so reordering the shebang is not a
    // test failure, while adding or removing a grant is.
    assertEquals(
      [...cliGrants()].sort(),
      [
        "--allow-env",
        "--allow-net",
        "--allow-run=git",
        "--allow-sys=hostname",
      ],
      "the CLI's shebang grants changed — if that was deliberate, update this " +
        "assertion; if it was not, the script just gained or lost a permission",
    );
  });

  await t.step("a file with no shebang throws rather than defaulting", () => {
    // server/index.ts is a real file with no shebang. Using it rather than a fixture
    // keeps this test honest about what "no shebang" looks like in this repo.
    const noShebang = new URL("../index.ts", import.meta.url).pathname;
    assertThrows(
      () => cliGrants(noShebang),
      Error,
      "does not start with a shebang",
    );
  });
});

// ---------------------------------------------------------------------------
// Everything that needs a server
// ---------------------------------------------------------------------------

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name: "ST-087: the awcp CLI reports a real session through the HTTP API",
  fn: async (t) => {
    const server = await startServerProcess(serverEnv());
    serverBaseUrl = server.baseUrl;

    try {
      await t.step("the CLI prints its usage and exits 0", async () => {
        const help = await runAwcp(["help"], { env: cliEnv() });

        assertEquals(help.code, 0, `stderr: ${help.stderr}`);
        assertStringIncludes(help.stdout, "awcp packet");
        assertStringIncludes(help.stdout, "awcp checkpoint");
        assertStringIncludes(help.stdout, "AWCP_AGENT_API_KEY");
      });

      await t.step("a packet created by the CLI exists in the database", async () => {
        const result = await runAwcp([
          "packet",
          "--title",
          "ST-087 harness smoke",
          "--objective",
          "prove the CLI reaches the API and the row lands",
          "--policy-scope",
          "personal",
        ], { env: cliEnv() });

        assertEquals(result.code, 0, `stderr: ${result.stderr}`);
        const { label, id } = emitted(result.stdout);
        assertEquals(label, "packet");

        // The independent witness: a direct query, not the API that just wrote the row.
        const rows = await sql<{ title: string; policy_scope: string }[]>`
          SELECT title, policy_scope FROM workflow.work_packets WHERE id = ${id}
        `;
        assertEquals(rows.length, 1, `no workflow.work_packets row with id ${id}`);
        assertEquals(rows[0].title, "ST-087 harness smoke");
        assertEquals(rows[0].policy_scope, "personal");
      });

      // ------------------------------------------------------------------
      // U2 — every reporting subcommand, each row located by the id the CLI printed
      // ------------------------------------------------------------------

      await t.step("every reporting subcommand drives the API and lands its row", async () => {
        const packet = emitted(
          (await expectOk(["packet", "--title", "ST-087 full sequence", "--objective", "exercise every subcommand", "--policy-scope", "personal"])).stdout,
        );

        const run = emitted(
          (await expectOk(["run", "--packet", packet.id])).stdout,
        );
        const [runRow] = await sql<{ packet_id: string; agent_type: string; status: string }[]>`
          SELECT packet_id, agent_type, status FROM workflow.agent_runs WHERE id = ${run.id}
        `;
        assertEquals(runRow.packet_id, packet.id);
        // `local-cli` is the CLI's own default, not a value this test supplied — the
        // assertion is about the CLI's behaviour, not about the API echoing input.
        assertEquals(runRow.agent_type, "local-cli");
        assertEquals(runRow.status, "running");

        const checkpoint = emitted(
          (await expectOk([
            "checkpoint",
            "--run",
            run.id,
            "--completed",
            "wired the harness",
            "--state",
            "green",
            "--next",
            "cover the edges",
            "--no-commit",
          ])).stdout,
        );
        const [checkpointRow] = await sql<
          { run_id: string; completed_work: string; current_state: string; next_action: string }[]
        >`
          SELECT run_id, completed_work, current_state, next_action
          FROM workflow.checkpoints WHERE id = ${checkpoint.id}
        `;
        assertEquals(checkpointRow.run_id, run.id);
        assertEquals(checkpointRow.completed_work, "wired the harness");
        assertEquals(checkpointRow.current_state, "green");
        assertEquals(checkpointRow.next_action, "cover the edges");

        const blocking = emitted(
          (await expectOk(["decision", "--packet", packet.id, "--question", "ship or hold?", "--rationale", "because", "--run", run.id])).stdout,
        );
        const advisory = emitted(
          (await expectOk(["decision", "--packet", packet.id, "--question", "nice to have?", "--advisory"])).stdout,
        );
        const decisionRows = await sql<{ id: string; blocking: boolean; run_id: string | null }[]>`
          SELECT id, blocking, run_id FROM workflow.operational_decisions
          WHERE id IN (${blocking.id}, ${advisory.id})
        `;
        const byId = new Map(decisionRows.map((r) => [r.id, r]));
        // Blocking is the default and --advisory is the way to opt out. Asserting both
        // in one step is what makes the flag's effect visible rather than assumed.
        assertEquals(byId.get(blocking.id)?.blocking, true);
        assertEquals(byId.get(blocking.id)?.run_id, run.id);
        assertEquals(byId.get(advisory.id)?.blocking, false);

        await expectOk(["end-run", "--run", run.id]);
        const [ended] = await sql<{ status: string; ended_at: string | null }[]>`
          SELECT status, ended_at FROM workflow.agent_runs WHERE id = ${run.id}
        `;
        assertEquals(ended.status, "ended");
        assert(ended.ended_at !== null, "a run that ended should carry an ended_at");
      });

      await t.step("--status failed is distinct from the default, and a bad status never reaches the API", async () => {
        const packet = emitted((await expectOk(["packet", "--title", "ST-087 failed run", "--objective", "end a run as failed", "--policy-scope", "personal"])).stdout);
        const run = emitted((await expectOk(["run", "--packet", packet.id])).stdout);

        await expectOk(["end-run", "--run", run.id, "--status", "failed"]);
        const [failed] = await sql<{ status: string }[]>`
          SELECT status FROM workflow.agent_runs WHERE id = ${run.id}
        `;
        assertEquals(failed.status, "failed");

        // Rejected by the CLI's own vocabulary check before any request is built.
        const bogus = await runAwcp(["end-run", "--run", run.id, "--status", "bogus"], { env: cliEnv() });
        assertEquals(bogus.code, 2);
        assertStringIncludes(bogus.stderr, "--status must be ended or failed");
      });

      await t.step("the agent credential alone drives the reporting subcommands", async () => {
        // No MEMORY_API_KEY in this environment at all. Combined with clearEnv, the
        // operator key is absent as a fact about the child rather than a hope.
        const agentEnv = {
          AWCP_BASE_URL: serverBaseUrl,
          AWCP_AGENT_API_KEY: AGENT_KEY,
        };

        const packet = await runAwcp([
          "packet",
          "--title",
          "ST-087 agent credential",
          "--objective",
          "reporting routes accept the narrower key",
          "--policy-scope",
          "personal",
        ], { env: agentEnv });
        assertEquals(packet.code, 0, `stderr: ${packet.stderr}`);

        const run = await runAwcp(["run", "--packet", emitted(packet.stdout).id], { env: agentEnv });
        assertEquals(run.code, 0, `stderr: ${run.stderr}`);

        const checkpoint = await runAwcp([
          "checkpoint",
          "--run",
          emitted(run.stdout).id,
          "--completed",
          "reported under the agent key",
          "--state",
          "green",
          "--no-commit",
        ], { env: agentEnv });
        assertEquals(checkpoint.code, 0, `stderr: ${checkpoint.stderr}`);

        const [row] = await sql<{ completed_work: string }[]>`
          SELECT completed_work FROM workflow.checkpoints WHERE id = ${emitted(checkpoint.stdout).id}
        `;
        assertEquals(row.completed_work, "reported under the agent key");
      });

      // ------------------------------------------------------------------
      // U3 — ST-086's criterion 5, on evidence this time
      // ------------------------------------------------------------------

      await t.step("a checkpoint's commit is obtained by the CLI, not supplied to it", async () => {
        const repo = await makeThrowawayRepo();
        try {
          const packet = emitted((await expectOk([
            "packet",
            "--title",
            "ST-087 commit provenance",
            "--objective",
            "prove the CLI reads git itself",
            "--policy-scope",
            "personal",
          ], repo.dir)).stdout);

          // The packet's repository and branch defaults come from git too.
          const [packetRow] = await sql<{ repository: string | null; branch: string | null }[]>`
            SELECT repository, branch FROM workflow.work_packets WHERE id = ${packet.id}
          `;
          assertEquals(packetRow.repository, repo.root);
          assertEquals(packetRow.branch, repo.branch);

          const run = emitted((await expectOk(["run", "--packet", packet.id], repo.dir)).stdout);

          // No --commit anywhere in this argv. That absence is the whole point: it is
          // what makes the stored value the CLI's work rather than this test's.
          const argv = [
            "checkpoint",
            "--run",
            run.id,
            "--completed",
            "obtained a commit without being told one",
            "--state",
            "green",
          ];
          assert(
            !argv.includes("--commit") && !argv.includes("--no-commit"),
            "this test is only meaningful when the CLI is given no commit",
          );
          const checkpoint = emitted((await expectOk(argv, repo.dir)).stdout);

          const [row] = await sql<{ repo_commit: string | null }[]>`
            SELECT repo_commit FROM workflow.checkpoints WHERE id = ${checkpoint.id}
          `;
          assertEquals(
            row.repo_commit,
            repo.head,
            "the checkpoint's commit does not match the repository's HEAD — the CLI " +
              "did not read git, or read a different repository",
          );
        } finally {
          await repo.cleanup();
        }
      });

      await t.step("--commit overrides the git-derived default", async () => {
        const repo = await makeThrowawayRepo();
        const explicit = "0123456789abcdef0123456789abcdef01234567";
        try {
          const packet = emitted((await expectOk(["packet", "--title", "ST-087 explicit commit", "--objective", "flag beats default", "--policy-scope", "personal"], repo.dir)).stdout);
          const run = emitted((await expectOk(["run", "--packet", packet.id], repo.dir)).stdout);
          const checkpoint = emitted((await expectOk([
            "checkpoint",
            "--run",
            run.id,
            "--completed",
            "explicit commit",
            "--state",
            "green",
            "--commit",
            explicit,
          ], repo.dir)).stdout);

          const [row] = await sql<{ repo_commit: string | null }[]>`
            SELECT repo_commit FROM workflow.checkpoints WHERE id = ${checkpoint.id}
          `;
          assertEquals(row.repo_commit, explicit);
          assert(
            row.repo_commit !== repo.head,
            "the explicit commit happens to equal HEAD, so this test cannot tell the " +
              "flag from the default — pick a different constant",
          );
        } finally {
          await repo.cleanup();
        }
      });

      // ------------------------------------------------------------------
      // U4 — argument parsing at its edges
      // ------------------------------------------------------------------

      await t.step("every help path exits 0 and prints usage", async () => {
        // `--help` and `-h` land in `command`, not `bools`, because the flag loop
        // starts at argv[1]. That asymmetry is why this regressed once: `--help`
        // used to fall through to the unknown-subcommand branch and exit 2.
        for (const argv of [["help"], ["--help"], ["-h"], []]) {
          const result = await runAwcp(argv, { env: cliEnv() });
          const shown = argv.length === 0 ? "(no arguments)" : argv.join(" ");
          assertEquals(result.code, 0, `awcp ${shown} exited ${result.code}: ${result.stderr}`);
          assertStringIncludes(result.stdout, "awcp — report a local development session");
        }
      });

      await t.step("usage errors exit 2 and name what was wrong", async () => {
        const cases: { argv: string[]; expect: string }[] = [
          {
            argv: ["packet", "--objective", "O", "--policy-scope", "personal"],
            expect: "--title is required",
          },
          {
            argv: ["packet", "--title"],
            expect: "--title requires a value",
          },
          {
            // policy-scope is a boundary value with no default by design; omitting it
            // must fail rather than inherit something the operator never chose.
            argv: ["packet", "--title", "T", "--objective", "O"],
            expect: "--policy-scope is required",
          },
          {
            argv: ["frobnicate", "--title", "T"],
            expect: "unknown subcommand",
          },
          {
            argv: ["packet", "positional"],
            expect: "unexpected argument",
          },
        ];

        for (const { argv, expect } of cases) {
          const result = await runAwcp(argv, { env: cliEnv() });
          assertEquals(result.code, 2, `awcp ${argv.join(" ")} exited ${result.code}`);
          assertStringIncludes(result.stderr, expect);
        }
      });

      await t.step("a path id is encoded rather than interpolated into the URL", async () => {
        // The second defect the review found by reading. Without encodeURIComponent an
        // id like this changes which route is addressed; with it, the id reaches the
        // server intact and is rejected as a malformed uuid — which is the tell.
        const result = await runAwcp([
          "checkpoint",
          "--run",
          "../../packets",
          "--completed",
          "W",
          "--state",
          "S",
          "--no-commit",
        ], { env: cliEnv() });

        assertEquals(result.code, 2);
        assertStringIncludes(result.stderr, "400");
        assertStringIncludes(
          result.stderr,
          "runId must be a uuid",
          "the traversal-shaped id did not reach the runId parameter — it was " +
            "interpolated into the path instead of being encoded",
        );
      });

      // ------------------------------------------------------------------
      // U5 — degradation and the two failure messages
      // ------------------------------------------------------------------

      await t.step("git-derived defaults degrade to null outside a repository", async () => {
        // Both halves run in the same invocation conditions, differing only in cwd.
        // Without the positive half this step would pass just as happily if git were
        // unreachable altogether — proving "null" rather than "null *because* there is
        // no repository here". A red control confirmed that: removing PATH from the
        // child's environment leaves a lone negative assertion green.
        const notARepo = await Deno.makeTempDir({ prefix: "awcp-cli-bare-" });
        const repo = await makeThrowawayRepo();
        try {
          const outside = emitted((await expectOk([
            "packet",
            "--title",
            "ST-087 no repository",
            "--objective",
            "degrade rather than fail",
            "--policy-scope",
            "personal",
          ], notARepo)).stdout);

          const inside = emitted((await expectOk([
            "packet",
            "--title",
            "ST-087 inside a repository",
            "--objective",
            "the positive control for the line above",
            "--policy-scope",
            "personal",
          ], repo.dir)).stdout);

          const rows = await sql<{ id: string; repository: string | null; branch: string | null }[]>`
            SELECT id, repository, branch FROM workflow.work_packets
            WHERE id IN (${outside.id}, ${inside.id})
          `;
          const byId = new Map(rows.map((r) => [r.id, r]));

          assertEquals(byId.get(outside.id)?.repository, null);
          assertEquals(byId.get(outside.id)?.branch, null);
          assertEquals(byId.get(inside.id)?.repository, repo.root);
          assertEquals(byId.get(inside.id)?.branch, repo.branch);
        } finally {
          await repo.cleanup();
          await Deno.remove(notARepo, { recursive: true });
        }
      });

      await t.step("--no-commit stores a null commit while the rest of the checkpoint lands", async () => {
        const repo = await makeThrowawayRepo();
        try {
          const packet = emitted((await expectOk(["packet", "--title", "ST-087 no commit", "--objective", "opt out explicitly", "--policy-scope", "personal"], repo.dir)).stdout);
          const run = emitted((await expectOk(["run", "--packet", packet.id], repo.dir)).stdout);
          const checkpoint = emitted((await expectOk([
            "checkpoint",
            "--run",
            run.id,
            "--completed",
            "opted out of the commit",
            "--state",
            "green",
            "--no-commit",
          ], repo.dir)).stdout);

          const [row] = await sql<{ repo_commit: string | null; completed_work: string }[]>`
            SELECT repo_commit, completed_work FROM workflow.checkpoints WHERE id = ${checkpoint.id}
          `;
          // Run from inside a real repository, so a null here is the flag's doing and
          // not an absent git — which is what makes --no-commit distinguishable.
          assertEquals(row.repo_commit, null);
          assertEquals(row.completed_work, "opted out of the commit");
        } finally {
          await repo.cleanup();
        }
      });

      // ------------------------------------------------------------------
      // U6 — a validation failure has to tell its caller which field was wrong
      // ------------------------------------------------------------------

      await t.step("a rejected field is named, not just 'failed validation'", async () => {
        // The CLI's primary caller is an agent. An agent that cannot see which field it
        // got wrong cannot correct itself; it can only retry blind. The API already
        // sends a per-field issues[] array — this asserts the CLI reads it.
        const result = await runAwcp([
          "packet",
          "--title",
          "ST-087 bad scope",
          "--objective",
          "out-of-vocabulary policy scope",
          "--policy-scope",
          "everyone",
        ], { env: cliEnv() });

        assertEquals(result.code, 2);
        assertStringIncludes(result.stderr, "400");
        assertStringIncludes(
          result.stderr,
          "policyScope",
          "the CLI reported a 400 without naming the field that caused it",
        );
      });

      await t.step("every offending field is named when a request fails on more than one", async () => {
        const packet = emitted((await expectOk(["packet", "--title", "ST-087 multi-issue", "--objective", "two bad fields at once", "--policy-scope", "personal"])).stdout);

        // Empty strings reach the API (the CLI's `required()` guard covers absent
        // values, not empty ones for optional flags), where both fail min(1).
        const result = await runAwcp([
          "run",
          "--packet",
          packet.id,
          "--agent-type",
          "",
          "--host",
          "",
        ], { env: cliEnv() });

        assertEquals(result.code, 2);
        assertStringIncludes(result.stderr, "agentType");
        assertStringIncludes(result.stderr, "host");
      });

      await t.step("a 400 that carries no issues array is still readable", async () => {
        // The malformed-id branch answers with message + received and no issues[].
        // Reading issues[] must not turn that into an empty or undefined fragment.
        const result = await runAwcp([
          "run",
          "--packet",
          "not-a-uuid",
        ], { env: cliEnv() });

        assertEquals(result.code, 2);
        assertStringIncludes(result.stderr, "packetId must be a uuid");
        assert(
          !result.stderr.includes("undefined") && !result.stderr.includes("[]"),
          `the no-issues branch produced a degraded message: ${result.stderr}`,
        );
      });

      await t.step("a timeout and an unreachable server produce different messages", async () => {
        const stall = new AbortController();
        let stallPort = 0;
        const stallReady = new Promise<number>((resolve) => {
          const server = Deno.serve({
            port: 0,
            hostname: "127.0.0.1",
            signal: stall.signal,
            onListen: ({ port }) => resolve(port),
            // Accept the connection and never answer. A server that closed instead
            // would produce the unreachable message and this test would prove nothing.
          }, () => new Promise<Response>(() => {}));
          void server.finished.catch(() => {});
        });
        stallPort = await stallReady;

        try {
          const timedOut = await runAwcp([
            "packet",
            "--title",
            "ST-087 timeout",
            "--objective",
            "never answered",
            "--policy-scope",
            "personal",
          ], {
            env: {
              AWCP_BASE_URL: `http://127.0.0.1:${stallPort}`,
              MEMORY_API_KEY: OPERATOR_KEY,
              AWCP_TIMEOUT_MS: "400",
            },
          });
          assertEquals(timedOut.code, 2);
          assertStringIncludes(timedOut.stderr, "timed out after 400ms");

          // The discrimination control. Nothing is listening here, so the CLI must say
          // something different — a test that accepted either message would not be
          // proving anything about the timeout path.
          const unreachable = await runAwcp([
            "packet",
            "--title",
            "ST-087 unreachable",
            "--objective",
            "nothing listening",
            "--policy-scope",
            "personal",
          ], {
            env: {
              AWCP_BASE_URL: "http://127.0.0.1:3199",
              MEMORY_API_KEY: OPERATOR_KEY,
            },
          });
          assertEquals(unreachable.code, 2);
          assertStringIncludes(unreachable.stderr, "could not reach");
          assert(
            !unreachable.stderr.includes("timed out"),
            `the unreachable case reported a timeout, so the two are indistinguishable: ${unreachable.stderr}`,
          );
        } finally {
          stall.abort();
        }
      });
      // ------------------------------------------------------------------
      // ST-097 B7 — `awcp status`, the SECONDARY read surface
      //
      // What is at stake here is not "the CLI can print": it is that the second
      // client of the WorkItem read model renders the same distinctions the web UI
      // renders, and synthesises nothing the projection does not hold. ADR-017 §6
      // says both clients consume the same read model and neither computes anything;
      // these steps are what makes that checkable on the CLI side.
      // ------------------------------------------------------------------

      await t.step("ST-097 B7: status resolves a work item by provenance, holding no uuid", async () => {
        const fixture = await statusFixture();

        // The lookup names ST-097's provenance pair and NOTHING else. No uuid is
        // passed, which is the property B9 will depend on: an agent that knows only
        // the story it is working on can reach the item.
        const result = await runAwcp(
          ["status", "--source", "story-board", "--ref", fixture.sourceRef],
          { env: cliEnv() },
        );

        assertEquals(result.code, 0, `stderr: ${result.stderr}`);
        const passed = ["status", "--source", "story-board", "--ref", fixture.sourceRef];
        assert(
          !passed.some((arg) =>
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(arg)
          ),
          "the lookup passed a uuid, so it did not prove resolution by provenance",
        );
        assert(
          !passed.some((arg) => arg.includes(fixture.item.id)),
          "the lookup named the item's own id, so it did not resolve by provenance",
        );
        assertStringIncludes(result.stdout, fixture.item.id);
        assertStringIncludes(result.stdout, fixture.sourceRef);

        // Both packets, each carrying ITS OWN scope. A renderer that reduced the set
        // to one WorkItem-level scope could not print both.
        assertStringIncludes(result.stdout, fixture.corporate.id);
        assertStringIncludes(result.stdout, fixture.personal.id);
        assertStringIncludes(result.stdout, "scope: corporate");
        assertStringIncludes(result.stdout, "scope: personal");
      });

      await t.step("ST-097 B7: observed sessions are textually distinguishable from packets", async () => {
        const fixture = await statusFixture();
        const result = await runAwcp(
          ["status", "--source", "story-board", "--ref", fixture.sourceRef],
          { env: cliEnv() },
        );
        assertEquals(result.code, 0, `stderr: ${result.stderr}`);

        const lines = result.stdout.split("\n");
        const sessionLines = lines.filter((line) => line.includes(fixture.observed.sessionId));
        assertEquals(
          sessionLines.length,
          1,
          `the claimed session should render on exactly one line: ${result.stdout}`,
        );

        // The same words the dashboard puts on the page, so a human reading either
        // surface is told the same thing.
        assertStringIncludes(sessionLines[0], "observed - not supervised");
        assert(
          !sessionLines[0].includes("scope:"),
          `an observed session carries no policy scope, so its line must not print one: ${sessionLines[0]}`,
        );

        // And the discrimination in the other direction: a packet line never wears
        // the observed marker.
        const packetLines = lines.filter((line) => line.includes(fixture.corporate.id));
        assertEquals(packetLines.length, 1, `stdout: ${result.stdout}`);
        assert(
          !packetLines[0].includes("observed"),
          `a supervised packet must not read as an observation: ${packetLines[0]}`,
        );
        assertStringIncludes(packetLines[0], "scope: corporate");
      });

      await t.step("ST-097 B7: nothing in the output is an aggregate work-item status", async () => {
        const fixture = await statusFixture();
        const result = await runAwcp(
          ["status", "--source", "story-board", "--ref", fixture.sourceRef],
          { env: cliEnv() },
        );
        assertEquals(result.code, 0, `stderr: ${result.stderr}`);

        // The identity line carries identity and nothing else. Pinned as an exact
        // shape rather than sampled, because the failure this guards against is a
        // helpful summary word appended to it later.
        const identity = result.stdout.split("\n")
          .find((line) => line.startsWith("work-item "));
        assert(identity !== undefined, `no work-item line in: ${result.stdout}`);
        assertEquals(
          identity,
          `work-item ${fixture.item.id}  source: story-board  ref: ${fixture.sourceRef}  label: -`,
        );

        // Non-vacuous for this fixture: both packets are `open` and the session is
        // live, so no honest rendering can emit any of these.
        for (
          const banned of [
            "in_progress",
            "in progress",
            "blocked",
            "complete",
            "done",
            "stalled",
            "healthy",
            "attention",
          ]
        ) {
          assert(
            !result.stdout.toLowerCase().includes(banned),
            `"${banned}" is a status word this server does not hold: ${result.stdout}`,
          );
        }

        // Packet status renders VERBATIM, once per packet. `in_progress` and
        // `blocked` are declared but unwritable, so everything in flight reads
        // `open`; inferring a livelier word would manufacture a signal.
        assertEquals(
          result.stdout.split(/\bopen\b/).length - 1,
          2,
          `each of the two packets should print its own verbatim status: ${result.stdout}`,
        );
      });

      await t.step("ST-097 B7: the uuid lookup and the provenance lookup render identically", async () => {
        const fixture = await statusFixture();
        const byRef = await runAwcp(
          ["status", "--source", "story-board", "--ref", fixture.sourceRef],
          { env: cliEnv() },
        );
        const byId = await runAwcp(["status", "--work-item", fixture.item.id], {
          env: cliEnv(),
        });

        assertEquals(byId.code, 0, `stderr: ${byId.stderr}`);
        // One renderer over one read model: two ways in cannot disagree.
        assertEquals(byId.stdout, byRef.stdout);
      });

      await t.step("ST-097 B7: a '#'-prefixed github ref survives the query encoding", async () => {
        // KTD-B5 routed provenance lookup through query parameters precisely because
        // `#57` cannot travel in a path segment. Built with URLSearchParams rather
        // than concatenation, a naive `?ref=#57` truncates at the fragment and the
        // server sees an empty ref.
        const sourceRef = `#57-${crypto.randomUUID()}`;
        const item = await workItemStore.createWorkItem({
          sourceSystem: "github",
          sourceRef,
        });

        const result = await runAwcp(
          ["status", "--source", "github", "--ref", sourceRef],
          { env: cliEnv() },
        );
        assertEquals(result.code, 0, `stderr: ${result.stderr}`);
        assertStringIncludes(result.stdout, item.id);
        assertStringIncludes(result.stdout, sourceRef);
      });

      await t.step("ST-097 B7: the listing names every work item, and an absent one is a 404", async () => {
        const fixture = await statusFixture();

        const listing = await runAwcp(["status"], { env: cliEnv() });
        assertEquals(listing.code, 0, `stderr: ${listing.stderr}`);
        assertStringIncludes(listing.stdout, fixture.item.id);

        const missing = await runAwcp(
          ["status", "--source", "jira", "--ref", `PROJ-${crypto.randomUUID()}`],
          { env: cliEnv() },
        );
        assertEquals(missing.code, 2);
        assertStringIncludes(missing.stderr, "404");
      });

      await t.step("ST-097 B7: status handles credentials exactly as the reporting subcommands do", async () => {
        const fixture = await statusFixture();

        // No credential at all. Built directly rather than through cliEnv(), which
        // always supplies the operator key — an absent-key test written with it would
        // prove nothing.
        const absent = await runAwcp(
          ["status", "--source", "story-board", "--ref", fixture.sourceRef],
          { env: { AWCP_BASE_URL: serverBaseUrl } },
        );
        assertEquals(absent.code, 2);
        assertStringIncludes(
          absent.stderr,
          "neither AWCP_AGENT_API_KEY nor MEMORY_API_KEY is set",
        );

        // A wrong key fails the way a wrong key fails for `packet` — same status,
        // same shape — so the read route inherits the credential contract rather than
        // inventing one.
        const wrongEnv = { AWCP_BASE_URL: serverBaseUrl, MEMORY_API_KEY: "not-the-key" };
        const wrongRead = await runAwcp(
          ["status", "--source", "story-board", "--ref", fixture.sourceRef],
          { env: wrongEnv },
        );
        const wrongWrite = await runAwcp([
          "packet",
          "--title",
          "ST-097 B7 wrong key",
          "--objective",
          "the credential contract is the same on both",
          "--policy-scope",
          "personal",
        ], { env: wrongEnv });
        assertEquals(wrongRead.code, wrongWrite.code);
        assertStringIncludes(wrongRead.stderr, "401");
        assertStringIncludes(wrongWrite.stderr, "401");

        // And the narrower agent key reads it: KTD-B3 classifies the three
        // `/work-items` GETs agent-callable, matching /overview's posture.
        const agent = await runAwcp(
          ["status", "--source", "story-board", "--ref", fixture.sourceRef],
          { env: { AWCP_BASE_URL: serverBaseUrl, AWCP_AGENT_API_KEY: AGENT_KEY } },
        );
        assertEquals(agent.code, 0, `stderr: ${agent.stderr}`);
        assertStringIncludes(agent.stdout, fixture.item.id);
      });

      await t.step("ST-097 B7: usage documents the subcommand it now ships", async () => {
        const help = await runAwcp(["help"], { env: cliEnv() });
        assertEquals(help.code, 0, `stderr: ${help.stderr}`);
        assertStringIncludes(help.stdout, "awcp status");
        assertStringIncludes(help.stdout, "--source");
      });

    } finally {
      await server.stop();
    }

    /** Run the CLI expecting success, failing loudly with the child's own stderr. */
    async function expectOk(args: string[], cwd?: string) {
      const result = await runAwcp(args, { env: cliEnv(), cwd });
      assertEquals(
        result.code,
        0,
        `awcp ${args.join(" ")} exited ${result.code}: ${result.stderr}`,
      );
      return result;
    }
  },
});
