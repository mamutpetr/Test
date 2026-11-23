import { MemoryCache, setCacheForTests } from "@/lib/cache";

export function freshCache() {
  setCacheForTests(new MemoryCache());
}

type Handler = (url: URL, init?: RequestInit) => { status?: number; body: unknown; delayMs?: number } | Promise<{ status?: number; body: unknown; delayMs?: number }>;

/** Minimal fetch mock honouring AbortSignal (for timeout tests). */
export function mockFetch(handler: Handler) {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({ url, init });
    const r = await handler(url, init);
    if (r.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, r.delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    }
    const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetch: f, calls };
}
