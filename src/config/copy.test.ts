import type { Habit, LogType, SkipReason } from '@/models';

import {
  CONFIG_MISSING_NOTE,
  LOG_TYPE_LABELS,
  SKIP_REASON_LABELS,
  deleteConfirmLines,
  rewardToastLines,
  rowRewardLine,
  saveBannerLines,
  signInCopy,
  type RewardToastFacts,
} from './copy';

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

/** The canvas's chip order — `design/parts/Today.logic.js:158`. */
const CANVAS_LOG_TYPES = ['메모', '잘한 일', '기분', '떠오른 생각'];

describe('LOG_TYPE_LABELS', () => {
  it('yields its labels in the canvas chip order', () => {
    expect(Object.values(LOG_TYPE_LABELS)).toEqual(CANVAS_LOG_TYPES);
  });

  it('maps every LogType, so no free log can reach the feed unlabelled', () => {
    // Listed literally rather than derived from the record under test: deriving the
    // expectation from the subject would make this assertion vacuous.
    const types: LogType[] = ['note', 'win', 'mood', 'idea'];
    for (const type of types) expect(LOG_TYPE_LABELS[type]).toEqual(expect.any(String));
    expect(Object.keys(LOG_TYPE_LABELS)).toEqual(types);
  });

  it('shares no label with a skip reason, which sits in the same feed', () => {
    const overlap = Object.values(LOG_TYPE_LABELS).filter((label) =>
      (Object.values(SKIP_REASON_LABELS) as string[]).includes(label),
    );
    expect(overlap).toEqual([]);
  });
});

/**
 * `rewardToastLines` — the log-time toast's copy (#17 AC 6, AC 7).
 *
 * A pure function over a delta the domain has already decided, so it asserts here in
 * the same seam as the domain: no repository, no render. The facts arrive as plain
 * primitives — `src/config` sits below `src/domain` (SPEC §2.2), so neither the
 * function nor this file imports `LogEffect` — and the fixtures below build them
 * directly. Every branch is covered, because the cascade is a priority order and an
 * untested branch is one that could be unreachable without anything saying so.
 */
const COUNT_HABIT: Habit = {
  id: 'h1',
  name: '독서',
  statId: 'intelligence',
  kind: 'count',
  floor: 5,
  floorUnit: '쪽',
  lifecycle: 'forming',
  createdAt: '2026-02-01T09:00:00.000Z',
};

const BINARY_HABIT: Habit = { ...COUNT_HABIT, id: 'h2', kind: 'binary', floor: 1, floorUnit: 'time' };

type Delta = Pick<
  RewardToastFacts,
  'xpGained' | 'floorCrossedToday' | 'pushedToOver' | 'statLevelUp' | 'showedUp' | 'streakMilestoneHit'
>;

const NOTHING_MOVED: Delta = {
  xpGained: 0,
  floorCrossedToday: false,
  pushedToOver: false,
  statLevelUp: false,
  showedUp: false,
};

function lines(effect: Partial<Delta>, over: Partial<RewardToastFacts> = {}) {
  return rewardToastLines({
    habit: COUNT_HABIT,
    actual: 5,
    ...NOTHING_MOVED,
    ...effect,
    isBackfill: false,
    statName: '지능',
    statLevel: 3,
    ...over,
  });
}

describe('rewardToastLines — the mono detail slot', () => {
  it('appends the XP the log earned', () => {
    expect(lines({ xpGained: 60, floorCrossedToday: true }).detail).toBe('+5쪽 · +60 XP');
  });

  it('says nothing about XP when the log earned none — the sub line carries that day', () => {
    expect(lines({ showedUp: true }).detail).toBe('+5쪽');
  });

  it('keeps a binary habit off the unit path, which would read `+1time`', () => {
    expect(lines({ xpGained: 60, floorCrossedToday: true }, { habit: BINARY_HABIT, actual: 1 }).detail).toBe(
      '✓ 완료 · +60 XP',
    );
  });
});

describe('rewardToastLines — the attributed sub line', () => {
  it('names the stat and its new level on a level-up', () => {
    expect(lines({ xpGained: 60, floorCrossedToday: true, statLevelUp: true }).sub).toBe('지능 레벨 3');
  });

  it('falls through to the next branch when the stat id names no configured stat', () => {
    expect(lines({ xpGained: 60, floorCrossedToday: true, statLevelUp: true }, { statName: undefined }).sub).toBe(
      '최소만큼 했어요 💪',
    );
  });

  it('names the run length a milestone was reached at', () => {
    expect(lines({ xpGained: 90, streakMilestoneHit: 5 }).sub).toBe('이어 간 날 5일 보너스');
  });

  it('reports clearing the target', () => {
    expect(lines({ xpGained: 120, floorCrossedToday: true, pushedToOver: true }).sub).toBe(
      '목표까지 넘었어요 🎯',
    );
  });

  it('reports crossing the floor', () => {
    expect(lines({ xpGained: 60, floorCrossedToday: true }).sub).toBe('최소만큼 했어요 💪');
  });

  it('acknowledges a sub-floor log rather than going silent (AC 7)', () => {
    expect(lines({ showedUp: true }).sub).toBe('오늘 나타났어요');
  });

  it('says 그 날, not 오늘, on a backfill — the only sentence here that names a day', () => {
    expect(lines({ showedUp: true }, { isBackfill: true }).sub).toBe('그 날 나타났어요');
  });

  it("tells a binary habit's second log of the day why it earned nothing", () => {
    expect(lines({}, { habit: BINARY_HABIT, actual: 1 }).sub).toBe('XP는 하루 한 번만');
  });

  it('reports intensity above a floor the day had already met', () => {
    expect(lines({ xpGained: 12 }).sub).toBe('최소보다 더 했어요');
  });

  it('does not borrow the binary line for a count habit that earned no XP', () => {
    expect(lines({}).sub).toBe('최소보다 더 했어요');
  });
});

describe('rewardToastLines — one line, so the branches are a priority order', () => {
  it('puts a level-up ahead of the milestone that caused it', () => {
    expect(lines({ xpGained: 90, statLevelUp: true, streakMilestoneHit: 5 }).sub).toBe('지능 레벨 3');
  });

  it('puts a milestone ahead of the floor crossing on the same log', () => {
    expect(lines({ xpGained: 150, floorCrossedToday: true, streakMilestoneHit: 5 }).sub).toBe(
      '이어 간 날 5일 보너스',
    );
  });

  it('puts clearing the target ahead of crossing the floor, which one log can do at once', () => {
    expect(lines({ xpGained: 120, floorCrossedToday: true, pushedToOver: true }).sub).toBe(
      '목표까지 넘었어요 🎯',
    );
  });
});

describe('saveBannerLines — the at-risk banner, split where the canvas splits it (#18)', () => {
  it('names the habit in the bold lead and keeps the invitation in the rest', () => {
    expect(saveBannerLines('명상')).toEqual({
      lead: '어제 명상 기록을 놓쳤어요.',
      rest: '오늘 한 번이면 흐름이 이어져요. 어제도 지금 채워 넣을 수 있어요.',
    });
  });

  /**
   * The reason the canvas's `{이름}을` is not copied literally: the object particle
   * would have to be 를 after a vowel, and neither form is right for both. Making the
   * name a modifier of an invariant noun is grammatical for every habit name.
   */
  it('reads the same for a vowel-final name, which 을 would have broken', () => {
    expect(saveBannerLines('요가').lead).toBe('어제 요가 기록을 놓쳤어요.');
    expect(saveBannerLines('푸시업 30').lead).toBe('어제 푸시업 30 기록을 놓쳤어요.');
  });
});

describe('signInCopy — 로그인 가능한 플랫폼인가 (#51)', () => {
  /**
   * 이 파일에 있는 이유가 곧 이 테스트다: 화면에 두면 `jest.config.js` 의 `src/**` 가
   * 닿지 못해 아무도 확인하지 못한다.
   */
  it('웹에서는 누를 버튼을 준다', () => {
    expect(signInCopy('web').action).toBe('카카오로 로그인');
  });

  /**
   * 버튼이 **없어야** 한다. `signInWithOAuth` 는 브라우저가 아니면 URL 만 돌려주고
   * 이동하지 않으므로, 버튼이 있으면 탭이 조용히 아무 일도 안 한다.
   */
  it('웹이 아니면 버튼 대신 못 한다는 말을 준다', () => {
    for (const platform of ['ios', 'android']) {
      expect(signInCopy(platform).action).toBeNull();
      expect(signInCopy(platform).note).toContain('웹 브라우저');
    }
  });
});

describe('CONFIG_MISSING_NOTE — 흰 화면 대신 무엇을 넣어야 하는지 말한다 (#51)', () => {
  /**
   * 이 문구를 보는 사람은 배포한 사람이다. 변수 이름이 빠지면 화면은 "뭔가 잘못됐다" 로만
   * 남고, 그건 흰 화면보다 아주 조금 나을 뿐이다.
   */
  it('없는 환경변수 두 개의 이름을 그대로 담는다', () => {
    expect(CONFIG_MISSING_NOTE).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(CONFIG_MISSING_NOTE).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });
});

/**
 * 네 갈래는 캔버스의 `logAmount` 그대로다 — `design/parts/Today.logic.js:60` 과
 * `:65–68`. 숫자는 캔버스에서 옮겨 적지 않는다: 여기 넣는 `xp` 는 `attributeDayXP` 가
 * 계산한 값이고, 이 테스트는 그 값이 문장에 그대로 나오는지만 본다.
 */
describe('rowRewardLine — 피드 행에 남는 보상 줄 (#37)', () => {
  const base = { xp: 0, sum: 0, floor: 5, floorMet: false, crossedFloor: false };

  it('최소에 못 미친 행은 XP 대신 "나타남" 을 말한다 (`:60`)', () => {
    expect(rowRewardLine({ ...base, sum: 3 })).toBe(
      '→ 3/5 · 최소엔 못 미쳤지만 “나타남” 하루 추가',
    );
  });

  it('목표를 넘긴 행은 합과 목표와 XP 를 말한다 (`:65`)', () => {
    expect(
      rowRewardLine({ ...base, xp: 78, sum: 8, floorMet: true, crossedTarget: 8 }),
    ).toBe('→ 합 8 · 목표 8 넘음 · +78 XP');
  });

  it('최소를 채운 행은 오늘 몫 완료를 말한다 (`:67`)', () => {
    expect(rowRewardLine({ ...base, xp: 60, sum: 5, floorMet: true, crossedFloor: true })).toBe(
      '→ 5/5 오늘 몫 완료 · +60 XP',
    );
  });

  /** 이 줄이 답해야 하는 질문이 "왜 이 행은 0 이냐" 라서, 0 도 적는다. */
  it('이미 채워진 뒤의 행은 제 몫만 말하고, 0 이면 0 이라고 적는다 (`:68`)', () => {
    expect(rowRewardLine({ ...base, xp: 0, sum: 9, floorMet: true })).toBe('→ 합 9 · +0 XP');
    expect(rowRewardLine({ ...base, xp: 18, sum: 9, floorMet: true })).toBe('→ 합 9 · +18 XP');
  });

  /** 예/아니오 습관은 floor 1 이고 목표가 없다 (§3.2) — 갈래를 따로 두지 않는다. */
  it('예/아니오 습관은 1/1 오늘 몫 완료로 읽힌다', () => {
    expect(
      rowRewardLine({ xp: 60, sum: 1, floor: 1, floorMet: true, crossedFloor: true }),
    ).toBe('→ 1/1 오늘 몫 완료 · +60 XP');
  });
});
