import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "../layout/Logo";
import { logoutAction } from "@/app/admin/actions";

export function AdminShell({ email, mode, children }: { email: string; mode: string; children: ReactNode }) {
  const links: Array<[string, string]> = [
    ["/admin", "Дашборд"],
    ["/admin/providers", "Партнери"],
    ["/admin/revenue", "Винагороди"],
    ["/admin/audit", "Аудит і події"],
  ];
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Logo />
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${mode === "live" ? "bg-positive-soft text-positive" : "bg-warning-soft text-warning"}`}>{mode.toUpperCase()}</span>
          <nav className="flex flex-wrap gap-1 text-sm">
            {links.map(([href, label]) => <Link key={href} href={href} className="rounded-lg px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-ink">{label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted">
            {email}
            <form action={logoutAction}><button className="rounded-lg px-3 py-1.5 hover:bg-surface-2 hover:text-ink">Вийти</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "positive" | "warning" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`num mt-1 text-2xl font-semibold ${tone === "positive" ? "text-positive" : tone === "warning" ? "text-warning" : ""}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function Money({ map }: { map: Record<string, string> }) {
  const e = Object.entries(map);
  if (!e.length) return <>0</>;
  return <span className="flex flex-col">{e.map(([c, v]) => <span key={c}>{v} <span className="text-sm text-muted">{c}</span></span>)}</span>;
}
