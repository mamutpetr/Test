# Partner API integrations

Endpoints and field names below were taken from each partner's official documentation on 2026-11-23:

- ChangeNOW — official Postman collection linked from https://changenow.io/api/docs (https://documenter.getpostman.com/view/8180765/SVfTPnM8)
- Swapzone — official Postman collection linked from https://swapzone.io/partners/exchange-api (https://documenter.getpostman.com/view/16362858/UVXokDS6)
- Changelly — https://docs.changelly.com

Re-check them before going live; partners change their APIs.

## Summary

| | ChangeNOW | Swapzone | Changelly |
|---|---|---|---|
| Adapter | `src/server/providers/changenow` | `src/server/providers/swapzone` | `src/server/providers/changelly` |
| State | ready, needs key | ready, needs key | implemented, needs partner approval |
| Quotes (floating / fixed) | ✅ / ✅ (`rateId`, `validUntil`) | ✅ / ✅ (one call per type) | ✅ / ✅ (`getFixRateForAmount`, ~1 min) |
| Limits | `/v2/exchange/range` | `minAmount` / `maxAmount` per offer | `min` / `max` in estimate |
| Redirect + attribution | partner referral link (env) | `https://swapzone.io/?refId=<id>` | affiliate link (env) |
| Embedded create / status | ✅ / ✅ | ✅ / ✅ | status only (create not wired) |
| Fiat payouts | separate ChangeNOW fiat product, **not integrated** | no | not integrated |
| Verified against live API | currency list ✅ (13 SWAPLY instruments mapped) | needs key (currencies return 401 from server) | needs approval |

## ChangeNOW (API v2)

- **Auth:** header `x-changenow-api-key`. Keys come from the affiliate account or partners@changenow.io. Rate limit: 1800 calls/min, 30 calls/s.
- **Used endpoints:**
  - `GET /v2/exchange/currencies?active=true&flow=standard` — `ticker`, `network`, `supportsFixedRate`, `buy`, `sell`, `isExtraIdSupported`, `isFiat`. Public.
  - `GET /v2/exchange/range?fromCurrency&toCurrency&fromNetwork&toNetwork&flow` — `minAmount`, `maxAmount|null`. Docs say access is "upon dedicated request".
  - `GET /v2/exchange/estimated-amount?...&fromAmount&flow=standard|fixed-rate&type=direct&useRateId` — `toAmount`, `rateId`, `validUntil`, `transactionSpeedForecast` ("10-60"), `warningMessage`, `depositFee`, `withdrawalFee`. Needs a key.
  - `POST /v2/exchange` — body `fromCurrency, toCurrency, fromNetwork, toNetwork, fromAmount, address, extraId, refundAddress, refundExtraId, flow, type, rateId`; returns `id, payinAddress, payinExtraId, payoutAddress, fromAmount, toAmount`.
  - `GET /v2/exchange/by-id?id=` — status values `new, waiting, confirming, exchanging, sending, finished, failed, refunded, verifying`.
  - `GET /v2/validate/address?currency&address` — `result`, `message`.
- **Network mapping (SWAPLY → ChangeNOW):** TRON→`trx`, ETHEREUM→`eth`, BSC→`bsc`, TON→`ton`, SOLANA→`sol`, BITCOIN→`btc`, LITECOIN→`ltc`.
- **Fee note:** the docs list `depositFee` / `withdrawalFee` but do not say whether `toAmount` is already net of them, so SWAPLY shows them as "inclusion unknown". Ask ChangeNOW to confirm; if `toAmount` is net, set `includedInReceive: true` in the adapter.
- **Referral link:** take the exact link from the ChangeNOW partner cabinet ("Referral links") and put it in `CHANGENOW_REFERRAL_URL`. SWAPLY does not invent attribution parameters. Optional placeholders `{from}`, `{to}`, `{amount}` may be used only if ChangeNOW documents them for your link. Without a referral link, offers show but the "Exchange" button is disabled.
- **Commercial:** the affiliate program advertises a revenue share from 0.4 % ("Start from 0.4% or higher"). Agree the actual rate, payout currency, reporting format, and whether the extra fields `userId` / `payload` should be enabled for per-click attribution.

## Swapzone (Instant Exchange API v1)

- **Auth:** header `x-api-key`. Key from https://swapzone.io/partners/account.
- **Used endpoints:**
  - `GET /v1/exchange/currencies` — `name`, `ticker`, `network`, `smartContract`.
  - `GET /v1/exchange/get-rate?from&to&amount&rateType=fixed|floating&chooseRate=all&fromNetwork&toNetwork&availableInUSA&noRefundAddress` — `adapter`, `amountTo` ("Amount to receive after exchange"), `minAmount`, `maxAmount`, `quotaId`, `open_fincases`. The docs show one object; for `chooseRate=all` the adapter accepts both an object and a list.
  - `POST /v1/exchange/create` — `from, to, fromNetwork, toNetwork, amountDeposit, addressReceive, extraIdReceive, refundAddress, refundExtraId, quotaId`; returns `transaction.{id, addressDeposit, amountEstimated, payTill, status}`.
  - `GET /v1/exchange/tx?id=` — statuses `waiting, confirming, exchanging, sending, finished, failed, refunded, overdue`.
- **Aggregator caveat:** every Swapzone offer is executed by a third service (`adapter`, e.g. "changehero"). The UI shows "ChangeHero · via Swapzone". Offers from partners with open financial claims are never requested, because `ofcAdapter` is never sent; if `open_fincases` is present, a warning is shown.
- **Referral link:** `https://swapzone.io/?refId=<SWAPZONE_REF_ID>`, the format shown on the partners page. Only `refId` is sent, so the user re-enters the pair on swapzone.io.
- **Commercial:** revenue share levels from 0.05 % per transaction (partners page). Agree level, reporting and payout.

## Changelly (API v2, JSON-RPC 2.0)

- **Access:** generate an RSA key pair, register the public key with Changelly, and get approval. `CHANGELLY_PRIVATE_KEY` is the hex-encoded PKCS#8 DER private key, as in the docs.
- **Auth:** `X-Api-Key` = base64(sha256(public key, PKCS#1 DER)); `X-Api-Signature` = base64(RSA-SHA256(body)). Covered by a unit test.
- **Methods used:**
  - `getCurrenciesFull`
  - `getExchangeAmount` — net = `amountTo − networkFee`, per docs
  - `getFixRateForAmount` — net = `amountFrom × result − networkFee`, per docs; rate id valid ~1 min
  - `getStatus` — statuses including `hold` → verification required, `overdue` / `expired`
- **To verify with a live key:** the ticker ↔ (asset, network) mapping, which is derived from `blockchain` / `name`.
- **Required notice (docs):** "Exchange services are provided by Changelly. By clicking 'Swap with Changelly', you accept Changelly's Terms of Use and AML/KYC Policy."
- **Commercial:** API extra fee is set via the account manager (e.g. 0.5 %).

## What you need to provide

1. ChangeNOW: API key, referral link, agreed revenue share, report format.
2. Swapzone: API key, refId, agreed revenue level, report format.
3. Changelly (optional): approval, registered public key, affiliate link.
4. For fiat payouts (UAH/USD/EUR to card): a partner that officially supports the payout method for each country, and its API docs. SWAPLY will not simulate bank integrations.

Then set the variables in `.env`, set `APP_MODE=live`, restart, and press "Перевірити API" in Admin → Партнери.
