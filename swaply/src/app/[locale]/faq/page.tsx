import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { faqItems } from "@/content/faq";
import { PageShell } from "@/components/layout/PageShell";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: "FAQ", alternates: { canonical: `/${locale}/faq` } };
}

export default async function Faq({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const items = faqItems[locale];
  const jsonLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <PageShell title={locale === "uk" ? "Питання та відповіді" : "Frequently asked questions"}>
      <div className="space-y-2">
        {items.map((f) => (
          <details key={f.q} className="group rounded-2xl border border-line bg-surface p-4 open:bg-surface-2">
            <summary className="cursor-pointer list-none font-medium text-ink">{f.q}</summary>
            <p className="mt-2">{f.a}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </PageShell>
  );
}
