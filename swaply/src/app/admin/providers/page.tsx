import { requireAdmin } from "@/server/admin/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getProviderEntries } from "@/server/providers/registry";
import { ensureProviderRows } from "@/server/analytics/record";
import { healthCheckAction, toggleProviderAction, updateProviderAction } from "../actions";

export default async function ProvidersPage() {
  const admin = await requireAdmin();
  await ensureProviderRows();
  const entries = await getProviderEntries();
  const rows = await prisma.provider.findMany({ orderBy: { priority: "asc" } });
  const since = new Date(Date.now() - 7 * 86400_000);
  const errors = await prisma.providerCallLog.findMany({ where: { ok: false, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 50 });
  const canEdit = admin.role !== "ANALYST";

  const cards = await Promise.all(
    entries.map(async ({ provider }) => {
      const caps = await provider.getCapabilities();
      let routes: number | string = "—";
      try { routes = (await provider.getSupportedAssets()).length; } catch (e) { routes = `помилка: ${(e as Error).message.slice(0, 60)}`; }
      return { provider, caps, routes, row: rows.find((r) => r.id === provider.id) };
    }),
  );

  return (
    <AdminShell email={admin.email} mode={env().APP_MODE}>
      <h1 className="mb-1 text-2xl font-semibold">Партнери</h1>
      <p className="mb-6 text-sm text-muted">Пріоритет визначає лише технічний порядок опитування/резервування й ніколи не впливає на ранжування пропозицій. API-ключі зберігаються тільки в змінних середовища сервера.</p>
      <div className="space-y-4">
        {cards.map(({ provider, caps, routes, row }) => (
          <section key={provider.id} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{provider.name}</h2>
              <span className={`rounded-md px-2 py-0.5 text-xs ${caps.configured ? "bg-positive-soft text-positive" : "bg-warning-soft text-warning"}`}>{caps.configured ? "ключ налаштовано" : "не підключено"}</span>
              <span className={`rounded-md px-2 py-0.5 text-xs ${row?.enabled ? "bg-accent-soft text-accent" : "bg-surface-3 text-muted"}`}>{row?.enabled ? "увімкнено" : "вимкнено"}</span>
              {caps.isAggregator && <span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs text-muted">агрегатор</span>}
              {canEdit && row && (
                <form action={toggleProviderAction} className="ml-auto">
                  <input type="hidden" name="id" value={provider.id} />
                  <input type="hidden" name="enabled" value={String(!row.enabled)} />
                  <button className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2">{row.enabled ? "Вимкнути" : "Увімкнути"}</button>
                </form>
              )}
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div><dt className="text-faint">Режими виконання</dt><dd>{caps.executionModes.join(", ") || "немає"}</dd></div>
              <div><dt className="text-faint">Партнерське посилання</dt><dd>{caps.referral.configured ? "налаштовано" : "не налаштовано"} <span className="text-faint">({caps.referral.format})</span></dd></div>
              <div><dt className="text-faint">Маршрути (інструменти)</dt><dd>{routes}</dd></div>
              <div><dt className="text-faint">Health</dt><dd>{row?.lastHealthAt ? `${row.lastHealthOk ? "OK" : "FAIL"} · ${row.lastHealthMessage} · ${row.lastHealthAt.toISOString().slice(0, 16)}` : "не перевірялось"}</dd></div>
              <div><dt className="text-faint">Документація</dt><dd>{caps.docsUrl ? <a className="text-accent" href={caps.docsUrl} rel="noopener noreferrer" target="_blank">{caps.docsUrl}</a> : "—"}</dd></div>
            </dl>
            {caps.notes.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-muted">{caps.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            {canEdit && row && (
              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                <form action={updateProviderAction} className="flex flex-wrap items-end gap-3 text-sm">
                  <input type="hidden" name="id" value={provider.id} />
                  <Field label="Пріоритет" name="priority" defaultValue={String(row.priority)} />
                  <Field label="Extra fee, % (якщо дозволено партнером)" name="extraFeePercent" defaultValue={row.extraFeePercent?.toFixed() ?? ""} />
                  <label className="flex flex-col gap-1"><span className="text-xs text-faint">Модель комісії</span>
                    <select name="commissionModel" defaultValue={row.commissionModel ?? ""} className="h-9 rounded-lg border border-line bg-surface-2 px-2">
                      <option value="">—</option><option value="REVENUE_SHARE">Revenue share</option><option value="PARTNER_EXTRA_FEE">Partner extra fee</option><option value="AFFILIATE_REFERRAL">Affiliate referral</option>
                    </select>
                  </label>
                  <Field label="Ставка (частка, 0.004 = 0.4%)" name="commissionRate" defaultValue={row.commissionRate?.toFixed() ?? ""} />
                  <Field label="Валюта винагороди" name="commissionCurrency" defaultValue={row.commissionCurrency ?? ""} />
                  <button className="h-9 rounded-lg bg-accent px-3 font-medium text-on-accent">Зберегти</button>
                </form>
                <form action={healthCheckAction}>
                  <input type="hidden" name="id" value={provider.id} />
                  <button className="h-9 rounded-lg border border-line px-3 text-sm hover:bg-surface-2">Перевірити API</button>
                </form>
              </div>
            )}
          </section>
        ))}
      </div>

      <h2 className="mb-2 mt-10 text-lg font-semibold">Помилки API (7 днів)</h2>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted"><tr><th className="p-3">Час</th><th className="p-3">Партнер</th><th className="p-3">Операція</th><th className="p-3">Код</th><th className="p-3">HTTP</th><th className="p-3">мс</th></tr></thead>
          <tbody>
            {errors.length === 0 && <tr><td colSpan={6} className="p-3 text-muted">Помилок немає</td></tr>}
            {errors.map((e) => (
              <tr key={e.id} className="border-t border-line"><td className="p-3">{e.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td><td className="p-3">{e.providerId}</td><td className="p-3">{e.operation}</td><td className="p-3 text-danger">{e.errorCode}</td><td className="p-3">{e.httpStatus ?? "—"}</td><td className="p-3">{e.durationMs}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

function Field({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-faint">{label}</span>
      <input name={name} defaultValue={defaultValue} className="h-9 w-40 rounded-lg border border-line bg-surface-2 px-2" />
    </label>
  );
}
