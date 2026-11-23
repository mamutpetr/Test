import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { PageShell } from "@/components/layout/PageShell";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "uk" ? "Підтримка" : "Support", alternates: { canonical: `/${locale}/support` } };
}

const PARTNERS = [
  { name: "ChangeNOW", url: "https://changenow.io/faq" },
  { name: "Swapzone", url: "https://swapzone.io/support" },
  { name: "Changelly", url: "https://support.changelly.com" },
];

export default async function Support({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const uk = locale === "uk";
  return (
    <PageShell title={uk ? "Підтримка" : "Support"} lead={uk ? "Обмін виконує партнер — тож питання щодо конкретної транзакції вирішує його служба підтримки." : "The partner performs the exchange, so questions about a specific transaction are handled by its support."}>
      <h2>{uk ? "Проблема з обміном" : "A problem with an exchange"}</h2>
      <ul>
        <li>{uk ? "Знайдіть ID транзакції на сайті партнера або в листі від нього." : "Find the transaction ID on the partner site or in their email."}</li>
        <li>{uk ? "Зверніться до підтримки партнера, вказавши ID і хеш транзакції:" : "Contact the partner's support with the ID and transaction hash:"}</li>
      </ul>
      <ul>
        {PARTNERS.map((p) => (
          <li key={p.name}><a href={p.url} rel="noopener noreferrer nofollow" target="_blank">{p.name}</a></li>
        ))}
      </ul>
      <h2>{uk ? "Питання щодо SWAPLY" : "Questions about SWAPLY"}</h2>
      <p>{uk ? "Пишіть на адресу підтримки, вказану оператором сервісу (див. README → контакти перед запуском)." : "Write to the support address published by the service operator (see README → contacts before launch)."}</p>
      <p className="text-sm text-faint">{uk ? "Ми ніколи не попросимо seed-фразу, приватний ключ чи пароль від гаманця." : "We will never ask for your seed phrase, private key or wallet password."}</p>
    </PageShell>
  );
}
