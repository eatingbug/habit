import { localToday, newId, timestampAtLocalTime } from './device';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('localToday', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  /** Freeze the clock at local wall-clock time on `y-m-d`. */
  function freezeAtLocal(y: number, m: number, d: number, hour: number, minute = 0) {
    jest.useFakeTimers({ now: new Date(y, m - 1, d, hour, minute) });
  }

  it('zero-pads a single-digit month and day', () => {
    freezeAtLocal(2026, 3, 9, 12);
    expect(localToday()).toBe('2026-03-09');
  });

  it('reports the LOCAL day, not the UTC one, just after local midnight', () => {
    // The bug this function exists to prevent: `toISOString()` would label the wrong
    // day `pending` for anyone east or west of UTC (§3.3 — a date string is the user's
    // declared local day). Just after local midnight the two calendars disagree
    // wherever the offset is non-zero.
    freezeAtLocal(2026, 3, 10, 0, 30);
    expect(localToday()).toBe('2026-03-10');

    if (new Date(2026, 2, 10, 0, 30).getTimezoneOffset() !== 0) {
      expect(localToday()).not.toBe(new Date().toISOString().slice(0, 10));
    }
  });

  it('reports the LOCAL day just before local midnight', () => {
    freezeAtLocal(2026, 3, 9, 23, 30);
    expect(localToday()).toBe('2026-03-09');
  });

  it('rolls over a year end by the local calendar', () => {
    freezeAtLocal(2027, 1, 1, 0, 15);
    expect(localToday()).toBe('2027-01-01');
  });

  it('reports a leap day', () => {
    freezeAtLocal(2028, 2, 29, 9);
    expect(localToday()).toBe('2028-02-29');
  });
});

describe('newId', () => {
  const nativeCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: nativeCrypto,
      configurable: true,
      writable: true,
    });
  });

  it('returns a v4 UUID when the platform provides one', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('returns a v4 UUID from the fallback when randomUUID is absent', () => {
    // The path taken on Hermes builds without `crypto.randomUUID` — the doc comment
    // calls it real, so it is exercised rather than assumed.
    Object.defineProperty(globalThis, 'crypto', {
      value: {},
      configurable: true,
      writable: true,
    });
    expect(newId()).toMatch(UUID_V4);
  });

  it('returns a v4 UUID from the fallback when crypto itself is absent', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(newId()).toMatch(UUID_V4);
  });

  it('does not collide across many fallback ids', () => {
    // Entry rows are appended, never merged, and are addressed by `id` alone
    // (§3.3) — a duplicate would make one row unaddressable by edit or delete.
    Object.defineProperty(globalThis, 'crypto', {
      value: {},
      configurable: true,
      writable: true,
    });
    const ids = new Set(Array.from({ length: 2000 }, () => newId()));
    expect(ids.size).toBe(2000);
  });
});

describe('timestampAtLocalTime', () => {
  const DATE = '2026-03-01';

  it('stamps the local wall clock the user typed, not the same digits in UTC', () => {
    const at = timestampAtLocalTime(DATE, '14', '05');

    expect(at).toBe(new Date(2026, 2, 1, 14, 5).toISOString());
    // The bug this guards: read back with `getHours()`, the row must show 14:05.
    expect(new Date(at as string).getHours()).toBe(14);
    expect(new Date(at as string).getMinutes()).toBe(5);
  });

  it('refuses an empty field rather than stamping local midnight', () => {
    // `Number('')` is 0 and `Number.isInteger(0)` is true, so the emptiness check is
    // load-bearing: without it, revealing the picker and logging would backdate the
    // row to 00:00 and sort it to the top of the feed.
    expect(timestampAtLocalTime(DATE, '', '')).toBeUndefined();
    expect(timestampAtLocalTime(DATE, '14', '')).toBeUndefined();
    expect(timestampAtLocalTime(DATE, '', '05')).toBeUndefined();
  });

  it('refuses an out-of-range or non-numeric time', () => {
    expect(timestampAtLocalTime(DATE, '24', '00')).toBeUndefined();
    expect(timestampAtLocalTime(DATE, '-1', '00')).toBeUndefined();
    expect(timestampAtLocalTime(DATE, '12', '60')).toBeUndefined();
    expect(timestampAtLocalTime(DATE, '12', '-5')).toBeUndefined();
    expect(timestampAtLocalTime(DATE, '아침', '00')).toBeUndefined();
    expect(timestampAtLocalTime(DATE, '12.5', '00')).toBeUndefined();
  });

  it('accepts the edges of the day', () => {
    expect(timestampAtLocalTime(DATE, '0', '0')).toBe(new Date(2026, 2, 1, 0, 0).toISOString());
    expect(timestampAtLocalTime(DATE, '23', '59')).toBe(
      new Date(2026, 2, 1, 23, 59).toISOString(),
    );
  });
});
