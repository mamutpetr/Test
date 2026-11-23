# Architecture

## Overview

One Next.js application serves the UI, the public REST API and the admin panel. A separate worker process runs background jobs from the same codebase. PostgreSQL is the system of record; Redis (optional) holds caches, rate-limit counters and short-lived quotes. Without Redis an in-process memory cache is used, which is fine for one instance.

```
Browser ──► Next.js (UI + /api/v1 + /admin) ──► Exchange Aggregation Engine ──► Provider adapters ──► Partner APIs
                     │                                 │                              (server-side only)
                     ├──► PostgreSQL (Prisma) ◄────────┤
                     └──► Redis / memory cache ◄───────┘
Worker (npm run worker) ──► status polling, health checks, data retention
```

Why one Next.js backend instead of a separate service: the API surface is small, the UI and API share types and validation (Zod), and deployment stays a single container. Provider calls already live in `src/server/**`, so they can be moved to a separate service later without touching the UI.

## Provider adapters

`src/server/providers/types.ts` defines `ExchangeProvider`:

```ts
interface ExchangeProvider {
  id; name; websiteUrl; isDemo; redirectHosts;
  getCapabilities(): Promise<ProviderCapabilities>;
  getSupportedAssets(): Promise<ProviderInstrument[]>;   // (asset, network) pairs from the partner's own list
  getQuotes(req: QuoteRequest): Promise<ProviderQuote[]>; // normalised quote + server-only internals
  buildReferralUrl?(quote, internals): string | null;
  createExchange?(req): Promise<ExchangeResult>;
  getExchangeStatus?(id): Promise<ExchangeStatusResult>;
  validateAddress?(asset, network, address): Promise<boolean | null>;
  healthCheck(): Promise<{ ok; message }>;
}
```

Each partner is isolated in its own folder. Adding a partner means writing one adapter and registering it in `registry.ts`; the engine does not change. Adapters:

- never invent values: missing fields become `null` / "unknown", a missing receive amount makes the quote invalid;
- map partner tickers and networks through the partner's own currency list, so a token is never confused with a network (USDT·TRON ≠ USDT·ETHEREUM);
- call partners only through `requestJson` (`src/lib/http.ts`): HTTPS only, per-adapter host allowlist (SSRF guard), timeout, no redirects, error classification, secret-free logging.

## Aggregation engine (`src/server/aggregator/engine.ts`)

1. Validate the request with Zod plus catalog rules (asset exists, network belongs to the asset, precision, no fiat source).
2. Load enabled providers. Skip unconfigured ones, reporting them as `not_configured`.
3. Check route support from each provider's cached instrument list (1 h TTL, stale fallback).
4. Query providers in parallel. Each request has its own timeout (`PROVIDER_TIMEOUT_MS`), so one slow partner never blocks the others.
5. Normalise, then drop quotes with a mismatched route or amount, a non-positive receive amount, expiry, or an amount outside the partner's min/max.
6. Rank (`ranking.ts`, shared with the client).
7. Store quotes (cache, TTL = validity + 15 min grace) with server-only internals such as `rateId` / `quotaId`. Persist the search and quotes to the DB best-effort.
8. Return quotes and a per-provider status (`ok | no_route | out_of_range | error | not_configured | disabled`), plus an explicit `emptyReason` and `suggestedMinAmount`.

### Ranking rules

- The best offer is the largest `estimatedReceiveAmount` in the same destination asset and network. Mixing destinations throws.
- `estimatedReceiveAmount` is net of every fee the partner documents as deducted (Changelly: `amountTo − networkFee`; Swapzone: `amountTo` is documented as "amount to receive after exchange"). When a partner reports fees without saying whether they are deducted (ChangeNOW `depositFee` / `withdrawalFee`), they are shown with `includedInReceive: "unknown"`, not silently subtracted or hidden.
- Partner extra fees configured with the partner are already inside the partner's quote, so they count before sorting.
- Ties are broken by guaranteed rate, then speed, then name. Partner reward and admin priority never affect order.
- All money maths uses `decimal.js` (`src/lib/money.ts`); amounts are floored to asset precision.

### Freshness and re-verification

- A floating quote is shown as fresh for `QUOTE_TTL_SECONDS` (default 60 s) and is marked as an estimate. A fixed quote uses the partner's own `validUntil` / `expiredAt` and is marked as guaranteed.
- The UI counts down and disables expired offers.
- On "Exchange", `reverifyQuote` asks the same partner again, for the same rate type and executing partner. If the amount dropped more than 0.05 %, the API returns `409 quote_changed` with old and new values. The user must accept, and the next call carries `acceptedReceiveAmount`.

## Execution flows

**Redirect (MVP).** `POST /api/v1/referrals/redirect` re-verifies the quote, builds the partner link, validates it (HTTPS, provider's host, no credentials), stores a `ReferralClick` and returns the URL. If the click cannot be stored, the redirect is refused, so attribution and audit stay intact. A redirect is never shown as a completed exchange.

**Embedded (phase 2, `EMBEDDED_EXCHANGE_ENABLED`).** `POST /api/v1/exchanges` requires an `Idempotency-Key`. It re-verifies, validates addresses (format, plus the partner's validator where available), creates the exchange through the partner API, and stores the partner-issued deposit details. Statuses come only from the partner (`statusFromProvider`). Demo mode can only simulate. The UI for this flow is on the roadmap; the tracking page `/[locale]/exchange/[id]` already exists.

## Assistant

`src/server/assistant/parser.ts` turns free text ("700 USDT TRC20 на гривні на картку") into a structured search. It is deterministic, with no LLM and no rates. An LLM parser can implement the same `ParsedIntent` interface later. Financial values always come from the engine.

## i18n

Path-based locales `/uk` (default) and `/en`. Middleware redirects `/` using a cookie, then `Accept-Language`. To add a language: add its code to `src/i18n/config.ts` and create a dictionary typed as `Dictionary`.

## Background worker (`src/server/jobs/worker.ts`)

- Every 60 s: refresh non-terminal embedded exchanges from partners.
- Every 5 min: provider health checks.
- Hourly: retention — call logs and orphan quotes older than 30 days, expired admin sessions.
