import { apiError, BodyError, bodyErrorResponse, internalError, json, limit, readJson } from "@/lib/api/respond";
import { createEmbeddedExchange, createExchangeSchema } from "@/server/exchanges/service";
import { isProviderError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = await limit(req, "exchanges", 5, 60);
  if (limited) return limited;
  try {
    const parsed = createExchangeSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return apiError(422, "validation_error", i?.message ?? "Invalid body", { field: i?.path.join(".") });
    }
    const r = await createEmbeddedExchange(parsed.data, req.headers.get("idempotency-key") ?? "");
    if (r.status === "created") return json(r.exchange, 201);
    if (r.status === "replayed") return json(r.exchange, 200, { "Idempotent-Replayed": "true" });
    if (r.status === "quote_changed") return json(r, 409);
    return apiError(r.http, r.code, r.message);
  } catch (err) {
    if (err instanceof BodyError) return bodyErrorResponse(err);
    if (isProviderError(err)) return apiError(502, `provider_${err.code}`, "The partner could not create the exchange. Nothing was charged; please try again or use the partner website.");
    return internalError("exchanges", err);
  }
}
