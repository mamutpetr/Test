/**
 * Swapzone adapter — Instant Exchange API v1.
 * Source: official Swapzone Postman collection (https://documenter.getpostman.com/view/16362858/UVXokDS6),
 * linked from https://swapzone.io/partners/exchange-api.
 *   Auth header: x-api-key
 *   GET  /v1/exchange/currencies → [{ name, ticker, network, smartContract }]
 *   GET  /v1/exchange/get-rate?from&to&amount&rateType(all|fixed|floating)&availableInUSA&chooseRate(best|all|recommended)
 *        &noRefundAddress&fromNetwork&toNetwork → { adapter, from, fromNetwork, to, toNetwork, amountFrom,
 *        amountTo ("Amount to receive after exchange"), quotaId, minAmount, maxAmount, time, open_fincases }
 *   POST /v1/exchange/create { from, to, amountDeposit, addressReceive, extraIdReceive, refundAddress, refundExtraId,
 *        quotaId, fromNetwork, toNetwork } → { transaction: { id, addressDeposit, amountEstimated, payTill, status } }
 *   GET  /v1/exchange/tx?id= → { transaction: { status: waiting|confirming|exchanging|sending|finished|failed|refunded|overdue } }
 * Referral link (partners page): https://swapzone.io/?refId=<refId>
 * Swapzone is itself an aggregator: each offer is executed by the partner named in `adapter`.
 */
import { ASSETS, isValidInstrument } from "@/lib/catalog";
import { ProviderError, isProviderError, requestJson } from "@/lib/http";
import { toDecimal } from "@/lib/money";
import {
  cachedInstruments,
  findInstrument,
  optionalDecimalString,
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

const BASE = "https://api.swapzone.io";
const API_HOSTS = ["api.swapzone.io"] as const;

export const SWAPZONE_NETWORKS: Record<string, string> = {
  TRON: "TRX",
  ETHEREUM: "ETH",
  BSC: "BSC",
  TON: "TON",
  SOLANA: "SOL",
  BITCOIN: "BTC",
  LITECOIN: "LTC",
};

export const SWAPZONE_STATUS: Record<string, CanonicalExchangeStatus> = {
  waiting: "AWAITING_DEPOSIT",
  confirming: "CONFIRMING",
  exchanging: "EXCHANGING",
  sending: "SENDING",
  finished: "COMPLETED",
  failed: "FAILED",
  refunded: "REFUNDED",
  overdue: "EXPIRED",
};

interface SzCurrency {
  ticker: string;
  network: string;
  name?: string;
}

interface SzRate {
  adapter?: string;
  from?: string;
  fromNetwork?: string;
  to?: string;
  toNetwork?: string;
  amountFrom?: number | string;
  amountTo?: number | string;
  minAmount?: number | string | null;
  maxAmount?: number | string | null;
  quotaId?: string;
  open_fincases?: unknown;
  message?: string;
}

export interface SwapzoneConfig {
  apiKey?: string;
  refId?: string;
  timeoutMs: number;
  quoteTtlSeconds: number;
  embeddedEnabled: boolean;
  fetchImpl?: typeof fetch;
}

function titleCase(s: string) {
  return s.replace(/(^|[-_ ])(\w)/g, (_m, sep: string, c: string) => (sep ? " " : "") + c.toUpperCase());
}

export class SwapzoneProvider implements ExchangeProvider {
  readonly id = "swapzone";
  readonly name = "Swapzone";
  readonly websiteUrl = "https://swapzone.io";
  readonly isDemo = false;
  readonly redirectHosts = ["swapzone.io"] as const;

  constructor(private cfg: SwapzoneConfig) {}

  private headers(): Record<string, string> {
    return this.cfg.apiKey ? { "x-api-key": this.cfg.apiKey } : {};
  }

  private get(path: string, params: Record<string, string>, operation: string) {
    const qs = new URLSearchParams(params).toString();
    return requestJson<unknown>({
      providerId: this.id,
      operation,
      url: `${BASE}${path}${qs ? `?${qs}` : ""}`,
      allowedHosts: API_HOSTS,
      headers: this.headers(),
      timeoutMs: this.cfg.timeoutMs,
      fetchImpl: this.cfg.fetchImpl,
    });
  }

  async getCapabilities(): Promise<ProviderCapabilities> {
    const configured = !!this.cfg.apiKey;
    const refOk = !!this.cfg.refId && /^[A-Za-z0-9_-]{1,64}$/.test(this.cfg.refId);
    const modes: ProviderCapabilities["executionModes"] = [];
    if (configured && refOk) modes.push("redirect");
    if (configured && this.cfg.embeddedEnabled) modes.push("embedded");
    return {
      rateTypes: ["floating", "fixed"],
      executionModes: modes,
      embeddedSupportedByApi: true,
      statusTracking: true,
      fiatPayout: false,
      referral: { supported: true, configured: refOk, format: "https://swapzone.io/?refId=<SWAPZONE_REF_ID>" },
      requiresApiKey: true,
      configured,
      isAggregator: true,
      docsUrl: "https://swapzone.io/partners/exchange-api",
      notes: [
        "amountTo is documented as 'Amount to receive after exchange' and is used as the net amount.",
        "Referral link carries only the documented refId — the user re-enters the pair on swapzone.io.",
        "Offers from partners with open financial claims are not requested (ofcAdapter is never sent).",
      ],
    };
  }

  async getSupportedAssets(): Promise<ProviderInstrument[]> {
    return cachedInstruments(this.id, 3600, async () => {
      const data = await this.get("/v1/exchange/currencies", {}, "currencies");
      if (!Array.isArray(data)) throw new ProviderError(this.id, "invalid_response", "currencies: expected array");
      const out: ProviderInstrument[] = [];
      for (const c of data as SzCurrency[]) {
        if (!c?.ticker || !c.network) continue;
        const networkId = Object.entries(SWAPZONE_NETWORKS).find(([, code]) => code === c.network)?.[0];
        const assetId = c.ticker.toUpperCase();
        if (!networkId || ASSETS[assetId]?.kind !== "crypto" || !isValidInstrument(assetId, networkId)) continue;
        if (out.some((o) => o.assetId === assetId && o.networkId === networkId)) continue;
        out.push({ assetId, networkId, providerAssetCode: c.ticker, providerNetworkCode: c.network, fixedRate: null, canSend: true, canReceive: true, memoSupported: null });
      }
      return out;
    });
  }

  async getQuotes(req: QuoteRequest): Promise<ProviderQuote[]> {
    if (!this.cfg.apiKey) throw new ProviderError(this.id, "not_configured", "SWAPZONE_API_KEY is not set");
    const instruments = await this.getSupportedAssets();
    const from = findInstrument(instruments, req.fromAsset, req.fromNetwork);
    const to = findInstrument(instruments, req.toAsset, req.toNetwork);
    if (!from || !to) throw new ProviderError(this.id, "pair_unavailable", "Route not supported by Swapzone");

    // One call per rate type so every offer's rate type is known, not guessed.
    const types: RateType[] = req.rateType === "any" ? ["floating", "fixed"] : [req.rateType];
    const settled = await Promise.allSettled(types.map((t) => this.rateCall(req, from, to, t)));
    const quotes = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
    if (quotes.length === 0) {
      const rejected = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
      throw rejected?.reason ?? new ProviderError(this.id, "pair_unavailable", "No offers");
    }
    return quotes;
  }

  private async rateCall(req: QuoteRequest, from: ProviderInstrument, to: ProviderInstrument, rateType: RateType): Promise<ProviderQuote[]> {
    const params: Record<string, string> = {
      from: from.providerAssetCode,
      to: to.providerAssetCode,
      amount: req.amount.toFixed(),
      rateType,
      chooseRate: "all",
      fromNetwork: from.providerNetworkCode ?? "",
      toNetwork: to.providerNetworkCode ?? "",
      availableInUSA: req.country === "US" ? "true" : "false",
      noRefundAddress: "false",
    };
    const data = await this.get("/v1/exchange/get-rate", params, "get-rate");
    // Docs show a single object for chooseRate=best; chooseRate=all may return a list. Accept both shapes.
    const rows: SzRate[] = Array.isArray(data)
      ? (data as SzRate[])
      : data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)
        ? ((data as { data: SzRate[] }).data)
        : [data as SzRate];

    const now = new Date();
    const caps = await this.getCapabilities();
    const out: ProviderQuote[] = [];
    let rangeError: ProviderError | null = null;

    for (const r of rows) {
      if (!r || typeof r !== "object" || !r.adapter) continue;
      const amountTo = toDecimal(r.amountTo);
      const min = optionalDecimalString(r.minAmount);
      const max = optionalDecimalString(r.maxAmount);
      if ((min && req.amount.lt(min)) || (max && req.amount.gt(max))) {
        rangeError ??= new ProviderError(this.id, "amount_out_of_range", "Amount out of range", undefined, { minAmount: min, maxAmount: max });
        continue;
      }
      if (!amountTo || amountTo.lte(0)) continue;
      if (r.toNetwork && r.toNetwork !== to.providerNetworkCode) continue; // never mix networks
      const receive = requirePositive(this.id, amountTo.toFixed(), "amountTo");
      const warnings: string[] = [];
      if (r.open_fincases && r.open_fincases !== "0" && r.open_fincases !== "false") warnings.push("Swapzone reports open financial claims for this partner.");
      out.push({
        quote: {
          providerId: this.id,
          providerName: this.name,
          executingPartner: { id: r.adapter, name: titleCase(r.adapter) },
          sourceAsset: req.fromAsset,
          sourceNetwork: req.fromNetwork,
          destinationAsset: req.toAsset,
          destinationNetwork: req.toNetwork,
          sendAmount: req.amount.toFixed(),
          estimatedReceiveAmount: receiveString(req.toAsset, receive),
          rateType,
          exchangeRate: rateOf(receive, req.amount),
          knownFees: [],
          feesCompleteness: "unknown",
          minAmount: min,
          maxAmount: max,
          estimatedDuration: null,
          kycRequirements: "unknown",
          expiresAt: new Date(now.getTime() + this.cfg.quoteTtlSeconds * 1000).toISOString(),
          expiryGuaranteed: false,
          retrievedAt: now.toISOString(),
          executionModes: caps.executionModes,
          providerReference: r.quotaId ?? null,
          warnings,
          isDemo: false,
        },
        internals: {
          adapter: r.adapter,
          quotaId: r.quotaId ?? null,
          fromCode: from.providerAssetCode,
          fromNet: from.providerNetworkCode,
          toCode: to.providerAssetCode,
          toNet: to.providerNetworkCode,
        },
      });
    }
    if (out.length === 0) throw rangeError ?? new ProviderError(this.id, "pair_unavailable", (rows[0] as SzRate | undefined)?.message ?? "No offers");
    return out;
  }

  buildReferralUrl(): string | null {
    if (!this.cfg.refId || !/^[A-Za-z0-9_-]{1,64}$/.test(this.cfg.refId)) return null;
    return `https://swapzone.io/?refId=${encodeURIComponent(this.cfg.refId)}`;
  }

  async createExchange(r: ExchangeRequest): Promise<ExchangeResult> {
    if (!this.cfg.apiKey) throw new ProviderError(this.id, "not_configured", "SWAPZONE_API_KEY is not set");
    const i: QuoteInternals = r.internals;
    const body: Record<string, string> = {
      from: String(i.fromCode),
      to: String(i.toCode),
      fromNetwork: String(i.fromNet ?? ""),
      toNetwork: String(i.toNet ?? ""),
      amountDeposit: r.quote.sendAmount,
      addressReceive: r.payoutAddress,
    };
    if (i.quotaId) body.quotaId = String(i.quotaId);
    if (r.payoutExtraId) body.extraIdReceive = r.payoutExtraId;
    if (r.refundAddress) body.refundAddress = r.refundAddress;
    if (r.refundExtraId) body.refundExtraId = r.refundExtraId;

    const res = (await requestJson({
      providerId: this.id,
      operation: "create-exchange",
      url: `${BASE}/v1/exchange/create`,
      method: "POST",
      allowedHosts: API_HOSTS,
      headers: this.headers(),
      body: JSON.stringify(body),
      timeoutMs: this.cfg.timeoutMs,
      fetchImpl: this.cfg.fetchImpl,
    })) as { transaction?: { id?: string; addressDeposit?: string; extraIdDeposit?: string; addressReceive?: string; amountDeposit?: string; amountEstimated?: string; payTill?: string; status?: string } };

    const t = res?.transaction;
    if (!t?.id || !t.addressDeposit) throw new ProviderError(this.id, "invalid_response", "create: missing id or addressDeposit");
    if (t.addressReceive && t.addressReceive !== r.payoutAddress) throw new ProviderError(this.id, "invalid_response", "create: payout address mismatch");
    return {
      externalId: t.id,
      payinAddress: t.addressDeposit,
      payinExtraId: t.extraIdDeposit || null,
      payoutAddress: r.payoutAddress,
      sendAmount: optionalDecimalString(t.amountDeposit) ?? r.quote.sendAmount,
      expectedReceive: optionalDecimalString(t.amountEstimated) ?? r.quote.estimatedReceiveAmount,
      payTill: t.payTill ?? null,
      status: (t.status && SWAPZONE_STATUS[t.status]) || "AWAITING_DEPOSIT",
      providerStatus: t.status ?? null,
    };
  }

  async getExchangeStatus(externalId: string): Promise<ExchangeStatusResult> {
    const res = (await this.get("/v1/exchange/tx", { id: externalId }, "status")) as {
      transaction?: { status?: string; amountRealReceive?: string; payinHash?: string; payoutHash?: string };
    };
    const t = res?.transaction;
    if (!t?.status) throw new ProviderError(this.id, "invalid_response", "status: missing status");
    return {
      status: SWAPZONE_STATUS[t.status] ?? "UNKNOWN",
      providerStatus: t.status,
      actualReceive: t.status === "finished" ? optionalDecimalString(t.amountRealReceive) : null,
      payinHash: t.payinHash ?? null,
      payoutHash: t.payoutHash ?? null,
    };
  }

  async healthCheck() {
    try {
      const list = await this.get("/v1/exchange/currencies", {}, "health");
      const ok = Array.isArray(list) && list.length > 0;
      return { ok: ok && !!this.cfg.apiKey, message: !this.cfg.apiKey ? "Public endpoints reachable; API key not configured" : ok ? "OK" : "Empty currency list" };
    } catch (e) {
      return { ok: false, message: isProviderError(e) ? `${e.code}: ${e.message}` : "error" };
    }
  }
}

export type { NormalizedQuote };
