import { ASSETS } from "@/lib/catalog";
import { cache } from "@/lib/cache";
import { D, floorTo, toDecimal, type Dec } from "@/lib/money";
import { ProviderError } from "@/lib/http";
import type { ProviderInstrument } from "./types";

/** "10-60" → {10, 60}; "30" → {30, 30}; anything else → null. */
export function parseDurationRange(v: unknown): { minMinutes: number; maxMinutes: number } | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return { minMinutes: v, maxMinutes: v };
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  if (!(a > 0) || !(b >= a)) return null;
  return { minMinutes: a, maxMinutes: b };
}

export function receiveString(assetId: string, value: Dec): string {
  const precision = ASSETS[assetId]?.precision ?? 8;
  return floorTo(value, precision).toFixed();
}

export function rateOf(receive: Dec, send: Dec): string {
  return send.isZero() ? "0" : receive.div(send).toSignificantDigits(12, D.ROUND_DOWN).toFixed();
}

/** Requires a positive decimal or throws invalid_response — we never fill a missing receive amount. */
export function requirePositive(providerId: string, value: unknown, field: string): Dec {
  const d = toDecimal(value);
  if (!d || d.lte(0)) throw new ProviderError(providerId, "invalid_response", `Missing or non-positive ${field}`);
  return d;
}

export function optionalDecimalString(value: unknown): string | null {
  const d = toDecimal(value);
  return d && d.gte(0) ? d.toFixed() : null;
}

export function findInstrument(list: ProviderInstrument[], assetId: string, networkId: string) {
  return list.find((i) => i.assetId === assetId && i.networkId === networkId) ?? null;
}

/** Caches a provider's instrument list; on failure returns the last good list if one exists. */
export async function cachedInstruments(providerId: string, ttlSeconds: number, load: () => Promise<ProviderInstrument[]>) {
  const key = `instruments:${providerId}`;
  const staleKey = `instruments-stale:${providerId}`;
  const hit = await cache().get<ProviderInstrument[]>(key);
  if (hit) return hit;
  try {
    const fresh = await load();
    await cache().set(key, fresh, ttlSeconds);
    await cache().set(staleKey, fresh, 24 * 3600);
    return fresh;
  } catch (err) {
    const stale = await cache().get<ProviderInstrument[]>(staleKey);
    if (stale) return stale;
    throw err;
  }
}

/** Fills a referral template. Only {from} {to} {amount} placeholders, all URL-encoded. */
export function fillTemplate(template: string, vars: { from: string; to: string; amount: string }): string {
  return template
    .replaceAll("{from}", encodeURIComponent(vars.from))
    .replaceAll("{to}", encodeURIComponent(vars.to))
    .replaceAll("{amount}", encodeURIComponent(vars.amount));
}

export function isUrlOnHosts(url: string, hosts: readonly string[]): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && hosts.includes(u.hostname);
  } catch {
    return false;
  }
}
