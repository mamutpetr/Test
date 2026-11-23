/**
 * Embedded exchange flow (phase 2, behind EMBEDDED_EXCHANGE_ENABLED).
 * The exchange is created and executed by the PARTNER via its official API. SWAPLY only relays the
 * partner-issued deposit details and the partner-reported status. Demo mode never creates real exchanges.
 */
import crypto from "node:crypto";
import { z } from "zod";
import { Prisma, type Exchange } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { validateAddressFormat, validateExtraId } from "@/lib/address";
import { reverifyQuote } from "../aggregator/engine";
import { getProvider } from "../providers/registry";
import { DemoProvider } from "../providers/demo/adapter";
import { ensureProviderRows, trackEvent } from "../analytics/record";
import type { CanonicalExchangeStatus, NormalizedQuote } from "../providers/types";

export const createExchangeSchema = z
  .object({
    quoteId: z.string().min(8).max(64),
    payoutAddress: z.string().min(10).max(128),
    payoutExtraId: z.string().max(64).optional(),
    refundAddress: z.string().min(10).max(128).optional(),
    refundExtraId: z.string().max(64).optional(),
    acceptedReceiveAmount: z.string().max(40).optional(),
  })
  .strict();

export const TERMINAL: CanonicalExchangeStatus[] = ["COMPLETED", "FAILED", "EXPIRED", "REFUNDED"];

export type CreateOutcome =
  | { status: "created"; exchange: PublicExchange }
  | { status: "replayed"; exchange: PublicExchange }
  | { status: "quote_changed"; previous: NormalizedQuote; quote: NormalizedQuote }
  | { status: "error"; http: number; code: string; message: string };

export interface PublicExchange {
  id: string;
  providerId: string;
  providerName: string;
  externalId: string | null;
  status: CanonicalExchangeStatus;
  statusFromProvider: boolean;
  providerStatus: string | null;
  isDemo: boolean;
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
  sendAmount: string;
  expectedReceive: string;
  actualReceive: string | null;
  payinAddress: string | null;
  payinExtraId: string | null;
  payoutAddressMasked: string;
  payTill: string | null;
  createdAt: string;
  updatedAt: string;
  statusTrackingAvailable: boolean;
}

const mask = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a);

export function toPublic(e: Exchange, providerName: string, tracking: boolean): PublicExchange {
  return {
    id: e.id,
    providerId: e.providerId,
    providerName,
    externalId: e.externalId,
    status: e.status,
    statusFromProvider: e.statusFromProvider,
    providerStatus: e.providerStatus,
    isDemo: e.mode === "demo",
    fromAsset: e.fromAsset,
    fromNetwork: e.fromNetwork,
    toAsset: e.toAsset,
    toNetwork: e.toNetwork,
    sendAmount: e.sendAmount.toFixed(),
    expectedReceive: e.expectedReceive.toFixed(),
    actualReceive: e.actualReceive ? e.actualReceive.toFixed() : null,
    payinAddress: e.payinAddress,
    payinExtraId: e.payinExtraId,
    payoutAddressMasked: mask(e.payoutAddress),
    payTill: e.payTill ? e.payTill.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    statusTrackingAvailable: tracking,
  };
}

export function requestHash(body: z.infer<typeof createExchangeSchema>) {
  const normalized = JSON.stringify([body.quoteId, body.payoutAddress.trim(), body.payoutExtraId ?? "", body.refundAddress?.trim() ?? "", body.refundExtraId ?? ""]);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export async function createEmbeddedExchange(body: z.infer<typeof createExchangeSchema>, idempotencyKey: string): Promise<CreateOutcome> {
  const e = env();
  if (!e.EMBEDDED_EXCHANGE_ENABLED) return { status: "error", http: 403, code: "feature_disabled", message: "Embedded exchanges are not enabled. Use the partner redirect." };
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) return { status: "error", http: 400, code: "invalid_idempotency_key", message: "Idempotency-Key header (16-128 chars [A-Za-z0-9_-]) is required" };

  const hash = requestHash(body);
  const existing = await prisma.exchange.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.requestHash !== hash) return { status: "error", http: 422, code: "idempotency_conflict", message: "Idempotency-Key was used with a different request" };
    const p = await getProvider(existing.providerId);
    return { status: "replayed", exchange: toPublic(existing, p?.provider.name ?? existing.providerId, true) };
  }

  const v = await reverifyQuote(body.quoteId, body.acceptedReceiveAmount);
  if (v.status === "not_found") return { status: "error", http: 404, code: "quote_not_found", message: "Quote not found or expired. Search again." };
  if (v.status === "unavailable") return { status: "error", http: 410, code: "quote_unavailable", message: `Offer is no longer available (${v.reason})` };
  if (v.status === "changed") return { status: "quote_changed", previous: v.previous, quote: v.quote };
  const { quote, stored, provider } = v;

  if (e.APP_MODE === "live" && provider.isDemo) return { status: "error", http: 400, code: "demo_provider", message: "Demo provider in live mode" };
  if (e.APP_MODE === "demo" && !provider.isDemo) return { status: "error", http: 400, code: "demo_mode", message: "Real exchanges cannot be created in demo mode" };
  if (!quote.executionModes.includes("embedded") || !provider.createExchange) return { status: "error", http: 400, code: "embedded_not_supported", message: "This partner does not support in-app exchanges" };

  const payout = validateAddressFormat(quote.destinationNetwork, body.payoutAddress);
  if (!payout.valid) return { status: "error", http: 400, code: "invalid_payout_address", message: `Payout address is not a valid ${quote.destinationNetwork} address` };
  if (body.refundAddress) {
    const refund = validateAddressFormat(quote.sourceNetwork, body.refundAddress);
    if (!refund.valid) return { status: "error", http: 400, code: "invalid_refund_address", message: `Refund address is not a valid ${quote.sourceNetwork} address` };
  }
  if (!validateExtraId(body.payoutExtraId) || !validateExtraId(body.refundExtraId)) return { status: "error", http: 400, code: "invalid_extra_id", message: "Invalid memo / extra id" };
  if (provider.validateAddress) {
    const ok = await provider.validateAddress(quote.destinationAsset, quote.destinationNetwork, body.payoutAddress.trim()).catch(() => null);
    if (ok === false) return { status: "error", http: 400, code: "invalid_payout_address", message: "Partner rejected the payout address" };
  }

  const result = await provider.createExchange({
    quote,
    internals: stored.internals,
    payoutAddress: body.payoutAddress.trim(),
    payoutExtraId: body.payoutExtraId,
    refundAddress: body.refundAddress?.trim(),
    refundExtraId: body.refundExtraId,
  });

  await ensureProviderRows();
  try {
    const row = await prisma.exchange.create({
      data: {
        providerId: provider.id,
        externalId: result.externalId,
        idempotencyKey,
        requestHash: hash,
        status: result.status,
        providerStatus: result.providerStatus,
        statusFromProvider: false,
        mode: e.APP_MODE,
        fromAsset: quote.sourceAsset,
        fromNetwork: quote.sourceNetwork,
        toAsset: quote.destinationAsset,
        toNetwork: quote.destinationNetwork,
        sendAmount: new Prisma.Decimal(result.sendAmount),
        expectedReceive: new Prisma.Decimal(result.expectedReceive),
        payinAddress: result.payinAddress,
        payinExtraId: result.payinExtraId,
        payoutAddress: result.payoutAddress,
        payoutExtraId: body.payoutExtraId ?? null,
        refundAddress: body.refundAddress?.trim() ?? null,
        payTill: result.payTill ? new Date(result.payTill) : null,
      },
    });
    await trackEvent("provider_selected", { providerId: provider.id, properties: { mode: "embedded" } });
    return { status: "created", exchange: toPublic(row, provider.name, true) };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await prisma.exchange.findUnique({ where: { idempotencyKey } });
      if (again) return { status: "replayed", exchange: toPublic(again, provider.name, true) };
    }
    logger.error("exchange.persist_failed", { providerId: provider.id, externalId: result.externalId, err: String(err) });
    throw err;
  }
}

/** Pulls the partner status. Status only advances from what the partner reports. */
export async function refreshExchangeStatus(row: Exchange): Promise<Exchange> {
  if (TERMINAL.includes(row.status)) return row;
  const entry = await getProvider(row.providerId);
  if (!entry?.provider.getExchangeStatus || !row.externalId) return row;
  try {
    const p = entry.provider;
    const s = p instanceof DemoProvider ? await p.getExchangeStatus(row.externalId, row.createdAt) : await p.getExchangeStatus!(row.externalId);
    const completed = s.status === "COMPLETED";
    const updated = await prisma.exchange.update({
      where: { id: row.id },
      data: {
        status: s.status === "UNKNOWN" ? row.status : s.status,
        providerStatus: s.providerStatus,
        statusFromProvider: true,
        actualReceive: s.actualReceive ? new Prisma.Decimal(s.actualReceive) : undefined,
        lastCheckedAt: new Date(),
        completedAt: completed && !row.completedAt ? new Date() : undefined,
      },
    });
    if (completed && row.status !== "COMPLETED") await onCompleted(updated);
    return updated;
  } catch (err) {
    logger.warn("exchange.status_refresh_failed", { id: row.id, err: String(err) });
    await prisma.exchange.update({ where: { id: row.id }, data: { lastCheckedAt: new Date() } }).catch(() => undefined);
    return row;
  }
}

/** On partner-confirmed completion: record an EXPECTED revenue line (never "earned" until reconciled). */
async function onCompleted(e: Exchange) {
  await trackEvent("exchange_confirmed", { providerId: e.providerId, properties: { mode: e.mode } });
  if (e.mode !== "live") return;
  const p = await prisma.provider.findUnique({ where: { id: e.providerId } });
  if (!p?.commissionModel) return;
  const expected = p.commissionModel === "REVENUE_SHARE" && p.commissionRate ? e.sendAmount.times(p.commissionRate) : null;
  await prisma.partnerRevenue.create({
    data: {
      providerId: e.providerId,
      exchangeId: e.id,
      providerTransactionId: e.externalId,
      commissionModel: p.commissionModel,
      commissionRate: p.commissionRate,
      currency: p.commissionCurrency ?? e.fromAsset,
      volume: e.sendAmount,
      expectedAmount: expected,
      status: "EXPECTED",
      note: expected ? "Estimated from configured rate × send amount; confirm via partner report" : "Amount unknown until partner report",
    },
  }).catch((err) => logger.warn("revenue.expected_failed", { err: String(err) }));
}

export async function getPublicExchange(id: string): Promise<PublicExchange | null> {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  let row = await prisma.exchange.findUnique({ where: { id } });
  if (!row) return null;
  const stale = !row.lastCheckedAt || Date.now() - row.lastCheckedAt.getTime() > 20_000;
  if (stale) row = await refreshExchangeStatus(row);
  const entry = await getProvider(row.providerId);
  return toPublic(row, entry?.provider.name ?? row.providerId, !!entry?.provider.getExchangeStatus);
}
