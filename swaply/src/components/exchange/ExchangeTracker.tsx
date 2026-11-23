"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Dictionary } from "@/i18n";
import { formatAmount } from "@/lib/format";
import { cn } from "../ui/cn";
import type { PublicExchange } from "@/server/exchanges/service";

const FLOW = ["AWAITING_DEPOSIT", "CONFIRMING", "EXCHANGING", "SENDING", "COMPLETED"] as const;
const TERMINAL = ["COMPLETED", "FAILED", "EXPIRED", "REFUNDED"];

export function ExchangeTracker({ id, t, locale }: { id: string; t: Dictionary; locale: "uk" | "en" }) {
  const q = useQuery<PublicExchange>({
    queryKey: ["exchange", id],
    queryFn: async () => {
      const r = await fetch(`/api/v1/exchanges/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    refetchInterval: (query) => (query.state.data && TERMINAL.includes(query.state.data.status) ? false : 10_000),
  });
  const [copied, setCopied] = useState(false);
  const tr = t.tracking;
  if (q.isLoading) return <p className="py-10 text-muted">{t.common.loading}</p>;
  if (q.isError || !q.data) return <p className="py-10 text-danger">404</p>;
  const e = q.data;
  const idx = FLOW.indexOf(e.status as (typeof FLOW)[number]);
  const bad = ["FAILED", "EXPIRED", "REFUNDED", "VERIFICATION_REQUIRED"].includes(e.status);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-10" data-testid="tracker" data-status={e.status}>
      <h1 className="text-2xl font-semibold">{tr.title}</h1>
      {e.isDemo && <p className="rounded-2xl bg-warning-soft p-3 text-sm text-warning">{tr.demoNote}</p>}
      <div className="rounded-3xl border border-line bg-surface p-5">
        <div className="text-sm text-muted">{tr.provider}: <b className="text-ink">{e.providerName}</b> {e.externalId && <span className="text-faint">· {e.externalId}</span>}</div>
        <div className={cn("mt-2 text-xl font-semibold", bad ? "text-danger" : e.status === "COMPLETED" ? "text-positive" : "")}>{tr.statuses[e.status]}</div>
        {!e.statusFromProvider && <p className="mt-1 text-xs text-faint">{tr.notFromProvider}</p>}
        {!e.statusTrackingAvailable && <p className="mt-1 text-xs text-faint">{tr.noTracking}</p>}
        <ol className="mt-4 flex gap-1.5" aria-hidden>
          {FLOW.map((s, i) => <li key={s} className={cn("h-1.5 flex-1 rounded-full", i <= idx ? "bg-accent" : "bg-surface-3")} />)}
        </ol>
      </div>
      {e.payinAddress && e.status === "AWAITING_DEPOSIT" && (
        <div className="rounded-3xl border border-line bg-surface p-5">
          <div className="text-sm font-medium">{tr.deposit}</div>
          <div className="num mt-1 text-2xl font-semibold">{formatAmount(e.sendAmount, 8, locale)} {e.fromAsset} <span className="text-sm text-muted">({e.fromNetwork})</span></div>
          <div className="mt-3 break-all rounded-xl bg-surface-2 p-3 font-mono text-sm" data-testid="payin-address">{e.payinAddress}</div>
          {e.payinExtraId && <div className="mt-2 break-all rounded-xl bg-surface-2 p-3 font-mono text-sm">Memo: {e.payinExtraId}</div>}
          <button type="button" className="mt-2 text-sm text-accent" onClick={() => { void navigator.clipboard.writeText(e.payinAddress!); setCopied(true); }}>{copied ? t.common.copied : t.common.copy}</button>
          <p className="mt-2 text-xs text-faint">{tr.depositNote}</p>
          {e.payTill && <p className="mt-1 text-xs text-muted">{tr.payTill}: {new Date(e.payTill).toLocaleString(locale)}</p>}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-3 rounded-3xl border border-line bg-surface p-5 text-sm">
        <dt className="text-muted">{tr.expected}</dt><dd className="num text-right">{formatAmount(e.expectedReceive, 8, locale)} {e.toAsset}</dd>
        {e.actualReceive && (<><dt className="text-muted">{tr.actual}</dt><dd className="num text-right">{formatAmount(e.actualReceive, 8, locale)} {e.toAsset}</dd></>)}
        <dt className="text-muted">{tr.payout}</dt><dd className="text-right font-mono">{e.payoutAddressMasked}</dd>
      </dl>
    </div>
  );
}
