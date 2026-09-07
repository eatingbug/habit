/**
 * 'YYYY-MM-DD' date arithmetic. Pure, UTC-based, no Date-locale surprises: a date
 * string is the user's declared local day (§3.3), so we never convert timezones —
 * we only add and compare days.
 */

const MS_PER_DAY = 86_400_000;

function toUTC(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The 'YYYY-MM-DD' part of an ISO-8601 timestamp or date string. */
export function dateOf(isoOrDate: string): string {
  return isoOrDate.slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUTC(toUTC(date) + days * MS_PER_DAY);
}

/** Negative when `a` is earlier, 0 when equal, positive when later. */
export function compareDates(a: string, b: string): number {
  return toUTC(a) - toUTC(b);
}

/** Whole days from `a` to `b`; negative when `b` precedes `a`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / MS_PER_DAY);
}

/** Inclusive ascending range. Empty when `to` precedes `from`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The `window` days ending at `asOfDate`, inclusive, ascending. */
export function windowEndingAt(asOfDate: string, window: number): string[] {
  return dateRange(addDays(asOfDate, -(window - 1)), asOfDate);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(toUTC(date)).getUTCDay();
}

/** The Monday on or before `date` — the ISO week start, used as `weekOf` (§3.5). */
export function mondayOf(date: string): string {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}
