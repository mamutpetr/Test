/* Seeds catalog (assets, networks), provider rows and the bootstrap admin. Idempotent. */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ASSETS, NETWORKS } from "../src/lib/catalog";

const prisma = new PrismaClient();

const PROVIDERS = [
  { id: "changenow", name: "ChangeNOW", websiteUrl: "https://changenow.io", termsUrl: "https://changenow.io/terms-of-use", supportUrl: "https://changenow.io/faq", commissionModel: "REVENUE_SHARE" as const, priority: 10 },
  { id: "swapzone", name: "Swapzone", websiteUrl: "https://swapzone.io", termsUrl: "https://swapzone.io/terms-of-use", supportUrl: "https://swapzone.io/support", commissionModel: "REVENUE_SHARE" as const, priority: 20 },
  { id: "changelly", name: "Changelly", websiteUrl: "https://changelly.com", termsUrl: "https://changelly.com/terms-of-use", supportUrl: "https://support.changelly.com", commissionModel: "PARTNER_EXTRA_FEE" as const, priority: 30 },
  { id: "demo-nova", name: "Nova Exchange (demo)", priority: 101 },
  { id: "demo-kite", name: "Kite Swap (demo)", priority: 102 },
  { id: "demo-flux", name: "Flux Pay (demo)", priority: 103 },
];

async function main() {
  for (const a of Object.values(ASSETS)) {
    await prisma.asset.upsert({ where: { id: a.id }, update: { name: a.name, precision: a.precision }, create: { id: a.id, symbol: a.symbol, name: a.name, type: a.kind === "fiat" ? "FIAT" : "CRYPTO", precision: a.precision } });
  }
  for (const n of Object.values(NETWORKS)) {
    await prisma.network.upsert({ where: { id: n.id }, update: { name: n.name }, create: { id: n.id, name: n.name, chainIdentifier: n.chainIdentifier ?? null, isFiatRail: n.kind === "fiat_rail" } });
  }
  for (const p of PROVIDERS) {
    const demo = p.id.startsWith("demo-");
    await prisma.provider.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        name: p.name,
        enabled: true,
        priority: p.priority,
        integrationStatus: demo ? "DEMO" : "NOT_CONFIGURED",
        websiteUrl: "websiteUrl" in p ? p.websiteUrl : null,
        termsUrl: "termsUrl" in p ? p.termsUrl : null,
        supportUrl: "supportUrl" in p ? p.supportUrl : null,
        commissionModel: "commissionModel" in p ? p.commissionModel : null,
      },
    });
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (!existing) {
      await prisma.adminUser.create({ data: { email, passwordHash: await bcrypt.hash(password, 12), role: "OWNER" } });
      console.log(`Admin created: ${email}`);
    } else console.log(`Admin exists: ${email} (password unchanged)`);
  } else console.log("ADMIN_EMAIL/ADMIN_PASSWORD not set — no admin created");
  await prisma.auditLog.create({ data: { actor: "system", action: "seed", metadata: {} } });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
