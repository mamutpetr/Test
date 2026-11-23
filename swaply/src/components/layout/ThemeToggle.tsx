"use client";
import { useState } from "react";

export function ThemeToggle({ initial, labels }: { initial: "dark" | "light"; labels: { dark: string; light: string } }) {
  const [theme, setTheme] = useState(initial);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={labels[next]}
      title={labels[next]}
      onClick={() => {
        document.documentElement.classList.toggle("dark", next === "dark");
        document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
        setTheme(next);
      }}
      className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
    >
      {theme === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
      )}
    </button>
  );
}
