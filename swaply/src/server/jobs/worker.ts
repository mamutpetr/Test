/**
 * Background worker (run as a separate process: `npm run worker`).
 *  - refreshes statuses of non-terminal embedded exchanges from partners (every 60s)
 *  - provider health checks (every 5 min)
 *  - data retention: deletes provider call logs > 30 days, quotes > 30 days, expired admin sessions
 */
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getProviderEntries } from "../providers/registry";
import { refreshExchangeStatus, TERMINAL } from "../exchanges/service";
import { installProviderCallLogging } from "../analytics/record";

const MIN = 60_000;

async function refreshStatuses() {
  const rows = await prisma.exchange.findMany({
    where: { status: { notIn: TERMINAL }, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: 50,
  });
  for (const r of rows) await refreshExchangeStatus(r);
  if (rows.length) logger.info("worker.statuses_refreshed", { count: rows.length });
}

async function healthChecks() {
  for (const { provider } of await getProviderEntries()) {
    const h = await provider.healthCheck();
    await prisma.provider.update({ where: { id: provider.id }, data: { lastHealthAt: new Date(), lastHealthOk: h.ok, lastHealthMessage: h.message.slice(0, 300) } }).catch(() => undefined);
  }
}

async function retention() {
  const cutoff = new Date(Date.now() - 30 * 86400_000);
  const [calls, quotes, sessions] = await Promise.all([
    prisma.providerCallLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.quote.deleteMany({ where: { createdAt: { lt: cutoff }, clicks: { none: {} } } }),
    prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
  ]);
  logger.info("worker.retention", { calls: calls.count, quotes: quotes.count, sessions: sessions.count });
}

function every(ms: number, name: string, fn: () => Promise<void>) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (err) {
      logger.error(`worker.${name}_failed`, { err: String(err) });
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, ms);
}

installProviderCallLogging();
logger.info("worker.started");
const timers = [every(MIN, "statuses", refreshStatuses), every(5 * MIN, "health", healthChecks), every(60 * MIN, "retention", retention)];

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, async () => {
    timers.forEach(clearInterval);
    await prisma.$disconnect();
    process.exit(0);
  });
