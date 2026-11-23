import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "../globals.css";
import { getDictionary } from "@/i18n";
import { isLocale, LOCALES } from "@/i18n/config";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Providers } from "@/components/Providers";
import { env } from "@/lib/env";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const base = env().APP_URL;
  return {
    metadataBase: new URL(base),
    title: { default: t.meta.title, template: `%s · SWAPLY` },
    description: t.meta.description,
    applicationName: "SWAPLY",
    alternates: { canonical: `/${locale}`, languages: { uk: "/uk", en: "/en" } },
    openGraph: { type: "website", siteName: "SWAPLY", title: t.meta.title, description: t.meta.description, locale: locale === "uk" ? "uk_UA" : "en_US", url: `/${locale}` },
    twitter: { card: "summary_large_image", title: t.meta.title, description: t.meta.description },
    robots: { index: env().APP_MODE === "live", follow: true },
    icons: { icon: "/icon.svg", apple: "/icon.svg" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08090d" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f9" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";
  const isDemo = env().APP_MODE === "demo";
  return (
    <html lang={locale} className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          {isDemo && (
            <div role="status" className="bg-warning-soft px-4 py-2 text-center text-xs font-medium text-warning" data-testid="demo-banner">
              {t.demo.banner}
            </div>
          )}
          <Header locale={locale} t={t} theme={theme} isDemo={isDemo} />
          <main className="mx-auto max-w-5xl px-4">{children}</main>
          <Footer locale={locale} t={t} />
        </Providers>
      </body>
    </html>
  );
}
