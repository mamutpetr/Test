/**
 * Pure ranking/filtering — shared by server and client (no server-only imports).
 * Ranking rule: the best offer is the one where the user receives the largest final amount
 * of the SAME destination asset on the SAME network. Partner rewards never influence order.
 */
import Decimal from "decimal.js";
import type { NormalizedQuote } from "../providers/types";

export type SortMode = "best" | "fastest";

export interface QuoteFilters {
  rateType?: "any" | "fixed" | "floating";
  noExtraKyc?: boolean;
  /** Hide offers whose minimum is above the user's amount (normally already excluded server-side). */
  withinLimitsOnly?: boolean;
}

const dec = (s: string) => new Decimal(s);

function durationMax(q: NormalizedQuote) {
  return q.estimatedDuration ? q.estimatedDuration.maxMinutes : Number.POSITIVE_INFINITY;
}

export function compareByReceive(a: NormalizedQuote, b: NormalizedQuote): number {
  const c = dec(b.estimatedReceiveAmount).comparedTo(dec(a.estimatedReceiveAmount));
  if (c !== 0) return c;
  // Tie-breakers are user-centric: guaranteed rate, then speed, then stable name order.
  if (a.expiryGuaranteed !== b.expiryGuaranteed) return a.expiryGuaranteed ? -1 : 1;
  const d = durationMax(a) - durationMax(b);
  if (d !== 0 && Number.isFinite(d)) return d;
  return a.providerName.localeCompare(b.providerName);
}

export function compareBySpeed(a: NormalizedQuote, b: NormalizedQuote): number {
  const da = durationMax(a);
  const db = durationMax(b);
  if (da !== db) return da - db; // unknown durations go last
  return compareByReceive(a, b);
}

/** Throws if quotes for different destination instruments are mixed — they are not comparable. */
export function assertComparable(quotes: NormalizedQuote[]) {
  const first = quotes[0];
  if (!first) return;
  for (const q of quotes) {
    if (q.destinationAsset !== first.destinationAsset || q.destinationNetwork !== first.destinationNetwork || q.sendAmount !== first.sendAmount || q.sourceAsset !== first.sourceAsset || q.sourceNetwork !== first.sourceNetwork)
      throw new Error("Quotes for different routes or amounts cannot be ranked together");
  }
}

export function applyFilters(quotes: NormalizedQuote[], f: QuoteFilters): NormalizedQuote[] {
  return quotes.filter((q) => {
    if (f.rateType && f.rateType !== "any" && q.rateType !== f.rateType) return false;
    if (f.noExtraKyc && q.kycRequirements !== "none_declared") return false;
    if (f.withinLimitsOnly) {
      const amt = dec(q.sendAmount);
      if (q.minAmount && amt.lt(q.minAmount)) return false;
      if (q.maxAmount && amt.gt(q.maxAmount)) return false;
    }
    return true;
  });
}

export function rankQuotes(quotes: NormalizedQuote[], sort: SortMode = "best"): NormalizedQuote[] {
  assertComparable(quotes);
  return [...quotes].sort(sort === "fastest" ? compareBySpeed : compareByReceive);
}

/** How much less than the best offer a quote gives, in percent (0 for the best). */
export function lossVsBest(best: NormalizedQuote, q: NormalizedQuote): string {
  const b = dec(best.estimatedReceiveAmount);
  if (b.isZero()) return "0";
  return b.minus(q.estimatedReceiveAmount).div(b).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function isExpired(q: Pick<NormalizedQuote, "expiresAt">, now = Date.now()): boolean {
  return new Date(q.expiresAt).getTime() <= now;
}
