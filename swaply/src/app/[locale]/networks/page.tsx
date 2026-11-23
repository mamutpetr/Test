import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { ASSETS, NETWORKS } from "@/lib/catalog";
import { PageShell } from "@/components/layout/PageShell";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "uk" ? "Криптомережі простими словами" : "Crypto networks explained", alternates: { canonical: `/${locale}/networks` } };
}

export default async function Networks({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const uk = locale === "uk";
  const chains = Object.values(NETWORKS).filter((n) => n.kind === "chain");
  return (
    <PageShell title={uk ? "Мережі простими словами" : "Networks, simply"} lead={uk ? "Один токен може існувати в кількох мережах. USDT у мережі Tron (TRC20) і USDT в Ethereum (ERC20) — це різні речі для переказу." : "One token can live on several networks. USDT on Tron (TRC20) and USDT on Ethereum (ERC20) are different things for a transfer."}>
      <h2>{uk ? "Головне правило" : "The golden rule"}</h2>
      <p>{uk ? "Надсилайте кошти в тій самій мережі, яку обрали в обміні. Якщо гаманець пропонує кілька мереж — оберіть ту, що збігається. Помилка з мережею часто означає втрату коштів." : "Send funds on the same network you chose in the exchange. If your wallet offers several networks, pick the matching one. A network mistake often means lost funds."}</p>
      <div className="not-prose mt-6 space-y-2">
        {chains.map((n) => (
          <div key={n.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="font-semibold text-ink">{n.name}{n.standard && <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{n.standard}</span>}</div>
            <p className="mt-1 text-sm text-muted">{n.hint[locale]}</p>
            <p className="mt-1 text-xs text-faint">{(uk ? "Активи: " : "Assets: ") + Object.values(ASSETS).filter((a) => a.networks.includes(n.id)).map((a) => a.symbol).join(", ")}</p>
          </div>
        ))}
      </div>
      <h2>{uk ? "Memo / Tag" : "Memo / Tag"}</h2>
      <p>{uk ? "Деякі мережі (наприклад, TON) і біржі вимагають memo або comment. Якщо партнер його видав — обов'язково вкажіть його при переказі." : "Some networks (e.g. TON) and exchanges require a memo or comment. If the partner issues one, you must include it in the transfer."}</p>
    </PageShell>
  );
}
