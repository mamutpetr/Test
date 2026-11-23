import { requireAdmin } from "@/server/admin/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export default async function AuditPage() {
  const admin = await requireAdmin(["OWNER", "ADMIN"]);
  const [logs, clicks, events] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.referralClick.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.analyticsEvent.groupBy({ by: ["name"], _count: { _all: true }, where: { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } } }),
  ]);
  return (
    <AdminShell email={admin.email} mode={env().APP_MODE}>
      <h1 className="mb-6 text-2xl font-semibold">Аудит і події</h1>
      <h2 className="mb-2 text-sm font-medium text-muted">Аналітичні події (30 днів)</h2>
      <div className="mb-8 flex flex-wrap gap-2">{events.map((e) => <span key={e.name} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">{e.name}: <b className="num">{e._count._all}</b></span>)}</div>
      <h2 className="mb-2 text-sm font-medium text-muted">Останні переходи до партнерів</h2>
      <Table head={["Час", "Партнер", "Маршрут", "Сума", "Показано до отримання", "Хост", "Режим"]} rows={clicks.map((c) => [c.createdAt.toISOString().slice(0, 19).replace("T", " "), c.providerId, c.route, c.sendAmount.toFixed(), c.receiveAmountShown.toFixed(), c.redirectHost, c.mode])} />
      <h2 className="mb-2 mt-8 text-sm font-medium text-muted">Журнал дій адміністраторів</h2>
      <Table head={["Час", "Хто", "Дія", "Об'єкт"]} rows={logs.map((l) => [l.createdAt.toISOString().slice(0, 19).replace("T", " "), l.actor, l.action, l.target ?? "—"])} />
    </AdminShell>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-muted"><tr>{head.map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="p-3 text-muted">—</td></tr>}
          {rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="p-3">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
