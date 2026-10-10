export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

const ISO_CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The UTC calendar day of an instant as `YYYY-MM-DD`; throws on an invalid date. */
export function isoDay(at: Date | number): string {
  return (typeof at === 'number' ? new Date(at) : at).toISOString().slice(0, 10);
}

/** Epoch ms of a `YYYY-MM-DD` day's UTC midnight, or NaN when the day does not parse. */
export function isoDayStartMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Whole UTC days from the epoch to a `YYYY-MM-DD` day, or NaN when the day does not parse. */
export function isoDayNumber(day: string): number {
  return Math.floor(isoDayStartMs(day) / DAY_MS);
}

/** The `YYYY-MM-DD` day a whole UTC day number from {@link isoDayNumber} names. */
export function isoDayFromNumber(dayNumber: number): string {
  return isoDay(dayNumber * DAY_MS);
}

/** Saturday or Sunday in UTC; false when the day does not parse. */
export function isUtcWeekend(day: string): boolean {
  const weekday = new Date(isoDayStartMs(day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** The instant exactly `days` 24-hour days before `now`. */
export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export function isIsoCalendarDate(value: string): boolean {
  if (!ISO_CALENDAR_DATE.test(value)) return false;
  const start = isoDayStartMs(value);
  return !Number.isNaN(start) && isoDay(start) === value;
}
