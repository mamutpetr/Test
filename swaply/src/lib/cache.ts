import type { Redis as RedisClient } from "ioredis";
import { logger } from "./logger";

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic increment with TTL set on first increment. Returns the new value. */
  incr(key: string, ttlSeconds: number): Promise<number>;
}

export class MemoryCache implements Cache {
  private store = new Map<string, { v: string; exp: number }>();
  constructor(private maxEntries = 10_000) {}

  private live(key: string) {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.exp <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e;
  }
  async get<T>(key: string) {
    const e = this.live(key);
    return e ? (JSON.parse(e.v) as T) : null;
  }
  async set<T>(key: string, value: T, ttl: number) {
    if (this.store.size >= this.maxEntries) {
      const first = this.store.keys().next().value;
      if (first !== undefined) this.store.delete(first);
    }
    this.store.set(key, { v: JSON.stringify(value), exp: Date.now() + ttl * 1000 });
  }
  async del(key: string) {
    this.store.delete(key);
  }
  async incr(key: string, ttl: number) {
    const e = this.live(key);
    const n = e ? Number(JSON.parse(e.v)) + 1 : 1;
    this.store.set(key, { v: JSON.stringify(n), exp: e ? e.exp : Date.now() + ttl * 1000 });
    return n;
  }
}

class RedisCache implements Cache {
  constructor(private r: RedisClient) {}
  async get<T>(key: string) {
    const v = await this.r.get(key);
    return v ? (JSON.parse(v) as T) : null;
  }
  async set<T>(key: string, value: T, ttl: number) {
    await this.r.set(key, JSON.stringify(value), "EX", ttl);
  }
  async del(key: string) {
    await this.r.del(key);
  }
  async incr(key: string, ttl: number) {
    const res = await this.r.multi().incr(key).expire(key, ttl, "NX").exec();
    return Number(res?.[0]?.[1] ?? 1);
  }
}

/** Falls back to memory if Redis is unreachable, so search keeps working. */
class ResilientCache implements Cache {
  constructor(private primary: Cache, private fallback: Cache) {}
  private async run<T>(fn: (c: Cache) => Promise<T>): Promise<T> {
    try {
      return await fn(this.primary);
    } catch (err) {
      logger.warn("cache.primary_failed", { err: String(err) });
      return fn(this.fallback);
    }
  }
  get<T>(k: string) { return this.run((c) => c.get<T>(k)); }
  set<T>(k: string, v: T, t: number) { return this.run((c) => c.set(k, v, t)); }
  del(k: string) { return this.run((c) => c.del(k)); }
  incr(k: string, t: number) { return this.run((c) => c.incr(k, t)); }
}

const g = globalThis as unknown as { __swaplyCache?: Cache };

export function cache(): Cache {
  if (g.__swaplyCache) return g.__swaplyCache;
  const url = process.env.REDIS_URL;
  const memory = new MemoryCache();
  if (url && process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: Redis } = require("ioredis") as typeof import("ioredis");
    const client = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    client.on("error", (e) => logger.warn("redis.error", { err: String(e) }));
    g.__swaplyCache = new ResilientCache(new RedisCache(client), memory);
  } else {
    g.__swaplyCache = memory;
  }
  return g.__swaplyCache;
}

export function setCacheForTests(c: Cache) {
  g.__swaplyCache = c;
}
