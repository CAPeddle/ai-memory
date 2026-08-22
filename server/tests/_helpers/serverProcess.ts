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
 * This is the negative control for "no model-provider requests were made" — but only
 * for provider calls that honour `OPENROUTER_BASE_URL`. Pointing that env var at this
 * sentinel means any call built from it lands here and is counted, as opposed to
 * asserting the absence of something nothing was watching for, which is the shape of a
 * check that cannot fail. It is NOT a control on every provider path:
 * `server/src/entityWorker.ts` and `server/src/consolidationLLM.ts` hardcode
 * `https://openrouter.ai/api/v1/...` and never read `OPENROUTER_BASE_URL`, so calls
 * from those two files are structurally invisible to this sentinel regardless of hit
 * count (making them configurable is separate, ST-085-scoped work).
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
  /** The port the kernel actually gave this child, parsed from its own stdout. */
  port: number;
  /** Everything the process wrote to stdout and stderr, joined. */
  output(): string;
  stop(): Promise<void>;
}

/**
 * Deno.serve's own startup line, e.g. `Listening on http://127.0.0.1:41337/`.
 * Anchored on the scheme and host so a stray occurrence of the words in some other
 * log line cannot be mistaken for a bound port.
 */
const LISTENING_LINE = /Listening on https?:\/\/[^\s:]+:(\d+)\//;

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
): Promise<ServerProcess> {
  const entry = new URL("../../index.ts", import.meta.url).pathname;
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-net", "--allow-env", "--allow-read", entry],
    // ST-092 R7: PORT=0 asks the kernel for a free port. Which one it picked is
    // read back out of the child's own startup line below.
    env: { ...env, PORT: "0" },
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

  let exited = false;
  const status = child.status.then((s) => {
    exited = true;
    return s;
  });

  // Surface the child's own output and make sure the process is actually gone before
  // reporting a boot failure. Without this a boot failure reads as a bare timeout and
  // the actual FATAL line — which the child already printed — is lost.
  const failBoot = async (reason: string): Promise<never> => {
    if (!exited) {
      // The child may have exited between our last check and here — killing an
      // already-dead process throws (Deno.errors.NotFound-ish), and that throw must
      // not replace the real boot-failure error below.
      try {
        child.kill("SIGKILL");
      } catch { /* already gone */ }
    }
    await status.catch(() => {});
    await draining.catch(() => {});
    throw new Error(`${reason}. Output:\n${chunks.join("")}`);
  };

  const deadline = Date.now() + BOOT_TIMEOUT_MS;

  // `/health` is unauthenticated and answers 200 UNCONDITIONALLY (see
  // server/src/auth.ts / index.ts), so a bare `/health` 200 is not proof that this
  // fetch reached the child we just spawned — it is only proof that *something* is
  // listening. `exited` cannot substitute for that proof either: it only flips once
  // the `child.status` promise resolves, which happens strictly AFTER the first
  // `fetch` below would already be in flight, so a competing listener could answer a
  // poll before `exited` had any chance to become true — and this helper would hand
  // back a "healthy" handle pointing at the wrong process entirely.
  //
  // Deno.serve prints "Listening on http://<host>:<port>/" to stdout the moment IT
  // binds successfully (server/index.ts's `Deno.serve({ port: PORT }, app.fetch)`
  // passes no custom `onListen`, so this is Deno's own default log line — verified by
  // running a bare `Deno.serve` under this exact Deno image). That line is specific to
  // THIS child's stdout, which nothing else can write to, so it is the one signal
  // available here that actually discriminates "this process bound the port" from
  // "the port answers". Do NOT simplify this back to a bare health poll.
  //
  // **ST-092 R7 — that line is now the source of the port as well as the proof of
  // binding, and the change makes it stronger rather than weaker.** Until this story
  // the helper was handed a fixed well-known port (3142/3143/3144/3145/3146/3160),
  // and the hazard the paragraph above describes was live rather than theoretical:
  // two suites had in fact each been assigned 3144. Under `PORT=0` the kernel hands
  // out a free port and prints it here, so a stale process holding "the" port cannot
  // occur at all — the collision class is gone rather than caught. What remains is
  // the same discrimination argument, now doing double duty: the only way to learn
  // where this child is listening is to read what this child said.
  let bound = false;
  let boundPort = 0;
  while (Date.now() < deadline && !exited) {
    const match = LISTENING_LINE.exec(chunks.join(""));
    if (match) {
      boundPort = Number(match[1]);
      bound = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  if (exited) {
    await failBoot("server process exited before it reported binding a port");
  }
  if (!bound) {
    await failBoot(
      "server process never reported binding a port within the timeout",
    );
  }
  if (!Number.isInteger(boundPort) || boundPort <= 0) {
    await failBoot(
      `server process reported a listening line with no usable port (${boundPort})`,
    );
  }

  const baseUrl = `http://127.0.0.1:${boundPort}`;

  // Only now, having proven THIS process bound the port, use /health as a readiness
  // confirmation (the port being bound does not yet mean the handler is serving).
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
      // Not accepting connections yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!healthy) {
    await failBoot("server process did not become healthy");
  }

  return {
    baseUrl,
    port: boundPort,
    output: () => chunks.join(""),
    stop: async () => {
      if (!exited) {
        // The child may have exited between the check above and here (e.g. it
        // crashed on its own right after this line was scheduled) — an unguarded
        // kill on an already-dead process throws, and stop() must not throw for that
        // reason.
        try {
          child.kill("SIGTERM");
        } catch { /* already gone */ }
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
