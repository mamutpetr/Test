import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { rateLimit } from "../rate-limit";
import { logger } from "../logger";

export interface ApiErrorBody {
  error: { code: string; message: string; field?: string; details?: unknown };
}

export function json<T>(data: T, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function apiError(status: number, code: string, message: string, extra: Omit<ApiErrorBody["error"], "code" | "message"> = {}) {
  return json<ApiErrorBody>({ error: { code, message, ...extra } }, status);
}

/** Client fingerprint for rate limiting only — hashed, never stored. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || req.headers.get("x-real-ip") || "local";
  return crypto.createHash("sha256").update(`swaply:${ip}`).digest("base64url").slice(0, 22);
}

export async function limit(req: Request, name: string, max: number, windowSeconds: number) {
  const r = await rateLimit(`${name}:${clientKey(req)}`, max, windowSeconds);
  if (!r.ok) {
    const res = apiError(429, "rate_limited", "Too many requests, please slow down.");
    res.headers.set("Retry-After", String(r.resetSeconds));
    return res;
  }
  return null;
}

export async function readJson(req: Request, maxBytes = 16_384): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new BodyError("payload_too_large");
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new BodyError("unsupported_media_type");
  const text = await req.text();
  if (text.length > maxBytes) throw new BodyError("payload_too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError("invalid_json");
  }
}

export class BodyError extends Error {}

export function bodyErrorResponse(e: BodyError) {
  const status = e.message === "payload_too_large" ? 413 : e.message === "unsupported_media_type" ? 415 : 400;
  return apiError(status, e.message, "Invalid request body");
}

export function internalError(where: string, err: unknown) {
  logger.error(`api.${where}.failed`, { err: err instanceof Error ? err.message : String(err) });
  return apiError(500, "internal_error", "Something went wrong. Please try again.");
}
