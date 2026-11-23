import { notFound } from "next/navigation";
import Link from "next/link";
import { isLocale } from "@/i18n/config";
import { env } from "@/lib/env";

export const metadata = { robots: { index: false } };

export default async function DemoPartner({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale } = await params;
  if (!isLocale(locale) || env().APP_MODE !== "demo") notFound();
  const sp = await searchParams;
  const uk = locale === "uk";
  return (
    <div className="mx-auto max-w-md py-16 text-center" data-testid="demo-partner">
      <div className="text-xs font-bold tracking-widest text-warning">DEMO</div>
      <h1 className="mt-2 text-2xl font-semibold">{uk ? "Демонстраційний партнер" : "Demo partner"}</h1>
      <p className="mt-3 text-muted">
        {uk ? "У live-режимі тут був би сайт партнера за офіційним партнерським посиланням. Жодного обміну не створено." : "In live mode this would be the partner website via the official partner link. No exchange was created."}
      </p>
      <p className="mt-4 rounded-2xl bg-surface p-4 text-sm"><b>{sp.p}</b> · {sp.amount} {sp.from} → {sp.to}</p>
      <Link href={`/${locale}`} className="mt-6 inline-block text-accent underline underline-offset-4">{uk ? "Повернутися" : "Back"}</Link>
    </div>
  );
}
