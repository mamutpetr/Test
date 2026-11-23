import { z } from "zod";
import { apiError, BodyError, bodyErrorResponse, internalError, json, limit, readJson } from "@/lib/api/respond";
import { createReferralRedirect } from "@/server/referral/service";
import { installProviderCallLogging } from "@/server/analytics/record";

export const dynamic = "force-dynamic";

const schema = z.object({ quoteId: z.string().min(8).max(64), acceptedReceiveAmount: z.string().max(40).optional() }).strict();

export async function POST(req: Request) {
  const limited = await limit(req, "redirect", 20, 60);
  if (limited) return limited;
  try {
    installProviderCallLogging();
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError(422, "validation_error", "quoteId is required");
    const r = await createReferralRedirect(parsed.data.quoteId, parsed.data.acceptedReceiveAmount);
    switch (r.status) {
      case "ok":
        return json(r);
      case "quote_changed":
        return json(r, 409);
      case "not_found":
        return apiError(404, "quote_not_found", "This offer has expired. Please search again.");
      case "unavailable":
        return apiError(410, "quote_unavailable", "The partner no longer offers this exchange.", { details: { reason: r.reason } });
      case "redirect_not_configured":
        return apiError(409, "redirect_not_configured", "Partner link is not configured for this provider.");
      case "tracking_failed":
        return apiError(503, "tracking_unavailable", "Could not prepare the partner link. Please try again.");
    }
  } catch (err) {
    if (err instanceof BodyError) return bodyErrorResponse(err);
    return internalError("redirect", err);
  }
}
