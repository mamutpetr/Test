import type { ReactNode } from "react";
import "../globals.css";

export const metadata = { title: "SWAPLY Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminRoot({ children }: { children: ReactNode }) {
  return (
    <html lang="uk" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
