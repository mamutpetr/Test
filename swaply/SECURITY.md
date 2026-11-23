# Security

## Principles

1. **Non-custodial by construction.** There are no wallets, private keys, payment acceptance or deposit-address generation. The UI never asks for seed phrases, keys or wallet passwords.
2. **Partner calls are server-side only.** API keys live in server environment variables, are sent only in request headers, and never reach the browser. CSP `connect-src 'self'` means the browser can talk only to SWAPLY.
3. **Fail closed** wherever money or attribution is involved.

## Controls

| Area | Control | Where |
|---|---|---|
| Secrets | Env-only; `.env` git-ignored; logger redacts keys, tokens, signatures, cookies and URL query strings, and masks addresses | `src/lib/env.ts`, `src/lib/logger.ts` |
| SSRF | Partner requests must be HTTPS to a per-adapter host allowlist; redirects disabled; timeouts | `src/lib/http.ts` |
| Open redirect | Referral URLs must be HTTPS, on the provider's declared hosts, without credentials; templates only substitute URL-encoded `{from}{to}{amount}` | `src/server/referral/service.ts`, `providers/shared.ts` |
| Deposit address substitution | Deposit details come only from the partner response; ChangeNOW and Swapzone create calls are rejected if the partner echoes a different payout address | adapters |
| Input validation | Zod schemas with `.strict()`, catalog checks, decimal parsing, address and memo format checks, 16 KB body limit, JSON content type required | `engine.ts`, `lib/api/respond.ts`, `lib/address.ts` |
| SQL injection | Prisma parameterised queries only; no raw SQL apart from `SELECT 1` health | — |
| XSS | React escaping; no user HTML; JSON-LD is escaped; strict CSP; `X-Content-Type-Options`, `X-Frame-Options: DENY`, `frame-ancestors 'none'` | `next.config.ts` |
| Rate limiting | Per-client fixed window (hashed IP, never stored): quotes 30/min, redirects 20/min, exchanges 5/min, assistant 20/min; admin login 10/15 min per IP and 5/15 min per email | `lib/rate-limit.ts` |
| Admin auth | bcrypt (cost 12), constant-cost check for unknown emails, 32-byte random session token stored only as sha256, `HttpOnly` + `SameSite=Strict` + `Secure` (production) cookie, 8 h expiry, roles OWNER/ADMIN/ANALYST | `src/server/admin/auth.ts` |
| CSRF | Admin mutations are Next.js Server Actions (POST-only, Origin checked by Next.js) plus `SameSite=Strict` cookies; the public API has no cookie auth | `src/app/admin/actions.ts` |
| Audit | Admin logins (including failures), provider toggles and settings, health checks and report imports are written to `AuditLog` | — |
| Idempotency | `Idempotency-Key` with request-hash check; unique constraint handles races | `exchanges/service.ts` |
| Transport | HSTS in production; deploy behind TLS (see DEPLOYMENT.md) | `next.config.ts` |
| Privacy | No IP, user agent or addresses in analytics; robots exclude tracking pages; demo mode is `noindex` | — |
| Webhooks | None of the integrated partners' documented flows used here deliver webhooks; statuses are polled. If added, verify signatures before trusting payloads | — |

## Out of scope by design

Tools to bypass KYC/AML, sanctions or geo-restrictions are never built. "No extra verification" is shown only as the partner's own statement, with a note that checks may still happen.

## Before production

- Change `ADMIN_PASSWORD`, use a password manager, limit OWNER accounts.
- Serve over HTTPS only; restrict `/admin` by IP or VPN if possible.
- Use managed PostgreSQL with backups and TLS; set `REDIS_URL` when running more than one instance.
- Rotate partner keys if exposed; request ChangeNOW's private key option if needed.
- Run `npm audit`, keep dependencies patched, and do an external penetration test.
- Report vulnerabilities to the operator's security contact (to be published before launch).
