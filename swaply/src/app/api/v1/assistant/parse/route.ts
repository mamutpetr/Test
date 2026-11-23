import { z } from "zod";
import { apiError, BodyError, bodyErrorResponse, json, limit, readJson } from "@/lib/api/respond";
import { parseIntent } from "@/server/assistant/parser";

export const dynamic = "force-dynamic";
const schema = z.object({ text: z.string().min(2).max(500) }).strict();

/** Parses free text into a structured search. It never returns rates or payment details. */
export async function POST(req: Request) {
  const limited = await limit(req, "assistant", 20, 60);
  if (limited) return limited;
  try {
    const parsed = schema.safeParse(await readJson(req, 4096));
    if (!parsed.success) return apiError(422, "validation_error", "text is required (2-500 chars)");
    return json({ engine: "rules-v1", intent: parseIntent(parsed.data.text) });
  } catch (err) {
    if (err instanceof BodyError) return bodyErrorResponse(err);
    throw err;
  }
}
