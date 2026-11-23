"use server";
// Server Actions are POST-only and Next.js verifies the Origin header against the host (CSRF protection).
// Every action re-checks the admin session and writes an audit record.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit, login, logout, requireAdmin } from "@/server/admin/auth";
import { getProvider, invalidateProviderSettings } from "@/server/providers/registry";
import { importPartnerReport } from "@/server/revenue/import";

export async function loginAction(_: unknown, form: FormData): Promise<{ error?: string; email?: string }> {
  const email = String(form.get("email") ?? "").slice(0, 200);
  const password = String(form.get("password") ?? "");
  if (!email || !password || password.length > 200) return { error: "Невірний email або пароль", email };
  const r = await login(email, password);
  if (!r.ok) return { error: r.reason === "rate_limited" ? "Забагато спроб. Спробуйте за 15 хвилин." : "Невірний email або пароль", email };
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

export async function toggleProviderAction(form: FormData) {
  const admin = await requireAdmin(["OWNER", "ADMIN"]);
  const id = z.string().max(40).parse(form.get("id"));
  const enabled = form.get("enabled") === "true";
  await prisma.provider.update({ where: { id }, data: { enabled } });
  await audit(admin.email, enabled ? "provider.enable" : "provider.disable", id);
  invalidateProviderSettings();
  revalidatePath("/admin/providers");
}

const settingsSchema = z.object({
  id: z.string().max(40),
  priority: z.coerce.number().int().min(0).max(10_000),
  extraFeePercent: z.string().regex(/^$|^\d{1,2}(\.\d{1,4})?$/),
  commissionModel: z.enum(["", "REVENUE_SHARE", "PARTNER_EXTRA_FEE", "AFFILIATE_REFERRAL"]),
  commissionRate: z.string().regex(/^$|^0(\.\d{1,6})?$|^1(\.0+)?$/),
  commissionCurrency: z.string().regex(/^$|^[A-Z0-9]{2,10}$/),
});

export async function updateProviderAction(form: FormData) {
  const admin = await requireAdmin(["OWNER", "ADMIN"]);
  const d = settingsSchema.parse(Object.fromEntries(form));
  await prisma.provider.update({
    where: { id: d.id },
    data: {
      priority: d.priority,
      extraFeePercent: d.extraFeePercent ? new Prisma.Decimal(d.extraFeePercent) : null,
      commissionModel: d.commissionModel || null,
      commissionRate: d.commissionRate ? new Prisma.Decimal(d.commissionRate) : null,
      commissionCurrency: d.commissionCurrency || null,
    },
  });
  await audit(admin.email, "provider.update_settings", d.id, d);
  invalidateProviderSettings();
  revalidatePath("/admin/providers");
}

export async function healthCheckAction(form: FormData) {
  const admin = await requireAdmin(["OWNER", "ADMIN"]);
  const id = z.string().max(40).parse(form.get("id"));
  const entry = await getProvider(id);
  if (!entry) return;
  const h = await entry.provider.healthCheck();
  await prisma.provider.update({ where: { id }, data: { lastHealthAt: new Date(), lastHealthOk: h.ok, lastHealthMessage: h.message.slice(0, 300) } });
  await audit(admin.email, "provider.health_check", id, { ok: h.ok });
  revalidatePath("/admin/providers");
}

export async function importReportAction(_: unknown, form: FormData): Promise<{ message?: string; errors?: string[] }> {
  const admin = await requireAdmin(["OWNER", "ADMIN"]);
  const providerId = z.string().max(40).parse(form.get("providerId"));
  const model = z.enum(["REVENUE_SHARE", "PARTNER_EXTRA_FEE", "AFFILIATE_REFERRAL"]).parse(form.get("commissionModel"));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { errors: ["Оберіть CSV-файл"] };
  if (file.size > 2_000_000) return { errors: ["Файл більший за 2 МБ"] };
  const r = await importPartnerReport(providerId, await file.text(), model);
  await audit(admin.email, "revenue.import", providerId, { batch: r.batch, rows: r.upserted, errors: r.errors.length });
  revalidatePath("/admin/revenue");
  return { message: `Імпортовано рядків: ${r.upserted}`, errors: r.errors.slice(0, 20).map((e) => `Рядок ${e.line}: ${e.message}`) };
}
