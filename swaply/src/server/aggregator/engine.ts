/**
 * Exchange Aggregation Engine.
 * validate → find providers supporting the route → query in parallel (bounded by timeouts) →
 * normalise → drop invalid/expired/out-of-range → rank by final receive amount → return.
 */
import crypto from "node:crypto";
import { z } from "zod";
import { ASSETS, isValidInstrument, routeKey } from "@/lib/catalog";
import { ProviderError, isProviderError, type ProviderErrorCode } from "@/lib/http";
import { D, parseUserAmount, toDecimal } from "@/lib/money";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { getProviderEntries, getProvider } from "../providers/registry";
import type { ExchangeProvider, NormalizedQuote, ProviderQuote, QuoteRequest } from "../providers/types";
import { isExpired, rankQuotes, type SortMode } from "./ranking";
import { loadQuote, saveQuote, type StoredQuote } from "./quote-store";

export const quoteRequestSchema = z
  .object({
    fromAsset: z.string().min(2).max(10),
    fromNetwork: z.string().min(2).max(20),
    toAsset: z.string().min(2).max(10),
    toNetwork: z.string().min(2).max(20),
    amount: z.string().min(1).max(40),
    rateType: z.enum(["any", "fixed", "floating"]).default("any"),
    sort: z.enum(["best", "fastest"]).default("best"),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict();

export type QuoteRequestInput = z.input<typeof quoteRequestSchema>;

export type ProviderOutcome =
  | { providerId: string; providerName: string; status: "ok"; quoteCount: number; durationMs: number }
  | { providerId: string; providerName: string; status: "no_route" | "out_of_range" | "error" | "not_configured" | "disabled"; code?: ProviderErrorCode; message: string; minAmount?: string | null; maxAmount?: string | null; durationMs?: number };

export interface AggregateResult {
  searchId: string;
  mode: "demo" | "live";
  route: string;
  request: { fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string; amount: string; rateType: string; sort: SortMode; country?: string };
  quotes: NormalizedQuote[];
  providers: ProviderOutcome[];
  /** Human-readable reason when no offers are available. */
  emptyReason: null | "no_providers_configured" | "route_not_supported" | "amount_out_of_range" | "all_providers_failed" | "fiat_not_integrated";
  /** Smallest minimum among providers that rejected the amount as too small. */
  suggestedMinAmount: string | null;
  generatedAt: string;
}

export class ValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
  }
}

export interface EngineHooks {
  onSearch?(r: AggregateResult, durationMs: number): Promise<void> | void;
}

export function validateRequest(input: unknown) {
  const parsed = quoteRequestSchema.safeParse(input);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new ValidationError(i?.path.join(".") || "body", i?.message ?? "Invalid request");
  }
  const r = parsed.data;
  if (!ASSETS[r.fromAsset]) throw new ValidationError("fromAsset", "Unknown asset");
  if (!ASSETS[r.toAsset]) throw new ValidationError("toAsset", "Unknown asset");
  if (!isValidInstrument(r.fromAsset, r.fromNetwork)) throw new ValidationError("fromNetwork", "Network not available for this asset");
  if (!isValidInstrument(r.toAsset, r.toNetwork)) throw new ValidationError("toNetwork", "Network not available for this asset");
  if (ASSETS[r.fromAsset]!.kind === "fiat") throw new ValidationError("fromAsset", "Buying crypto with fiat is not supported yet");
  if (r.fromAsset === r.toAsset && r.fromNetwork === r.toNetwork) throw new ValidationError("toAsset", "Source and destination are the same");
  const amount = parseUserAmount(r.amount);
  if (!amount) throw new ValidationError("amount", "Amount must be a positive number");
  if (amount.decimalPlaces() > ASSETS[r.fromAsset]!.precision) throw new ValidationError("amount", `At most ${ASSETS[r.fromAsset]!.precision} decimal places`);
  if (amount.gt("1e12")) throw new ValidationError("amount", "Amount is too large");
  return { ...r, amountDec: amount };
}

/** Sanity checks on a normalised quote. Returns a reason string if the quote must be dropped. */
export function rejectReason(q: Omit<NormalizedQuote, "quoteId">, req: QuoteRequest, now = Date.now()): string | null {
  if (q.sourceAsset !== req.fromAsset || q.sourceNetwork !== req.fromNetwork) return "source_mismatch";
  if (q.destinationAsset !== req.toAsset || q.destinationNetwork !== req.toNetwork) return "destination_mismatch";
  if (!new D(q.sendAmount).eq(req.amount)) return "amount_mismatch";
  const recv = toDecimal(q.estimatedReceiveAmount);
  if (!recv || recv.lte(0)) return "non_positive_receive";
  if (isExpired(q, now)) return "expired";
  if (q.minAmount && req.amount.lt(q.minAmount)) return "below_min";
  if (q.maxAmount && req.amount.gt(q.maxAmount)) return "above_max";
  return null;
}

async function supportsRoute(p: ExchangeProvider, r: QuoteRequest): Promise<boolean | "unknown"> {
  try {
    const list = await p.getSupportedAssets();
    const from = list.some((i) => i.assetId === r.fromAsset && i.networkId === r.fromNetwork && i.canSend);
    const to = list.some((i) => i.assetId === r.toAsset && i.networkId === r.toNetwork && i.canReceive);
    return from && to;
  } catch {
    return "unknown";
  }
}

export async function aggregate(input: unknown, hooks: EngineHooks = {}): Promise<AggregateResult> {
  const started = Date.now();
  const v = validateRequest(input);
  const mode = env().APP_MODE;
  const req: QuoteRequest = { fromAsset: v.fromAsset, fromNetwork: v.fromNetwork, toAsset: v.toAsset, toNetwork: v.toNetwork, amount: v.amountDec, rateType: v.rateType, country: v.country };
  const searchId = crypto.randomUUID();
  const entries = await getProviderEntries();
  const outcomes: ProviderOutcome[] = [];
  const collected: Array<{ pq: ProviderQuote; provider: ExchangeProvider }> = [];

  await Promise.all(
    entries.map(async ({ provider, enabled }) => {
      const base = { providerId: provider.id, providerName: provider.name };
      if (!enabled) return void outcomes.push({ ...base, status: "disabled", message: "Disabled by administrator" });
      const caps = await provider.getCapabilities();
      if (!caps.configured) return void outcomes.push({ ...base, status: "not_configured", message: "Partner API access not configured" });
      const supported = await supportsRoute(provider, req);
      if (supported === false) return void outcomes.push({ ...base, status: "no_route", message: "Route not supported by this partner" });
      const t0 = Date.now();
      try {
        const quotes = await provider.getQuotes(req);
        let kept = 0;
        for (const pq of quotes) {
          const reason = rejectReason(pq.quote, req);
          if (reason) {
            logger.info("aggregator.quote_rejected", { providerId: provider.id, reason });
            continue;
          }
          collected.push({ pq, provider });
          kept++;
        }
        outcomes.push(kept > 0 ? { ...base, status: "ok", quoteCount: kept, durationMs: Date.now() - t0 } : { ...base, status: "error", code: "invalid_response", message: "No valid offers returned", durationMs: Date.now() - t0 });
      } catch (err) {
        const pe = isProviderError(err) ? err : new ProviderError(provider.id, "upstream_error", "Unexpected error");
        if (!(isProviderError(err))) logger.error("aggregator.provider_crash", { providerId: provider.id, err: String(err) });
        const status = pe.code === "pair_unavailable" ? "no_route" : pe.code === "amount_out_of_range" ? "out_of_range" : pe.code === "not_configured" ? "not_configured" : "error";
        outcomes.push({ ...base, status, code: pe.code, message: pe.message, minAmount: pe.details?.minAmount ?? null, maxAmount: pe.details?.maxAmount ?? null, durationMs: Date.now() - t0 });
      }
    }),
  );

  const quotes: NormalizedQuote[] = collected.map(({ pq }) => ({ ...pq.quote, quoteId: crypto.randomBytes(12).toString("base64url") }));
  const ranked = rankQuotes(quotes, v.sort);
  const requestSummary = { fromAsset: v.fromAsset, fromNetwork: v.fromNetwork, toAsset: v.toAsset, toNetwork: v.toNetwork, amount: v.amountDec.toFixed(), country: v.country };

  await Promise.all(
    collected.map(({ pq }, i) => {
      const stored: StoredQuote = { quote: quotes[i]!, internals: pq.internals, request: requestSummary, searchSessionId: searchId };
      return saveQuote(stored);
    }),
  );

  let emptyReason: AggregateResult["emptyReason"] = null;
  let suggestedMinAmount: string | null = null;
  if (ranked.length === 0) {
    const tooSmall = outcomes.filter((o) => o.status === "out_of_range" && o.minAmount && v.amountDec.lt(o.minAmount));
    if (tooSmall.length) suggestedMinAmount = tooSmall.map((o) => new D((o as { minAmount: string }).minAmount)).reduce((a, b) => (a.lt(b) ? a : b)).toFixed();
    const configured = outcomes.filter((o) => o.status !== "not_configured" && o.status !== "disabled");
    if (configured.length === 0) emptyReason = ASSETS[v.toAsset]!.kind === "fiat" ? "fiat_not_integrated" : "no_providers_configured";
    else if (outcomes.some((o) => o.status === "out_of_range")) emptyReason = "amount_out_of_range";
    else if (configured.every((o) => o.status === "no_route")) emptyReason = ASSETS[v.toAsset]!.kind === "fiat" ? "fiat_not_integrated" : "route_not_supported";
    else emptyReason = "all_providers_failed";
  }

  const result: AggregateResult = {
    searchId,
    mode,
    route: routeKey(v.fromAsset, v.fromNetwork, v.toAsset, v.toNetwork),
    request: { ...requestSummary, rateType: v.rateType, sort: v.sort },
    quotes: ranked,
    providers: outcomes.sort((a, b) => a.providerName.localeCompare(b.providerName)),
    emptyReason,
    suggestedMinAmount,
    generatedAt: new Date().toISOString(),
  };
  try {
    await hooks.onSearch?.(result, Date.now() - started);
  } catch (err) {
    logger.warn("aggregator.hook_failed", { err: String(err) });
  }
  return result;
}

/** Tolerance for a downward move before the user must re-confirm (0.05%). */
export const REQUOTE_TOLERANCE = new D("0.0005");

export type ReverifyResult =
  | { status: "ok"; quote: NormalizedQuote; stored: StoredQuote; provider: ExchangeProvider }
  | { status: "changed"; previous: NormalizedQuote; quote: NormalizedQuote; stored: StoredQuote }
  | { status: "not_found" }
  | { status: "unavailable"; reason: string };

/**
 * Re-checks an offer with the partner right before the user proceeds.
 * `acceptedReceiveAmount` is the amount the user explicitly confirmed (after a previous "changed" answer).
 */
export async function reverifyQuote(quoteId: string, acceptedReceiveAmount?: string): Promise<ReverifyResult> {
  const stored = await loadQuote(quoteId);
  if (!stored) return { status: "not_found" };
  const entry = await getProvider(stored.quote.providerId);
  if (!entry || !entry.enabled) return { status: "unavailable", reason: "provider_disabled" };
  const old = stored.quote;
  const req: QuoteRequest = {
    fromAsset: old.sourceAsset,
    fromNetwork: old.sourceNetwork,
    toAsset: old.destinationAsset,
    toNetwork: old.destinationNetwork,
    amount: new D(old.sendAmount),
    rateType: old.rateType,
    country: stored.request.country,
  };
  let fresh: ProviderQuote[];
  try {
    fresh = await entry.provider.getQuotes(req);
  } catch (err) {
    return { status: "unavailable", reason: isProviderError(err) ? err.code : "error" };
  }
  const match = fresh.find((f) => f.quote.rateType === old.rateType && (f.quote.executingPartner?.id ?? null) === (old.executingPartner?.id ?? null) && !rejectReason(f.quote, req));
  if (!match) return { status: "unavailable", reason: "offer_gone" };

  const quote: NormalizedQuote = { ...match.quote, quoteId: crypto.randomBytes(12).toString("base64url") };
  const newStored: StoredQuote = { ...stored, quote, internals: match.internals };
  await saveQuote(newStored);

  const reference = new D(acceptedReceiveAmount && parseUserAmount(acceptedReceiveAmount) ? acceptedReceiveAmount : old.estimatedReceiveAmount);
  const floor = reference.times(new D(1).minus(REQUOTE_TOLERANCE));
  if (new D(quote.estimatedReceiveAmount).lt(floor)) return { status: "changed", previous: old, quote, stored: newStored };
  return { status: "ok", quote, stored: newStored, provider: entry.provider };
}
