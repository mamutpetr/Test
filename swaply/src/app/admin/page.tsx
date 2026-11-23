import { requireAdmin } from "@/server/admin/auth";
import { dashboardMetrics } from "@/server/admin/metrics";
import { AdminShell, Money, Stat } from "@/components/admin/AdminShell";
import { env } from "@/lib/env";

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ days?: string; mode?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const days = [1, 7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const mode = sp.mode === "demo" || sp.mode === "live" ? sp.mode : env().APP_MODE;
  const m = await dashboardMetrics(days, mode);
  const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
  return (
    <AdminShell email={admin.email} mode={env().APP_MODE}>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">Дашборд</h1>
        {[1, 7, 30, 90].map((d) => <a key={d} href={`?days=${d}&mode=${mode}`} className={`rounded-lg px-3 py-1.5 text-sm ${d === days ? "bg-surface-3" : "text-muted"}`}>{d} дн.</a>)}
        {(["live", "demo"] as const).map((x) => <a key={x} href={`?days=${days}&mode=${x}`} className={`rounded-lg px-3 py-1.5 text-sm ${x === mode ? "bg-surface-3" : "text-muted"}`}>{x}</a>)}
      </div>

      <h2 className="mb-2 text-sm font-medium text-muted">Воронка (дані: {mode})</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Пошуки" value={m.searches} />
        <Stat label="Переходи до партнерів" value={m.clicks} hint={`CTR: ${pct(m.clickThroughRate)}`} />
        <Stat label="Підтверджені партнером операції" value={m.confirmedOperations} hint={`Конверсія з переходів: ${pct(m.confirmationRate)}`} />
        <Stat label="Завершені вбудовані обміни" value={m.completedExchanges} hint="Лише статус, отриманий від партнера" />
      </div>
      <p className="mt-2 text-xs text-faint">Переходи та створені заявки не є завершеними обмінами. Операція вважається підтвердженою лише після звіту/статусу партнера.</p>

      <h2 className="mb-2 mt-8 text-sm font-medium text-muted">Монетизація</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Підтверджений обсяг" value={<Money map={m.confirmedVolume} />} />
        <Stat label="Підтверджена винагорода" value={<Money map={m.confirmedRevenue} />} tone="positive" />
        <Stat label="Очікувана винагорода" value={<Money map={m.expectedRevenue} />} tone="warning" hint="Оцінка — не зароблені гроші" />
        <Stat label="Фактичні виплати" value={<Money map={m.paidOut} />} />
      </div>

      <h2 className="mb-2 mt-8 text-sm font-medium text-muted">API партнерів</h2>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted"><tr><th className="p-3">Партнер</th><th className="p-3">Запити</th><th className="p-3">Помилки</th><th className="p-3">Сер. відповідь</th></tr></thead>
          <tbody>
            {m.providerStats.length === 0 && <tr><td colSpan={4} className="p-3 text-muted">Ще немає запитів</td></tr>}
            {m.providerStats.map((p) => (
              <tr key={p.providerId} className="border-t border-line">
                <td className="p-3">{p.name}</td><td className="num p-3">{p.calls}</td>
                <td className={`num p-3 ${p.errors ? "text-danger" : ""}`}>{p.errors} ({p.calls ? ((p.errors / p.calls) * 100).toFixed(1) : 0}%)</td>
                <td className="num p-3">{p.avgMs} мс</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
