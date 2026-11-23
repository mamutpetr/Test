import Link from "next/link";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Logo } from "./Logo";

export function Footer({ locale, t }: { locale: Locale; t: Dictionary }) {
  const l = (p: string) => `/${locale}${p}`;
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 text-sm md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-muted">{t.footer.disclaimer}</p>
        </div>
        <ul className="space-y-2 text-muted">
          <li><Link className="hover:text-ink" href={l("/how-it-works")}>{t.nav.how}</Link></li>
          <li><Link className="hover:text-ink" href={l("/assets")}>{t.nav.assets}</Link></li>
          <li><Link className="hover:text-ink" href={l("/networks")}>{t.nav.networks}</Link></li>
          <li><Link className="hover:text-ink" href={l("/faq")}>{t.nav.faq}</Link></li>
          <li><Link className="hover:text-ink" href={l("/support")}>{t.nav.support}</Link></li>
        </ul>
        <ul className="space-y-2 text-muted">
          <li><Link className="hover:text-ink" href={l("/legal/terms")}>{t.footer.terms}</Link></li>
          <li><Link className="hover:text-ink" href={l("/legal/privacy")}>{t.footer.privacy}</Link></li>
          <li><Link className="hover:text-ink" href={l("/legal/risk")}>{t.footer.risk}</Link></li>
          <li className="pt-2 text-xs text-faint">{t.footer.draft}</li>
        </ul>
      </div>
      <div className="pb-8 text-center text-xs text-faint">© {new Date().getFullYear()} SWAPLY</div>
    </footer>
  );
}
