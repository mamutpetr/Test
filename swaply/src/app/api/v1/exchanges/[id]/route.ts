import { apiError, internalError, json, limit } from "@/lib/api/respond";
import { getPublicExchange } from "@/server/exchanges/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await limit(req, "exchange-status", 60, 60);
  if (limited) return limited;
  try {
    const { id } = await ctx.params;
    const e = await getPublicExchange(id);
    if (!e) return apiError(404, "not_found", "Exchange not found");
    return json(e);
  } catch (err) {
    return internalError("exchange-status", err);
  }
}
