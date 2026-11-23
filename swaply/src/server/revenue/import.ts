import { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { parsePartnerReport } from "./reconciliation";
import { trackEvent } from "../analytics/record";

export async function importPartnerReport(providerId: string, csv: string, commissionModel: "REVENUE_SHARE" | "PARTNER_EXTRA_FEE" | "AFFILIATE_REFERRAL") {
  const { rows, errors } = parsePartnerReport(csv);
  const batch = crypto.randomUUID();
  let upserted = 0;
  for (const r of rows) {
    const exchange = await prisma.exchange.findFirst({ where: { providerId, externalId: r.providerTransactionId }, select: { id: true } });
    const amount = new Prisma.Decimal(r.commission);
    const data = {
      confirmedAmount: r.status === "REJECTED" ? null : amount,
      paidAmount: r.status === "PAID" ? amount : null,
      status: r.status,
      currency: r.currency,
      volume: r.volume ? new Prisma.Decimal(r.volume) : null,
      reconciledAt: new Date(),
      periodStart: r.date,
      periodEnd: r.date,
      importBatchId: batch,
      exchangeId: exchange?.id ?? null,
    };
    await prisma.partnerRevenue.upsert({
      where: { providerId_providerTransactionId_commissionModel: { providerId, providerTransactionId: r.providerTransactionId, commissionModel } },
      update: data,
      create: { ...data, providerId, providerTransactionId: r.providerTransactionId, commissionModel },
    });
    upserted++;
  }
  if (upserted) await trackEvent("revenue_confirmed", { providerId, properties: { rows: upserted, batch } });
  return { batch, upserted, errors };
}
