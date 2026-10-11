import type { Habit, LogType, SkipReason } from '@/models';

import {
  BEST_RECORD_GLYPH,
  CELEBRATION_COPY,
  CONFIG_MISSING_NOTE,
  DAY_STATE_GLYPHS,
  DAY_STATE_WORDS,
  LOG_TYPE_LABELS,
  SCREEN_WORDS,
  SKIP_REASON_LABELS,
  STATUS_LIGHT_GLYPHS,
  STATUS_LIGHT_WORDS,
  TOOLTIPS,
  celebrationLine,
  deleteConfirmLines,
  milestoneBonusLine,
  rowRewardLine,
  saveBannerLines,
  signInCopy,
  skipToastLines,
  starLine,
  undoToastLines,
  type UndoToastFacts,
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
 * `undoToastLines` and `skipToastLines` — the undo toast's second and third lines
 * (SPEC §6.2 Undo toast copy, #127).
 *
 * Pure functions over facts the domain and the hook have already decided, so they
 * assert here with no repository and no render. The facts are plain primitives:
 * `src/config` sits below `src/domain` (SPEC §2.2). Every branch is covered, because the
 * third line is a priority order and an untested branch could be unreachable.
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

const NOTHING_MOVED: UndoToastFacts = {
  habit: COUNT_HABIT,
  actual: 5,
  xpGained: 0,
  remainingToFloor: 0,
  statLevelUp: false,
  statName: '지능',
  statLevel: 3,
  pushedToOver: false,
  floorCrossed: false,
  celebrated: false,
  alreadyCelebrated: false,
  isBackfill: false,
};

function lines(over: Partial<UndoToastFacts>) {
  return undoToastLines({ ...NOTHING_MOVED, ...over });
}

describe('undoToastLines — the second line: amount and 별', () => {
  it('appends the 별 the log earned', () => {
    expect(lines({ xpGained: 60, floorCrossed: true }).detail).toBe('+5쪽 · 별 +60');
  });

  it('drops the 별 part when the log earned none', () => {
    expect(lines({ actual: 3, remainingToFloor: 2 }).detail).toBe('+3쪽');
  });

  it('keeps a binary habit off the unit path, which would read `+1time`', () => {
    expect(lines({ habit: BINARY_HABIT, actual: 1, xpGained: 60, floorCrossed: true }).detail).toBe(
      '✓ 했어요 · 별 +60',
    );
  });
});

describe('undoToastLines — the third line', () => {
  it('has none when a banner or popup celebrates the log — the toast holds no streak', () => {
    expect(lines({ xpGained: 60, floorCrossed: true, celebrated: true }).sub).toBeUndefined();
  });

  it('says how much is left to the floor on a partial log', () => {
    expect(lines({ actual: 3, remainingToFloor: 2 }).sub).toBe(
      '조금이라도 했어요 · 최소량까지 2쪽 남았어요',
    );
  });

  it('says 더 했어요 on another log of a day already celebrated', () => {
    expect(lines({ actual: 2, xpGained: 12 }).sub).toBe('더 했어요');
    expect(lines({ floorCrossed: true, alreadyCelebrated: true }).sub).toBe('더 했어요');
  });

  it('says the target was passed', () => {
    expect(lines({ xpGained: 84, pushedToOver: true }).sub).toBe('목표까지 넘겼어요');
  });

  it('says the day is filled when the floor is crossed with no celebration', () => {
    expect(lines({ xpGained: 60, floorCrossed: true }).sub).toBe('오늘 몫을 채웠어요');
    expect(lines({ xpGained: 60, floorCrossed: true, isBackfill: true }).sub).toBe('그날 몫을 채웠어요');
  });

  it('names the stat and its new level on a level-up, beside a banner too', () => {
    expect(lines({ xpGained: 60, floorCrossed: true, statLevelUp: true, celebrated: true }).sub).toBe(
      '지능 레벨 3',
    );
  });

  it('falls through when the stat id names no configured stat', () => {
    expect(lines({ xpGained: 60, floorCrossed: true, statLevelUp: true, statName: undefined }).sub).toBe(
      '오늘 몫을 채웠어요',
    );
  });
});

describe('skipToastLines — a skip puts its reason second (§6.2)', () => {
  it('says the streak stays on an exception', () => {
    expect(skipToastLines({ reason: 'exception' })).toEqual({
      detail: '예외',
      sub: '예외라서 연속은 그대로예요',
    });
  });

  it('says 쉬었어요 on any other reason, with the note after 이유: when there is one', () => {
    expect(skipToastLines({ reason: 'cue' })).toEqual({ detail: '깜빡함', sub: '쉬었어요' });
    expect(skipToastLines({ reason: 'floor', note: '피곤해요' })).toEqual({
      detail: '너무 힘듦',
      sub: '쉬었어요 · 이유: 피곤해요',
    });
  });

  it('never says the streak broke', () => {
    for (const reason of ['cue', 'floor', 'identity'] as const) {
      expect(skipToastLines({ reason }).sub).not.toMatch(/끊|실패/);
    }
  });
});

describe('celebration copy (§6.2 Streak celebration)', () => {
  it('says the habit filled today’s share', () => {
    expect(celebrationLine({ icon: '📖', name: '독서', streak: 3 })).toBe('📖 독서 오늘 몫을 채웠어요');
  });

  it('says which day a backfill filled and the streak it made', () => {
    expect(celebrationLine({ icon: '📖', name: '독서', streak: 13, filledDay: '어제' })).toBe(
      '📖 독서 어제를 채워서 13일 연속이 됐어요',
    );
    expect(celebrationLine({ icon: '📖', name: '독서', streak: 4, filledDay: '2월 27일' })).toBe(
      '📖 독서 2월 27일을 채워서 4일 연속이 됐어요',
    );
  });

  it('writes the ★ line and the bonus line with their 별', () => {
    expect(starLine(12)).toBe('★ 목표까지 넘겼어요 · 별 +12');
    expect(milestoneBonusLine(90)).toBe('기념일 보너스 · 별 +90');
    expect(CELEBRATION_COPY.streakSuffix).toBe('일 연속!');
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

/**
 * 공통 상태 단어 (SPEC §6.0 Day-state marks, Visual rules, Screen words, #127). 대시보드,
 * 습관 상세, 글 모음 티켓이 이 낱말을 그대로 다시 쓴다. 그래서 낱말 하나하나를 고정한다.
 */
describe('DAY_STATE_WORDS — 하루 상태 여섯의 화면 낱말 (§6.0)', () => {
  it('SPEC 표의 낱말 그대로다', () => {
    expect(DAY_STATE_WORDS).toEqual({
      done: '했어요',
      over: '목표까지 했어요',
      partial: '조금 했어요',
      skip: '못 했어요',
      missed: '기록 없음',
      pending: '아직이에요',
    });
  });

  it('표시 글자는 ✓ ★ ½ − ! 이고, pending 은 점선 테두리뿐이라 글자가 없다', () => {
    expect(DAY_STATE_GLYPHS).toEqual({
      done: '✓',
      over: '★',
      partial: '½',
      skip: '−',
      missed: '!',
      pending: '',
    });
  });

  it('어느 상태 이름에도 실패라는 말이 없다', () => {
    for (const word of Object.values(DAY_STATE_WORDS)) expect(word).not.toContain('실패');
  });
});

describe('STATUS_LIGHT_WORDS — 상태등은 색, 모양, 글자가 함께 간다 (§6.0)', () => {
  it('세 단계의 낱말과 모양', () => {
    expect(STATUS_LIGHT_WORDS).toEqual({
      stable: '괜찮아요',
      caution: '살펴보세요',
      intervention: '손봐야 해요',
    });
    expect(STATUS_LIGHT_GLYPHS).toEqual({ stable: '●', caution: '◆', intervention: '▲' });
  });

  it('최고 기록은 ★을 더한다', () => {
    expect(BEST_RECORD_GLYPH).toBe('★');
  });
});

describe('SCREEN_WORDS — 화면이 부르는 이름 (§6.0 Screen words)', () => {
  it('XP는 별, 스탯은 능력치, cue는 언제·어디서, identity는 이유다', () => {
    expect(SCREEN_WORDS).toEqual({
      star: '별',
      stat: '능력치',
      cue: '언제·어디서',
      identity: '이유',
      engagementStreak: '조금이라도 한 날',
      streak: '연속',
      floor: '최소량',
      dayShare: '오늘 몫',
    });
  });

  it('XP와 스탯이라는 말은 화면 낱말에 없다', () => {
    for (const word of Object.values(SCREEN_WORDS)) {
      expect(word).not.toMatch(/XP|스탯/);
    }
  });
});

describe('TOOLTIPS — `?` 툴팁 문구 (§6.8 표)', () => {
  it('오늘 화면의 두 툴팁은 표의 문장 그대로다', () => {
    expect(TOOLTIPS.yesterdayBanner).toBe(
      '기록 없이 지나간 날은 연속이 끊긴 것으로 세요. 했는지 못 했는지 채우면 그 기록으로 다시 계산해요.',
    );
    expect(TOOLTIPS.freeLog).toBe(
      '떠오른 생각이나 방금 한 일을 적어요. 별이나 연속에는 영향이 없어요.',
    );
  });

  it('다른 화면이 쓸 툴팁도 표 그대로 둔다', () => {
    expect(TOOLTIPS).toEqual({
      streak:
        '최소량을 채운 날이 이어진 날수예요. 기록 없이 지나간 날이나 이유를 골라 못 했다고 찍은 날이 있으면 0부터 다시 세요.',
      engagementStreak:
        '최소량에 못 미쳐도 조금이라도 한 날까지 세요. 기록 없는 날이나 이유를 골라 못 했다고 찍은 날이 있으면 0부터 다시 세요.',
      successRate:
        '최근 28일 중 최소량을 채운 날의 비율이에요. 예외로 찍은 날은 빼고, 5일이 쌓이기 전에는 —로 보여요.',
      bestStreak: '지금까지 가장 길게 이어진 연속이에요. 연속이 끊겨도 줄지 않아요.',
      starsAndLevel: '최소량을 채우면 별을 받아요. 별이 모이면 레벨이 올라요.',
      characterLevel:
        '능력치 가운데 가장 높은 레벨이에요. 습관을 하면 그 습관의 능력치에 별이 쌓여요.',
      statusLight:
        '최근 기록을 보고 습관이 잘 굴러가는지 알려 줘요. 손봐야 해요가 뜨면 회고하기로 원인을 찾아요.',
      sevenDayDots:
        '점을 누르면 그날 기록을 채울 수 있어요. 테두리만 있는 점은 기록 없는 날이고, 실패로 세요.',
      recentThreeWeeks:
        '최근 3주를 하루 한 칸으로 보여 줘요. 칸을 누르면 그날 기록을 채울 수 있어요.',
      forming: '날짜가 아니라 실제로 한 날로 세요. 보통 두 달쯤 걸리니 더뎌도 괜찮아요.',
      weeklyTotal:
        '막대 하나가 한 주 동안 한 양을 모두 더한 값이에요. 가로선은 하루 최소량과 목표를 7일로 곱한 기준이에요.',
      floor: '아무리 바빠도 할 수 있는 양이에요. 이만큼 하면 그날 몫을 한 거예요.',
      target: '최소량보다 큰 선택 목표예요. 넘기면 별을 더 받지만 안 해도 괜찮아요.',
      kind: '횟수 · 양은 한 만큼 적고, 최소량을 채우면 그날 몫을 해요. 예 · 아니오는 했는지만 보고, 이어 간 날이 쌓이면 별을 더 받아요.',
      cue: '습관을 시작할 때와 곳이에요. 비워 둬도 되고, 잘 안 될 때 먼저 정해 보자고 물어볼게요.',
      stat: '이 습관으로 받은 별이 쌓이는 갈래예요. 가장 높은 능력치 레벨이 캐릭터 레벨이 돼요.',
      identity:
        '어떤 사람이 되고 싶어서 하는지 적어요. 내키지 않는 날 다시 꺼내 보면 이어 가기 쉬워요.',
      yesterdayBanner:
        '기록 없이 지나간 날은 연속이 끊긴 것으로 세요. 했는지 못 했는지 채우면 그 기록으로 다시 계산해요.',
      freeLog: '떠오른 생각이나 방금 한 일을 적어요. 별이나 연속에는 영향이 없어요.',
      reflectionBackfill:
        '기록 없이 지나간 날은 했는지 못 했는지 알 수 없어요. 그래서 원인을 짚기 전에 먼저 물어봐요.',
      reflectionSevenDays:
        '! 칸은 기록 없이 지나간 날이고, − 칸은 이유를 골라 못 했다고 찍은 날이에요. 둘 다 실패로 세지만 이유는 − 칸만 알 수 있어요.',
      reflectionHowItReads:
        '직접 남긴 기록만 보고 원인을 짚어요. 기록 없이 지나간 날은 이유를 몰라서 빼요.',
    });
  });

  it('툴팁은 두 문장 이하다 (§6.8)', () => {
    for (const tip of Object.values(TOOLTIPS)) {
      // 마침표로만 끊는다. "! 칸은" 의 `!` 는 하루 상태 표시이지 문장 끝이 아니다.
      const sentences = tip.split(/(?<=\.)\s+/).filter((part) => part.length > 0);
      expect(sentences.length).toBeLessThanOrEqual(2);
    }
  });
});
