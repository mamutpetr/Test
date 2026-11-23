import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { ASSETS, networkLabel } from "@/lib/catalog";
import { AssetIcon } from "@/components/ui/AssetIcon";
import { PageShell } from "@/components/layout/PageShell";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "uk" ? "Підтримувані валюти" : "Supported currencies", alternates: { canonical: `/${locale}/assets` } };
}

export default async function Assets({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const uk = locale === "uk";
  return (
    <PageShell title={uk ? "Валюти" : "Currencies"} lead={uk ? "Які валюти та мережі розпізнає SWAPLY. Чи доступний конкретний обмін, визначають підключені партнери в момент пошуку." : "Currencies and networks SWAPLY understands. Whether a specific exchange is available is decided by connected partners at search time."}>
      <ul className="not-prose grid gap-2 sm:grid-cols-2">
        {Object.values(ASSETS).map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <AssetIcon assetId={a.id} size={40} />
            <div>
              <div className="font-semibold text-ink">{a.symbol} <span className="font-normal text-muted">· {a.name}</span></div>
              <div className="text-sm text-muted">{a.kind === "fiat" ? (uk ? "Фіат — лише через підтверджених партнерів" : "Fiat — only via confirmed partners") : a.networks.map(networkLabel).join(", ")}</div>
            </div>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
