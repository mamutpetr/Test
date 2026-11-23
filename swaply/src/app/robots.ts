import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const live = process.env.APP_MODE === "live";
  return {
    rules: live ? [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/uk/exchange/", "/en/exchange/", "/uk/demo-partner", "/en/demo-partner"] }] : [{ userAgent: "*", disallow: "/" }],
    sitemap: `${base}/sitemap.xml`,
  };
}
