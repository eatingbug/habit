/**
 * The Today feed's ordering — SPEC §6.2 ("Chronological Today feed (habit entries and
 * free logs interleaved by timestamp)").
 *
 * Habit entries and free logs share no interface and no base type: a `FreeLog` has no
 * `habitId` and never reaches a domain function that scores anything (§3.4). What they
 * do share is the pair of fields the total order reads — `(timestamp ASC, id ASC)`,
 * the §7.3 invariant — so the comparator is stated once here over that structural
 * shape and `classify.sortDayRows` delegates to it. Two copies of a tiebreak is how one
 * of them eventually loses the `id` half and a same-stamp pair starts flickering.
 *
 * The `id` tiebreak is load-bearing: same-day backfills can share a timestamp, and
 * "creation sequence" is unimplementable on non-monotonic UUIDs.
 *
 * Sorting a copy keeps callers permutation-invariant.
 */
export function sortByDomainOrder<T extends { timestamp: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.timestamp === b.timestamp
      ? a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0
      : a.timestamp < b.timestamp
        ? -1
        : 1,
  );
}
