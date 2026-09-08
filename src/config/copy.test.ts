import type { SkipReason } from '@/models';

import { deleteConfirmLines, SKIP_REASON_LABELS } from './copy';

/**
 * `SKIP_REASON_LABELS` is a pure module value, so it is assertable in the same seam
 * as the domain's pure functions — no render and no repository.
 *
 * The chip row iterates this record's **key order**, so the order of the keys is
 * load-bearing: it is the order the four chips appear on screen. Nothing else pins
 * it — a `Record` type checks that every reason has a label, never the sequence — so
 * reordering the literal would move the chips with no type error anywhere. These
 * assertions are what hold the order to the canvas.
 */

/** The canvas's chip order — `design/parts/RowSkip.body.html:21–24`. */
const CANVAS_ORDER = ['깜빡함', '너무 힘듦', '예외', '안 내킴'];

describe('SKIP_REASON_LABELS', () => {
  it('yields its labels in the canvas chip order', () => {
    expect(Object.values(SKIP_REASON_LABELS)).toEqual(CANVAS_ORDER);
  });

  it('maps every SkipReason, so no reason can reach the row unlabelled', () => {
    // Listed literally rather than derived from the record under test: deriving the
    // expectation from the subject would make this assertion vacuous.
    const every: SkipReason[] = ['cue', 'floor', 'exception', 'identity'];

    expect(Object.keys(SKIP_REASON_LABELS)).toEqual(every);
    for (const reason of every) {
      expect(SKIP_REASON_LABELS[reason].length).toBeGreaterThan(0);
    }
  });
});

/**
 * The delete confirm (#13 AC 5–6). Three conditionals decide what the user is told
 * they are about to lose, so they are asserted here rather than left in `app/`, which
 * `jest.config.js` cannot reach at all.
 *
 * The assertions name the *claims*, not the exact sentences: what must hold is that a
 * clause appears only when its condition does, and that two forbidden claims — a
 * `missed`/실패 reversal of the day and a streak figure — never appear (ADR-0001: today
 * is still open, so neither is true on this screen).
 */
describe('deleteConfirmLines', () => {
  const facts = { habitName: '팔굽혀펴기', emptiesDay: false, carriesMiss: false };

  it('says nothing at all when nothing is lost and no state is known', () => {
    expect(deleteConfirmLines(facts)).toEqual([]);
  });

  it('names the habit whose day is being emptied (AC 5)', () => {
    const lines = deleteConfirmLines({ ...facts, emptiesDay: true });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('팔굽혀펴기');
  });

  it('warns about the erased miss only when the miss is erased (AC 6)', () => {
    expect(deleteConfirmLines({ ...facts, carriesMiss: true })).toEqual([
      "실패로 세고 있던 '못 함' 기록이 사라져요.",
    ]);
    expect(deleteConfirmLines(facts)).toEqual([]);
  });

  it('puts the loss before the day\u2019s new reading, as Backfill\u2019s notice does', () => {
    const lines = deleteConfirmLines({
      ...facts,
      emptiesDay: true,
      carriesMiss: true,
      stateAfterLabel: '아직 기록 없음',
    });

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('남는 기록이 없어요');
    expect(lines[1]).toContain("'못 함'");
    expect(lines[2]).toBe('지운 뒤 오늘: 아직 기록 없음');
  });

  it('omits the state line entirely with no label (a paused day, ADR-0003)', () => {
    const lines = deleteConfirmLines({ ...facts, emptiesDay: true });

    // The engine has no opinion about an empty paused day, so the copy must not
    // invent one — not even a fallback label.
    expect(lines.some((line) => line.includes('지운 뒤 오늘'))).toBe(false);
  });

  it('never claims the day fails or that a streak breaks (ADR-0001)', () => {
    const all = deleteConfirmLines({
      habitName: '독서',
      emptiesDay: true,
      carriesMiss: true,
      stateAfterLabel: '아직 기록 없음',
    }).join(' ');

    // Today is still open: emptying it leaves it `pending`, so there is no reversal to
    // `missed` and no figure to quote. Both belong to a past-dated screen (#15).
    expect(all).not.toMatch(/연속|스트릭|일 째|미스/);
    expect(all).not.toContain('실패로 바뀝니다');
    expect(all).not.toMatch(/\d/);
  });
});
