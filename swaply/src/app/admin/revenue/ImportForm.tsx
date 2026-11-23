"use client";
import { useActionState } from "react";
import { importReportAction } from "../actions";

export function ImportForm({ providers }: { providers: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(importReportAction, {} as { message?: string; errors?: string[] });
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1"><span className="text-xs text-faint">Партнер</span>
        <select name="providerId" className="h-9 rounded-lg border border-line bg-surface-2 px-2">{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1"><span className="text-xs text-faint">Модель</span>
        <select name="commissionModel" className="h-9 rounded-lg border border-line bg-surface-2 px-2">
          <option value="REVENUE_SHARE">Revenue share</option><option value="PARTNER_EXTRA_FEE">Partner extra fee</option><option value="AFFILIATE_REFERRAL">Affiliate referral</option>
        </select>
      </label>
      <label className="flex flex-col gap-1"><span className="text-xs text-faint">CSV-звіт</span><input type="file" name="file" accept=".csv,text/csv" className="text-sm" /></label>
      <button disabled={pending} className="h-9 rounded-lg bg-accent px-3 font-medium text-on-accent disabled:opacity-50">{pending ? "…" : "Імпортувати"}</button>
      {state.message && <p className="w-full text-positive">{state.message}</p>}
      {state.errors?.length ? <ul className="w-full list-disc pl-5 text-danger">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
    </form>
  );
}
