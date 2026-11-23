"use client";
import { useState } from "react";
import type { Dictionary } from "@/i18n";

export interface Intent {
  fromAsset: string | null;
  fromNetwork: string | null;
  toAsset: string | null;
  toNetwork: string | null;
  amount: string | null;
  country: string | null;
  missing: string[];
}

/** Free-text → form fields. Only fills the form; never shows rates itself. */
export function AssistantBox({ t, onApply }: { t: Dictionary; onApply: (i: Intent) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labels: Record<string, string> = { fromAsset: t.form.give, fromNetwork: t.form.network, toAsset: t.form.get, toNetwork: t.form.payout, amount: t.form.amount };

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/assistant/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message);
      onApply(data.intent as Intent);
      const missing = (data.intent.missing as string[]).map((m) => labels[m] ?? m);
      setMsg(missing.length ? `${t.form.describeMissing} ${missing.join(", ")}` : t.form.describeOk);
    } catch {
      setMsg(t.confirm.error);
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 w-full text-center text-sm text-muted hover:text-ink" data-testid="assistant-open">
        ✦ {t.form.describe}
      </button>
    );
  return (
    <div className="mt-3 rounded-2xl border border-line p-3">
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t.form.describePlaceholder} aria-label={t.form.describe} data-testid="assistant-input"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (text.trim().length > 1) void run(); } }}
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-[16px] outline-none focus:border-accent sm:text-sm" />
        <button type="button" onClick={() => void run()} disabled={busy || text.trim().length < 2} data-testid="assistant-apply" className="h-10 rounded-xl bg-surface-3 px-3 text-sm font-medium disabled:opacity-50">
          {t.form.describeApply}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-muted" data-testid="assistant-msg">{msg}</p>}
    </div>
  );
}
