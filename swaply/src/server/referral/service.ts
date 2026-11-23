import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { routeKey } from "@/lib/catalog";
import { reverifyQuote } from "../aggregator/engine";
import { ensureProviderRows, persistQuoteRow, trackEvent } from "../analytics/record";
import type { NormalizedQuote } from "../providers/types";

export type RedirectOutcome =
  | { status: "ok"; redirectUrl: string; clickId: string; quote: NormalizedQuote; providerName: string; executingPartner: string | null }
  | { status: "quote_changed"; previous: NormalizedQuote; quote: NormalizedQuote }
  | { status: "not_found" }
  | { status: "unavailable"; reason: string }
  | { status: "redirect_not_configured" }
  | { status: "tracking_failed" };

/** Validates that a redirect target is an https URL on one of the provider's declared hosts. */
export function isSafeRedirect(url: string, hosts: readonly string[], allowHttpLocal = false): boolean {
  try {
    const u = new URL(url);
    if (u.username || u.password) return false;
    const okProto = u.protocol === "https:" || (allowHttpLocal && u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
    return okProto && hosts.includes(u.hostname);
  } catch {
    return false;
  }
}

export async function createReferralRedirect(quoteId: string, acceptedReceiveAmount?: string): Promise<RedirectOutcome> {
  const v = await reverifyQuote(quoteId, acceptedReceiveAmount);
  if (v.status === "not_found") return v;
  if (v.status === "unavailable") return v;
  if (v.status === "changed") return { status: "quote_changed", previous: v.previous, quote: v.quote };

  const { quote, stored, provider } = v;
  if (!quote.executionModes.includes("redirect") || !provider.buildReferralUrl) return { status: "redirect_not_configured" };
  const url = provider.buildReferralUrl(quote, stored.internals);
  const allowHttpLocal = provider.isDemo && env().APP_URL.startsWith("http://");
  if (!url || !isSafeRedirect(url, provider.redirectHosts, allowHttpLocal)) {
    logger.error("referral.unsafe_or_missing_url", { providerId: provider.id });
    return { status: "redirect_not_configured" };
  }

  const route = routeKey(quote.sourceAsset, quote.sourceNetwork, quote.destinationAsset, quote.destinationNetwork);
  try {
    await ensureProviderRows();
    const sessionExists = stored.searchSessionId ? !!(await prisma.searchSession.findUnique({ where: { id: stored.searchSessionId }, select: { id: true } })) : false;
    const searchSessionId = sessionExists ? stored.searchSessionId : null;
    const quotePersisted = await persistQuoteRow(quote, route, searchSessionId);
    const click = await prisma.referralClick.create({
      data: {
        providerId: provider.id,
        searchSessionId,
        quoteId: quotePersisted ? quote.quoteId : null,
        route,
        sendAmount: new Prisma.Decimal(quote.sendAmount),
        receiveAmountShown: new Prisma.Decimal(quote.estimatedReceiveAmount),
        redirectHost: new URL(url).hostname,
        mode: env().APP_MODE,
      },
    });
    await trackEvent("referral_redirect", { providerId: provider.id, sessionRef: searchSessionId ?? undefined, properties: { route, executingPartner: quote.executingPartner?.id ?? null } });
    return { status: "ok", redirectUrl: url, clickId: click.id, quote, providerName: provider.name, executingPartner: quote.executingPartner?.name ?? null };
  } catch (err) {
    // Without a tracking record we cannot attribute or audit the redirect — fail closed.
    logger.error("referral.tracking_failed", { err: String(err) });
    return { status: "tracking_failed" };
  }
}
