import {
  addDays,
  compareDates,
  dateOf,
  dateRange,
  daysBetween,
  mondayOf,
  weekdayOf,
  windowEndingAt,
} from './dates';

/**
 * The arithmetic every classifier stands on, so the cases that matter are the ones
 * that silently shift a row onto the wrong day: month and year ends, leap days, and
 * the DST changeovers that a naive local-time implementation gets wrong.
 */

describe('dateOf', () => {
  it('takes the calendar day out of an ISO-8601 timestamp', () => {
    expect(dateOf('2026-03-09T21:30:00.000Z')).toBe('2026-03-09');
  });

  it('leaves a bare date untouched', () => {
    expect(dateOf('2026-03-09')).toBe('2026-03-09');
  });
});

describe('addDays', () => {
  it('crosses a month end', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year end in both directions', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('skips 2 29 in a non-leap year', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('is unaffected by a DST spring-forward', () => {
    // 2026-03-08 is the US spring-forward. A local-time implementation would land on
    // the same day twice or skip one; dates are pure calendar arithmetic (§3.3).
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });

  it('is unaffected by a DST fall-back', () => {
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('returns the same date for 0', () => {
    expect(addDays('2026-03-09', 0)).toBe('2026-03-09');
  });
});

describe('compareDates', () => {
  it('orders earlier before later and reports equality as 0', () => {
    expect(compareDates('2026-03-08', '2026-03-09')).toBeLessThan(0);
    expect(compareDates('2026-03-09', '2026-03-08')).toBeGreaterThan(0);
    expect(compareDates('2026-03-09', '2026-03-09')).toBe(0);
  });

  it('compares across a year boundary', () => {
    expect(compareDates('2025-12-31', '2026-01-01')).toBeLessThan(0);
  });
});

describe('daysBetween', () => {
  it('counts forward, backward, and zero', () => {
    expect(daysBetween('2026-03-01', '2026-03-08')).toBe(7);
    expect(daysBetween('2026-03-08', '2026-03-01')).toBe(-7);
    expect(daysBetween('2026-03-08', '2026-03-08')).toBe(0);
  });

  it('counts a leap year correctly', () => {
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });

  it('counts whole days across a DST changeover', () => {
    // The 23-hour local day must still be one day — otherwise week bucketing drifts.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });
});

describe('dateRange', () => {
  it('is inclusive at both ends and ascending', () => {
    expect(dateRange('2026-03-07', '2026-03-10')).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
  });

  it('is a single date when the ends are equal', () => {
    expect(dateRange('2026-03-09', '2026-03-09')).toEqual(['2026-03-09']);
  });

  it('is empty when `to` precedes `from`', () => {
    expect(dateRange('2026-03-10', '2026-03-09')).toEqual([]);
  });
});

describe('windowEndingAt', () => {
  it('returns exactly `window` days ending at the anchor, inclusive', () => {
    const days = windowEndingAt('2026-03-10', 5);
    expect(days).toHaveLength(5);
    expect(days[0]).toBe('2026-03-06');
    expect(days[days.length - 1]).toBe('2026-03-10');
  });

  it('is just the anchor for a window of 1', () => {
    expect(windowEndingAt('2026-03-10', 1)).toEqual(['2026-03-10']);
  });
});

describe('weekdayOf', () => {
  it('numbers Sunday 0 through Saturday 6', () => {
    expect(weekdayOf('2026-03-08')).toBe(0); // Sunday
    expect(weekdayOf('2026-03-09')).toBe(1); // Monday
    expect(weekdayOf('2026-03-14')).toBe(6); // Saturday
  });
});

describe('mondayOf', () => {
  it('is the date itself on a Monday', () => {
    expect(mondayOf('2026-03-09')).toBe('2026-03-09');
  });

  it('reaches back to the preceding Monday mid-week', () => {
    expect(mondayOf('2026-03-12')).toBe('2026-03-09');
  });

  it('treats Sunday as the END of its week, not the start', () => {
    // ISO weeks run Monday–Sunday, so 2026-03-08 (a Sunday) belongs to the week that
    // began 2026-03-02. Getting this wrong shifts every weekly total by a day.
    expect(mondayOf('2026-03-08')).toBe('2026-03-02');
  });

  it('crosses a month boundary', () => {
    expect(mondayOf('2026-03-01')).toBe('2026-02-23');
  });
});
