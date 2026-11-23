import { ASSETS, NETWORKS } from "@/lib/catalog";
import { json } from "@/lib/api/respond";

export const dynamic = "force-static";

export function GET() {
  return json({
    assets: Object.values(ASSETS).map((a) => ({
      id: a.id,
      symbol: a.symbol,
      name: a.name,
      type: a.kind,
      precision: a.precision,
      networks: a.networks.map((n) => ({ id: n, name: NETWORKS[n]!.name, standard: NETWORKS[n]!.standard ?? null })),
    })),
  });
}
