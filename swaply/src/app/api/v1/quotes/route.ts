import { apiError, BodyError, bodyErrorResponse, internalError, json, limit, readJson } from "@/lib/api/respond";
import { aggregate, ValidationError } from "@/server/aggregator/engine";
import { installProviderCallLogging, recordSearch } from "@/server/analytics/record";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = await limit(req, "quotes", 30, 60);
  if (limited) return limited;
  try {
    installProviderCallLogging();
    const body = await readJson(req);
    const result = await aggregate(body, { onSearch: (r, ms) => recordSearch(r, ms) });
    return json(result);
  } catch (err) {
    if (err instanceof BodyError) return bodyErrorResponse(err);
    if (err instanceof ValidationError) return apiError(422, "validation_error", err.message, { field: err.field });
    return internalError("quotes", err);
  }
}
