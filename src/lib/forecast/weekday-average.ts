import { addIsoDays, weekdayFromIso } from "@/lib/forecast/dates";
import {
  FORECAST_HORIZON_DAYS,
  WEEKDAY_LOOKBACK_WEEKS,
  type DailyForecast,
  type ForecastProvider,
  type ForecastProviderInput,
} from "@/lib/forecast/provider";

/**
 * Average ml sold on each weekday over the last 8 weeks, with recent weeks
 * weighted higher. Venue-wide dry days are excluded (not treated as zero).
 */
export class WeekdayAverageProvider implements ForecastProvider {
  predict(input: ForecastProviderInput): DailyForecast[] {
    const days = input.days > 0 ? input.days : FORECAST_HORIZON_DAYS;
    const byDate = new Map(input.history.map((row) => [row.date, row.demandMl]));
    const weekdayAvg = weekdayWeightedAverages(input.startDate, byDate, input.dryDays);

    const out: DailyForecast[] = [];
    for (let i = 0; i < days; i++) {
      const date = addIsoDays(input.startDate, i);
      const weekday = weekdayFromIso(date);
      out.push({ date, demandMl: weekdayAvg[weekday] ?? 0 });
    }
    return out;
  }
}

function weekdayWeightedAverages(
  startDate: string,
  byDate: Map<string, number>,
  dryDays: ReadonlySet<string>,
): number[] {
  const averages = Array.from({ length: 7 }, () => 0);
  const yesterday = addIsoDays(startDate, -1);

  for (let weekday = 0; weekday < 7; weekday++) {
    let weightSum = 0;
    let weightedMl = 0;
    for (let weekAgo = 0; weekAgo < WEEKDAY_LOOKBACK_WEEKS; weekAgo++) {
      const date = mostRecentWeekdayOnOrBefore(yesterday, weekday, weekAgo);
      if (dryDays.has(date)) continue;
      const weight = WEEKDAY_LOOKBACK_WEEKS - weekAgo;
      weightedMl += (byDate.get(date) ?? 0) * weight;
      weightSum += weight;
    }
    averages[weekday] = weightSum > 0 ? weightedMl / weightSum : 0;
  }
  return averages;
}

function mostRecentWeekdayOnOrBefore(endDate: string, weekday: number, weeksAgo: number): string {
  let cursor = endDate;
  while (weekdayFromIso(cursor) !== weekday) {
    cursor = addIsoDays(cursor, -1);
  }
  return addIsoDays(cursor, -7 * weeksAgo);
}

export const defaultForecastProvider: ForecastProvider = new WeekdayAverageProvider();
