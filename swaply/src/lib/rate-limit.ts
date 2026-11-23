import { cache } from "./cache";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetSeconds: number;
}

/** Fixed-window limiter. `key` should already include the route name and client fingerprint. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const n = await cache().incr(`rl:${key}:${window}`, windowSeconds + 1);
  return { ok: n <= limit, remaining: Math.max(0, limit - n), resetSeconds: windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds) };
}
