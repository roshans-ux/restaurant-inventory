type Metric = {
  count: number;
  errors: number;
  totalMs: number;
  p95ApproxMs: number[];
};

const store: Record<string, Metric> = {};
const startTs = Date.now();

export function recordApiMetric(route: string, status: number, durationMs: number) {
  const metric = (store[route] ??= { count: 0, errors: 0, totalMs: 0, p95ApproxMs: [] });
  metric.count += 1;
  if (status >= 400) metric.errors += 1;
  metric.totalMs += durationMs;
  metric.p95ApproxMs.push(durationMs);
  if (metric.p95ApproxMs.length > 200) {
    metric.p95ApproxMs.shift();
  }
}

export function getApiMetrics() {
  return Object.entries(store).map(([route, m]) => {
    const sorted = [...m.p95ApproxMs].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    return {
      route,
      calls: m.count,
      errors: m.errors,
      errorRate: m.count ? Number((m.errors / m.count).toFixed(4)) : 0,
      avgMs: m.count ? Number((m.totalMs / m.count).toFixed(2)) : 0,
      p95Ms: p95,
    };
  });
}

export function getUptimeMs() {
  return Date.now() - startTs;
}

