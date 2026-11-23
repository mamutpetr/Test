import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SWAPLY — crypto exchange aggregator",
    short_name: "SWAPLY",
    description: "Compare real crypto exchange offers. No sign-up.",
    start_url: "/uk",
    display: "standalone",
    background_color: "#08090d",
    theme_color: "#08090d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
