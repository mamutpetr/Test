import { NETWORKS } from "@/lib/catalog";
import { json } from "@/lib/api/respond";

export const dynamic = "force-static";

export function GET() {
  return json({
    networks: Object.values(NETWORKS).map((n) => ({ id: n.id, name: n.name, standard: n.standard ?? null, kind: n.kind, chainIdentifier: n.chainIdentifier ?? null, memoCommon: !!n.memoCommon, hint: n.hint })),
  });
}
