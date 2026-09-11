import { sortByDomainOrder } from './feed';

/**
 * The Today feed's comparator (§6.2, §7.3). Asserted here rather than through
 * `sortDayRows` because what this ticket needs from it is that it orders rows of two
 * *different shapes* — a habit entry and a free log — by the same key pair.
 */
describe('sortByDomainOrder', () => {
  it('orders by timestamp ascending, whatever the input order', () => {
    const rows = [
      { id: 'c', timestamp: '2026-03-01T10:00:00.000Z' },
      { id: 'a', timestamp: '2026-03-01T08:00:00.000Z' },
      { id: 'b', timestamp: '2026-03-01T09:00:00.000Z' },
    ];

    expect(sortByDomainOrder(rows).map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a tie on equal timestamps by id, not by input order', () => {
    const at = '2026-03-01T12:00:00.000Z';
    const forward = [
      { id: 'a', timestamp: at },
      { id: 'b', timestamp: at },
    ];

    expect(sortByDomainOrder(forward).map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortByDomainOrder([...forward].reverse()).map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('interleaves two differently-shaped rows by the key pair, not by type (§6.2)', () => {
    // A habit entry and a free log share no interface — only `(timestamp, id)`.
    const entry = { id: 'e1', timestamp: '2026-03-01T09:00:00.000Z', habitId: 'h1', actual: 5 };
    const free = { id: 'f1', timestamp: '2026-03-01T08:00:00.000Z', type: 'mood', text: '맑음' };
    const later = { id: 'f2', timestamp: '2026-03-01T10:00:00.000Z', type: 'note', text: '메모' };

    expect(sortByDomainOrder([entry, free, later]).map((row) => row.id)).toEqual([
      'f1',
      'e1',
      'f2',
    ]);
  });

  it('returns a new array, leaving the input untouched', () => {
    const rows = [
      { id: 'b', timestamp: '2026-03-01T10:00:00.000Z' },
      { id: 'a', timestamp: '2026-03-01T08:00:00.000Z' },
    ];
    const sorted = sortByDomainOrder(rows);

    expect(sorted).not.toBe(rows);
    expect(rows.map((row) => row.id)).toEqual(['b', 'a']);
  });
});
