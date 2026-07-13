const ISO_CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a YYYY-MM-DD string that names a real UTC calendar day. */
export function isIsoCalendarDate(value: string): boolean {
  if (!ISO_CALENDAR_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
