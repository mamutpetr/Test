import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_MODE: z.enum(["demo", "live"]).default("demo"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: optionalString,
  REDIS_URL: optionalString,
  CHANGENOW_API_KEY: optionalString,
  CHANGENOW_REFERRAL_URL: optionalString,
  SWAPZONE_API_KEY: optionalString,
  SWAPZONE_REF_ID: optionalString,
  CHANGELLY_PRIVATE_KEY: optionalString,
  CHANGELLY_REFERRAL_URL: optionalString,
  EMBEDDED_EXCHANGE_ENABLED: bool,
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(8000),
  QUOTE_TTL_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Server-only configuration. Never import from client components. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = null;
}

export const isDemo = () => env().APP_MODE === "demo";
