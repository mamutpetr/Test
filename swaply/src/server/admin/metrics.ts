import "server-only";
import { prisma } from "@/lib/db";
import { sumByCurrency } from "../revenue/reconciliation";

export async function dashboardMetrics(days: number, mode: "demo" | "live") {
  const since = new Date(Date.now() - days * 86400_000);
  const [searches, clicks, completedExchanges, revenue, callStats, errorsByProvider, providers] = await Promise.all([
    prisma.searchSession.count({ where: { createdAt: { gte: since }, mode } }),
    prisma.referralClick.count({ where: { createdAt: { gte: since }, mode } }),
    prisma.exchange.count({ where: { createdAt: { gte: since }, mode, status: "COMPLETED", statusFromProvider: true } }),
    prisma.partnerRevenue.findMany({ where: { createdAt: { gte: since } }, select: { status: true, currency: true, expectedAmount: true, confirmedAmount: true, paidAmount: true, volume: true } }),
    prisma.providerCallLog.groupBy({ by: ["providerId"], where: { createdAt: { gte: since } }, _avg: { durationMs: true }, _count: { _all: true } }),
    prisma.providerCallLog.groupBy({ by: ["providerId"], where: { createdAt: { gte: since }, ok: false }, _count: { _all: true } }),
    prisma.provider.findMany({ select: { id: true, name: true } }),
  ]);
  const confirmed = revenue.filter((r) => r.status === "CONFIRMED" || r.status === "PAID");
  const names = new Map(providers.map((p) => [p.id, p.name]));
  return {
    searches,
    clicks,
    /** Partner-confirmed operations only: reconciled report lines + partner-reported completed embedded exchanges. */
    confirmedOperations: confirmed.length,
    completedExchanges,
    confirmedVolume: sumByCurrency(confirmed.map((r) => ({ amount: r.volume?.toFixed() ?? null, currency: r.currency }))),
    confirmedRevenue: sumByCurrency(confirmed.map((r) => ({ amount: r.confirmedAmount?.toFixed() ?? null, currency: r.currency }))),
    expectedRevenue: sumByCurrency(revenue.filter((r) => r.status === "EXPECTED").map((r) => ({ amount: r.expectedAmount?.toFixed() ?? null, currency: r.currency }))),
    paidOut: sumByCurrency(revenue.filter((r) => r.status === "PAID").map((r) => ({ amount: r.paidAmount?.toFixed() ?? null, currency: r.currency }))),
    clickThroughRate: searches ? (clicks / searches) * 100 : null,
    confirmationRate: clicks ? (confirmed.length / clicks) * 100 : null,
    providerStats: callStats.map((c) => ({
      providerId: c.providerId,
      name: names.get(c.providerId) ?? c.providerId,
      calls: c._count._all,
      avgMs: Math.round(c._avg.durationMs ?? 0),
      errors: errorsByProvider.find((e) => e.providerId === c.providerId)?._count._all ?? 0,
    })),
  };
}
