/**
 * ChangeNOW adapter — API v2.
 * Source: official ChangeNOW Postman collection (https://documenter.getpostman.com/view/8180765/SVfTPnM8),
 * linked from https://changenow.io/api/docs. Endpoint and field names below are taken from it verbatim.
 *   Auth header: x-changenow-api-key
 *   GET  /v2/exchange/currencies?active=true&flow=standard   (ticker, network, supportsFixedRate, buy, sell, isExtraIdSupported)
 *   GET  /v2/exchange/range?fromCurrency&toCurrency&fromNetwork&toNetwork&flow  → minAmount, maxAmount|null
 *   GET  /v2/exchange/estimated-amount?...&fromAmount&flow&type=direct&useRateId → toAmount, rateId, validUntil,
 *        transactionSpeedForecast, warningMessage, depositFee, withdrawalFee
 *   POST /v2/exchange → id, payinAddress, payinExtraId, payoutAddress, fromAmount, toAmount
 *   GET  /v2/exchange/by-id?id= → status: new, waiting, confirming, exchanging, sending, finished, failed, refunded, verifying
 *   GET  /v2/validate/address?currency&address → result, message
 * Rate limits (docs): 1800 calls/min, 30 calls/s.
 */
import { ASSETS, isValidInstrument } from "@/lib/catalog";
import { ProviderError, isProviderError, requestJson } from "@/lib/http";
import { D, toDecimal } from "@/lib/money";
import { cache } from "@/lib/cache";
import {
  cachedInstruments,
  fillTemplate,
  findInstrument,
  isUrlOnHosts,
  optionalDecimalString,
  parseDurationRange,
  rateOf,
  receiveString,
  requirePositive,
} from "../shared";
import type {
  CanonicalExchangeStatus,
  ExchangeProvider,
  ExchangeRequest,
  ExchangeResult,
  ExchangeStatusResult,
  NormalizedQuote,
  ProviderCapabilities,
  ProviderInstrument,
  ProviderQuote,
  QuoteInternals,
  QuoteRequest,
  RateType,
} from "../types";

const BASE = "https://api.changenow.io";
const API_HOSTS = ["api.changenow.io"] as const;

/** SWAPLY network id → ChangeNOW v2 `network` value (checked against the live currency list). */
export const CHANGENOW_NETWORKS: Record<string, string> = {
  TRON: "trx",
  ETHEREUM: "eth",
  BSC: "bsc",
  TON: "ton",
  SOLANA: "sol",
  BITCOIN: "btc",
  LITECOIN: "ltc",
};

export const CHANGENOW_STATUS: Record<string, CanonicalExchangeStatus> = {
  new: "CREATED",
  waiting: "AWAITING_DEPOSIT",
  confirming: "CONFIRMING",
  exchanging: "EXCHANGING",
  sending: "SENDING",
  finished: "COMPLETED",
  failed: "FAILED",
  refunded: "REFUNDED",
  verifying: "VERIFICATION_REQUIRED",
};

interface CnCurrency {
  ticker: string;
  network: string;
  supportsFixedRate?: boolean;
  buy?: boolean;
  sell?: boolean;
  isExtraIdSupported?: boolean;
  isFiat?: boolean;
}

interface CnEstimate {
  fromCurrency: string;
  fromNetwork: string;
  toCurrency: string;
  toNetwork: string;
  flow: "standard" | "fixed-rate";
  rateId?: string | null;
  validUntil?: string | null;
  transactionSpeedForecast?: string | null;
  warningMessage?: string | null;
  depositFee?: number | null;
  withdrawalFee?: number | null;
  fromAmount: number;
  toAmount: number;
}

export interface ChangeNowConfig {
  apiKey?: string;
  referralUrl?: string;
  timeoutMs: number;
  quoteTtlSeconds: number;
  embeddedEnabled: boolean;
  fetchImpl?: typeof fetch;
}

export class ChangeNowProvider implements ExchangeProvider {
  readonly id = "changenow";
  readonly name = "ChangeNOW";
  readonly websiteUrl = "https://changenow.io";
  readonly isDemo = false;
  readonly redirectHosts = ["changenow.io"] as const;

  constructor(private cfg: ChangeNowConfig) {}

  private headers(): Record<string, string> {
    return this.cfg.apiKey ? { "x-changenow-api-key": this.cfg.apiKey } : {};
  }

  private get(path: string, params: Record<string, string>, operation: string) {
    const qs = new URLSearchParams(params).toString();
    return requestJson<unknown>({
      providerId: this.id,
      operation,
      url: `${BASE}${path}?${qs}`,
      allowedHosts: API_HOSTS,
      headers: this.headers(),
      timeoutMs: this.cfg.timeoutMs,
      fetchImpl: this.cfg.fetchImpl,
    });
  }

  private referralConfigured() {
    return !!this.cfg.referralUrl && isUrlOnHosts(fillTemplate(this.cfg.referralUrl, { from: "x", to: "y", amount: "1" }), this.redirectHosts);
  }

  async getCapabilities(): Promise<ProviderCapabilities> {
    const configured = !!this.cfg.apiKey;
    const modes: ProviderCapabilities["executionModes"] = [];
    if (configured && this.referralConfigured()) modes.push("redirect");
    if (configured && this.cfg.embeddedEnabled) modes.push("embedded");
    return {
      rateTypes: ["floating", "fixed"],
      executionModes: modes,
      embeddedSupportedByApi: true,
      statusTracking: true,
      fiatPayout: false,
      referral: { supported: true, configured: this.referralConfigured(), format: "Referral link from the ChangeNOW partner cabinet (CHANGENOW_REFERRAL_URL)" },
      requiresApiKey: true,
      configured,
      isAggregator: false,
      docsUrl: "https://changenow.io/api/docs",
      notes: [
        "Estimated amount and range endpoints require an API key (\"Access to this endpoint you can receive upon dedicated request to partners@changenow.io\").",
        "Docs list depositFee / withdrawalFee next to toAmount but do not state whether toAmount is already net of them — shown as 'inclusion unknown'.",
        "Fiat on/off-ramp is a separate ChangeNOW product and is not integrated.",
      ],
    };
  }

  async getSupportedAssets(): Promise<ProviderInstrument[]> {
    return cachedInstruments(this.id, 3600, async () => {
      const data = await this.get("/v2/exchange/currencies", { active: "true", flow: "standard" }, "currencies");
      if (!Array.isArray(data)) throw new ProviderError(this.id, "invalid_response", "currencies: expected array");
      const list = data as CnCurrency[];
      const out: ProviderInstrument[] = [];
      for (const [networkId, code] of Object.entries(CHANGENOW_NETWORKS)) {
        for (const c of list) {
          if (c.isFiat || c.network !== code) continue;
          const assetId = c.ticker?.toUpperCase();
          if (!assetId || !isKnownCrypto(assetId, networkId)) continue;
          out.push({
            assetId,
            networkId,
            providerAssetCode: c.ticker,
            providerNetworkCode: c.network,
            fixedRate: typeof c.supportsFixedRate === "boolean" ? c.supportsFixedRate : null,
            canSend: c.sell !== false,
            canReceive: c.buy !== false,
            memoSupported: typeof c.isExtraIdSupported === "boolean" ? c.isExtraIdSupported : null,
          });
        }
      }
      return out;
    });
  }

  private async range(from: ProviderInstrument, to: ProviderInstrument, flow: string) {
    const key = `cn:range:${from.providerAssetCode}:${from.providerNetworkCode}:${to.providerAssetCode}:${to.providerNetworkCode}:${flow}`;
    const hit = await cache().get<{ min: string | null; max: string | null }>(key);
    if (hit) return hit;
    const data = (await this.get(
      "/v2/exchange/range",
      {
        fromCurrency: from.providerAssetCode,
        toCurrency: to.providerAssetCode,
        fromNetwork: from.providerNetworkCode ?? "",
        toNetwork: to.providerNetworkCode ?? "",
        flow,
      },
      "range",
    )) as { minAmount?: number | null; maxAmount?: number | null };
    const r = { min: optionalDecimalString(data?.minAmount), max: optionalDecimalString(data?.maxAmount) };
    await cache().set(key, r, 300);
    return r;
  }

  async getQuotes(req: QuoteRequest): Promise<ProviderQuote[]> {
    if (!this.cfg.apiKey) throw new ProviderError(this.id, "not_configured", "CHANGENOW_API_KEY is not set");
    const instruments = await this.getSupportedAssets();
    const from = findInstrument(instruments, req.fromAsset, req.fromNetwork);
    const to = findInstrument(instruments, req.toAsset, req.toNetwork);
    if (!from || !to || !from.canSend || !to.canReceive) throw new ProviderError(this.id, "pair_unavailable", "Route not supported by ChangeNOW");

    const flows: RateType[] = req.rateType === "any" ? ["floating", "fixed"] : [req.rateType];
    const usable = flows.filter((f) => f === "floating" || (from.fixedRate !== false && to.fixedRate !== false));
    if (usable.length === 0) throw new ProviderError(this.id, "pair_unavailable", "Fixed rate not supported for this route");

    const settled = await Promise.allSettled(usable.map((f) => this.quoteFlow(req, from, to, f)));
    const quotes = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    if (quotes.length === 0) {
      const first = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
      throw first?.reason ?? new ProviderError(this.id, "pair_unavailable", "No quote");
    }
    return quotes;
  }

  private async quoteFlow(req: QuoteRequest, from: ProviderInstrument, to: ProviderInstrument, rateType: RateType): Promise<ProviderQuote> {
    const flow = rateType === "fixed" ? "fixed-rate" : "standard";
    const range = await this.range(from, to, flow);
    if (range.min && req.amount.lt(range.min)) throw new ProviderError(this.id, "amount_out_of_range", "Below minimum", undefined, { minAmount: range.min, maxAmount: range.max });
    if (range.max && req.amount.gt(range.max)) throw new ProviderError(this.id, "amount_out_of_range", "Above maximum", undefined, { minAmount: range.min, maxAmount: range.max });

    const raw = (await this.get(
      "/v2/exchange/estimated-amount",
      {
        fromCurrency: from.providerAssetCode,
        toCurrency: to.providerAssetCode,
        fromAmount: req.amount.toFixed(),
        fromNetwork: from.providerNetworkCode ?? "",
        toNetwork: to.providerNetworkCode ?? "",
        flow,
        type: "direct",
        useRateId: rateType === "fixed" ? "true" : "false",
      },
      "estimated-amount",
    )) as CnEstimate;

    const receive = requirePositive(this.id, raw?.toAmount, "toAmount");
    const sent = toDecimal(raw?.fromAmount);
    if (sent && !sent.eq(req.amount)) throw new ProviderError(this.id, "invalid_response", "fromAmount does not match request");
    const now = new Date();
    const validUntil = raw.validUntil ? new Date(raw.validUntil) : null;
    const guaranteed = rateType === "fixed" && !!raw.rateId && !!validUntil && !Number.isNaN(validUntil.getTime());
    const expiresAt = guaranteed ? validUntil! : new Date(now.getTime() + this.cfg.quoteTtlSeconds * 1000);
    const capabilities = await this.getCapabilities();

    const fees: NormalizedQuote["knownFees"] = [];
    const depositFee = optionalDecimalString(raw.depositFee);
    const withdrawalFee = optionalDecimalString(raw.withdrawalFee);
    if (depositFee && !new D(depositFee).isZero())
      fees.push({ type: "deposit", amount: depositFee, currency: req.fromAsset, includedInReceive: "unknown", note: "Reported by ChangeNOW" });
    if (withdrawalFee && !new D(withdrawalFee).isZero())
      fees.push({ type: "withdrawal", amount: withdrawalFee, currency: req.toAsset, includedInReceive: "unknown", note: "Reported by ChangeNOW" });

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
        estimatedReceiveAmount: receiveString(req.toAsset, receive),
        rateType,
        exchangeRate: rateOf(receive, req.amount),
        knownFees: fees,
        feesCompleteness: fees.length ? "partial" : "unknown",
        minAmount: range.min,
        maxAmount: range.max,
        estimatedDuration: parseDurationRange(raw.transactionSpeedForecast),
        kycRequirements: "may_be_required",
        expiresAt: expiresAt.toISOString(),
        expiryGuaranteed: guaranteed,
        retrievedAt: now.toISOString(),
        executionModes: capabilities.executionModes,
        providerReference: raw.rateId ?? null,
        warnings: raw.warningMessage ? [raw.warningMessage] : [],
        isDemo: false,
      },
      internals: {
        flow,
        fromCode: from.providerAssetCode,
        fromNet: from.providerNetworkCode,
        toCode: to.providerAssetCode,
        toNet: to.providerNetworkCode,
        rateId: raw.rateId ?? null,
      },
    };
  }

  buildReferralUrl(quote: NormalizedQuote, internals: QuoteInternals): string | null {
    if (!this.cfg.referralUrl) return null;
    const url = fillTemplate(this.cfg.referralUrl, {
      from: String(internals.fromCode ?? quote.sourceAsset.toLowerCase()),
      to: String(internals.toCode ?? quote.destinationAsset.toLowerCase()),
      amount: quote.sendAmount,
    });
    return isUrlOnHosts(url, this.redirectHosts) ? url : null;
  }

  async createExchange(r: ExchangeRequest): Promise<ExchangeResult> {
    if (!this.cfg.apiKey) throw new ProviderError(this.id, "not_configured", "CHANGENOW_API_KEY is not set");
    const i = r.internals;
    const body: Record<string, string> = {
      fromCurrency: String(i.fromCode),
      toCurrency: String(i.toCode),
      fromNetwork: String(i.fromNet ?? ""),
      toNetwork: String(i.toNet ?? ""),
      fromAmount: r.quote.sendAmount,
      address: r.payoutAddress,
      flow: String(i.flow),
      type: "direct",
    };
    if (r.payoutExtraId) body.extraId = r.payoutExtraId;
    if (r.refundAddress) body.refundAddress = r.refundAddress;
    if (r.refundExtraId) body.refundExtraId = r.refundExtraId;
    if (i.flow === "fixed-rate" && i.rateId) body.rateId = String(i.rateId);

    const res = (await requestJson({
      providerId: this.id,
      operation: "create-exchange",
      url: `${BASE}/v2/exchange`,
      method: "POST",
      allowedHosts: API_HOSTS,
      headers: this.headers(),
      body: JSON.stringify(body),
      timeoutMs: this.cfg.timeoutMs,
      fetchImpl: this.cfg.fetchImpl,
    })) as { id?: string; payinAddress?: string; payinExtraId?: string | null; payoutAddress?: string; fromAmount?: number; toAmount?: number };

    if (!res?.id || !res.payinAddress) throw new ProviderError(this.id, "invalid_response", "create: missing id or payinAddress");
    if (res.payoutAddress && res.payoutAddress !== r.payoutAddress) throw new ProviderError(this.id, "invalid_response", "create: payout address mismatch");
    return {
      externalId: res.id,
      payinAddress: res.payinAddress,
      payinExtraId: res.payinExtraId || null,
      payoutAddress: r.payoutAddress,
      sendAmount: optionalDecimalString(res.fromAmount) ?? r.quote.sendAmount,
      expectedReceive: optionalDecimalString(res.toAmount) ?? r.quote.estimatedReceiveAmount,
      payTill: null,
      status: "AWAITING_DEPOSIT",
      providerStatus: null,
    };
  }

  async getExchangeStatus(externalId: string): Promise<ExchangeStatusResult> {
    const res = (await this.get("/v2/exchange/by-id", { id: externalId }, "status")) as {
      status?: string;
      amountTo?: number | null;
      payinHash?: string | null;
      payoutHash?: string | null;
    };
    if (!res?.status) throw new ProviderError(this.id, "invalid_response", "status: missing status");
    return {
      status: CHANGENOW_STATUS[res.status] ?? "UNKNOWN",
      providerStatus: res.status,
      actualReceive: res.status === "finished" ? optionalDecimalString(res.amountTo) : null,
      payinHash: res.payinHash ?? null,
      payoutHash: res.payoutHash ?? null,
    };
  }

  async validateAddress(assetId: string, networkId: string, address: string): Promise<boolean | null> {
    const inst = findInstrument(await this.getSupportedAssets(), assetId, networkId);
    if (!inst) return null;
    // The docs example passes the ticker as `currency`; for multi-network tokens ChangeNOW's legacy
    // ticker is not exposed in our mapping, so we only validate native coins here.
    if (inst.providerAssetCode !== inst.providerNetworkCode) return null;
    const res = (await this.get("/v2/validate/address", { currency: inst.providerAssetCode, address }, "validate-address")) as { result?: boolean };
    return typeof res?.result === "boolean" ? res.result : null;
  }

  async healthCheck() {
    try {
      const list = await this.get("/v2/exchange/currencies", { active: "true", flow: "standard" }, "health");
      const ok = Array.isArray(list) && list.length > 0;
      return { ok: ok && !!this.cfg.apiKey, message: !this.cfg.apiKey ? "Public endpoints reachable; API key not configured" : ok ? "OK" : "Empty currency list" };
    } catch (e) {
      return { ok: false, message: isProviderError(e) ? `${e.code}: ${e.message}` : "error" };
    }
  }
}

function isKnownCrypto(assetId: string, networkId: string) {
  return ASSETS[assetId]?.kind === "crypto" && isValidInstrument(assetId, networkId);
}
