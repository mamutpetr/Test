import { describe, expect, it } from "vitest";
import { applyFilters, assertComparable, isExpired, lossVsBest, rankQuotes } from "@/server/aggregator/ranking";
import type { NormalizedQuote } from "@/server/providers/types";

export function q(p: Partial<NormalizedQuote> & { id: string; receive: string }): NormalizedQuote {
  return {
    providerId: p.id, providerName: p.providerName ?? p.id, executingPartner: null, quoteId: `q_${p.id}_${p.rateType ?? "floating"}`,
    sourceAsset: "USDT", sourceNetwork: "TRON", destinationAsset: "BTC", destinationNetwork: "BITCOIN",
    sendAmount: "1000", estimatedReceiveAmount: p.receive, rateType: p.rateType ?? "floating", exchangeRate: "0", knownFees: [],
    feesCompleteness: "unknown", minAmount: null, maxAmount: null, estimatedDuration: p.estimatedDuration ?? null,
    kycRequirements: p.kycRequirements ?? "unknown", expiresAt: p.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
    expiryGuaranteed: p.expiryGuaranteed ?? false, retrievedAt: new Date().toISOString(), executionModes: ["redirect"],
    providerReference: null, warnings: [], isDemo: false, ...p,
  } as NormalizedQuote;
}

describe("ranking", () => {
  it("ranks by final receive amount, not by provider or nominal rate", () => {
    const r = rankQuotes([q({ id: "a", receive: "0.0104" }), q({ id: "b", receive: "0.01045789" }), q({ id: "c", receive: "0.01043684" })]);
    expect(r.map((x) => x.providerId)).toEqual(["b", "c", "a"]);
  });
  it("compares precisely beyond float precision", () => {
    const r = rankQuotes([q({ id: "a", receive: "0.100000000000000001" }), q({ id: "b", receive: "0.1" })]);
    expect(r[0]!.providerId).toBe("a");
  });
  it("breaks ties with guaranteed rate, then speed", () => {
    const r = rankQuotes([
      q({ id: "slow", receive: "1", estimatedDuration: { minMinutes: 30, maxMinutes: 60 } }),
      q({ id: "fast", receive: "1", estimatedDuration: { minMinutes: 5, maxMinutes: 10 } }),
      q({ id: "fixed", receive: "1", expiryGuaranteed: true }),
    ]);
    expect(r.map((x) => x.providerId)).toEqual(["fixed", "fast", "slow"]);
  });
  it("fastest sort puts unknown durations last", () => {
    const r = rankQuotes([q({ id: "unknown", receive: "2" }), q({ id: "fast", receive: "1", estimatedDuration: { minMinutes: 5, maxMinutes: 10 } })], "fastest");
    expect(r.map((x) => x.providerId)).toEqual(["fast", "unknown"]);
  });
  it("refuses to rank different destination networks together", () => {
    expect(() => assertComparable([q({ id: "a", receive: "1" }), q({ id: "b", receive: "1", destinationNetwork: "ETHEREUM" })])).toThrow();
    expect(() => assertComparable([q({ id: "a", receive: "1" }), q({ id: "b", receive: "1", destinationAsset: "ETH" })])).toThrow();
  });
  it("filters by rate type and declared no-KYC", () => {
    const list = [q({ id: "a", receive: "1", rateType: "fixed", kycRequirements: "none_declared" }), q({ id: "b", receive: "2", kycRequirements: "may_be_required" })];
    expect(applyFilters(list, { rateType: "fixed" }).map((x) => x.providerId)).toEqual(["a"]);
    expect(applyFilters(list, { noExtraKyc: true }).map((x) => x.providerId)).toEqual(["a"]);
    expect(applyFilters(list, { withinLimitsOnly: true, rateType: "any" })).toHaveLength(2);
    expect(applyFilters([q({ id: "c", receive: "1", minAmount: "2000" })], { withinLimitsOnly: true })).toHaveLength(0);
  });
  it("computes loss vs best and expiry", () => {
    expect(lossVsBest(q({ id: "a", receive: "100" }), q({ id: "b", receive: "99.49" }))).toBe("0.51");
    expect(isExpired(q({ id: "a", receive: "1", expiresAt: new Date(Date.now() - 1).toISOString() }))).toBe(true);
  });
});
