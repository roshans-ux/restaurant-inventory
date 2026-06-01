export function shiftReportFilename(date = new Date()): string {
  return `shift-report-${date.toISOString().slice(0, 10)}.csv`;
}
