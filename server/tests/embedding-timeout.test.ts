import { assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getEmbedding } from "../src/embeddings.ts";

// ---------------------------------------------------------------------------
// Helpers to stub globalThis.fetch within a test scope.
// ---------------------------------------------------------------------------

type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function stubFetch(impl: FetchStub): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof globalThis.fetch;
  return () => { globalThis.fetch = original; };
}

const STUB_VECTOR = Array.from({ length: 512 }, (_, i) => i * 0.001);

function makeFetchSuccess(): FetchStub {
  return (_input, _init) =>
    Promise.resolve(
      new Response(
        JSON.stringify({ data: [{ embedding: STUB_VECTOR }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
}

function makeFetchHang(): FetchStub {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = (init as RequestInit | undefined)?.signal as AbortSignal | undefined;
      if (signal?.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError"))
      );
    });
}

function makeFetchError(status: number): FetchStub {
  return (_input, _init) =>
    Promise.resolve(new Response("bad gateway", { status }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test({
  name: "U1 happy path: valid embedding response returns vector",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const restore = stubFetch(makeFetchSuccess());
    try {
      const result = await getEmbedding("test query");
      assertEquals(result.length, 512);
      assertEquals(result[0], STUB_VECTOR[0]);
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "U1 timeout path: hanging fetch aborts within EMBEDDING_TIMEOUT_MS",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const restore = stubFetch(makeFetchHang());
    try {
      // Use a very short timeout to make the test fast
      const start = Date.now();
      await assertRejects(
        () => getEmbedding("test query", { timeoutMs: 150 }),
        Error,
      );
      const elapsed = Date.now() - start;
      // Should abort well within 1s (we set 150ms timeout)
      assertEquals(elapsed < 1000, true, `Expected abort within 1s, took ${elapsed}ms`);
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "U1 timeout error: thrown error identifies timeout cause",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const restore = stubFetch(makeFetchHang());
    try {
      let caughtErr: Error | undefined;
      try {
        await getEmbedding("test query", { timeoutMs: 100 });
      } catch (e) {
        caughtErr = e as Error;
      }
      assertStringIncludes((caughtErr?.message ?? "").toLowerCase(), "timeout");
    } finally {
      restore();
    }
  },
});

Deno.test({
  name: "U1 provider error: non-2xx response throws descriptive error",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const restore = stubFetch(makeFetchError(502));
    try {
      await assertRejects(
        () => getEmbedding("test query"),
        Error,
        "502",
      );
    } finally {
      restore();
    }
  },
});
