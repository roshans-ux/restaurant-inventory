import { unstable_cache, revalidateTag } from "next/cache";
import { computeForecastsForTenant, type TenantForecastMap } from "@/lib/forecast/compute";

const FORECAST_REVALIDATE_SECONDS = 60 * 60;

function forecastTag(tenantId: string) {
  return `forecast-${tenantId}`;
}

export async function getCachedForecastsForTenant(tenantId: string): Promise<TenantForecastMap> {
  return unstable_cache(
    async () => computeForecastsForTenant(tenantId),
    ["forecast", tenantId, "readiness-v1"],
    { revalidate: FORECAST_REVALIDATE_SECONDS, tags: [forecastTag(tenantId)] },
  )();
}

export function revalidateForecastCache(tenantId: string) {
  revalidateTag(forecastTag(tenantId), { expire: 0 });
}
