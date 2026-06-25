/**
 * util/date.ts — the single source of "today" + display formatting for the UI layer.
 *
 * `todayLocal()` returns the real device-local calendar date as 'YYYY-MM-DD' (the demo's
 * hardcoded "June 08 / Week 14" must never survive). Domain functions take date strings
 * as input, keeping them pure and the calendar in one place. Timestamps are UTC ISO-8601.
 */

const WEEKDAY_LETTERS = ['일', '월', '화', '수', '목', '금', '토']; // 0 = Sunday

/** Device-local calendar date as 'YYYY-MM-DD'. */
export function todayLocal(): string {
  return toLocalDateString(new Date());
}

/** A Date → local 'YYYY-MM-DD'. */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Current UTC timestamp (when something was logged). */
export function nowTimestamp(): string {
  return new Date().toISOString();
}

/** Now, as { hour: '00'..'23', minute: '00'..'50' } rounded down to the nearest 10 minutes. */
export function nowHourMinute(): { hour: string; minute: string } {
  const d = new Date();
  return {
    hour: String(d.getHours()).padStart(2, '0'),
    minute: String(Math.floor(d.getMinutes() / 10) * 10).padStart(2, '0'),
  };
}

/** '00'..'23'. */
export const HOUR_OPTIONS: string[] = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
/** '00','10',..'50'. */
export const MINUTE_OPTIONS: string[] = Array.from({ length: 6 }, (_, i) => String(i * 10).padStart(2, '0'));

/**
 * Build a UTC ISO timestamp from a local calendar date + local hour/minute the user picked.
 * (The picker is in the user's wall-clock time; we store UTC.)
 */
export function timestampFromLocalTime(dateStr: string, hour: string, minute: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const local = new Date(y, m - 1, d, Number(hour), Number(minute), 0, 0);
  return local.toISOString();
}

/** Local 'HH:MM' for a stored UTC timestamp (feed display). */
export function formatClock(timestamp: string): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The local date portion ('YYYY-MM-DD') of a UTC timestamp. */
export function localDateOf(timestamp: string): string {
  return toLocalDateString(new Date(timestamp));
}

/** 'YYYY-MM-DD' → '6월 7일' (journal date). */
export function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}월 ${d}일`;
}

/** 'YYYY-MM-DD' → '일요일', '월요일', … (header). */
export function formatWeekday(dateStr: string): string {
  const names = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const [y, m, d] = dateStr.split('-').map(Number);
  return names[new Date(y, m - 1, d).getDay()];
}

/** 'YYYY-MM-DD' → single weekday letter for the mirror grid. */
export function weekdayLetter(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_LETTERS[new Date(y, m - 1, d).getDay()];
}
