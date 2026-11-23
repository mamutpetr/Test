import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { ExchangeTracker } from "@/components/exchange/ExchangeTracker";

export const metadata = { robots: { index: false } };

export default async function ExchangePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  return <ExchangeTracker id={id} t={getDictionary(locale)} locale={locale} />;
}
