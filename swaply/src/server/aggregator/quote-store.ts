import { cache } from "@/lib/cache";
import type { NormalizedQuote, QuoteInternals } from "../providers/types";

export interface StoredQuote {
  quote: NormalizedQuote;
  internals: QuoteInternals;
  request: { fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string; amount: string; country?: string };
  searchSessionId: string | null;
}

/** Quotes are kept for re-verification a bit beyond expiry (so we can say "expired" instead of "not found"). */
const GRACE_SECONDS = 15 * 60;

export async function saveQuote(s: StoredQuote) {
  const ttl = Math.max(30, Math.ceil((new Date(s.quote.expiresAt).getTime() - Date.now()) / 1000)) + GRACE_SECONDS;
  await cache().set(`quote:${s.quote.quoteId}`, s, ttl);
}

export async function loadQuote(quoteId: string): Promise<StoredQuote | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(quoteId)) return null;
  return cache().get<StoredQuote>(`quote:${quoteId}`);
}
