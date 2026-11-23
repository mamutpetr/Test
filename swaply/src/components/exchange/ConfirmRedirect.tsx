"use client";
import { useEffect, useState } from "react";
import type { Dictionary } from "@/i18n";
import { ASSETS } from "@/lib/catalog";
import { formatAmount } from "@/lib/format";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import type { NormalizedQuote } from "./types";

type State =
  | { kind: "checking" }
  | { kind: "changed"; previous: NormalizedQuote; quote: NormalizedQuote }
  | { kind: "ready"; url: string; quote: NormalizedQuote; providerName: string; executingPartner: string | null }
  | { kind: "error"; message: string; expired?: boolean };

async function requestRedirect(quoteId: string, accepted?: string) {
  const res = await fetch("/api/v1/referrals/redirect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId, ...(accepted ? { acceptedReceiveAmount: accepted } : {}) }) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export function ConfirmRedirect({ quote, onClose, onExpired, t, locale }: { quote: NormalizedQuote | null; onClose: () => void; onExpired: () => void; t: Dictionary; locale: "uk" | "en" }) {
  const [state, setState] = useState<State>({ kind: "checking" });
  const c = t.confirm;

  const run = async (q: NormalizedQuote, accepted?: string) => {
    setState({ kind: "checking" });
    try {
      const { status, data } = await requestRedirect(q.quoteId, accepted);
      if (status === 200 && data.status === "ok") setState({ kind: "ready", url: data.redirectUrl, quote: data.quote, providerName: data.providerName, executingPartner: data.executingPartner });
      else if (status === 409 && data.status === "quote_changed") setState({ kind: "changed", previous: data.previous, quote: data.quote });
      else if (status === 404 || status === 410) setState({ kind: "error", message: c.expired, expired: true });
      else setState({ kind: "error", message: data?.error?.message ?? c.error });
    } catch {
      setState({ kind: "error", message: c.error });
    }
  };

  useEffect(() => {
    if (quote) void run(quote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.quoteId]);

  const prec = (q: NormalizedQuote) => ASSETS[q.destinationAsset]?.precision ?? 8;
  const amount = (q: NormalizedQuote) => `${formatAmount(q.estimatedReceiveAmount, prec(q), locale)} ${q.destinationAsset}`;

  return (
    <Sheet open={!!quote} onClose={onClose} title={state.kind === "changed" ? c.changedTitle : c.title} labelClose={t.common.close}>
      <div className="space-y-4 pb-2" data-testid="confirm-sheet" data-state={state.kind}>
        {state.kind === "checking" && (
          <div className="flex items-center gap-3 py-6 text-muted">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            {c.checking}
          </div>
        )}

        {state.kind === "changed" && (
          <>
            <p className="text-sm text-muted">{c.changedText}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface-2 p-3">
                <div className="text-xs text-faint">{c.was}</div>
                <div className="num font-semibold line-through decoration-danger/60">{amount(state.previous)}</div>
              </div>
              <div className="rounded-2xl bg-accent-soft p-3">
                <div className="text-xs text-faint">{c.now}</div>
                <div className="num font-semibold" data-testid="changed-new-amount">{amount(state.quote)}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={onClose}>{c.cancel}</Button>
              <Button className="flex-1" data-testid="accept-new-rate" onClick={() => run(state.quote, state.quote.estimatedReceiveAmount)}>{c.accept}</Button>
            </div>
          </>
        )}

        {state.kind === "ready" && (
          <>
            <div className="glass-inset rounded-3xl p-4">
              <div className="text-xs text-faint">{c.redirectTitle}</div>
              <div className="text-lg font-semibold" data-testid="redirect-provider">{state.executingPartner ? `${state.executingPartner} · ${state.providerName}` : state.providerName}</div>
              <div className="mt-2 text-xs text-faint">{t.results.youGet}</div>
              <div className="num text-2xl font-semibold">{amount(state.quote)}</div>
              {state.quote.rateType === "floating" && <div className="text-xs text-faint">{t.results.floatingHint}</div>}
            </div>
            <ul className="space-y-1.5 text-sm text-muted">
              <li>• {c.redirectText}</li>
              <li>• {t.results.whoProvides}</li>
              <li>• {c.reenterNote}</li>
              <li>• {c.attribution}</li>
            </ul>
            <a href={state.url} rel="noopener noreferrer nofollow" data-testid="redirect-link"
              className="btn-liquid flex h-14 w-full items-center justify-center rounded-[22px] font-semibold transition active:scale-[0.98]">
              {c.go} ↗
            </a>
          </>
        )}

        {state.kind === "error" && (
          <>
            <p className="rounded-2xl bg-danger-soft p-4 text-sm text-danger" data-testid="confirm-error">{state.message}</p>
            <Button className="w-full" variant="secondary" onClick={() => { onClose(); if (state.expired) onExpired(); }}>{state.expired ? t.results.refresh : t.common.close}</Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
