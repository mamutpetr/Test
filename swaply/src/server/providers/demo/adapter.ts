/**
 * DEMO providers. Only registered when APP_MODE=demo. Every quote carries isDemo=true and the UI labels it.
 * Prices are a fixed illustrative table — not market data. Real exchanges are never created in demo mode.
 */
import crypto from "node:crypto";
import { ASSETS, isValidInstrument, NETWORKS } from "@/lib/catalog";
import { ProviderError } from "@/lib/http";
import { D, type Dec } from "@/lib/money";
import { rateOf, receiveString } from "../shared";
import type {
  CanonicalExchangeStatus,
  ExchangeProvider,
  ExchangeRequest,
  ExchangeResult,
  ExchangeStatusResult,
  KycRequirement,
  ProviderCapabilities,
  ProviderInstrument,
  ProviderQuote,
  QuoteRequest,
  RateType,
} from "../types";

/** Illustrative USD prices for demo only. */
export const DEMO_USD_PRICES: Record<string, string> = {
  USDT: "1",
  USDC: "1",
  BTC: "95000",
  ETH: "3400",
  SOL: "180",
  LTC: "95",
  TRX: "0.25",
  UAH: "0.0241",
  USD: "1",
  EUR: "1.08",
};

const DEMO_NETWORK_FEE_USD: Record<string, string> = {
  TRON: "1",
  ETHEREUM: "4",
  BSC: "0.3",
  TON: "0.1",
  SOLANA: "0.05",
  BITCOIN: "3",
  LITECOIN: "0.05",
  CARD: "0.5",
  BANK_TRANSFER: "1",
};

interface DemoProfile {
  id: string;
  name: string;
  /** Spread taken by the demo partner, e.g. 0.6 (%). */
  spreadPercent: string;
  fixedExtraPercent: string;
  minUsd: string;
  maxUsd: string | null;
  durations: { minMinutes: number; maxMinutes: number };
  kyc: KycRequirement;
  latencyMs: number;
  fiat: boolean;
  crypto: boolean;
  /** Simulated failure for routes touching this asset. */
  failsOn?: { asset: string; code: "rate_limited" | "timeout" | "upstream_error" };
  feesIncluded: boolean;
}

export const DEMO_PROFILES: DemoProfile[] = [
  { id: "demo-nova", name: "Nova Exchange (demo)", spreadPercent: "0.55", fixedExtraPercent: "0.6", minUsd: "10", maxUsd: "50000", durations: { minMinutes: 5, maxMinutes: 20 }, kyc: "may_be_required", latencyMs: 150, fiat: false, crypto: true, feesIncluded: true },
  { id: "demo-kite", name: "Kite Swap (demo)", spreadPercent: "0.35", fixedExtraPercent: "0.8", minUsd: "50", maxUsd: "20000", durations: { minMinutes: 15, maxMinutes: 45 }, kyc: "none_declared", latencyMs: 400, fiat: false, crypto: true, failsOn: { asset: "LTC", code: "rate_limited" }, feesIncluded: false },
  { id: "demo-flux", name: "Flux Pay (demo)", spreadPercent: "1.2", fixedExtraPercent: "0.5", minUsd: "20", maxUsd: "10000", durations: { minMinutes: 10, maxMinutes: 60 }, kyc: "required", latencyMs: 700, fiat: true, crypto: true, feesIncluded: true },
];

function usd(asset: string): Dec {
  const p = DEMO_USD_PRICES[asset];
  if (!p) throw new Error(`no demo price for ${asset}`);
  return new D(p);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DemoProvider implements ExchangeProvider {
  readonly isDemo = true;
  readonly websiteUrl = "/demo-partner";
  readonly redirectHosts: readonly string[];
  readonly id: string;
  readonly name: string;

  constructor(private p: DemoProfile, private appUrl: string, private embeddedEnabled: boolean) {
    this.id = p.id;
    this.name = p.name;
    this.redirectHosts = [new URL(appUrl).hostname];
  }

  async getCapabilities(): Promise<ProviderCapabilities> {
    return {
      rateTypes: ["floating", "fixed"],
      executionModes: this.embeddedEnabled && !this.p.fiat ? ["redirect", "embedded"] : ["redirect"],
      embeddedSupportedByApi: !this.p.fiat,
      statusTracking: true,
      fiatPayout: this.p.fiat,
      referral: { supported: true, configured: true, format: "Internal demo partner page" },
      requiresApiKey: false,
      configured: true,
      isAggregator: false,
      docsUrl: "",
      notes: ["Demo provider — illustrative data only."],
    };
  }

  async getSupportedAssets(): Promise<ProviderInstrument[]> {
    const out: ProviderInstrument[] = [];
    for (const a of Object.values(ASSETS)) {
      if (a.kind === "fiat" && !this.p.fiat) continue;
      if (a.kind === "crypto" && !this.p.crypto) continue;
      for (const n of a.networks) {
        out.push({ assetId: a.id, networkId: n, providerAssetCode: a.id.toLowerCase(), providerNetworkCode: n.toLowerCase(), fixedRate: a.kind === "crypto", canSend: a.kind === "crypto", canReceive: true, memoSupported: NETWORKS[n]?.memoCommon ?? false });
      }
    }
    return out;
  }

  async getQuotes(req: QuoteRequest): Promise<ProviderQuote[]> {
    await sleep(process.env.NODE_ENV === "test" ? 0 : this.p.latencyMs);
    const inst = await this.getSupportedAssets();
    const from = inst.find((i) => i.assetId === req.fromAsset && i.networkId === req.fromNetwork && i.canSend);
    const to = inst.find((i) => i.assetId === req.toAsset && i.networkId === req.toNetwork && i.canReceive);
    if (!from || !to || !isValidInstrument(req.toAsset, req.toNetwork)) throw new ProviderError(this.id, "pair_unavailable", "Route not supported (demo)");
    if (this.p.failsOn && (req.fromAsset === this.p.failsOn.asset || req.toAsset === this.p.failsOn.asset))
      throw new ProviderError(this.id, this.p.failsOn.code, "Simulated provider error (demo)");
    if (ASSETS[req.toAsset]?.kind === "fiat" && req.country && req.country !== "UA" && req.toAsset === "UAH")
      throw new ProviderError(this.id, "pair_unavailable", "UAH payout is only available for Ukraine (demo)");

    const sendUsd = req.amount.times(usd(req.fromAsset));
    const minFrom = new D(this.p.minUsd).div(usd(req.fromAsset));
    const maxFrom = this.p.maxUsd ? new D(this.p.maxUsd).div(usd(req.fromAsset)) : null;
    const minS = minFrom.toSignificantDigits(6, D.ROUND_UP).toFixed();
    const maxS = maxFrom ? maxFrom.toSignificantDigits(6, D.ROUND_DOWN).toFixed() : null;
    if (sendUsd.lt(this.p.minUsd) || (this.p.maxUsd && sendUsd.gt(this.p.maxUsd)))
      throw new ProviderError(this.id, "amount_out_of_range", "Amount out of range (demo)", undefined, { minAmount: minS, maxAmount: maxS });

    const types: RateType[] = req.rateType === "any" ? ["floating", "fixed"] : [req.rateType];
    const now = new Date();
    return types.map((rateType) => {
      const spread = new D(this.p.spreadPercent).plus(rateType === "fixed" ? this.p.fixedExtraPercent : 0);
      const gross = sendUsd.times(new D(100).minus(spread).div(100)).div(usd(req.toAsset));
      const feeAmt = new D(DEMO_NETWORK_FEE_USD[req.toNetwork] ?? "1").div(usd(req.toAsset));
      const net = gross.minus(feeAmt);
      const ttl = rateType === "fixed" ? 10 * 60 : 60;
      return {
        quote: {
          providerId: this.id,
          providerName: this.name,
          executingPartner: null,
          sourceAsset: req.fromAsset,
          sourceNetwork: req.fromNetwork,
          destinationAsset: req.toAsset,
          destinationNetwork: req.toNetwork,
          sendAmount: req.amount.toFixed(),
          estimatedReceiveAmount: receiveString(req.toAsset, net),
          rateType,
          exchangeRate: rateOf(net, req.amount),
          knownFees: [
            { type: "exchange", amount: null, currency: req.toAsset, includedInReceive: true, note: `Spread ${spread.toFixed()}% (demo)` },
            { type: "network", amount: receiveString(req.toAsset, feeAmt), currency: req.toAsset, includedInReceive: true },
          ],
          feesCompleteness: this.p.feesIncluded ? "complete" : "partial",
          minAmount: minS,
          maxAmount: maxS,
          estimatedDuration: this.p.durations,
          kycRequirements: this.p.kyc,
          expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
          expiryGuaranteed: rateType === "fixed",
          retrievedAt: now.toISOString(),
          executionModes: this.embeddedEnabled && !this.p.fiat ? ["redirect", "embedded"] : ["redirect"],
          providerReference: `demo-${rateType}`,
          warnings: [],
          isDemo: true,
        },
        internals: { demo: true },
      };
    });
  }

  buildReferralUrl(q: { sourceAsset: string; destinationAsset: string; sendAmount: string }): string {
    const u = new URL("/uk/demo-partner", this.appUrl);
    u.searchParams.set("p", this.id);
    u.searchParams.set("from", q.sourceAsset);
    u.searchParams.set("to", q.destinationAsset);
    u.searchParams.set("amount", q.sendAmount);
    return u.toString();
  }

  async createExchange(r: ExchangeRequest): Promise<ExchangeResult> {
    return {
      externalId: `demo_${crypto.randomUUID()}`,
      payinAddress: "DEMO-NOT-A-REAL-ADDRESS-DO-NOT-SEND",
      payinExtraId: null,
      payoutAddress: r.payoutAddress,
      sendAmount: r.quote.sendAmount,
      expectedReceive: r.quote.estimatedReceiveAmount,
      payTill: new Date(Date.now() + 30 * 60_000).toISOString(),
      status: "AWAITING_DEPOSIT",
      providerStatus: "waiting",
    };
  }

  /** Simulated progression driven by the creation time embedded in the stored record (see exchanges service). */
  async getExchangeStatus(externalId: string, createdAt?: Date): Promise<ExchangeStatusResult> {
    const age = createdAt ? (Date.now() - createdAt.getTime()) / 1000 : 0;
    const steps: Array<[number, CanonicalExchangeStatus, string]> = [
      [0, "AWAITING_DEPOSIT", "waiting"],
      [20, "CONFIRMING", "confirming"],
      [40, "EXCHANGING", "exchanging"],
      [60, "SENDING", "sending"],
      [80, "COMPLETED", "finished"],
    ];
    const s = [...steps].reverse().find(([t]) => age >= t) ?? steps[0]!;
    return { status: s[1], providerStatus: `${s[2]} (demo)`, actualReceive: null, payinHash: null, payoutHash: externalId ? null : null };
  }

  async healthCheck() {
    return { ok: true, message: "Demo provider" };
  }
}
