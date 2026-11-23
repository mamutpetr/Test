# Deployment

The production build is a Docker image (`Dockerfile`, target `runner`) that runs the Next.js standalone server on port 3000. The same repository builds a `tools` image for migrations, seeding and the background worker.

## Requirements

- PostgreSQL 14+ (managed recommended, with backups)
- Redis (recommended; required for more than one app instance)
- TLS termination (the platform's, or a reverse proxy such as Caddy or Nginx)
- Environment variables from `.env.example`

## Option 1 — Render (one click from the repo)

`render.yaml` in the repository root defines a web service, a worker, a PostgreSQL database and a Redis instance.

1. Push the repository to GitHub.
2. In Render, choose **New → Blueprint**, select the repository, and confirm.
3. Fill the secret env vars when prompted: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and later the partner keys.
4. The web service runs migrations and the seed before each deploy (`preDeployCommand`). Once it is live you get a public `https://<name>.onrender.com` URL. Set `APP_URL` to it.

Start with `APP_MODE=demo`. Switch to `live` after partner keys are in place.

## Option 2 — Any VPS with Docker

```bash
git clone <repo> && cd <repo>/swaply
cp .env.example .env    # set APP_MODE, APP_URL=https://your.domain, ADMIN_*, keys
docker compose up -d --build
```

Put a TLS reverse proxy in front. For example, a Caddyfile:

```
your.domain {
  reverse_proxy localhost:3000
}
```

For production, move Postgres out of compose (managed DB) and remove the published `5432` port.

## Option 3 — Railway / Fly.io / Kubernetes

1. Build the image with `--target runner` for the web process and `--target tools` for the jobs.
2. Release step: `npx prisma migrate deploy && npm run db:seed`, using the tools image.
3. Worker: `npm run worker`, using the tools image, one replica.
4. Health check: `GET /api/v1/health` (200 when DB and cache are reachable).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `APP_MODE` | yes | `demo` or `live` |
| `APP_URL` | yes | public https URL; used for metadata, sitemap and demo redirects |
| `DATABASE_URL` | yes | PostgreSQL connection string (use `sslmode=require` on managed DBs) |
| `REDIS_URL` | recommended | cache and rate limits across instances |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | seed | bootstrap admin; password ≥ 12 chars |
| `CHANGENOW_API_KEY`, `CHANGENOW_REFERRAL_URL` | live | see API_INTEGRATIONS.md |
| `SWAPZONE_API_KEY`, `SWAPZONE_REF_ID` | live | see API_INTEGRATIONS.md |
| `CHANGELLY_PRIVATE_KEY`, `CHANGELLY_REFERRAL_URL` | optional | after Changelly approval |
| `EMBEDDED_EXCHANGE_ENABLED` | no | `false` until phase 2 |
| `PROVIDER_TIMEOUT_MS`, `QUOTE_TTL_SECONDS`, `LOG_LEVEL` | no | defaults 8000, 60, info |

## Monitoring

- Logs are structured JSON on stdout (`level`, `msg`, fields, secrets redacted). Ship them to your log platform.
- Uptime check on `/api/v1/health`.
- Admin dashboard: partner error rates and latency; Admin → Партнери → "Перевірити API".
- Alert on: health 503, provider error rate above 20 %, zero searches for 1 h during the day.

## Go-live checklist

- [ ] Legal review of Terms, Privacy and Risk pages; operator details and support contact published
- [ ] Partner agreements signed; commission model, rate and reporting agreed and entered in Admin
- [ ] Keys set; `APP_MODE=live`; health checks green in Admin
- [ ] Manual test with real partner pages, using redirect only and no funds
- [ ] HTTPS, HSTS, admin password rotated, DB backups enabled
- [ ] Analytics and retention reviewed against the privacy policy
