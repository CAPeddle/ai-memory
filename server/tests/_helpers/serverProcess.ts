/**
 * ST-086 — helpers for driving a REAL server process from a test.
 *
 * Route-function tests and source scans cannot answer the questions this story asks:
 * whether the composition root actually applies workflow migrations at boot, whether
 * the process starts without a provider credential, and whether operational state
 * survives a restart. Each of those is a property of a process, so a process is what
 * the test has to start.
 */

/** A recorded inbound request to the provider sentinel. */
export interface SentinelHit {
  method: string;
  path: string;
  authorization: string | null;
}

export interface ProviderSentinel {
  /** Base URL to hand the server as OPENROUTER_BASE_URL. */
  baseUrl: string;
  /** Every request the sentinel received, in order. */
  hits: SentinelHit[];
  close(): Promise<void>;
}

/**
 * A stand-in for the model provider that records rather than answers.
 *
 * This is the negative control for "no model-provider requests were made". Pointing
 * `OPENROUTER_BASE_URL` at it means any provider call the server makes lands here and
 * is counted — as opposed to asserting the absence of something nothing was watching
 * for, which is the shape of a check that cannot fail.
 *
 * It answers 200 with a plausible `/models` body deliberately. A sentinel that
 * returned an error would make "zero hits" and "provider unreachable" produce the same
 * downstream symptom, and the test could no longer tell which one it had proven.
 */
export async function startProviderSentinel(): Promise<ProviderSentinel> {
  const hits: SentinelHit[] = [];
  const ac = new AbortController();
  let resolvePort: (p: number) => void;
  const portReady = new Promise<number>((r) => {
    resolvePort = r;
  });

  const server = Deno.serve({
    port: 0,
    hostname: "127.0.0.1",
    signal: ac.signal,
    onListen: ({ port }) => resolvePort(port),
  }, (req) => {
    const url = new URL(req.url);
    hits.push({
      method: req.method,
      path: url.pathname,
      authorization: req.headers.get("Authorization"),
    });
    return new Response(JSON.stringify({ data: [{ id: "sentinel/model" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const port = await portReady;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    hits,
    close: async () => {
      ac.abort();
      await server.finished.catch(() => {});
    },
  };
}

export interface ServerProcess {
  baseUrl: string;
  /** Everything the process wrote to stdout and stderr, joined. */
  output(): string;
  stop(): Promise<void>;
}

const BOOT_TIMEOUT_MS = 60_000;

/**
 * Start `server/index.ts` as a real child process and wait for it to serve.
 *
 * **`clearEnv: true` is load-bearing, not tidiness.** The test container sets
 * `OPENROUTER_API_KEY` (docker-compose.yml), and `Deno.Command` inherits the parent
 * environment by default. Without `clearEnv` a child launched to prove "starts with no
 * provider credential" would quietly receive one from its parent, and the assertion
 * would pass having tested nothing. Every variable the child gets is listed by the
 * caller, so the absence of a variable in that list is a fact about the child.
 */
export async function startServerProcess(
  env: Record<string, string>,
  port: number,
): Promise<ServerProcess> {
  const entry = new URL("../../index.ts", import.meta.url).pathname;
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-net", "--allow-env", "--allow-read", entry],
    env: { ...env, PORT: String(port) },
    clearEnv: true,
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  // Drain both streams continuously. A child whose pipes fill up blocks on write, so
  // a server that logs enough during boot would hang forever waiting to be read.
  const chunks: string[] = [];
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) chunks.push(decoder.decode(chunk));
  };
  const draining = Promise.all([drain(child.stdout), drain(child.stderr)]);

  const baseUrl = `http://127.0.0.1:${port}`;
  let exited = false;
  const status = child.status.then((s) => {
    exited = true;
    return s;
  });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  let healthy = false;
  while (Date.now() < deadline && !exited) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      await res.body?.cancel();
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!healthy) {
    // Surface the child's own output. Without this a boot failure reads as a bare
    // timeout and the actual FATAL line — which the child already printed — is lost.
    child.kill("SIGKILL");
    await status.catch(() => {});
    await draining.catch(() => {});
    throw new Error(
      `server process did not become healthy on port ${port}. Output:\n${chunks.join("")}`,
    );
  }

  return {
    baseUrl,
    output: () => chunks.join(""),
    stop: async () => {
      if (!exited) {
        child.kill("SIGTERM");
        // SIGTERM is enough for Deno.serve; escalate only if the child ignores it.
        const escalate = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch { /* already gone */ }
        }, 5_000);
        await status.catch(() => {});
        clearTimeout(escalate);
      }
      await draining.catch(() => {});
    },
  };
}

/** Convenience wrapper: authenticated JSON call against a running server process. */
export async function apiCall(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}
