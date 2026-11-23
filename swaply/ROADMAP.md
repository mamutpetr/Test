# Roadmap

Order agreed with the product owner: a full MVP with two real providers first. AI, Telegram Mini App and embedded exchanges come only after that.

## Phase 1 — Foundation ✅
Next.js + TypeScript strict, Tailwind, Prisma/PostgreSQL schema and migrations, Docker and compose, design system (dark-first + light), local run.

## Phase 2 — Core UI ✅
Home with exchange form, asset and network pickers (bottom sheets on mobile), payout method and country for fiat, offer cards, sort and filters, freshness timers, demo mode, uk/en, PWA manifest and service worker.

## Phase 3 — Real providers ✅ (code) / ⏳ (keys)
- ✅ Universal adapter interface, ChangeNOW and Swapzone adapters, normalisation, comparison, caching, error handling, referral redirects with tracking, re-verification before redirect.
- ⏳ Partner keys, referral links and agreements. Then switch to `APP_MODE=live` and verify the estimate endpoints with real keys (see API_INTEGRATIONS.md).
- ⏳ Confirm with ChangeNOW whether `toAmount` is net of `depositFee` / `withdrawalFee`.

## Phase 4 — Business infrastructure ✅
Admin panel (dashboard, partners, reconciliation import, audit), referral tracking, revenue accounting (expected / confirmed / paid), structured logs, privacy-conscious analytics, provider health and latency.

## Phase 5 — Advanced exchange (next)
1. **Go live with two providers.** Deploy, monitor partner coverage and error rates for 2–4 weeks.
2. **Embedded exchange UI.** Backend, idempotency, partner-only statuses and the tracking page exist behind `EMBEDDED_EXCHANGE_ENABLED`. Still needed: address entry and a confirmation screen in the offer flow, partner agreement for in-app creation, and notifications (email or Telegram) on status change.
3. **AI Smart Exchange Assistant.** An LLM parser behind the existing `ParsedIntent` interface (rule-based parser stays as fallback), plus plain-language explanations generated only from engine output. No exchange or payment without explicit user confirmation. Search keeps working without an AI key.
4. **Telegram Mini App.** The same UI in Telegram WebApp, using the existing `/api/v1`.
5. **More partners:** Changelly after approval; others via new adapters.
6. **Fiat routes (UAH/USD/EUR to cards):** only with a partner that officially supports the payout method and country.

## Phase 6 — Production readiness
- ✅ Unit, integration and E2E tests; CI; deployment docs; security controls.
- ⏳ External security audit and penetration test; load test of `/api/v1/quotes`.
- ⏳ Monitoring and alerting setup on the chosen host.
- ⏳ Legal review and operator details; final Terms, Privacy and Risk texts.
