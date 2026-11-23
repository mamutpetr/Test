import { requireAdmin } from "@/server/admin/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ImportForm } from "./ImportForm";

const STATUS: Record<string, string> = { EXPECTED: "очікується", CONFIRMED: "підтверджено", PAID: "виплачено", REJECTED: "відхилено" };

export default async function RevenuePage() {
  const admin = await requireAdmin();
  const [rows, providers] = await Promise.all([
    prisma.partnerRevenue.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.provider.findMany({ where: { NOT: { id: { startsWith: "demo-" } } }, select: { id: true, name: true }, orderBy: { priority: "asc" } }),
  ]);
  return (
    <AdminShell email={admin.email} mode={env().APP_MODE}>
      <h1 className="mb-1 text-2xl font-semibold">Партнерські винагороди</h1>
      <p className="mb-6 text-sm text-muted">Очікувані суми — оцінка. Зароблено лише те, що підтвердив партнер у звіті; виплачено — фактично отримано.</p>
      {admin.role !== "ANALYST" && (
        <section className="mb-8 rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-1 font-semibold">Імпорт звіту партнера</h2>
          <p className="mb-3 text-xs text-faint">Формат CSV: provider_transaction_id,date,volume,volume_currency,commission,commission_currency,status (confirmed|paid|rejected)</p>
          <ImportForm providers={providers} />
        </section>
      )}
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted"><tr><th className="p-3">Партнер</th><th className="p-3">Транзакція</th><th className="p-3">Модель</th><th className="p-3">Ставка</th><th className="p-3">Обсяг</th><th className="p-3">Очікувано</th><th className="p-3">Підтверджено</th><th className="p-3">Виплачено</th><th className="p-3">Статус</th><th className="p-3">Звірка</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="p-3 text-muted">Записів немає. Імпортуйте звіт партнера.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="p-3">{r.providerId}</td><td className="p-3 font-mono text-xs">{r.providerTransactionId ?? "—"}</td><td className="p-3">{r.commissionModel}</td>
                <td className="num p-3">{r.commissionRate?.toFixed() ?? "—"}</td><td className="num p-3">{r.volume?.toFixed() ?? "—"}</td>
                <td className="num p-3 text-warning">{r.expectedAmount ? `${r.expectedAmount.toFixed()} ${r.currency}` : "—"}</td>
                <td className="num p-3 text-positive">{r.confirmedAmount ? `${r.confirmedAmount.toFixed()} ${r.currency}` : "—"}</td>
                <td className="num p-3">{r.paidAmount ? `${r.paidAmount.toFixed()} ${r.currency}` : "—"}</td>
                <td className="p-3">{STATUS[r.status]}</td><td className="p-3">{r.reconciledAt?.toISOString().slice(0, 10) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
