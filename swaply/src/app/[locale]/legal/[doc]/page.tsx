import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, LOCALES } from "@/i18n/config";
import { legal, LEGAL_DRAFT_NOTICE } from "@/content/legal";
import { PageShell } from "@/components/layout/PageShell";

const DOCS = ["terms", "privacy", "risk"] as const;
type DocId = (typeof DOCS)[number];
const isDoc = (d: string): d is DocId => (DOCS as readonly string[]).includes(d);

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => DOCS.map((doc) => ({ locale, doc })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; doc: string }> }): Promise<Metadata> {
  const { locale, doc } = await params;
  if (!isLocale(locale) || !isDoc(doc)) return {};
  return { title: legal[locale][doc].title, alternates: { canonical: `/${locale}/legal/${doc}` } };
}

export default async function LegalPage({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  if (!isLocale(locale) || !isDoc(doc)) notFound();
  const d = legal[locale][doc];
  return (
    <PageShell title={d.title}>
      <p className="rounded-2xl bg-warning-soft p-4 text-sm !text-warning">{LEGAL_DRAFT_NOTICE[locale]}</p>
      {d.sections.map(([h, ps]) => (
        <section key={h}>
          <h2>{h}</h2>
          {ps.length > 1 ? <ul>{ps.map((p) => <li key={p}>{p}</li>)}</ul> : <p>{ps[0]}</p>}
        </section>
      ))}
    </PageShell>
  );
}
