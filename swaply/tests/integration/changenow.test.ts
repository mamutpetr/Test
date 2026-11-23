import { beforeEach, describe, expect, it } from "vitest";
import { ChangeNowProvider } from "@/server/providers/changenow/adapter";
import { D } from "@/lib/money";
import { freshCache, mockFetch } from "../helpers";
import currencies from "../fixtures/changenow-currencies.json";

const req = { fromAsset: "USDT", fromNetwork: "TRON", toAsset: "BTC", toNetwork: "BITCOIN", amount: new D("1000"), rateType: "floating" as const };
const estimate = {
  fromCurrency: "usdt", fromNetwork: "trx", toCurrency: "btc", toNetwork: "btc", flow: "standard", type: "direct",
  rateId: null, validUntil: null, transactionSpeedForecast: "10-60", warningMessage: null, depositFee: 0, withdrawalFee: 0.00012, userId: null,
  fromAmount: 1000, toAmount: 0.01043684,
};

function provider(handler: Parameters<typeof mockFetch>[0], opts: Partial<ConstructorParameters<typeof ChangeNowProvider>[0]> = {}) {
  const m = mockFetch(handler);
  return { p: new ChangeNowProvider({ apiKey: "test-key", referralUrl: "https://changenow.io/?link_id=TEST", timeoutMs: 300, quoteTtlSeconds: 60, embeddedEnabled: false, fetchImpl: m.fetch, ...opts }), calls: m.calls };
}

const base = (url: URL) => {
  if (url.pathname === "/v2/exchange/currencies") return { body: currencies };
  if (url.pathname === "/v2/exchange/range") return { body: { fromCurrency: "usdt", fromNetwork: "trx", toCurrency: "btc", toNetwork: "btc", flow: "standard", minAmount: 14.44176, maxAmount: null } };
  return null;
};

describe("ChangeNOW adapter (mocked HTTP, real response shapes)", () => {
  beforeEach(freshCache);

  it("maps the live currency list to SWAPLY instruments (token ≠ network)", async () => {
    const { p } = provider((u) => base(u) ?? { status: 404, body: {} });
    const list = await p.getSupportedAssets();
    const key = (a: string, n: string) => list.find((i) => i.assetId === a && i.networkId === n);
    expect(key("USDT", "TRON")).toMatchObject({ providerAssetCode: "usdt", providerNetworkCode: "trx" });
    expect(key("USDT", "ETHEREUM")).toMatchObject({ providerNetworkCode: "eth" });
    expect(key("USDT", "TON")).toBeTruthy();
    expect(key("USDC", "SOLANA")).toMatchObject({ providerNetworkCode: "sol" });
    expect(list.some((i) => i.assetId === "EUR")).toBe(false); // fiat entries ignored
    expect(list.some((i) => i.assetId === "ETH" && i.networkId === "BSC")).toBe(false); // not in our catalog
  });

  it("normalises an estimate, sends the key in the documented header, keeps fee inclusion unknown", async () => {
    const { p, calls } = provider((u) => base(u) ?? (u.pathname === "/v2/exchange/estimated-amount" ? { body: estimate } : { status: 404, body: {} }));
    const [r] = await p.getQuotes(req);
    expect(r!.quote).toMatchObject({ providerId: "changenow", estimatedReceiveAmount: "0.01043684", rateType: "floating", minAmount: "14.44176", maxAmount: null, estimatedDuration: { minMinutes: 10, maxMinutes: 60 }, expiryGuaranteed: false, executionModes: ["redirect"] });
    expect(r!.quote.knownFees).toEqual([expect.objectContaining({ type: "withdrawal", amount: "0.00012", includedInReceive: "unknown" })]);
    const est = calls.find((c) => c.url.pathname.endsWith("estimated-amount"))!;
    expect((est.init!.headers as Record<string, string>)["x-changenow-api-key"]).toBe("test-key");
    expect(est.url.searchParams.get("fromNetwork")).toBe("trx");
    expect(est.url.searchParams.get("flow")).toBe("standard");
  });

  it("fixed rate uses rateId + validUntil as a guaranteed expiry", async () => {
    const until = new Date(Date.now() + 5 * 60_000).toISOString();
    const { p } = provider((u) => base(u) ?? { body: { ...estimate, flow: "fixed-rate", rateId: "RID", validUntil: until, toAmount: 0.0103 } });
    const [r] = await p.getQuotes({ ...req, rateType: "fixed" });
    expect(r!.quote).toMatchObject({ rateType: "fixed", expiryGuaranteed: true, expiresAt: until, providerReference: "RID" });
    expect(r!.internals.rateId).toBe("RID");
  });

  it("rejects amounts below the documented minimum without calling the estimate", async () => {
    const { p, calls } = provider((u) => base(u) ?? { body: estimate });
    await expect(p.getQuotes({ ...req, amount: new D("5") })).rejects.toMatchObject({ code: "amount_out_of_range", details: { minAmount: "14.44176" } });
    expect(calls.some((c) => c.url.pathname.endsWith("estimated-amount"))).toBe(false);
  });

  it.each([
    [{ status: 401, body: "Unauthorized" }, "unauthorized"],
    [{ status: 429, body: { message: "Too many" } }, "rate_limited"],
    [{ status: 500, body: {} }, "upstream_error"],
    [{ body: { ...estimate, toAmount: null } }, "invalid_response"],
    [{ body: { ...estimate, fromAmount: 999 } }, "invalid_response"],
    [{ body: "<html>not json" }, "invalid_response"],
    [{ body: estimate, delayMs: 1000 }, "timeout"],
  ])("maps partner failure %# to %s", async (resp, code) => {
    const { p } = provider((u) => base(u) ?? resp);
    await expect(p.getQuotes(req)).rejects.toMatchObject({ code });
  });

  it("is not configured without a key, and has no redirect without a referral link", async () => {
    const { p } = provider((u) => base(u) ?? { body: estimate }, { apiKey: undefined });
    await expect(p.getQuotes(req)).rejects.toMatchObject({ code: "not_configured" });
    const { p: p2 } = provider((u) => base(u) ?? { body: estimate }, { referralUrl: undefined });
    expect((await p2.getCapabilities()).executionModes).toEqual([]);
    const { p: p3 } = provider((u) => base(u) ?? { body: estimate }, { referralUrl: "https://evil.example/?x=1" });
    expect((await p3.getCapabilities()).referral.configured).toBe(false);
  });

  it("maps documented statuses and refuses a payout address mismatch on create", async () => {
    const { p } = provider((u) => (u.pathname === "/v2/exchange/by-id" ? { body: { id: "x", status: "verifying" } } : { body: { id: "abc", payinAddress: "TXYZ", payoutAddress: "OTHER" } }));
    expect((await p.getExchangeStatus("x")).status).toBe("VERIFICATION_REQUIRED");
    const quote = { sendAmount: "1000", estimatedReceiveAmount: "0.01" } as never;
    await expect(p.createExchange({ quote, internals: { fromCode: "usdt", toCode: "btc", fromNet: "trx", toNet: "btc", flow: "standard" }, payoutAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" })).rejects.toMatchObject({ code: "invalid_response" });
  });
});
