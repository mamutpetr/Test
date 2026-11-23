# Business model

SWAPLY is an information and technology aggregator. It does not hold reserves or user funds, accept payments, or issue deposit addresses. Partners perform the exchanges. SWAPLY earns through official partner programs.

The absence of custody does **not** remove regulatory obligations automatically. Crypto-asset rules, intermediary status, AML/KYC, sanctions, data protection and tax treatment of partner income must be assessed by a lawyer for the operator's jurisdiction before launch.

## Revenue mechanisms (tracked separately)

| Model (`CommissionModel`) | How it works | Typical source |
|---|---|---|
| `REVENUE_SHARE` | Partner pays a share of its revenue on attributed exchanges | ChangeNOW affiliate (advertised from 0.4 %), Swapzone revenue levels (advertised from 0.05 % per transaction) |
| `PARTNER_EXTRA_FEE` | An extra fee set within the partner's API terms; it is already inside the partner's quote | Changelly "API extra fee" via account manager |
| `AFFILIATE_REFERRAL` | Fixed reward per user or confirmed operation | Per partner terms |

The real terms come from the signed agreements. Never assume every partner pays a percentage of turnover.

## Fairness rules

- Offers are ranked only by the user's final receive amount. Partner reward never changes the order.
- Any extra fee is already reflected in the partner's quote that the user sees, so it is counted before sorting.
- Every page states who performs the exchange.

## Revenue accounting

1. **Activity** — searches, redirects (`ReferralClick`), embedded exchanges. These are not revenue.
2. **Expected** — `PartnerRevenue` with status `EXPECTED`. It is created only for partner-confirmed completed embedded exchanges, using the configured rate. It is an estimate and is shown separately.
3. **Confirmed** — imported from partner reports (Admin → Винагороди, CSV) as `CONFIRMED`.
4. **Paid** — rows marked `PAID` in partner payout reports, with `paidAmount` and `reconciledAt`.

The dashboard shows confirmed volume, confirmed revenue, expected revenue and payouts separately and per currency. Redirects are never counted as completed exchanges.

### Report import format

```
provider_transaction_id,date,volume,volume_currency,commission,commission_currency,status
abc123,2026-11-01,1000,USDT,4.0,USDT,confirmed
```

`status`: `confirmed | paid | rejected`. Rows upsert by `(provider, provider_transaction_id, model)`, so re-importing a report is safe.

## Unit economics to track

- Searches → redirect rate (CTR)
- Redirects → partner-confirmed operations (needs partner reports)
- Confirmed revenue per 1,000 searches, per partner and currency
- Partner API reliability (error rate, latency), which affects offer coverage
