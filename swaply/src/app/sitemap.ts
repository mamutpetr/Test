import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";

const PATHS = ["", "/how-it-works", "/faq", "/assets", "/networks", "/support", "/legal/terms", "/legal/privacy", "/legal/risk"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  // Only static, informational pages — never generated pages with rates.
  return LOCALES.flatMap((l) => PATHS.map((p) => ({ url: `${base}/${l}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.6, alternates: { languages: Object.fromEntries(LOCALES.map((x) => [x, `${base}/${x}${p}`])) } })));
}
