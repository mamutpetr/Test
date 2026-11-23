import { logger } from "./logger";

export type ProviderErrorCode =
  | "timeout"
  | "network"
  | "unauthorized"
  | "rate_limited"
  | "bad_request"
  | "pair_unavailable"
  | "amount_out_of_range"
  | "upstream_error"
  | "invalid_response"
  | "not_configured"
  | "host_not_allowed";

export class ProviderError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly httpStatus?: number,
    public readonly details?: { minAmount?: string | null; maxAmount?: string | null },
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Structural check — `instanceof` is unreliable across bundler module copies. */
export function isProviderError(e: unknown): e is ProviderError {
  return !!e && typeof e === "object" && (e as { name?: unknown }).name === "ProviderError" && typeof (e as { code?: unknown }).code === "string" && typeof (e as { providerId?: unknown }).providerId === "string";
}

export interface JsonRequest {
  providerId: string;
  operation: string;
  url: string;
  /** SSRF guard: the request is refused unless the URL host is in this list. */
  allowedHosts: readonly string[];
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface CallObserver {
  (e: { providerId: string; operation: string; ok: boolean; durationMs: number; errorCode?: string; httpStatus?: number }): void;
}

let observer: CallObserver | null = null;
export function setProviderCallObserver(o: CallObserver | null) {
  observer = o;
}

function assertAllowed(providerId: string, url: string, allowed: readonly string[]) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ProviderError(providerId, "host_not_allowed", "Malformed provider URL");
  }
  if (u.protocol !== "https:" || !allowed.includes(u.hostname)) {
    throw new ProviderError(providerId, "host_not_allowed", `Host ${u.hostname} is not allowed for ${providerId}`);
  }
}

function classify(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "bad_request";
  return "upstream_error";
}

/** Server-side JSON request to a provider with timeout, host allowlist and safe logging. */
export async function requestJson<T = unknown>(req: JsonRequest): Promise<T> {
  assertAllowed(req.providerId, req.url, req.allowedHosts);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs);
  const f = req.fetchImpl ?? fetch;
  let status: number | undefined;
  try {
    const res = await f(req.url, {
      method: req.method ?? "GET",
      headers: { Accept: "application/json", ...(req.body ? { "Content-Type": "application/json" } : {}), ...req.headers },
      body: req.body,
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });
    status = res.status;
    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = undefined;
      }
    }
    if (!res.ok) {
      const msg =
        (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : text.slice(0, 200)) || `HTTP ${res.status}`;
      throw new ProviderError(req.providerId, classify(res.status), msg, res.status);
    }
    if (data === undefined) throw new ProviderError(req.providerId, "invalid_response", "Response is not JSON", res.status);
    observer?.({ providerId: req.providerId, operation: req.operation, ok: true, durationMs: Date.now() - started, httpStatus: status });
    return data as T;
  } catch (err) {
    const pe =
      isProviderError(err)
        ? err
        : (err as { name?: string })?.name === "AbortError"
          ? new ProviderError(req.providerId, "timeout", `Timed out after ${req.timeoutMs}ms`)
          : new ProviderError(req.providerId, "network", "Network error");
    observer?.({ providerId: req.providerId, operation: req.operation, ok: false, durationMs: Date.now() - started, errorCode: pe.code, httpStatus: pe.httpStatus });
    logger.warn("provider.request_failed", { providerId: req.providerId, operation: req.operation, code: pe.code, httpStatus: pe.httpStatus, url: req.url });
    throw pe;
  } finally {
    clearTimeout(timer);
  }
}
