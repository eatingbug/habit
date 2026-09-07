/**
 * The two readings of the device that the pure layers must not make — the local clock
 * and the id source (SPEC §2.2: `src/domain` and `src/data` stay pure and clock-free).
 *
 * Both were born inline in a screen and are now shared, so they live here rather than
 * being copied: a second `localToday` would be a second timezone bug waiting to
 * happen, and a second UUID fallback a second chance to emit a colliding id.
 */

/**
 * 'YYYY-MM-DD' for the device's *local* day. A date string is the user's declared
 * local day (§3.3), so `toISOString()` is wrong here: east or west of UTC it would
 * label the wrong day `pending`.
 */
export function localToday(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The B3 time override (§6.2): a `date` plus the hour and minute the user typed → an
 * ISO `timestamp`. Built from the **local** wall clock, for the same reason
 * `localToday` avoids `toISOString()` — the feed reads the row back with
 * `getHours()`, so a naive `${date}T${hh}:${mm}:00Z` would display a time the user
 * never entered wherever the offset is non-zero.
 *
 * `undefined` for anything that is not a real time of day, so the caller can refuse
 * to log rather than silently substituting "now" for an explicit override. `date` is
 * untouched: `timestamp` orders within a day and never moves a row between days
 * (§3.3).
 */
export function timestampAtLocalTime(
  date: string,
  hour: string,
  minute: string,
): string | undefined {
  const h = Number(hour);
  const m = Number(minute);
  // `Number('')` is 0, which `Number.isInteger` accepts — an empty field would
  // otherwise stamp local midnight.
  if (hour.trim().length === 0 || minute.trim().length === 0) return undefined;
  if (!Number.isInteger(h) || !Number.isInteger(m)) return undefined;
  if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;

  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, h, m).toISOString();
}

/**
 * `crypto.randomUUID` exists on web and on modern Hermes builds but not everywhere, so
 * the fallback is a real path, not a theoretical one.
 */
export function newId(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
