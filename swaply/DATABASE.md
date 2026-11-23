# Database

PostgreSQL 14+ via Prisma (`prisma/schema.prisma`). Migrations live in `prisma/migrations`; apply them with `npx prisma migrate deploy`. Seed data comes from `npm run db:seed`, which is idempotent.

## Rules

- **Money is `Decimal(38, 18)`**, never float. Rates and commission percentages are `Decimal(10, 4–6)`.
- **Amounts are summed per currency only.** The dashboard never adds USDT to BTC.
- **No personal data in analytics.** Search sessions, quotes, clicks and events contain no IP, user agent, email or wallet address.
- **Wallet addresses** exist only on `Exchange` (embedded flow, phase 2). They are needed to create the operation with the partner.
- **Deposit details** (`payinAddress`, `payinExtraId`) are always copied from the partner response. SWAPLY never generates them.
- **Exchange status** changes only from partner reports (`statusFromProvider = true`). A redirect click is never an exchange.

## Entities

| Model | Purpose | Key fields |
|---|---|---|
| `Provider` | Partner record and admin settings | `enabled`, `integrationStatus`, `priority` (technical order only), `capabilities` (JSON snapshot), `extraFeePercent`, `commissionModel/Rate/Currency`, health fields |
| `Asset` | Catalog asset | `id` (`USDT`), `type` CRYPTO/FIAT, `precision` |
| `Network` | Chain or fiat rail | `id` (`TRON`, `CARD`), `chainIdentifier`, `isFiatRail` |
| `ProviderAsset` | Partner code for an (asset, network) | `providerAssetCode`, `providerNetworkCode`, unique `(provider, asset, network)` |
| `SearchSession` | One user search (anonymous) | `request` (route + amount), `mode`, `quoteCount`, `errorCount`, `durationMs` |
| `Quote` | Offer shown to a user | `route`, `sendAmount`, `receiveAmount`, `rateType`, `fees`, `providerReference`, `expiresAt` |
| `ReferralClick` | Redirect to a partner | `route`, `sendAmount`, `receiveAmountShown`, `redirectHost`, `mode` |
| `Exchange` | Embedded exchange (phase 2) | `externalId`, `idempotencyKey` + `requestHash`, `status`, `providerStatus`, `statusFromProvider`, amounts, payin/payout details |
| `PartnerRevenue` | Revenue line | `commissionModel`, `expectedAmount`, `confirmedAmount`, `paidAmount`, `status` EXPECTED/CONFIRMED/PAID/REJECTED, `reconciledAt`, `importBatchId`; unique `(provider, providerTransactionId, commissionModel)` |
| `ProviderCallLog` | Partner API metrics | `operation`, `ok`, `durationMs`, `errorCode`, `httpStatus` |
| `AnalyticsEvent` | Privacy-conscious funnel events | `search_initiated`, `quotes_displayed`, `provider_selected`, `referral_redirect`, `exchange_confirmed`, `revenue_confirmed` |
| `AuditLog` | Admin and system actions | `actor`, `action`, `target`, `metadata` |
| `AdminUser` | Admin account | `email`, `passwordHash` (bcrypt, cost 12), `role` OWNER/ADMIN/ANALYST |
| `AdminSession` | Admin session | `tokenHash` (sha256; the raw token exists only in the HttpOnly cookie), `expiresAt` |

## Retention (worker)

| Data | Kept |
|---|---|
| `ProviderCallLog` | 30 days |
| `Quote` rows without clicks | 30 days |
| Expired `AdminSession` rows | deleted hourly |
| Revenue and audit data | not deleted automatically (accounting) |

## Common commands

```bash
npx prisma migrate dev --name <change>   # create a migration (development)
npx prisma migrate deploy                # apply migrations (production)
npx prisma studio                        # browse data locally
npm run db:seed                          # catalog, providers, admin
```
