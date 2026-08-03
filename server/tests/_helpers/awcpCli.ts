/**
 * ST-087 — helpers for driving the REAL `awcp` CLI from a test.
 *
 * `server/scripts/awcp.ts` runs `main()` at module top level and `die()` calls
 * `Deno.exit(2)`, so it cannot be imported and unit-tested without restructuring the
 * shipped script. That restructuring was declined: the process boundary is where the
 * things worth asserting live — exit codes, stderr wording, the permission set, and
 * whether `git` was actually consulted. An in-process test would cover none of them.
 *
 * Requires the parent test process to hold `--allow-run=deno` (this file spawns
 * `Deno.execPath()`) and `--allow-read` (it reads the CLI's shebang). Tests that build
 * a throwaway repository additionally need `--allow-run=git` and `--allow-write=/tmp`.
 */

/** The shipped CLI, resolved relative to this helper rather than to any caller's cwd. */
export const CLI_PATH = new URL("../../scripts/awcp.ts", import.meta.url).pathname;

/**
 * The permission flags the CLI ships with, read from its own shebang line.
 *
 * `deno run <flags> script.ts` ignores the shebang, so a test that hardcoded its own
 * flag list would drift from the grant the script actually ships with — and would drift
 * in the dangerous direction, a test passing under looser permissions than production
 * gets. Reading the shebang means the two cannot disagree: narrow the shipped grant and
 * this test narrows with it.
 *
 * Throws rather than falling back to a default list. A silent fallback is exactly the
 * failure this function exists to prevent.
 */
export function cliGrants(scriptPath: string = CLI_PATH): string[] {
  const [firstLine] = Deno.readTextFileSync(scriptPath).split("\n", 1);
  if (!firstLine.startsWith("#!")) {
    throw new Error(
      `${scriptPath} does not start with a shebang, so its permission grants cannot ` +
        `be read; refusing to guess them. First line: ${JSON.stringify(firstLine)}`,
    );
  }
  const grants = firstLine.split(/\s+/).filter((token) => token.startsWith("--allow"));
  if (grants.length === 0) {
    throw new Error(
      `the shebang of ${scriptPath} declares no --allow-* grants; refusing to guess ` +
        `them. Shebang: ${JSON.stringify(firstLine)}`,
    );
  }
  return grants;
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunAwcpOptions {
  /** Variables the child receives. Nothing else reaches it — see clearEnv below. */
  env?: Record<string, string>;
  /** Working directory for the child, which is what its `git` calls resolve against. */
  cwd?: string;
}

/**
 * Run the CLI as a child process and collect its exit code, stdout and stderr.
 *
 * **`clearEnv: true` is load-bearing.** The test container sets `MEMORY_API_KEY`, and
 * `Deno.Command` inherits the parent environment by default — a credential test that
 * passed only `AWCP_AGENT_API_KEY` would quietly receive the operator key too and prove
 * nothing. Every variable the child gets is listed here, so a variable's absence is a
 * fact about the child rather than a hope about the parent.
 *
 * **`PATH` is supplied deliberately, not incidentally.** `Deno.Command("git", ...)`
 * inside the CLI resolves a bare binary name through `PATH`; under `clearEnv` there is
 * no `PATH`, the spawn fails, and `git()` returns null on the catch. Every git-derived
 * default would then take its degradation branch and every assertion about them would
 * pass while testing nothing. Tests that WANT that branch should point `cwd` outside a
 * repository instead, which exercises the real non-zero-exit path.
 */
export async function runAwcp(
  args: string[],
  opts: RunAwcpOptions = {},
): Promise<CliResult> {
  const env: Record<string, string> = {
    PATH: Deno.env.get("PATH") ?? "/usr/local/bin:/usr/bin:/bin",
    ...opts.env,
  };

  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", ...cliGrants(), CLI_PATH, ...args],
    env,
    clearEnv: true,
    cwd: opts.cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();

  const decoder = new TextDecoder();
  return {
    code,
    stdout: decoder.decode(stdout),
    stderr: decoder.decode(stderr),
  };
}

export interface EmittedRecord {
  label: string;
  id: string;
  record: Record<string, unknown>;
}

/**
 * Parse the `emit()` output shape: a `<label> <id>` line, then the record as JSON.
 *
 * Tests use the returned id to locate the row in Postgres. That link is what turns
 * "a row exists" into "the CLI created this row" — without it a test could pass against
 * a row some earlier test left behind.
 */
export function emitted(stdout: string): EmittedRecord {
  const newline = stdout.indexOf("\n");
  if (newline === -1) {
    throw new Error(`CLI stdout has no record body: ${JSON.stringify(stdout)}`);
  }
  const [label, id] = stdout.slice(0, newline).split(" ");
  if (!label || !id) {
    throw new Error(
      `CLI stdout's first line is not "<label> <id>": ${JSON.stringify(stdout.slice(0, newline))}`,
    );
  }
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(stdout.slice(newline + 1));
  } catch (err) {
    throw new Error(
      `CLI stdout after the header line is not JSON (${(err as Error).message}): ` +
        JSON.stringify(stdout.slice(newline + 1, newline + 200)),
    );
  }
  return { label, id, record };
}

/** Identity for the throwaway repositories tests build. Git refuses to commit without one. */
const GIT_IDENTITY = [
  "-c",
  "user.name=ST-087 fixture",
  "-c",
  "user.email=st-087@example.invalid",
];

export interface ThrowawayRepo {
  /** Absolute path to the repository's working tree, as this process created it. */
  dir: string;
  /**
   * The working tree as `git rev-parse --show-toplevel` reports it.
   *
   * Separate from `dir` on purpose: git resolves symlinks in the path, so on a host
   * where the temp directory sits under one this differs from `dir`. Assertions about
   * the CLI's `--repo` default compare against this — git's answer against git's
   * answer — rather than against a path this process happens to hold.
   */
  root: string;
  /** The full SHA of the single commit this repository contains. */
  head: string;
  /** The branch that commit is on, as git actually named it. */
  branch: string;
  cleanup(): Promise<void>;
}

/**
 * Build a throwaway git repository in a temp directory with exactly one commit.
 *
 * The alternative — pointing the CLI at this checkout — would make the assertion depend
 * on the repository the test happens to run inside, which is not mounted into the test
 * container at all. Building one here is hermetic, behaves identically in CI, and still
 * proves the claim that matters: the CLI obtained a commit from git rather than being
 * handed one.
 *
 * `branch` is read back from git rather than assumed, because the default branch name
 * is a git configuration value and asserting a guess would make this fixture fragile
 * for reasons that have nothing to do with the CLI.
 */
export async function makeThrowawayRepo(): Promise<ThrowawayRepo> {
  const dir = await Deno.makeTempDir({ prefix: "awcp-cli-repo-" });

  const run = async (...args: string[]): Promise<string> => {
    const { code, stdout, stderr } = await new Deno.Command("git", {
      args,
      cwd: dir,
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (code !== 0) {
      throw new Error(
        `git ${args.join(" ")} failed (${code}) in ${dir}: ${new TextDecoder().decode(stderr)}`,
      );
    }
    return new TextDecoder().decode(stdout).trim();
  };

  await run("init", "--quiet");
  await Deno.writeTextFile(`${dir}/README.md`, "ST-087 fixture repository.\n");
  await run("add", "README.md");
  await run(...GIT_IDENTITY, "commit", "--quiet", "-m", "fixture commit");

  const head = await run("rev-parse", "HEAD");
  const branch = await run("branch", "--show-current");
  const root = await run("rev-parse", "--show-toplevel");

  return {
    dir,
    root,
    head,
    branch,
    cleanup: () => Deno.remove(dir, { recursive: true }),
  };
}
