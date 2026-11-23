"use client";
import { useMemo, useState } from "react";
import { ASSETS, NETWORKS, networkLabel } from "@/lib/catalog";
import { AssetIcon } from "../ui/AssetIcon";
import { Sheet } from "../ui/Sheet";
import type { Dictionary } from "@/i18n";
import { cn } from "../ui/cn";

export function AssetButton({ assetId, networkId, onClick, testId, locale }: { assetId: string; networkId: string; onClick: () => void; testId: string; locale: "uk" | "en" }) {
  const a = ASSETS[assetId]!;
  return (
    <button type="button" data-testid={testId} onClick={onClick} className="glass flex shrink-0 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3 transition duration-300 hover:scale-[1.03] active:scale-95">
      <AssetIcon assetId={assetId} size={32} />
      <span className="text-left leading-tight">
        <span className="block text-[15px] font-semibold">{a.symbol}</span>
        <span className="block text-[11px] text-muted">{NETWORKS[networkId]?.kind === "fiat_rail" ? RAIL_SHORT[locale][networkId] : NETWORKS[networkId]?.standard ?? NETWORKS[networkId]?.name}</span>
      </span>
      <svg width="12" height="12" viewBox="0 0 12 12" className="text-muted" aria-hidden><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
    </button>
  );
}

export function AssetSheet({ open, onClose, onSelect, t, allowFiat, current, title }: { open: boolean; onClose: () => void; onSelect: (assetId: string) => void; t: Dictionary; allowFiat: boolean; current: string; title: string }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.values(ASSETS).filter((a) => (allowFiat || a.kind === "crypto") && (!s || a.symbol.toLowerCase().includes(s) || a.name.toLowerCase().includes(s)));
  }, [q, allowFiat]);
  const groups: Array<[string, typeof list]> = [
    [t.form.crypto, list.filter((a) => a.kind === "crypto")],
    [t.form.fiat, list.filter((a) => a.kind === "fiat")],
  ];
  return (
    <Sheet open={open} onClose={onClose} title={title} labelClose={t.common.close}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.form.searchAsset} aria-label={t.form.searchAsset} className="glass-inset mb-3 h-12 w-full rounded-2xl px-4 text-[16px] outline-none focus:border-accent" />
      {groups.map(([label, items]) =>
        items.length ? (
          <div key={label} className="mb-3">
            <div className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wider text-faint">{label}</div>
            <ul className="space-y-1">
              {items.map((a) => (
                <li key={a.id}>
                  <button type="button" data-testid={`asset-option-${a.id}`} onClick={() => { onSelect(a.id); setQ(""); onClose(); }} className={cn("flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition duration-200 hover:bg-ink/5 active:scale-[0.98]", current === a.id && "bg-accent-soft")}>
                    <AssetIcon assetId={a.id} size={40} />
                    <span className="flex-1">
                      <span className="block font-semibold">{a.symbol}</span>
                      <span className="block text-sm text-muted">{a.name}</span>
                    </span>
                    <span className="text-xs text-faint">{a.networks.length > 1 ? networksCount(a.networks.length, t) : networkLabel(a.networks[0]!)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </Sheet>
  );
}

const RAIL_SHORT: Record<"uk" | "en", Record<string, string>> = {
  uk: { CARD: "Картка", BANK_TRANSFER: "Переказ" },
  en: { CARD: "Card", BANK_TRANSFER: "Transfer" },
};

function networksCount(n: number, t: Dictionary) {
  if (t.form.network === "Мережа") {
    const m10 = n % 10, m100 = n % 100;
    return `${n} ${m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "мережі" : "мереж"}`;
  }
  return `${n} networks`;
}

const RAIL_LABELS: Record<"uk" | "en", Record<string, string>> = {
  uk: { CARD: "Банківська картка", BANK_TRANSFER: "Банківський переказ" },
  en: { CARD: "Bank card", BANK_TRANSFER: "Bank transfer" },
};

export function NetworkChips({ assetId, value, onChange, label, locale, testId }: { assetId: string; value: string; onChange: (n: string) => void; label: string; locale: "uk" | "en"; testId: string }) {
  const a = ASSETS[assetId]!;
  if (a.networks.length <= 1 && a.kind === "crypto") return null;
  return (
    <div className="mt-3" role="radiogroup" aria-label={label} data-testid={testId}>
      <div className="mb-1.5 text-xs text-muted">{label}</div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 pr-6 [scrollbar-width:none] [mask-image:linear-gradient(90deg,#000_85%,transparent)]">
        {a.networks.map((n) => {
          const net = NETWORKS[n]!;
          const active = value === n;
          return (
            <button key={n} type="button" role="radio" aria-checked={active} data-testid={`${testId}-${n}`} title={net.hint[locale]} onClick={() => onChange(n)}
              className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition duration-200 active:scale-95", active ? "border-accent/60 bg-accent-soft text-ink shadow-[0_0_0_3px_var(--accent-soft)]" : "border-line text-muted hover:border-line-strong hover:text-ink")}>
              <span className="font-medium">{net.kind === "fiat_rail" ? RAIL_LABELS[locale][n] ?? net.name : net.standard ?? net.name}</span>
              {net.standard && <span className="ml-1 text-xs text-faint">{net.name}</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-faint">{NETWORKS[value]?.hint[locale]}</p>
    </div>
  );
}
