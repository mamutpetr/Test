import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aggregate, reverifyQuote } from "@/server/aggregator/engine";
import { setProviderEntriesForTests } from "@/server/providers/registry";
import { ProviderError } from "@/lib/http";
import { D } from "@/lib/money";
import type { ExchangeProvider, ProviderQuote, QuoteRequest } from "@/server/providers/types";
import { freshCache } from "../helpers";

function fake(id: string, opts: { receive?: string | (() => string); error?: ProviderError; supports?: boolean; configured?: boolean; delayMs?: number; minAmount?: string }): ExchangeProvider {
  return {
    id, name: id.toUpperCase(), websiteUrl: "https://x.io", isDemo: false, redirectHosts: ["x.io"],
    getCapabilities: async () => ({ rateTypes: ["floating"], executionModes: ["redirect"], embeddedSupportedByApi: false, statusTracking: false, fiatPayout: false, referral: { supported: true, configured: true, format: "" }, requiresApiKey: true, configured: opts.configured ?? true, isAggregator: false, docsUrl: "", notes: [] }),
    getSupportedAssets: async () => (opts.supports === false ? [] : [
      { assetId: "USDT", networkId: "TRON", providerAssetCode: "usdt", providerNetworkCode: "trx", fixedRate: true, canSend: true, canReceive: true, memoSupported: false },
      { assetId: "BTC", networkId: "BITCOIN", providerAssetCode: "btc", providerNetworkCode: "btc", fixedRate: true, canSend: true, canReceive: true, memoSupported: false },
    ]),
    getQuotes: async (r: QuoteRequest): Promise<ProviderQuote[]> => {
      if (opts.delayMs) await new Promise((x) => setTimeout(x, opts.delayMs));
      if (opts.error) throw opts.error;
      const receive = typeof opts.receive === "function" ? opts.receive() : opts.receive ?? "0.01";
      return [{ internals: {}, quote: { providerId: id, providerName: id.toUpperCase(), executingPartner: null, sourceAsset: r.fromAsset, sourceNetwork: r.fromNetwork, destinationAsset: r.toAsset, destinationNetwork: r.toNetwork, sendAmount: r.amount.toFixed(), estimatedReceiveAmount: receive, rateType: "floating", exchangeRate: "0", knownFees: [], feesCompleteness: "unknown", minAmount: opts.minAmount ?? null, maxAmount: null, estimatedDuration: null, kycRequirements: "unknown", expiresAt: new Date(Date.now() + 60_000).toISOString(), expiryGuaranteed: false, retrievedAt: new Date().toISOString(), executionModes: ["redirect"], providerReference: null, warnings: [], isDemo: false } }];
    },
    buildReferralUrl: () => "https://x.io/?ref=1",
    healthCheck: async () => ({ ok: true, message: "" }),
  };
}

const body = { fromAsset: "USDT", fromNetwork: "TRON", toAsset: "BTC", toNetwork: "BITCOIN", amount: "1000" };
const set = (...p: ExchangeProvider[]) => setProviderEntriesForTests(p.map((provider, i) => ({ provider, enabled: true, priority: i })));

describe("aggregation engine", () => {
  beforeEach(freshCache);
  afterEach(() => setProviderEntriesForTests(null));

  it("queries providers in parallel, ranks by receive, isolates failures", async () => {
    set(fake("a", { receive: "0.0104" }), fake("b", { receive: "0.0106" }), fake("c", { error: new ProviderError("c", "timeout", "t") }), fake("d", { supports: false }), fake("e", { configured: false }));
    const t0 = Date.now();
    const r = await aggregate(body);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(r.quotes.map((q) => q.providerId)).toEqual(["b", "a"]);
    const status = Object.fromEntries(r.providers.map((p) => [p.providerId, p.status]));
    expect(status).toEqual({ a: "ok", b: "ok", c: "error", d: "no_route", e: "not_configured" });
    expect(new Set(r.quotes.map((q) => q.quoteId)).size).toBe(2);
  });

  it("drops quotes that violate limits returned by the partner", async () => {
    set(fake("a", { receive: "0.01", minAmount: "5000" }));
    const r = await aggregate(body);
    expect(r.quotes).toHaveLength(0);
    expect(r.emptyReason).toBe("all_providers_failed");
  });

  it("explains empty results: none configured, fiat, out of range", async () => {
    set(fake("a", { configured: false }));
    expect((await aggregate(body)).emptyReason).toBe("no_providers_configured");
    expect((await aggregate({ ...body, toAsset: "UAH", toNetwork: "CARD" })).emptyReason).toBe("fiat_not_integrated");
    set(fake("a", { error: new ProviderError("a", "amount_out_of_range", "min", undefined, { minAmount: "20" }) }), fake("b", { error: new ProviderError("b", "amount_out_of_range", "min", undefined, { minAmount: "15" }) }));
    const r = await aggregate({ ...body, amount: "5" });
    expect(r.emptyReason).toBe("amount_out_of_range");
    expect(r.suggestedMinAmount).toBe("15");
  });

  it("re-verifies: ok when unchanged/higher, 'changed' when lower, accepted amount respected", async () => {
    let current = "0.0100";
    set(fake("a", { receive: () => current }));
    const r = await aggregate(body);
    const id = r.quotes[0]!.quoteId;
    current = "0.0101";
    expect((await reverifyQuote(id)).status).toBe("ok");
    current = "0.0099";
    const changed = await reverifyQuote(id);
    expect(changed.status).toBe("changed");
    if (changed.status !== "changed") return;
    expect(changed.quote.estimatedReceiveAmount).toBe("0.0099");
    expect((await reverifyQuote(changed.quote.quoteId, "0.0099")).status).toBe("ok");
    expect((await reverifyQuote("does-not-exist-123")).status).toBe("not_found");
  });

  it("reports unavailable when the partner fails on re-check", async () => {
    let fail = false;
    const p = fake("a", {});
    const orig = p.getQuotes;
    p.getQuotes = async (r) => { if (fail) throw new ProviderError("a", "pair_unavailable", "gone"); return orig(r); };
    set(p);
    const id = (await aggregate(body)).quotes[0]!.quoteId;
    fail = true;
    expect(await reverifyQuote(id)).toEqual({ status: "unavailable", reason: "pair_unavailable" });
  });
});

describe("demo providers", () => {
  beforeEach(freshCache);
  afterEach(() => setProviderEntriesForTests(null));

  it("are labelled demo, simulate errors and support the fiat demo route", async () => {
    setProviderEntriesForTests(null);
    const r = await aggregate({ fromAsset: "USDT", fromNetwork: "TRON", toAsset: "UAH", toNetwork: "CARD", amount: "1000", country: "UA" });
    expect(r.mode).toBe("demo");
    expect(r.quotes.length).toBeGreaterThan(0);
    expect(r.quotes.every((q) => q.isDemo)).toBe(true);
    const ltc = await aggregate({ fromAsset: "USDT", fromNetwork: "TRON", toAsset: "LTC", toNetwork: "LITECOIN", amount: "1000" });
    expect(ltc.providers.find((p) => p.providerId === "demo-kite")).toMatchObject({ status: "error", code: "rate_limited" });
    expect(new D(ltc.quotes[0]!.estimatedReceiveAmount).gt(0)).toBe(true);
  });
});
