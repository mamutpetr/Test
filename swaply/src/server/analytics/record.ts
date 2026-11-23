/**
 * Best-effort persistence of searches, provider calls and analytics events.
 * Privacy: no IPs, user agents, wallet addresses or emails are stored here.
 * Failures are logged and never break the user-facing request.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { setProviderCallObserver } from "@/lib/http";
import { getProviderEntries } from "../providers/registry";
import type { AggregateResult } from "../aggregator/engine";

export type AnalyticsName = "search_initiated" | "quotes_displayed" | "provider_selected" | "referral_redirect" | "exchange_confirmed" | "revenue_confirmed";

const g = globalThis as unknown as { __swaplyRowsEnsured?: Promise<void>; __swaplyObserver?: boolean; __swaplyCallBuffer?: Prisma.ProviderCallLogCreateManyInput[] };

/** Creates Provider rows for the current mode's adapters if missing (never overwrites admin settings). */
export function ensureProviderRows(): Promise<void> {
  g.__swaplyRowsEnsured ??= (async () => {
    try {
      const entries = await getProviderEntries();
      for (const { provider, priority } of entries) {
        const caps = await provider.getCapabilities();
        await prisma.provider.upsert({
          where: { id: provider.id },
          create: {
            id: provider.id,
            name: provider.name,
            enabled: true,
            priority,
            integrationStatus: provider.isDemo ? "DEMO" : caps.configured ? "ACTIVE" : "NOT_CONFIGURED",
            capabilities: caps as unknown as Prisma.InputJsonValue,
            websiteUrl: provider.websiteUrl,
          },
          update: { capabilities: caps as unknown as Prisma.InputJsonValue, integrationStatus: provider.isDemo ? "DEMO" : caps.configured ? "ACTIVE" : "NOT_CONFIGURED" },
        });
      }
    } catch (err) {
      g.__swaplyRowsEnsured = undefined;
      logger.warn("analytics.ensure_rows_failed", { err: String(err) });
    }
  })();
  return g.__swaplyRowsEnsured;
}

/** Buffers provider call metrics and flushes them in batches. */
export function installProviderCallLogging() {
  if (g.__swaplyObserver) return;
  g.__swaplyObserver = true;
  g.__swaplyCallBuffer = [];
  setProviderCallObserver((e) => {
    g.__swaplyCallBuffer!.push({ providerId: e.providerId, operation: e.operation, ok: e.ok, durationMs: e.durationMs, errorCode: e.errorCode ?? null, httpStatus: e.httpStatus ?? null });
    if (g.__swaplyCallBuffer!.length >= 20) void flushCalls();
  });
  const t = setInterval(() => void flushCalls(), 5000);
  (t as { unref?: () => void }).unref?.();
}

async function flushCalls() {
  const buf = g.__swaplyCallBuffer;
  if (!buf?.length) return;
  g.__swaplyCallBuffer = [];
  try {
    await ensureProviderRows();
    await prisma.providerCallLog.createMany({ data: buf });
  } catch (err) {
    logger.warn("analytics.flush_calls_failed", { err: String(err), count: buf.length });
  }
}

export async function trackEvent(name: AnalyticsName, data: { providerId?: string; sessionRef?: string; properties?: Record<string, unknown> } = {}) {
  try {
    await prisma.analyticsEvent.create({ data: { name, providerId: data.providerId, sessionRef: data.sessionRef, properties: (data.properties ?? {}) as Prisma.InputJsonValue } });
  } catch (err) {
    logger.warn("analytics.event_failed", { name, err: String(err) });
  }
}

export async function recordSearch(r: AggregateResult, durationMs: number) {
  try {
    await ensureProviderRows();
    await prisma.searchSession.create({
      data: {
        id: r.searchId,
        request: r.request as unknown as Prisma.InputJsonValue,
        mode: r.mode,
        quoteCount: r.quotes.length,
        errorCount: r.providers.filter((p) => p.status === "error").length,
        durationMs,
      },
    });
    if (r.quotes.length) {
      await prisma.quote.createMany({
        data: r.quotes.map((q) => ({
          id: q.quoteId,
          searchSessionId: r.searchId,
          providerId: q.providerId,
          executingPartner: q.executingPartner?.id ?? null,
          route: r.route,
          sendAmount: new Prisma.Decimal(q.sendAmount),
          receiveAmount: new Prisma.Decimal(q.estimatedReceiveAmount),
          rateType: q.rateType,
          fees: q.knownFees as unknown as Prisma.InputJsonValue,
          providerReference: q.providerReference,
          expiresAt: new Date(q.expiresAt),
        })),
        skipDuplicates: true,
      });
    }
    await prisma.analyticsEvent.createMany({
      data: [
        { name: "search_initiated", sessionRef: r.searchId, properties: { route: r.route, mode: r.mode } },
        ...(r.quotes.length ? [{ name: "quotes_displayed", sessionRef: r.searchId, properties: { count: r.quotes.length, best: r.quotes[0]!.providerId } }] : []),
      ],
    });
  } catch (err) {
    logger.warn("analytics.record_search_failed", { err: String(err) });
  }
}

/** Persists a quote produced by re-verification so referral clicks can reference it. */
export async function persistQuoteRow(q: AggregateResult["quotes"][number], route: string, searchSessionId: string | null) {
  try {
    await prisma.quote.upsert({
      where: { id: q.quoteId },
      update: {},
      create: {
        id: q.quoteId,
        searchSessionId: searchSessionId ?? undefined,
        providerId: q.providerId,
        executingPartner: q.executingPartner?.id ?? null,
        route,
        sendAmount: new Prisma.Decimal(q.sendAmount),
        receiveAmount: new Prisma.Decimal(q.estimatedReceiveAmount),
        rateType: q.rateType,
        fees: q.knownFees as unknown as Prisma.InputJsonValue,
        providerReference: q.providerReference,
        expiresAt: new Date(q.expiresAt),
      },
    });
    return true;
  } catch (err) {
    logger.warn("analytics.persist_quote_failed", { err: String(err) });
    return false;
  }
}
