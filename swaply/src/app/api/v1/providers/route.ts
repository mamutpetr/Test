import { json, internalError } from "@/lib/api/respond";
import { env } from "@/lib/env";
import { getProviderEntries } from "@/server/providers/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await getProviderEntries();
    const providers = await Promise.all(
      entries.map(async ({ provider, enabled }) => {
        const c = await provider.getCapabilities();
        return {
          id: provider.id,
          name: provider.name,
          website: provider.websiteUrl,
          isDemo: provider.isDemo,
          enabled,
          configured: c.configured,
          isAggregator: c.isAggregator,
          rateTypes: c.rateTypes,
          executionModes: c.executionModes,
          statusTracking: c.statusTracking,
          fiatPayout: c.fiatPayout,
          referralConfigured: c.referral.configured,
        };
      }),
    );
    return json({ mode: env().APP_MODE, providers });
  } catch (err) {
    return internalError("providers", err);
  }
}
