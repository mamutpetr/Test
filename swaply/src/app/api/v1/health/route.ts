import { json } from "@/lib/api/respond";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "down"> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "down";
  }
  try {
    await cache().set("health", 1, 5);
    checks.cache = "ok";
  } catch {
    checks.cache = "down";
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return json({ status: ok ? "ok" : "degraded", mode: env().APP_MODE, checks, time: new Date().toISOString() }, ok ? 200 : 503);
}
