# ---------- deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---------- builder ----------
FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build \
 && cp -r .next/static .next/standalone/.next/static \
 && cp -r public .next/standalone/public

# ---------- runner: minimal web server image (docker compose `app`, CI) ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ---------- full (default/last stage): web server + migrations, seed and worker tooling ----------
# Used by PaaS hosts that build the last stage (Render) and by compose `migrate` / `worker`.
FROM builder AS full
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]
