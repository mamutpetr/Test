import Link from "next/link";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function Header({ locale, t, theme, isDemo }: { locale: Locale; t: Dictionary; theme: "dark" | "light"; isDemo: boolean }) {
  const other = locale === "uk" ? "en" : "uk";
  return (
    <header className="sticky top-0 z-30 border-b border-line/50 bg-bg/35 backdrop-blur-2xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href={`/${locale}`} className="flex items-center gap-2" aria-label="SWAPLY">
          <Logo />
          {isDemo && <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-warning">{t.demo.badge}</span>}
        </Link>
        <nav className="hidden items-center gap-1 text-sm text-muted md:flex">
          <Link className="rounded-xl px-3 py-2 hover:text-ink" href={`/${locale}/how-it-works`}>{t.nav.how}</Link>
          <Link className="rounded-xl px-3 py-2 hover:text-ink" href={`/${locale}/networks`}>{t.nav.networks}</Link>
          <Link className="rounded-xl px-3 py-2 hover:text-ink" href={`/${locale}/faq`}>{t.nav.faq}</Link>
          <Link className="rounded-xl px-3 py-2 hover:text-ink" href={`/${locale}/support`}>{t.nav.support}</Link>
        </nav>
        <div className="flex items-center gap-1">
          <Link href={`/${other}`} hrefLang={other} className="grid h-10 min-w-10 place-items-center rounded-full px-2 text-xs font-semibold uppercase text-muted hover:bg-surface-2 hover:text-ink">
            {other}
          </Link>
          <ThemeToggle initial={theme} labels={t.theme} />
        </div>
      </div>
    </header>
  );
}
