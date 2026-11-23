# SWAPLY — Smart Crypto Exchange Aggregator

SWAPLY is a non-custodial crypto exchange aggregator. It compares real exchange offers from partner services, ranks them by the **final amount the user receives**, and sends the user to the partner via an official partner link. SWAPLY never holds funds, accepts payments, or creates deposit addresses.

> Status: **MVP, technically ready, waiting for partner keys.** The code runs locally end-to-end in Demo Mode. Live Mode works and reports "partner not connected" until ChangeNOW / Swapzone keys are configured. See [What is done / blocked](#what-is-done--what-is-blocked).

## Quick start

### Option A — Docker (everything included)

```bash
cd swaply
cp .env.example .env          # optional: edit APP_MODE, keys, admin password
docker compose up --build
```

- App: http://localhost:3000 (redirects to `/uk`)
- Admin: http://localhost:3000/admin — `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (defaults: `admin@example.com` / `change-me-please-123`)
- The `migrate` service applies migrations and seeds the catalog and admin; `worker` runs background jobs.

### Option B — Node.js locally

Requirements: Node.js ≥ 20.11 (22 recommended), PostgreSQL 14+. Redis is optional.

```bash
cd swaply
cp .env.example .env          # set DATABASE_URL
npm install                   # also runs `prisma generate`
npx prisma migrate deploy     # create tables
npm run db:seed               # catalog, providers, admin user
npm run dev                   # http://localhost:3000
# production:
npm run build && npm start
# background jobs (status polling, health checks, retention), in another terminal:
npm run worker
```

## Modes

| | Demo (`APP_MODE=demo`) | Live (`APP_MODE=live`) |
|---|---|---|
| Providers | 3 demo providers, clearly labelled "demo" | ChangeNOW, Swapzone, Changelly adapters |
| Rates | fixed illustrative price table | only real partner API responses |
| Errors | simulated (rate limit on LTC routes, limits, fiat country rules) | real |
| Exchanges | real exchanges impossible; embedded flow only simulates statuses | through partner APIs when enabled |
| Without keys | — | "partner not connected", never fake offers |

## Tests

```bash
npm test               # 79 unit + integration tests (Vitest), partner HTTP mocked
npm run typecheck
npm run lint
npm run build && npm run test:e2e   # 22 Playwright tests (desktop + mobile), demo mode; needs a migrated DB
```

Adapter tests use trimmed copies of real ChangeNOW / Swapzone currency responses (`tests/fixtures`). No real funds are ever used.

## Project layout

```
prisma/                 schema, migrations, seed
src/app/[locale]/       public pages (uk, en): home, how-it-works, faq, assets, networks, support, legal, exchange tracking
src/app/admin/          admin panel (server components + server actions)
src/app/api/v1/         public REST API (OpenAPI: /api/v1/openapi.json)
src/server/providers/   ExchangeProvider interface + changenow / swapzone / changelly / demo adapters
src/server/aggregator/  aggregation engine, ranking, quote store, re-verification
src/server/referral/    partner redirect + click tracking
src/server/exchanges/   embedded exchange flow (phase 2, feature-flagged)
src/server/revenue/     partner report import & reconciliation
src/server/assistant/   rule-based text → search parser (AI-ready interface)
src/server/jobs/        background worker
src/i18n/               dictionaries (uk default, en)
tests/                  unit, integration, e2e
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — components, request flow, ranking rules
- [API_INTEGRATIONS.md](API_INTEGRATIONS.md) — partners, verified endpoints, what keys/agreements are needed
- [DATABASE.md](DATABASE.md) — schema and data rules
- [SECURITY.md](SECURITY.md) — threat model and controls
- [DEPLOYMENT.md](DEPLOYMENT.md) — production deployment (Docker, Render, any VPS)
- [BUSINESS_MODEL.md](BUSINESS_MODEL.md) — monetisation and revenue accounting
- [ROADMAP.md](ROADMAP.md) — phases and next steps

## What is done / what is blocked

**Done and tested**
- Full-stack app: Next.js 15 (App Router) + TypeScript strict + Tailwind 4 + Motion + TanStack Query + React Hook Form + Zod; PostgreSQL via Prisma; optional Redis.
- Mobile-first dark/light UI in Ukrainian and English, PWA manifest + service worker (never caches rates).
- Aggregation engine: parallel partner queries, timeouts, normalisation, rejection of invalid/expired/out-of-range offers, ranking by final receive amount, decimal arithmetic.
- Re-verification before redirect; a lower amount requires explicit user confirmation.
- Referral redirect with server-side URL validation and click tracking (fails closed if tracking is unavailable).
- ChangeNOW and Swapzone adapters built from their official API docs; ChangeNOW currency mapping verified against the live API.
- Changelly adapter (JSON-RPC + RSA signing) — implemented, disabled until partner approval.
- Admin panel: dashboard (searches, redirects, partner-confirmed operations, confirmed vs expected vs paid revenue, API errors, latency), partner management, CSV reconciliation import, audit log.
- REST API with validation, rate limiting, typed errors, idempotency for exchange creation, OpenAPI spec.
- Demo Mode fully separated from Live Mode.
- Docker, docker-compose, CI workflow (`.github/workflows/swaply-ci.yml`).

**Blocked by external dependencies**
- Real offers: need `CHANGENOW_API_KEY` + `CHANGENOW_REFERRAL_URL` and `SWAPZONE_API_KEY` + `SWAPZONE_REF_ID`. ChangeNOW's estimate and range endpoints, and Swapzone's whole API, require a key.
- Changelly: requires partner approval and registration of the public key.
- Fiat payouts (UAH/USD/EUR to cards): no confirmed partner integration yet; the UI says so explicitly.
- Legal texts are drafts and must be reviewed by a lawyer before launch.
- Public URL: deploy to a host (see DEPLOYMENT.md).
