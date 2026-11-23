import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ChangeNowProvider } from "./changenow/adapter";
import { SwapzoneProvider } from "./swapzone/adapter";
import { ChangellyProvider } from "./changelly/adapter";
import { DEMO_PROFILES, DemoProvider } from "./demo/adapter";
import type { ExchangeProvider } from "./types";

export interface ProviderEntry {
  provider: ExchangeProvider;
  enabled: boolean;
  /** Technical fallback order only — never used for ranking offers. */
  priority: number;
}

interface ProviderSettings {
  enabled: boolean;
  priority: number;
}

const g = globalThis as unknown as {
  __swaplyProviders?: ExchangeProvider[];
  __swaplyProviderOverride?: ProviderEntry[] | null;
  __swaplySettings?: { at: number; map: Map<string, ProviderSettings> };
};

export function buildProviders(): ExchangeProvider[] {
  const e = env();
  if (e.APP_MODE === "demo") {
    return DEMO_PROFILES.map((p) => new DemoProvider(p, e.APP_URL, e.EMBEDDED_EXCHANGE_ENABLED));
  }
  const common = { timeoutMs: e.PROVIDER_TIMEOUT_MS, quoteTtlSeconds: e.QUOTE_TTL_SECONDS };
  return [
    new ChangeNowProvider({ ...common, apiKey: e.CHANGENOW_API_KEY, referralUrl: e.CHANGENOW_REFERRAL_URL, embeddedEnabled: e.EMBEDDED_EXCHANGE_ENABLED }),
    new SwapzoneProvider({ ...common, apiKey: e.SWAPZONE_API_KEY, refId: e.SWAPZONE_REF_ID, embeddedEnabled: e.EMBEDDED_EXCHANGE_ENABLED }),
    new ChangellyProvider({ ...common, privateKeyHex: e.CHANGELLY_PRIVATE_KEY, referralUrl: e.CHANGELLY_REFERRAL_URL }),
  ];
}

function allProviders(): ExchangeProvider[] {
  g.__swaplyProviders ??= buildProviders();
  return g.__swaplyProviders;
}

async function loadSettings(): Promise<Map<string, ProviderSettings>> {
  const now = Date.now();
  if (g.__swaplySettings && now - g.__swaplySettings.at < 30_000) return g.__swaplySettings.map;
  const map = new Map<string, ProviderSettings>();
  try {
    const { prisma } = await import("@/lib/db");
    const rows = await prisma.provider.findMany({ select: { id: true, enabled: true, priority: true } });
    for (const r of rows) map.set(r.id, { enabled: r.enabled, priority: r.priority });
  } catch (err) {
    logger.warn("registry.settings_unavailable", { err: String(err) });
  }
  g.__swaplySettings = { at: now, map };
  return map;
}

export function invalidateProviderSettings() {
  g.__swaplySettings = undefined;
}

/** All providers for the current mode with admin settings applied. */
export async function getProviderEntries(): Promise<ProviderEntry[]> {
  if (g.__swaplyProviderOverride) return g.__swaplyProviderOverride;
  const settings = await loadSettings();
  return allProviders()
    .map((provider, i) => {
      const s = settings.get(provider.id);
      // No DB row yet (fresh install without seed): enabled by default; unconfigured adapters are skipped anyway.
      return { provider, enabled: s ? s.enabled : true, priority: s ? s.priority : (i + 1) * 10 };
    })
    .sort((a, b) => a.priority - b.priority);
}

export async function getProvider(id: string): Promise<ProviderEntry | null> {
  return (await getProviderEntries()).find((e) => e.provider.id === id) ?? null;
}

/** Test hook. */
export function setProviderEntriesForTests(entries: ProviderEntry[] | null) {
  g.__swaplyProviderOverride = entries;
}
