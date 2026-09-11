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

/**
 * Every value `stateLabel` can return (`app/today.tsx`). Listed here because
 * `jest.config.js` cannot import from `app/`: the confirm's miss clause must not
 * reuse any of them, and `못 함` — `stateLabel('skip')` — is the one it collided with.
 */
const STATE_LABELS = [
  '성공',
  '성공 · 목표 초과',
  '조금 함',
  '못 함',
  '기록 없음 · 실패',
  '아직 기록 없음',
];

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
 * clause appears only when its condition does. Both callers are here: `app/today.tsx`,
 * which passes no `dayLabel` and no streak figures, since today is still open and
 * neither is true of it (ADR-0001); and the journal (§6.3), which passes a past date's
 * own label and, when the run actually changes, both streak numbers.
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
      '실패로 세던 기록이 바로 이 줄이라, 지우면 그 실패는 더 세지 않아요.',
    ]);
    expect(deleteConfirmLines(facts)).toEqual([]);
  });

  it('never names a day state in the miss clause, which can sit beside one', () => {
    // The reachable state that makes this matter: a miss-carrying skip deleted while
    // another skip row survives, so both clauses render and the Banner joins them.
    const lines = deleteConfirmLines({
      ...facts,
      carriesMiss: true,
      stateAfterLabel: '못 함',
    });

    expect(lines).toEqual([
      '실패로 세던 기록이 바로 이 줄이라, 지우면 그 실패는 더 세지 않아요.',
      '지운 뒤 오늘: 못 함',
    ]);
    // The miss clause says what the row was *counted as* and what stops. Reusing the
    // day's label would read as the record both vanishing and remaining, one sentence
    // apart — the term mixing `CONTEXT.md`'s glossary forbids — and would give
    // `stateLabel` a second source.
    for (const label of STATE_LABELS) {
      expect(lines[0]).not.toContain(label);
    }
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
    expect(lines[1]).toContain('더 세지 않아요');
    expect(lines[2]).toBe('지운 뒤 오늘: 아직 기록 없음');
  });

  it('omits the state line entirely with no label (a paused day, ADR-0003)', () => {
    const lines = deleteConfirmLines({ ...facts, emptiesDay: true });

    // The engine has no opinion about an empty paused day, so the copy must not
    // invent one — not even a fallback label.
    expect(lines.some((line) => line.includes('지운 뒤 오늘'))).toBe(false);
  });

  it('never claims the day fails or quotes a streak for today\u2019s caller (ADR-0001)', () => {
    const all = deleteConfirmLines({
      habitName: '독서',
      emptiesDay: true,
      carriesMiss: true,
      stateAfterLabel: '아직 기록 없음',
    }).join(' ');

    // Today is still open: emptying it leaves it `pending`, so there is no reversal to
    // `missed` and no figure to quote. The streak clause belongs to the journal
    // (§6.3), which passes `streakBefore`/`streakAfter`; this call passes neither.
    expect(all).not.toMatch(/연속|스트릭|일 째|미스/);
    expect(all).not.toContain('실패로 바뀝니다');
    expect(all).not.toMatch(/\d/);
  });

  it('names the journal’s own day in both sentences that mention one (§6.3)', () => {
    const lines = deleteConfirmLines({
      ...facts,
      emptiesDay: true,
      dayLabel: '3월 27일',
      stateAfterLabel: '기록 없음 · 실패',
    });

    // The default is `오늘`, which is false of every day but today — so a caller that
    // passes a label must see it in *each* sentence that names the day, not the first.
    expect(lines[0]).toContain('3월 27일');
    expect(lines[1]).toBe('지운 뒤 3월 27일: 기록 없음 · 실패');
    expect(lines.join(' ')).not.toContain('오늘');
  });

  it('quotes both streak figures, and a run cut to zero is still a figure (AC 9)', () => {
    expect(deleteConfirmLines({ ...facts, streakBefore: 20, streakAfter: 4 })).toEqual([
      '연속 날수가 다시 계산돼요 — 20일 → 4일.',
    ]);
    // `0` is the whole reason the guard is `!= null`: a broken run is the case the
    // user most needs the number for.
    expect(deleteConfirmLines({ ...facts, streakBefore: 3, streakAfter: 0 })).toEqual([
      '연속 날수가 다시 계산돼요 — 3일 → 0일.',
    ]);
  });

  it('says nothing about the streak unless the caller passes both figures', () => {
    // Half a comparison is not one: `연속 20일 → ?` would be worse than silence.
    expect(deleteConfirmLines({ ...facts, streakBefore: 20 })).toEqual([]);
    expect(deleteConfirmLines({ ...facts, streakAfter: 4 })).toEqual([]);
  });
});
