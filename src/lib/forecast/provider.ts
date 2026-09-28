export type SkuDailyHistory = {
  date: string;
  demandMl: number;
};

export type DailyForecast = {
  date: string;
  demandMl: number;
};

export type ForecastProviderInput = {
  history: SkuDailyHistory[];
  dryDays: ReadonlySet<string>;
  startDate: string;
  days: number;
};

export interface ForecastProvider {
  predict(input: ForecastProviderInput): DailyForecast[];
}

export const FORECAST_HORIZON_DAYS = 21;
export const WEEKDAY_LOOKBACK_WEEKS = 8;
export const MIN_SALES_HISTORY_DAYS = 14;
