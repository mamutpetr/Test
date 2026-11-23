import { ASSETS } from "@/lib/catalog";

/** Monogram token icon (no third-party logos/brand assets). */
export function AssetIcon({ assetId, size = 36 }: { assetId: string; size?: number }) {
  const a = ASSETS[assetId];
  const color = a?.color ?? "#888";
  const label = (a?.symbol ?? assetId).slice(0, assetId.length > 3 ? 4 : 3);
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * (label.length > 3 ? 0.26 : 0.3), background: `linear-gradient(145deg, ${color}, color-mix(in oklab, ${color} 60%, black))`, boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 50%, transparent)` }}
    >
      {label}
    </span>
  );
}
