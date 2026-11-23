import { beforeEach, describe, expect, it } from "vitest";
import { SwapzoneProvider } from "@/server/providers/swapzone/adapter";
import { D } from "@/lib/money";
import { freshCache, mockFetch } from "../helpers";
import currencies from "../fixtures/swapzone-currencies.json";

const req = { fromAsset: "USDT", fromNetwork: "TRON", toAsset: "BTC", toNetwork: "BITCOIN", amount: new D("1000"), rateType: "floating" as const };
const offer = (adapter: string, amountTo: number, extra: Record<string, unknown> = {}) => ({ adapter, from: "usdt", fromNetwork: "TRX", to: "btc", toNetwork: "BTC", amountFrom: 1000, amountTo, minAmount: 20, maxAmount: null, quotaId: `q-${adapter}`, time: 30, ...extra });

function provider(rate: (u: URL) => { status?: number; body: unknown; delayMs?: number }, refId: string | undefined = "SWAPLY1") {
  const m = mockFetch((u) => (u.pathname === "/v1/exchange/currencies" ? { body: currencies } : rate(u)));
  return { p: new SwapzoneProvider({ apiKey: "k", refId, timeoutMs: 300, quoteTtlSeconds: 60, embeddedEnabled: false, fetchImpl: m.fetch }), calls: m.calls };
}

describe("Swapzone adapter", () => {
  beforeEach(freshCache);

  it("maps currencies by ticker + network", async () => {
    const { p } = provider(() => ({ body: [] }));
    const list = await p.getSupportedAssets();
    expect(list.find((i) => i.assetId === "USDT" && i.networkId === "TRON")).toMatchObject({ providerNetworkCode: "TRX" });
    expect(list.find((i) => i.assetId === "BTC")).toMatchObject({ networkId: "BITCOIN" });
  });

  it("returns one quote per executing partner (array response) and drops wrong-network offers", async () => {
    const { p, calls } = provider(() => ({ body: [offer("changehero", 0.0104), offer("simpleswap", 0.0105), offer("bad", 9, { toNetwork: "ETH" }), offer("zero", 0)] }));
    const qs = await p.getQuotes(req);
    expect(qs.map((q) => [q.quote.executingPartner?.id, q.quote.estimatedReceiveAmount])).toEqual([["changehero", "0.0104"], ["simpleswap", "0.0105"]]);
    expect(qs[0]!.quote).toMatchObject({ providerName: "Swapzone", feesCompleteness: "unknown", estimatedDuration: null, kycRequirements: "unknown" });
    const c = calls.find((x) => x.url.pathname.endsWith("get-rate"))!;
    expect(c.url.searchParams.get("fromNetwork")).toBe("TRX");
    expect(c.url.searchParams.get("chooseRate")).toBe("all");
    expect((c.init!.headers as Record<string, string>)["x-api-key"]).toBe("k");
  });

  it("accepts the documented single-object response", async () => {
    const { p } = provider(() => ({ body: offer("changehero", 0.0104) }));
    expect(await p.getQuotes(req)).toHaveLength(1);
  });

  it("reports out-of-range with partner limits", async () => {
    const { p } = provider(() => ({ body: [offer("a", 0.0001, { minAmount: 5000 })] }));
    await expect(p.getQuotes(req)).rejects.toMatchObject({ code: "amount_out_of_range", details: { minAmount: "5000" } });
  });

  it("warns about open financial claims", async () => {
    const { p } = provider(() => ({ body: [offer("a", 0.01, { open_fincases: "1" })] }));
    expect((await p.getQuotes(req))[0]!.quote.warnings[0]).toMatch(/financial claims/);
  });

  it("builds only the documented referral link", async () => {
    const { p } = provider(() => ({ body: [] }));
    expect(p.buildReferralUrl()).toBe("https://swapzone.io/?refId=SWAPLY1");
    const { p: bad } = provider(() => ({ body: [] }), "x&evil=1");
    expect(bad.buildReferralUrl()).toBeNull();
  });

  it("maps overdue to EXPIRED", async () => {
    const { p } = provider(() => ({ body: { transaction: { id: "1", status: "overdue" } } }));
    expect((await p.getExchangeStatus("1")).status).toBe("EXPIRED");
  });
});
