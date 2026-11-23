import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { ExchangeWidget } from "@/components/exchange/ExchangeWidget";
import { env } from "@/lib/env";
import { faqItems } from "@/content/faq";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const demo = env().APP_MODE === "demo";
  // Main scenario from the brief. In live mode we default to a crypto route, because fiat payouts
  // are only shown when a confirmed partner integration exists.
  const defaults = demo
    ? { fromAsset: "USDT", fromNetwork: "TRON", toAsset: "UAH", toNetwork: "CARD", amount: "1000", country: "UA" }
    : { fromAsset: "USDT", fromNetwork: "TRON", toAsset: "BTC", toNetwork: "BITCOIN", amount: "1000", country: undefined };

  const [sloganA, ...rest] = t.brand.slogan.split(". ");
  const sloganB = rest.join(". ");
  const steps = locale === "uk"
    ? [["Вкажіть обмін", "Валюта, мережа і сума — без реєстрації."], ["Порівняйте", "Бачите, скільки отримаєте після відомих комісій."], ["Обміняйте у партнера", "Переходите до сервісу, який виконає обмін."]]
    : [["Describe the swap", "Currency, network and amount — no sign-up."], ["Compare", "See what you get after known fees."], ["Swap with the partner", "Continue on the service that performs the exchange."]];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems[locale].slice(0, 5).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <>
      <section className="pb-6 pt-7 text-center sm:pb-8 sm:pt-16">
        <h1 className="fade-up mx-auto max-w-2xl text-balance text-[36px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[56px]">
          {sloganA}{sloganB ? "." : ""}
          <br />
          <span className="shimmer-text">{sloganB}</span>
        </h1>
        <p className="fade-up-2 mx-auto mt-3 max-w-md text-balance text-[15px] text-muted sm:mt-4 sm:text-base">{t.brand.sub}</p>
      </section>
      <div className="fade-up-3">
        <ExchangeWidget t={t} locale={locale} defaults={defaults} />
      </div>
      <section className="mx-auto mt-20 grid max-w-3xl gap-3 sm:grid-cols-3">
        {steps.map(([h, p], i) => (
          <div key={h} className="glass rounded-[28px] p-5">
            <div className="mb-3 btn-liquid grid h-8 w-8 place-items-center rounded-full text-sm font-semibold">{i + 1}</div>
            <h3 className="font-semibold">{h}</h3>
            <p className="mt-1 text-sm text-muted">{p}</p>
          </div>
        ))}
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
