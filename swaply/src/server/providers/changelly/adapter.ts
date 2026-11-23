/**
 * Changelly adapter — Exchange API v2 (JSON-RPC 2.0), https://docs.changelly.com
 * Access requires registering the public key with Changelly (partner approval).
 *   POST https://api.changelly.com/v2
 *   Headers: X-Api-Key = base64(sha256(public key, PKCS#1 DER)); X-Api-Signature = base64(RSA-SHA256(body))
 *   getCurrenciesFull  → ticker, name, enabled, enabledFrom, enabledTo, fixRateEnabled, blockchain, protocol, extraIdName
 *   getExchangeAmount  [{from,to,amountFrom}] → amountTo (before networkFee), networkFee, min/max, fee, rate
 *        "To calculate the estimated amount that the user will get, you should deduct the networkFee value from amountTo."
 *   getFixRateForAmount [{from,to,amountFrom}] → id (rateId, ~1 min), result, networkFee, amountFrom, amountTo, expiredAt (unix s)
 *        "multiply the amount that the user wants to send to the result and deduct the value of the networkFee"
 *   getStatus {id} → waiting|confirming|exchanging|sending|finished|failed|refunded|hold|overdue|expired
 *
 * NOTE: the coin+network → ticker mapping comes from getCurrenciesFull (blockchain field) and must be
 * verified with a live key before enabling — see API_INTEGRATIONS.md. Exchange creation is not wired here.
 */
import crypto from "node:crypto";
import { ASSETS, isValidInstrument } from "@/lib/catalog";
import { ProviderError, isProviderError, requestJson } from "@/lib/http";
import { toDecimal } from "@/lib/money";
import { cachedInstruments, findInstrument, isUrlOnHosts, optionalDecimalString, rateOf, receiveString } from "../shared";
import type {
  CanonicalExchangeStatus,
  ExchangeProvider,
  ExchangeStatusResult,
  NormalizedQuote,
  ProviderCapabilities,
  ProviderInstrument,
  ProviderQuote,
  QuoteRequest,
  RateType,
} from "../types";

const URL_V2 = "https://api.changelly.com/v2";
const API_HOSTS = ["api.changelly.com"] as const;

export const CHANGELLY_BLOCKCHAINS: Record<string, string[]> = {
  TRON: ["tron", "trx"],
  ETHEREUM: ["ethereum", "eth"],
  BSC: ["binance_smart_chain", "bsc", "binancesmartchain"],
  TON: ["ton", "toncoin"],
  SOLANA: ["solana", "sol"],
  BITCOIN: ["bitcoin", "btc"],
  LITECOIN: ["litecoin", "ltc"],
};

export const CHANGELLY_STATUS: Record<string, CanonicalExchangeStatus> = {
  new: "CREATED",
  waiting: "AWAITING_DEPOSIT",
  confirming: "CONFIRMING",
  exchanging: "EXCHANGING",
  sending: "SENDING",
  finished: "COMPLETED",
  failed: "FAILED",
  refunded: "REFUNDED",
  hold: "VERIFICATION_REQUIRED",
  overdue: "EXPIRED",
  expired: "EXPIRED",
};

export interface ChangellyConfig {
  privateKeyHex?: string;
  referralUrl?: string;
  timeoutMs: number;
  quoteTtlSeconds: number;
  fetchImpl?: typeof fetch;
}

interface ClCurrency {
  ticker: string;
  name?: string;
  enabled?: boolean;
  enabledFrom?: boolean;
  enabledTo?: boolean;
  fixRateEnabled?: boolean;
  blockchain?: string;
  extraIdName?: string;
}

export function changellySign(privateKeyHex: string, body: string) {
  const privateKey = crypto.createPrivateKey({ key: Buffer.from(privateKeyHex, "hex"), format: "der", type: "pkcs8" });
  const publicKey = crypto.createPublicKey(privateKey).export({ type: "pkcs1", format: "der" });
  return {
    apiKey: crypto.createHash("sha256").update(publicKey).digest("base64"),
    signature: crypto.sign("sha256", Buffer.from(body), privateKey).toString("base64"),
  };
}

export class ChangellyProvider implements ExchangeProvider {
  readonly id = "changelly";
  readonly name = "Changelly";
  readonly websiteUrl = "https://changelly.com";
  readonly isDemo = false;
  readonly redirectHosts = ["changelly.com"] as const;

  constructor(private cfg: ChangellyConfig) {}

  private async rpc<T>(method: string, params: unknown, operation = method): Promise<T> {
    if (!this.cfg.privateKeyHex) throw new ProviderError(this.id, "not_configured", "CHANGELLY_PRIVATE_KEY is not set");
    const body = JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params });
    let headers: Record<string, string>;
    try {
      const s = changellySign(this.cfg.privateKeyHex, body);
      headers = { "X-Api-Key": s.apiKey, "X-Api-Signature": s.signature };
    } catch {
      throw new ProviderError(this.id, "not_configured", "CHANGELLY_PRIVATE_KEY is not a valid hex PKCS#8 key");
    }
    const res = await requestJson<{ result?: T; error?: { code: number; message: string } }>({
      providerId: this.id,
      operation,
      url: URL_V2,
      method: "POST",
      body,
      headers,
      allowedHosts: API_HOSTS,
      timeoutMs: this.cfg.timeoutMs,
      fetchImpl: this.cfg.fetchImpl,
    });
    if (res.error) {
      const code = res.error.code === -32603 && /limit/i.test(res.error.message) ? "rate_limited" : /amount/i.test(res.error.message) ? "amount_out_of_range" : "bad_request";
      throw new ProviderError(this.id, code, res.error.message);
    }
    if (res.result === undefined) throw new ProviderError(this.id, "invalid_response", "Missing result");
    return res.result;
  }

  async getCapabilities(): Promise<ProviderCapabilities> {
    const configured = !!this.cfg.privateKeyHex;
    const refOk = !!this.cfg.referralUrl && isUrlOnHosts(this.cfg.referralUrl, this.redirectHosts);
    return {
      rateTypes: ["floating", "fixed"],
      executionModes: configured && refOk ? ["redirect"] : [],
      embeddedSupportedByApi: true,
      statusTracking: true,
      fiatPayout: false,
      referral: { supported: true, configured: refOk, format: "Affiliate link from the Changelly partner account (CHANGELLY_REFERRAL_URL)" },
      requiresApiKey: true,
      configured,
      isAggregator: false,
      docsUrl: "https://docs.changelly.com",
      notes: [
        "API access requires registering the public key with Changelly.",
        "Ticker mapping is derived from getCurrenciesFull and must be verified with a live key.",
        "Changelly asks partners to show: \"Exchange services are provided by Changelly…\" (KYC/AML notice).",
      ],
    };
  }

  async getSupportedAssets(): Promise<ProviderInstrument[]> {
    return cachedInstruments(this.id, 3600, async () => {
      const list = await this.rpc<ClCurrency[]>("getCurrenciesFull", {});
      if (!Array.isArray(list)) throw new ProviderError(this.id, "invalid_response", "getCurrenciesFull: expected array");
      const out: ProviderInstrument[] = [];
      for (const c of list) {
        if (!c?.ticker || c.enabled === false || !c.blockchain) continue;
        const networkId = Object.entries(CHANGELLY_BLOCKCHAINS).find(([, names]) => names.includes(c.blockchain!.toLowerCase()))?.[0];
        if (!networkId) continue;
        const symbol = (c.name ?? c.ticker).toUpperCase();
        if (ASSETS[symbol]?.kind !== "crypto" || !isValidInstrument(symbol, networkId)) continue;
        if (out.some((o) => o.assetId === symbol && o.networkId === networkId)) continue;
        out.push({
          assetId: symbol,
          networkId,
          providerAssetCode: c.ticker,
          providerNetworkCode: c.blockchain,
          fixedRate: typeof c.fixRateEnabled === "boolean" ? c.fixRateEnabled : null,
          canSend: c.enabledFrom !== false,
          canReceive: c.enabledTo !== false,
          memoSupported: c.extraIdName ? true : null,
        });
      }
      return out;
    });
  }

  async getQuotes(req: QuoteRequest): Promise<ProviderQuote[]> {
    const inst = await this.getSupportedAssets();
    const from = findInstrument(inst, req.fromAsset, req.fromNetwork);
    const to = findInstrument(inst, req.toAsset, req.toNetwork);
    if (!from || !to || !from.canSend || !to.canReceive) throw new ProviderError(this.id, "pair_unavailable", "Route not supported by Changelly");
    const types: RateType[] = req.rateType === "any" ? ["floating", "fixed"] : [req.rateType];
    const settled = await Promise.allSettled(types.map((t) => this.quote(req, from, to, t)));
    const ok = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    if (!ok.length) throw (settled.find((s): s is PromiseRejectedResult => s.status === "rejected")?.reason as Error) ?? new ProviderError(this.id, "pair_unavailable", "No quote");
    return ok;
  }

  private async quote(req: QuoteRequest, from: ProviderInstrument, to: ProviderInstrument, rateType: RateType): Promise<ProviderQuote> {
    const params = [{ from: from.providerAssetCode, to: to.providerAssetCode, amountFrom: req.amount.toFixed() }];
    const now = new Date();
    let net, networkFee, min, max, rateId: string | null = null, expiresAt: Date, guaranteed = false;
    if (rateType === "floating") {
      const [r] = await this.rpc<Array<{ amountTo: string; networkFee: string; minFrom?: string; maxFrom?: string; min?: string; max?: string }>>("getExchangeAmount", params);
      const amountTo = toDecimal(r?.amountTo);
      networkFee = toDecimal(r?.networkFee);
      if (!amountTo || !networkFee) throw new ProviderError(this.id, "invalid_response", "getExchangeAmount: missing amountTo/networkFee");
      net = amountTo.minus(networkFee);
      min = optionalDecimalString(r?.minFrom ?? r?.min);
      max = optionalDecimalString(r?.maxFrom ?? r?.max);
      expiresAt = new Date(now.getTime() + this.cfg.quoteTtlSeconds * 1000);
    } else {
      const [r] = await this.rpc<Array<{ id: string; result: string; networkFee: string; minFrom?: string; maxFrom?: string; expiredAt?: number }>>("getFixRateForAmount", params);
      const rate = toDecimal(r?.result);
      networkFee = toDecimal(r?.networkFee);
      if (!rate || !networkFee || !r?.id) throw new ProviderError(this.id, "invalid_response", "getFixRateForAmount: missing fields");
      net = req.amount.times(rate).minus(networkFee);
      min = optionalDecimalString(r.minFrom);
      max = optionalDecimalString(r.maxFrom);
      rateId = r.id;
      guaranteed = typeof r.expiredAt === "number";
      expiresAt = guaranteed ? new Date(r.expiredAt! * 1000) : new Date(now.getTime() + this.cfg.quoteTtlSeconds * 1000);
    }
    if (net.lte(0)) throw new ProviderError(this.id, "amount_out_of_range", "Amount too small after network fee", undefined, { minAmount: min, maxAmount: max });
    const caps = await this.getCapabilities();
    const q: Omit<NormalizedQuote, "quoteId"> = {
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
      knownFees: [{ type: "network", amount: networkFee.toFixed(), currency: req.toAsset, includedInReceive: true, note: "Deducted per Changelly docs" }],
      feesCompleteness: "complete",
      minAmount: min,
      maxAmount: max,
      estimatedDuration: null,
      kycRequirements: "may_be_required",
      expiresAt: expiresAt.toISOString(),
      expiryGuaranteed: guaranteed,
      retrievedAt: now.toISOString(),
      executionModes: caps.executionModes,
      providerReference: rateId,
      warnings: [],
      isDemo: false,
    };
    return { quote: q, internals: { fromCode: from.providerAssetCode, toCode: to.providerAssetCode, rateId } };
  }

  buildReferralUrl(): string | null {
    return this.cfg.referralUrl && isUrlOnHosts(this.cfg.referralUrl, this.redirectHosts) ? this.cfg.referralUrl : null;
  }

  async getExchangeStatus(externalId: string): Promise<ExchangeStatusResult> {
    const s = await this.rpc<string>("getStatus", { id: externalId });
    return { status: CHANGELLY_STATUS[s] ?? "UNKNOWN", providerStatus: s, actualReceive: null, payinHash: null, payoutHash: null };
  }

  async healthCheck() {
    if (!this.cfg.privateKeyHex) return { ok: false, message: "Not configured (partner approval + key required)" };
    try {
      const l = await this.rpc<unknown[]>("getCurrenciesFull", {}, "health");
      return { ok: Array.isArray(l) && l.length > 0, message: "OK" };
    } catch (e) {
      return { ok: false, message: isProviderError(e) ? `${e.code}: ${e.message}` : "error" };
    }
  }
}
