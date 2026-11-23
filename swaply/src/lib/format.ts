/** Formats a decimal string without converting to float. Groups thousands, trims to `maxDecimals`. */
export function formatAmount(value: string, maxDecimals = 8, locale: "uk" | "en" = "uk"): string {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  const neg = value.startsWith("-");
  const [intRaw, fracRaw = ""] = (neg ? value.slice(1) : value).split(".");
  const int = (intRaw ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, locale === "uk" ? " " : ",");
  const frac = fracRaw.slice(0, maxDecimals).replace(/0+$/, "");
  const sep = locale === "uk" ? "," : ".";
  return `${neg ? "−" : ""}${int}${frac ? sep + frac : ""}`;
}

/** Significant-digit friendly decimals for a rate: small numbers keep more digits. */
export function decimalsFor(value: string, base = 6): number {
  const n = value.split(".")[0] ?? "0";
  if (n.length >= 4) return 2;
  if (n !== "0") return Math.min(base, 4);
  return Math.max(base, 8);
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
