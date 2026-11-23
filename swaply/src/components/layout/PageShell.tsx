import type { ReactNode } from "react";

export function PageShell({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl py-12">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {lead && <p className="mt-3 text-muted">{lead}</p>}
      <div className="prose-swaply mt-6">{children}</div>
    </article>
  );
}
