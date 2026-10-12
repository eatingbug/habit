import type {
  DayState,
  DiagnosisComponent,
  Habit,
  LogType,
  ReflectionAction,
  Severity,
  SkipReason,
} from '@/models';

import { TUNING } from './tuning';

/**
 * User-facing strings that no single layer can own.
 *
 * `deleteConfirmLines` is copy a **component** renders, assembled from conditions a
 * **hook** derives (`useToday.deletePreview`) — and a pure function in `app/` is
 * unreachable by any test, since `jest.config.js` matches `src/**` only. So it sits
 * here, where the three conditionals that *are* the judgment can be asserted.
 *
 * The skip reason labels are needed by a **hook** (`useQuickLog` puts one on the undo
 * toast's detail line) and by a **component** (`SkipReasonChips` renders all four).
 * Neither can own them: a hook importing a component is a layer inversion, and a hook
 * importing the component that renders the chips would be exactly that. `src/config/`
 * already holds user-facing names for this reason — `TUNING.stats` carries the
 * canvas's 힘/지능/의지.
 *
 * Deliberately **not** in `tuning.ts`: that file declares itself to hold only the open
 * *numbers* to be tuned empirically, and these are fixed copy from the design canvas.
 */

/**
 * The four reason chips (SPEC §6.2 B5) — copy from
 * `design/parts/RowSkip.body.html:21–24`, which is the only canvas source carrying
 * all four. `design/parts/Today.logic.js:150–153` holds just three (안 내킴 is
 * missing) and its long forms (`깜빡함 — 할 시간이 안 정해짐`) therefore do not exist
 * for every reason, so the short labels are what both surfaces use.
 *
 * Declaration order **is** the on-screen order (the canvas's chip order, unchanged),
 * and consumers iterate these keys rather than a separate order array: such an array
 * could silently omit a reason — the `Record` would still type-check while the chip
 * vanished from the row. Every key is non-numeric, so JS guarantees `Object.keys`
 * returns them in this order.
 */
export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  cue: '깜빡함',
  floor: '너무 힘듦',
  exception: '예외',
  identity: '안 내킴',
};

/**
 * The four free-log type chips (§3.4, §6.2 "Free log path: type chips") — copy from
 * `design/parts/Today.logic.js:158`, the canvas's only source for them. Keyed in the
 * order §3.4 declares the `LogType` union, which is also the canvas's chip order, and
 * the chip row iterates these keys for the same reason `SKIP_REASON_LABELS`' consumers
 * do: a separate order array could silently omit a type while the `Record` still
 * type-checks.
 *
 * `win` reads `잘한 일` and `idea` reads `떠오른 생각` — the canvas's words, not the
 * 성취/아이디어 of the ticket's prose, which the canvas does not say anywhere.
 *
 * No emoji: the canvas seeds one on a single sample feed row
 * (`design/parts/Today.logic.js:20`) and defines none for the chips, so a set of four
 * would be copy we invented.
 */
export const LOG_TYPE_LABELS: Record<LogType, string> = {
  note: '메모',
  win: '잘한 일',
  mood: '기분',
  idea: '떠오른 생각',
};

/**
 * What a free log's feed row says on its note line when the user wrote no text — copy
 * from `design/parts/Today.logic.js:196`, the canvas's own `reward` for a
 * `feeditem freelog` row.
 *
 * The canvas's feed row has exactly one such slot (`design/parts/Today.body.html:88`,
 * `<span class="{{ f.rcls }}">{{ f.reward }}</span>`) and its two instances put
 * different things in it: the user's text on the seeded row (`Today.logic.js:20`) and
 * this sentence on a row just written (`:196`). So the two are alternatives, not two
 * lines — and the composer already carries the standing version of this hint
 * (`Today.body.html:58`), which is why repeating it under a row that says something is
 * not wanted either.
 *
 * Here rather than in the row's JSX because *which* of the two a row shows is a
 * judgment (`TodayFreeFeedItem.note`), and `jest.config.js` matches `src/**` only.
 */
export const FREE_LOG_NO_TEXT_NOTE = '점수에는 영향 없어요';

/** What `deleteConfirmLines` needs to know — see `useToday.DeleteEffect` for each. */
export interface DeleteConfirmFacts {
  habitName: string;
  /** The delete leaves no row at all for that `(habit, date)`. */
  emptiesDay: boolean;
  /** The delete erases a miss the day currently counts. */
  carriesMiss: boolean;
  /**
   * How the sentences name the day being changed. Defaults to `오늘`, which is the
   * only day `app/today.tsx` can delete from; the journal (§6.3) also holds past
   * dates and passes such a row's own date, because `오늘` would be false there.
   */
  dayLabel?: string;
  /**
   * The run before and after the delete, both figures, when the caller has decided
   * the user should be told (`useHabitDetail.showsStreak`). Absent ⇒ no streak clause:
   * on today there is nothing to break, since an emptied today falls back to `pending`
   * (ADR-0001), which is why `app/today.tsx` never passes them.
   *
   * Both numbers, never their difference: `20일 → 4일` says which is which.
   */
  streakBefore?: number;
  streakAfter?: number;
  /**
   * The day's new reading, already resolved to screen copy by the caller — the state →
   * label map is the screen's (`stateLabel`), so this file takes the label, not a
   * `DayState`. **Absent** for a paused date the engine has no opinion about
   * (ADR-0003), and the line is then omitted rather than guessed.
   */
  stateAfterLabel?: string;
}

/**
 * The delete confirm's body (SPEC §6.2 / #13 AC 5–6), one clause per consequence.
 *
 * Takes primitives rather than a `DeleteEffect`: `src/config` importing a hook's type
 * would invert the layer direction (§2.2).
 *
 * **캔버스 출처 없음 — 신규 문구.** `design/parts/` holds no delete confirm at all.
 * 근거: `design/parts/Backfill.body.html:67` is the canvas's one consequence notice,
 * and it names **what changes** before anything else ("원래 있던 기록을 지우지 않고
 * 옆에 더해집니다. 실패로 잡혀 있던 날이면 성공으로 바뀌고 …"). These lines follow
 * that register, in the same order: what is lost first, then the day's new reading.
 *
 * The miss clause deliberately carries **no day-state label**. `stateLabel('skip')`
 * reads `못 함`, and the two clauses can appear together (a miss-carrying skip with
 * another row surviving): "…'못 함' 기록이 사라져요. 지운 뒤 오늘: 못 함" would use
 * one term for the 미스 being erased and for the day's surviving state, one sentence
 * apart, which is the mixing `CONTEXT.md`'s glossary forbids. It would also give the
 * label a second source, three lines below a docblock promising the map stays the
 * screen's. So the clause names what the row **was** (a skip with a reason, in the
 * §6.8 tooltips' own words "이유를 골라 못 했다고 찍은") and what stops — never how
 * the day now reads. It no longer says 실패: the redesigned Today shows this confirm,
 * and no Today copy uses that word (#127).
 *
 * Every clause is the caller's to ask for, and two of them are asked for by only one
 * screen:
 * - the streak figures, which need a **past** date whose run actually changes. Today
 *   is still open, so emptying it leaves it `pending` and breaks nothing (ADR-0001) —
 *   `app/today.tsx` passes neither number and gets no such clause.
 * - the day's new reading, omitted without a `stateAfterLabel`: the engine has no
 *   opinion about an empty paused day (ADR-0003), so neither does the sentence.
 *
 * The day is never called `missed`. A day whose last row is deleted is repairable by
 * the same gesture that emptied it, and the clauses say what is lost, not that the day
 * has failed.
 */
export function deleteConfirmLines(facts: DeleteConfirmFacts): string[] {
  const lines: string[] = [];
  const day = facts.dayLabel ?? '오늘';
  if (facts.emptiesDay) {
    lines.push(`이 기록을 지우면 ${day} ${facts.habitName}에 남는 기록이 없어요.`);
  }
  if (facts.carriesMiss) {
    lines.push('못 했다고 찍은 기록이 바로 이 줄이라, 지우면 그날을 못 한 날로 세지 않아요.');
  }
  if (facts.streakBefore != null && facts.streakAfter != null) {
    lines.push(`연속 날수가 다시 계산돼요 — ${facts.streakBefore}일 → ${facts.streakAfter}일.`);
  }
  if (facts.stateAfterLabel != null) {
    lines.push(`지운 뒤 ${day}: ${facts.stateAfterLabel}`);
  }
  return lines;
}


/**
 * The habit detail screen's lifecycle controls — 잠깐 쉬기 · 보관하기 · 다시 시작 ·
 * 다시 꺼내기 (SPEC §4.7, issue #19).
 *
 * **캔버스에 이 자리의 아트보드는 없다. 그러나 이 동작의 말은 있다.** No artboard
 * draws a lifecycle control *here*: `design/parts/HabitDetail.body.html` and
 * `YesNo.body.html` have none, and the ones that draw a pause at all
 * (`design/Focus.dc.html`, `design/parts/Focus.body.html`) are Focus Mode, which #19
 * declares V2 and out of scope. The **placement** is therefore ours. The **word is
 * not**: `design/parts/Reflection.body.html:53` (= `design/Reflection.dc.html:316`)
 * draws 잠깐 쉬기 as one of the 처방 alternatives, and 회고 is V1 — #19 excludes only
 * `Focus.dc.html` and `Slots.dc.html` — so it is in-scope canvas authority. ADR-0003
 * (`docs/adr/0003-paused-days-are-not-classified.md:20`) rests its whole V1 case on
 * precisely that reflection `pause` action. Adopting the label verbatim is what keeps
 * the one action from being called two things once #21 ships 회고.
 *
 * `보관하기`, `다시 시작` and `다시 꺼내기` are ours — grep finds no artboard drawing
 * an archive control — written in CONCEPT §8.2's register: a pause is 나중에 하기, not
 * 퀘스트 포기.
 *
 * `LIFECYCLE_NOTE` carries the sense of the one canvas line that does exist for this
 * gesture (`design/parts/Focus.body.html:40`: 쉬어 두는 것뿐이에요. 지우는 게
 * 아닙니다. …기록도 이어 온 날수도 그대로 남아 있다가…), shortened to one sentence
 * because it sits under two low-emphasis buttons at the foot of a long screen rather
 * than inside a full-screen decision. It is the honest promise ADR-0003 actually
 * keeps: an empty day inside the interval is never classified, so no 미스 accrues and
 * the pre-pause streak re-joins on resume.
 *
 * Here rather than in `app/habit/[id].tsx` for this file's standing reason —
 * `jest.config.js` matches `src/**` only — and, more to the point, because
 * `useHabitDetail` is what decides *which* of these labels the screen is given, and a
 * hook cannot read copy that lives in `app/`.
 */
export const LIFECYCLE_LABELS = {
  pause: '잠깐 쉬기',
  archive: '보관하기',
  resume: '다시 시작',
  unarchive: '다시 꺼내기',
} as const;

/** The supporting line under those buttons — see `LIFECYCLE_LABELS`. */
export const LIFECYCLE_NOTE =
  '지우는 게 아니에요. 쉬는 동안은 실패로 세지 않고, 기록도 이어 온 날수도 그대로 남아 있어요.';

/**
 * The Reflection action buttons (SPEC §6.4, #21). Here rather than in
 * `app/reflect/[id].tsx` because `useReflection` hands the screen its options already
 * labelled, and a hook cannot read copy that lives in `app/`.
 *
 * `fill_cue` and `adjust_cue` are SPEC §6.7's Diagnosis copy table (#111). Canvas:
 * `lower_floor` (`design/parts/Reflection.body.html:52`), `keep` (`:54`). `pause` and `archive` are `LIFECYCLE_LABELS`' own words — `:53`
 * draws `잠깐 쉬기` too — so one action has one name on both screens. The other three
 * are **캔버스 출처 없음 — 신규 문구**.
 */
export const REFLECTION_ACTION_LABELS: Record<ReflectionAction, string> = {
  fill_cue: '언제·어디서 정하기',
  adjust_cue: '언제·어디서 바꾸기',
  fill_identity: '하는 이유 적기',
  lower_floor: '최소량 줄이기',
  raise_target: '목표 올리기',
  pause: LIFECYCLE_LABELS.pause,
  archive: LIFECYCLE_LABELS.archive,
  keep: '그대로 두기',
};

/**
 * The line under the recommended action — "with explanation" (§6.4). `fill_cue` is the
 * canvas's (`ReReflection.body.html`); the rest are **캔버스 출처 없음 — 신규 문구**.
 */
export const REFLECTION_ACTION_REASONS: Record<ReflectionAction, string> = {
  fill_cue: '언제, 어디서 할지만 정해도 훨씬 잘 돼요. 맞으면 누르기만 하세요.',
  adjust_cue: '지금 정한 때가 자꾸 어긋나요. 더 잘 지켜지는 때로 옮겨 보세요.',
  fill_identity: '왜 하는지가 분명하면 내키지 않는 날에도 이어 가기 쉬워요.',
  lower_floor: '최소량을 못 할 수가 없을 만큼 낮추면 이어 가기가 쉬워져요.',
  raise_target: '최소량은 이미 몸에 붙었어요. 조금 더 높은 목표를 걸어 보세요.',
  pause: LIFECYCLE_NOTE,
  archive: LIFECYCLE_NOTE,
  keep: '지금 설계를 그대로 두고 한 주 더 지켜봐요.',
};

/**
 * The flag card's component badge (§6.4 "Component (CUE / FLOOR / IDENTITY / LOAD)").
 * `cue` and `identity` are SPEC §6.7's Diagnosis copy table (#111), the same words as
 * `SCREEN_WORDS`. `floor` is the canvas's (`Reflection.body.html:42`); `load` is
 * **캔버스 출처 없음 — 신규 문구**.
 */
export const COMPONENT_LABELS: Record<DiagnosisComponent, string> = {
  cue: '언제·어디서',
  floor: '최소량',
  identity: '이유',
  load: '양 늘리기',
};

/**
 * The Established decline card (§4.6 C5) — the one 🔴 with no diagnosis flag, so it has
 * no `COMPONENT_LABELS` badge of its own. The badge reuses the growth chart's own
 * eyebrow (`주마다 한 양`, `HabitDetail.body.html:23`); the two lines are **캔버스 출처
 * 없음 — 신규 문구**, since `Reflection.body.html` draws no decline card.
 */
export const DECLINE_BADGE = '주마다 한 양';

export function declineMessage(weeks: number): string {
  return `주마다 한 양이 ${weeks}주 연속 줄었어요.`;
}

/** Cites the totals the light read and the level the guard compared the last one to. */
export function declineEvidence(totals: number[], level: 'target' | 'floor', value: number): string {
  const name = level === 'target' ? '목표' : '최소량';
  return `지난 ${totals.length}주 합계 ${totals.join(' → ')} · 마지막 주가 ${name} ${value} 이하`;
}

/** The design field a text action writes, placeholder included (`Reflection.body.html:50`). */
export const REFLECTION_CUE_PLACEHOLDER = '예: “자기 전 양치 후, 침대 옆에서”';

/**
 * 로그인 화면의 문구 — **캔버스 출처 없음, 신규 문구.** 디자인 캔버스는 로그인 화면을
 * 그린 적이 없다(앱이 로컬 전용이던 때의 캔버스다), 그래서 여기 있는 모든 문장은 이
 * 티켓이 새로 쓴 것이다. `app/index.tsx` 의 `최고 레벨` 이 같은 표시를 달고 있다.
 *
 * 화면이 아니라 이 파일에 있는 이유는 이 파일의 표준 이유 그대로다 — `jest.config.js`
 * 의 `testMatch` 가 `<rootDir>/src/**` 라 `app/` 아래 어떤 판단에도 테스트가 닿지
 * 않는다. 그리고 여기 있는 것은 단순한 상수가 아니라 **판단**이다: 이 플랫폼에서
 * 로그인이 가능한가.
 */
export interface SignInCopy {
  lead: string;
  /**
   * 로그인 버튼의 문구. `null` 이면 이 플랫폼에는 누를 것이 없다 — 화면은 버튼을 그리지
   * 않고 `note` 만 보여준다.
   */
  action: string | null;
  note: string;
}

/**
 * 웹이 아니면 **버튼이 없다.** `@supabase/auth-js` 의 provider 로그인은 브라우저가
 * 아니면 URL 만 돌려주고 아무 데도 이동하지 않으므로, 네이티브에 버튼을 두면 탭이 조용히
 * 아무 일도 안 한다 — 이 티켓이 "최악의 버그" 라고 부르는 바로 그 모양이다. 네이티브
 * OAuth 는 이 티켓의 범위가 아니므로, 지을 수 없는 것을 지은 척하는 대신 그 사실을
 * 말한다.
 *
 * `platform` 은 `Platform.OS` 를 받는다 — `src/config` 는 `react-native` 를 직접 읽지
 * 않고(그 판단은 `src/context` 의 몫이다) 문자열로 받아 테스트가 양쪽을 다 볼 수 있게
 * 한다.
 */
export function signInCopy(platform: string): SignInCopy {
  if (platform !== 'web') {
    return {
      lead: '기록은 계정에 저장돼요.',
      action: null,
      note: '앱에서의 카카오 로그인은 아직 준비 중이에요. 지금은 웹 브라우저에서 열어 주세요.',
    };
  }
  return {
    lead: '기록은 계정에 저장돼요. 로그인하면 어느 기기에서든 같은 기록이 보여요.',
    action: '카카오로 로그인',
    note: '닉네임과 프로필 사진으로 계정을 만들어요.',
  };
}

/**
 * 앱이 서버 주소도 키도 모르는 채로 떴을 때 — **캔버스 출처 없음, 신규 문구.**
 *
 * 이 화면이 존재하는 이유는 실제로 흰 화면을 봤기 때문이다. 값이 없으면 읽을 수 있는
 * 에러로 죽게 해 뒀는데, 그 "읽을 수 있는" 은 **콘솔에서만** 참이었다. 프로덕션 번들에는
 * 에러 경계가 없어서 트리가 통째로 언마운트되고 사용자에게는 빈 화면만 남는다 — 이
 * 티켓의 AC 2 가 없다고 못박은 바로 그것이다.
 *
 * 변수 이름을 문구에 그대로 적는다. 이 화면을 보는 사람은 배포한 사람이고, 그에게
 * 필요한 것은 위로가 아니라 **무엇을 넣어야 하는지**다.
 */
export const CONFIG_MISSING_NOTE =
  '서버 설정이 없어 앱을 열 수 없어요. 배포 환경변수에 EXPO_PUBLIC_SUPABASE_URL 과 ' +
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY 를 넣어 주세요.';

/** 세션을 확인하는 동안 화면에 남는 한 줄 — 빈 화면이 보이지 않게 하는 것이 목적이다. */
export const SESSION_CHECKING_NOTE = '로그인 상태를 확인하는 중…';

/** 로그인 자체가 시작되지 못했을 때. 실패한 탭이 아무 말 없이 끝나지 않게 한다. */
export const SIGN_IN_FAILED_NOTE = '로그인을 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.';

/** 로그아웃 버튼 — 설정 화면의 맨 아래 (#126). */
export const SIGN_OUT_LABEL = '로그아웃';

/**
 * 실패 문구 — **캔버스 출처 없음, 신규 문구.** 캔버스는 앱이 로컬 전용이던 때 그려졌고,
 * 로컬 KV 는 사실상 실패하지 않으므로 실패 화면이 없다. ADR-0005 가 서버를 단일 원본으로
 * 만들면서 오프라인·토큰 만료·프로젝트 정지가 일상이 됐다.
 *
 * 세 문장이 `app/habit/new.tsx` 의 `저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.` 와 같은
 * 모양인 것은 의도다 — 이 앱에서 실패를 말하는 방식은 이미 한 가지이고, 새 어법을
 * 만들 이유가 없다. 다른 점은 **다시 누를 곳을 같이 준다**는 것이라 뒷문장이 "다시 눌러
 * 주세요" 가 아니라 "다시 시도해 주세요" 다: 누를 것은 `RETRY_LABEL` 버튼이다.
 */
export const WRITE_FAILED_NOTE = '기록하지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
export const SAVE_FAILED_NOTE = '저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
export const LOAD_FAILED_NOTE = '불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.';

/** 실패 배너가 달고 있는 버튼. */
export const RETRY_LABEL = '다시 시도';

/** 목록을 읽는 동안 남는 한 줄 (#126). 옛 화면들은 같은 문구를 직접 적는다. */
export const LOADING_NOTE = '불러오는 중…';

/** 아래 탭 바의 세 낱말 (SPEC §6.1). 접근성 이름도 같다. */
export const TAB_LABELS = {
  today: '오늘',
  dashboard: '대시보드',
  journal: '글 모음',
} as const;

/**
 * 설정 화면과 보관한 습관 화면 (SPEC §6.3 Settings, `ReSettings`, #126).
 * `open` 과 `back` 은 아이콘만 있는 버튼의 접근성 이름이다 (§6.0 Icons).
 * 보관한 습관 목록과 그 빈 화면은 아트보드가 없다. 빈 화면은 §6.0 의 이모지 하나,
 * 문장 하나, 버튼 하나를 따른다.
 */
export const SETTINGS_COPY = {
  open: '설정',
  back: '뒤로',
  title: '설정',
  themeLabel: '테마',
  themeOptions: { system: '자동', light: '라이트', dark: '다크' },
  archivedTitle: '보관한 습관',
  archivedEmptyEmoji: '🗄️',
  archivedEmpty: '보관한 습관이 없어요.',
  archivedEmptyAction: '설정으로 돌아가기',
} as const;

/**
 * 설정의 "보관한 습관 N개" 줄. 개수를 모르면(읽는 중이거나 읽기 실패) 숫자를 빼고
 * "보관한 습관" 만 쓴다. 읽지 못한 것을 "0개" 라고 말하지 않기 위해서다.
 *
 * 아트보드는 "N개" 를 줄 오른쪽에 따로 그린다. 그 조각이 `archivedCountLabel` 이고,
 * `archivedRowLabel` 은 접근성 이름으로 쓰는 한 줄 전체다.
 */
export function archivedCountLabel(count: number | null): string {
  return count == null ? '' : `${count}개`;
}

export function archivedRowLabel(count: number | null): string {
  return count == null
    ? SETTINGS_COPY.archivedTitle
    : `${SETTINGS_COPY.archivedTitle} ${archivedCountLabel(count)}`;
}

/**
 * 공통 상태 단어 (SPEC §6.0, #127). 오늘 화면 티켓이 두고, 대시보드, 습관 상세, 글 모음
 * 티켓이 다시 쓴다. 모든 화면이 같은 하루 상태를 같은 낱말과 같은 표시로 보여 준다.
 */

/** 하루 상태 여섯의 화면 낱말 (§6.0 Day-state marks). 어느 이름에도 "실패"가 없다. */
export const DAY_STATE_WORDS: Record<DayState, string> = {
  done: '했어요',
  over: '목표까지 했어요',
  partial: '조금 했어요',
  skip: '못 했어요',
  missed: '기록 없음',
  pending: '아직이에요',
};

/** 하루 상태 표시 안의 글자. `pending` 은 점선 테두리뿐이라 글자가 없다. */
export const DAY_STATE_GLYPHS: Record<DayState, string> = {
  done: '✓',
  over: '★',
  partial: '½',
  skip: '−',
  missed: '!',
  pending: '',
};

/**
 * 상태등 세 단계의 낱말과 모양 (§6.0 Visual rules). 키는 `src/domain/statusLight.ts` 의
 * `StatusLight` 값이다. `personal_best` 는 `stable` 에 `BEST_RECORD_GLYPH` 를 더해 그린다.
 * `src/config` 는 도메인 아래 층이라 그 타입을 가져오지 않고 키만 맞춘다 (§2.2).
 */
export const STATUS_LIGHT_WORDS = {
  stable: '괜찮아요',
  caution: '살펴보세요',
  intervention: '손봐야 해요',
} as const;

export const STATUS_LIGHT_GLYPHS = {
  stable: '●',
  caution: '◆',
  intervention: '▲',
} as const;

/** 최고 기록이 상태등에 더하는 표시. */
export const BEST_RECORD_GLYPH = '★';

/** 화면이 부르는 이름 (§6.0 Screen words). XP는 별, 스탯은 능력치다. */
export const SCREEN_WORDS = {
  star: '별',
  stat: '능력치',
  cue: '언제·어디서',
  identity: '이유',
  engagementStreak: '조금이라도 한 날',
  streak: '연속',
  floor: '최소량',
  dayShare: '오늘 몫',
} as const;

/** 아이콘만 있는 버튼의 접근성 이름 (§6.0 Icons). */
export const ICON_LABELS = {
  help: '설명 보기',
  close: '닫기',
} as const;

/** `?` 툴팁 문구 (§6.8 Copy 표). 표의 문장 그대로다. */
export const TOOLTIPS = {
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
} as const;

/** The two days a Today sheet writes to, as copy names them (§6.2 B4). */
export const DAY_WORDS = {
  today: '오늘',
  yesterday: '어제',
} as const;

/**
 * The toast's amount half. It cannot be built from `floorUnit` alone: a binary habit
 * carries `floorUnit: 'time'`, so `+1${floorUnit}` would render `+1time`. Its amount is
 * the day-state word `✓ 했어요` instead.
 */
function amountOf(habit: Habit, actual: number): string {
  return habit.kind === 'binary'
    ? `${DAY_STATE_GLYPHS.done} ${DAY_STATE_WORDS.done}`
    : `+${actual}${habit.floorUnit}`;
}

/** What the undo toast needs to know about the activity log that just landed. */
export interface UndoToastFacts {
  /** The habit logged — `kind` and `floorUnit` shape the amount. */
  habit: Habit;
  /** The amount the row records. */
  actual: number;
  /** 별 this log earned (`describeLogEffect`'s `xpGained`). */
  xpGained: number;
  /** How much the day still lacks to its floor after this log. Above 0 only on `partial`. */
  remainingToFloor: number;
  statLevelUp: boolean;
  /**
   * The stat's display name, or absent when `statId` names no configured stat. The
   * level-up line is then skipped rather than rendered with a hole in it.
   */
  statName?: string;
  /** The stat's level **after** this log — `computeStatLevel`, never recomputed here. */
  statLevel: number;
  pushedToOver: boolean;
  /** The log's day went from not floor-met to floor-met. */
  floorCrossed: boolean;
  /** A streak banner or milestone popup shows for this log. */
  celebrated: boolean;
  /** This habit and date were celebrated before this log (one date celebrates once). */
  alreadyCelebrated: boolean;
  /** Is the row on a date other than today? */
  isBackfill: boolean;
}

/**
 * "의지 레벨 3으로 올랐어요" — the toast's level-up line (#127 decision). The particle
 * follows how the number is read: 으로 after a closed syllable (영, 삼, 육, 십), 로 after
 * an open one or ㄹ (일, 이, 사, 오, 칠, 팔, 구).
 */
export function levelUpLine(statName: string, level: number): string {
  const particle = [0, 3, 6].includes(level % 10) ? '으로' : '로';
  return `${statName} 레벨 ${level}${particle} 올랐어요`;
}

/**
 * The undo toast's second and third lines for an activity log — SPEC §6.2 Undo toast
 * copy and C1. The first line is always `기록됨` (B6).
 *
 * `detail` is the amount, plus ` · 별 +N` only when the log earned 별 ("A log that earns
 * no 별 drops the 별 part of the second line").
 *
 * `sub` is one line, so the branches are a priority order:
 * - a level-up first. It stays even when a banner shows (#127 decision);
 * - nothing else when a banner or popup celebrates the log: "the toast has no streak.
 *   It holds the amount, 별 and 실행취소";
 * - the `partial` row of the table;
 * - passing the target (C1's "목표까지 넘겼어요"; its 별 is already on the second line);
 * - the "another log on a day already celebrated" row of the table;
 * - a floor crossed with no streak rise, e.g. a backfill onto an isolated past day
 *   (오늘 몫을 채웠어요, 그날 몫을 채웠어요; #127 decision).
 */
export function undoToastLines(facts: UndoToastFacts): { detail: string; sub?: string } {
  const detail =
    amountOf(facts.habit, facts.actual) + (facts.xpGained > 0 ? ` · 별 +${facts.xpGained}` : '');

  let sub: string | undefined;
  if (facts.statLevelUp && facts.statName != null) {
    sub = levelUpLine(facts.statName, facts.statLevel);
  } else if (facts.celebrated) {
    sub = undefined;
  } else if (facts.remainingToFloor > 0) {
    sub = `조금이라도 했어요 · 최소량까지 ${facts.remainingToFloor}${facts.habit.floorUnit} 남았어요`;
  } else if (facts.pushedToOver) {
    sub = '목표까지 넘겼어요';
  } else if (facts.alreadyCelebrated || !facts.floorCrossed) {
    sub = '더 했어요';
  } else {
    sub = `${facts.isBackfill ? '그날' : DAY_WORDS.today} 몫을 채웠어요`;
  }
  return { detail, sub };
}

/**
 * The undo toast's lines for a skip (SPEC §6.2 Undo toast copy, #127 decision): the
 * reason second, then 예외라서 연속은 그대로예요 for an exception, or for any other
 * reason the row's note after 이유:, or 쉬었어요 alone with no note. It never says the
 * streak broke; the streak pill shows that.
 */
export function skipToastLines({ reason, note }: { reason: SkipReason; note?: string }): {
  detail: string;
  sub: string;
} {
  return {
    detail: SKIP_REASON_LABELS[reason],
    sub:
      reason === 'exception'
        ? '예외라서 연속은 그대로예요'
        : note != null && note.length > 0
          ? `쉬었어요 · 이유: ${note}`
          : '쉬었어요',
  };
}

/** The undo toast's first line (§6.2 B6) and its action. */
export const UNDO_TOAST_COPY = {
  title: '기록됨',
  undo: '실행취소',
} as const;

/** The streak banner's and the milestone popup's fixed words (§6.2 Streak celebration). */
export const CELEBRATION_COPY = {
  /** After the streak number, which is drawn in `streak` ink: "3" + "일 연속!". */
  streakSuffix: '일 연속!',
} as const;

/** Weekday labels from Sunday, for the celebration's week and the date headers. */
export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/**
 * The celebration's line under the streak. On today: "📖 독서 오늘 몫을 채웠어요"
 * (`ReTodayStreak`). On a backfill: the SPEC's "어제를 채워서 13일 연속이 됐어요", after
 * the habit. `filledDay` is 어제 or "M월 D일"; the object particle follows it (어제를,
 * 27일을), and every "M월 D일" ends in 일, so the two cases are all there is.
 */
export function celebrationLine({
  icon,
  name,
  streak,
  filledDay,
}: {
  icon: string;
  name: string;
  streak: number;
  filledDay?: string;
}): string {
  if (filledDay == null) return `${icon} ${name} ${DAY_WORDS.today} 몫을 채웠어요`;
  const particle = filledDay === DAY_WORDS.yesterday ? '를' : '을';
  return `${icon} ${name} ${filledDay}${particle} 채워서 ${streak}일 연속이 됐어요`;
}

/** The ★ line a target crossing adds to the banner or popup (§6.2). */
export function starLine(stars: number): string {
  return `★ 목표까지 넘겼어요 · 별 +${stars}`;
}

/** The milestone popup's bonus line, shown only when the day earns the bonus (§6.2). */
export function milestoneBonusLine(stars: number): string {
  return `기념일 보너스 · 별 +${stars}`;
}

/**
 * The habit's icon: the one picked on the New habit screen (#130), else its stat's icon
 * (`TUNING.stats`). `🌱` when `statId` names no configured stat.
 */
export function habitIcon(habit: Pick<Habit, 'statId' | 'icon'>): string {
  return habit.icon ?? TUNING.stats.find((stat) => stat.id === habit.statId)?.icon ?? '🌱';
}

/** "10월 9일" — a date by month and day, for copy that names a past day. */
export function monthDayLabel(date: string): string {
  const { month, day } = monthAndDay(date);
  return `${month}월 ${day}일`;
}

/** The month and day of a `YYYY-MM-DD` date, as numbers. */
function monthAndDay(date: string): { month: number; day: number } {
  const [, month, day] = date.split('-').map(Number);
  return { month, day };
}

/** "10월 10일 토요일" — the Today header and the yesterday sheet's eyebrow. */
export function longDateLabel(date: string, weekday: number): string {
  return `${monthDayLabel(date)} ${WEEKDAY_LABELS[weekday]}요일`;
}

/**
 * The shared record and skip reason sheets' words (§6.2 Record sheet, Skip reason
 * sheet). Shared, not Today's: Today, the Dashboard's 7-day dots and Habit Detail's
 * date cells open the same sheets ("One log form").
 */
export const SHEET_COPY = {
  notePlaceholder: '메모 (선택)',
  record: '기록하기',
  skipHint: '이유를 누르면 바로 기록돼요.',
  /** The stepper's accessible names. */
  stepDown: '하나 줄이기',
  stepUp: '하나 늘리기',
  /** The time reveal's two fields and its reset. */
  hour: '시',
  minute: '분',
  backToNow: '지금으로',
} as const;

/**
 * The redesigned Today screen's copy (SPEC §6.2, the `ReToday*` artboards, #127).
 * Fixed words are here; the sentences that carry a number or a name are the functions
 * below, which `useToday` calls.
 */
export const TODAY_COPY = {
  title: '오늘 할 일',
  fill: '채우기',
  did: DAY_STATE_WORDS.done,
  didNot: DAY_STATE_WORDS.skip,
  yesterdayListTitle: '어제 기록이 빈 습관',
  freeLogButton: '끄적이기',
  freeLogTitle: '✏️ 끄적이기',
  freeLogPlaceholder: '떠오른 생각을 적어요',
  freeLogSubmit: '남기기',
  /** The edit sheet's actions and the delete confirm's two answers. */
  save: '저장',
  remove: '삭제',
  confirmRemove: '지울게요',
  keep: '그대로 둘게요',
  /** The edit sheet's row kind switch — the day-state words of the two row kinds. */
  editKinds: { activity: DAY_STATE_WORDS.done, skip: DAY_STATE_WORDS.skip },
  /** A backfilled row's stamp, in the edit sheet (§6.3 noon pin). */
  backfillTime: '낮 12:00으로 남아요',
  /** The empty screen: one emoji, one sentence, one button (§6.0 Icons). */
  emptyEmoji: '🌱',
  empty: '아직 습관이 없어요.',
  emptyAction: '습관 만들기',
  /** The fold's accessible action words. */
  foldOpen: '펼치기',
  foldClose: '접기',
} as const;

/** "✅ 3개 중 1개 했어요" — the count chip. */
export function countChipLabel(total: number, done: number): string {
  return `✅ ${total}개 중 ${done}개 ${DAY_STATE_WORDS.done}`;
}

/**
 * The yesterday banner's title (#135): the habit's name when one habit is blank, the
 * count when two or more are.
 */
export function yesterdayBannerTitle(names: string[]): string {
  return names.length === 1
    ? `🌙 어제 ${names[0]} 기록이 비어 있어요.`
    : `🌙 어제 기록이 빈 습관 ${names.length}개`;
}

/** "오늘 기록 2개" — the fold over the day's records. */
export function foldLabel(count: number): string {
  return `${DAY_WORDS.today} 기록 ${count}개`;
}

/** The 언제·어디서 value on a habit card, with no label (§6.0 Screen words). */
export function cueLine(cue: string): string {
  return `🕐 ${cue}`;
}

/** The card's status words, mark first: ✓ 했어요, ★ 목표까지 했어요, − 못 했어요. */
export function cardBadge(state: DayState): string | null {
  return state === 'done' || state === 'over' || state === 'skip' ? dayStateBadge(state) : null;
}

/** "6 / 10쪽", or past the target "30쪽 · 목표 30쪽" (§6.2 Habit card). */
export function cardProgressLine({
  sum,
  floor,
  unit,
  target,
}: {
  sum: number;
  floor: number;
  unit: string;
  /** Given only when the day is `over`. */
  target?: number;
}): string {
  return target != null ? `${sum}${unit} · 목표 ${target}${unit}` : `${sum} / ${floor}${unit}`;
}

/** "{어느 날} 못 했어요 · 왜?" — the skip reason sheet's title and the record sheet's link. */
export function skipSheetTitle(dayWord: string): string {
  return `${dayWord} ${DAY_STATE_WORDS.skip} · 왜?`;
}

/** "지금 6쪽" — today's sum, in the record sheet's head. */
export function recordSumLabel(sum: number, unit: string): string {
  return `지금 ${sum}${unit}`;
}

/** "지금 14:20" — the record sheet's time, a plain label (B3). */
export function nowLabel(clock: string): string {
  return `지금 ${clock}`;
}

/** "어제 12:00" — a backfill's time in the record sheet: it is stamped at noon (B3, §6.3). */
export function backfillTimeLabel(dayWord: string): string {
  return `${dayWord} 12:00`;
}

/**
 * "지금 14:20 · 시간 바꾸기" — the free log's time button (B3). The date does not change:
 * a free log is today's only (#16, #127 decision).
 */
export function freeLogTimeLabel(clock: string): string {
  return `지금 ${clock} · 시간 바꾸기`;
}

/** "07:10 · 시간 바꾸기" — an existing row's time button in the edit sheet (#127 decision). */
export function editTimeLabel(clock: string): string {
  return `${clock} · 시간 바꾸기`;
}

/**
 * The record sheet's one result line under the stepper (C7a): what this amount does to
 * the day. The SPEC gives one case, "이걸로 오늘 몫을 채워요 ✓". The other three are in
 * the same register: still short of the floor, past the target, and a day whose floor
 * is already met.
 */
export function recordResultLine({
  sum,
  amount,
  floor,
  target,
  unit,
  dayWord,
}: {
  /** The day's sum before this amount. */
  sum: number;
  amount: number;
  floor: number;
  /** The habit's target when the engine honours one (`> floor`, count only). */
  target?: number;
  unit: string;
  /** 오늘 or 어제 (`DAY_WORDS`). */
  dayWord: string;
}): string {
  const next = sum + amount;
  const passesTarget = target != null && sum < target && next >= target;
  if (sum < floor && next < floor) return `최소량까지 ${floor - next}${unit} 남아요`;
  if (passesTarget) return '이걸로 목표까지 넘겨요 ★';
  if (sum < floor) return `이걸로 ${dayWord} 몫을 채워요 ✓`;
  return `${dayWord} 몫은 이미 채웠어요`;
}

/**
 * 대시보드 (SPEC §6.3, `ReDashboard`, `ReDashboardStats`, `ReDashboardEmpty`, #129).
 * Fixed words are here; the sentences that carry a number are the functions below,
 * which `useDashboard` calls. Day-state, status light, tooltip and record sheet words
 * are the shared ones above.
 */
export const DASHBOARD_COPY = {
  title: '대시보드',
  reflect: '회고하기',
  newHabit: '습관 만들기',
  /** The empty screen: one emoji, one sentence, one button (§6.0 Icons). */
  emptyEmoji: '🌱',
  empty: '아직 습관이 없어요',
  /** The level line at the top level, where there is no next threshold (#129 decision). */
  topLevel: '최고 레벨이에요',
} as const;

/** "캐릭터 레벨 4" — the level card's head and the stat sheet's title. */
export function characterLevelLabel(level: number): string {
  return `캐릭터 레벨 ${level}`;
}

/** "레벨 3" — one stat's level in the stat sheet. */
export function statLevelLabel(level: number): string {
  return `레벨 ${level}`;
}

/** "다음 레벨까지 별 120개", or `DASHBOARD_COPY.topLevel` when there is no next level. */
export function starsToNextLevelLabel(stars: number | null): string {
  return stars == null ? DASHBOARD_COPY.topLevel : `다음 레벨까지 ${SCREEN_WORDS.star} ${stars}개`;
}

/** "💪 3 · 📖 2 · 🧘 4" — the level card's one stat line. */
export function statLineLabel(stats: { icon: string; level: number }[]): string {
  return stats.map((stat) => `${stat.icon} ${stat.level}`).join(' · ');
}

/** "손볼 습관 1개" — the head over the habit rows. It has no `?` (§6.8). */
export function needsAttentionLabel(count: number): string {
  return `손볼 습관 ${count}개`;
}

/** "🔥 12" — a row's streak. */
export function streakCountLabel(streak: number): string {
  return `🔥 ${streak}`;
}

/** "10월 8일 목요일 기록 없음" — a 7-day dot's accessible name. */
export function dayCellLabel(dateLabel: string, state: DayState): string {
  return `${dateLabel} ${DAY_STATE_WORDS[state]}`;
}

// --- 새 습관 (#130, SPEC §6.6) ----------------------------------------------

/** 새 습관 화면의 문구 (`ReNewHabit`, `ReNewHabitYesNo`). `labels`의 키 순서가 화면의 칸 순서다. */
export const NEW_HABIT_COPY = {
  title: '습관 만들기',
  subtitle: '나중에 언제든 고칠 수 있어요',
  labels: {
    name: '이름',
    kind: '측정 방식',
    floor: '최소량',
    target: '목표',
    cue: SCREEN_WORDS.cue,
    stat: SCREEN_WORDS.stat,
    identity: SCREEN_WORDS.identity,
  },
  /** 목표, 언제·어디서, 이유 뒤에 붙는다. */
  optional: '· 선택',
  placeholders: {
    name: '예: 턱걸이',
    floor: '5',
    floorUnit: '회',
    target: '10',
    cue: '예: 아침 커피 마신 뒤, 문틀 바에서',
    identity: '예: 나는 매일 몸을 쓰는 사람이니까',
  },
  kinds: { count: '횟수 · 양', binary: '예 · 아니오' },
  /** 단위 칸의 접근성 이름. */
  floorUnitLabel: '단위',
  submit: '습관 만들기',
  /** 이름 왼쪽 아이콘 버튼의 접근성 이름이자 아이콘 시트의 제목. */
  pickIcon: '아이콘 고르기',
  /** 아이콘 시트에서 고른 아이콘을 지우는 버튼. */
  useStatIcon: '능력치 아이콘 쓰기',
  errors: {
    name: '이름을 적어 주세요.',
    floor: '최소량은 1 이상의 숫자로 적어 주세요.',
    floorUnit: '단위를 적어 주세요 (예: 회, 쪽, 분).',
    target: '목표는 숫자로 적어 주세요.',
    targetNotAboveFloor: '목표는 최소량보다 커야 해요.',
  },
} as const;

/** 아이콘 시트가 늘어놓는 습관 아이콘. 능력치 아이콘 셋을 포함한다. */
export const NEW_HABIT_ICONS = [
  '💪', '🏃', '🚶', '🧘', '📖', '✍️', '🧠', '💻',
  '🎸', '🎨', '💧', '🥗', '😴', '🦷', '🧹', '🌱',
] as const;

// ---------------------------------------------------------------------------
// 글 모음 (SPEC §6.4, the `ReJournal` artboard, #132)
// ---------------------------------------------------------------------------

/**
 * The 글 모음 tab's fixed words. The lines that carry a date, a kind or a state are the
 * functions below, which `useJournal` calls.
 */
export const JOURNAL_COPY = {
  title: TAB_LABELS.journal,
  /** The two filter chips that are not a habit: 전체, then 끄적이기 (free logs). */
  all: '전체',
  freeLogs: TODAY_COPY.freeLogButton,
  /** The empty screen: one emoji, one sentence, one button (§6.0 Icons). */
  emptyEmoji: '📝',
  empty: '아직 남긴 글이 없어요.',
  emptyAction: TODAY_COPY.freeLogButton,
  /** A filter with nothing under it, while other filters still hold rows. */
  noMatch: '여기에는 아직 글이 없어요.',
} as const;

/** A date group's head: "오늘 · 10월 10일" for today, else "10월 9일". */
export function journalDateLabel(date: string, today: string): string {
  return date === today ? `${DAY_WORDS.today} · ${monthDayLabel(date)}` : monthDayLabel(date);
}

/** A free log row's head: "✏️ 끄적이기 · 떠오른 생각". */
export function journalFreeLogLabel(type: LogType): string {
  return `✏️ ${TODAY_COPY.freeLogButton} · ${LOG_TYPE_LABELS[type]}`;
}

/** A day-state as its mark and word: "✓ 했어요", "½ 조금 했어요", "− 못 했어요". */
export function dayStateBadge(state: DayState): string {
  const glyph = DAY_STATE_GLYPHS[state];
  return glyph.length > 0 ? `${glyph} ${DAY_STATE_WORDS[state]}` : DAY_STATE_WORDS[state];
}

/**
 * 회고 화면 (SPEC §6.7, `ReReflection`, #131). 진단 카드의 성분 이름과 처방 이름은
 * 위의 `COMPONENT_LABELS` 와 `REFLECTION_ACTION_LABELS` 에 있다.
 */

/**
 * 진단 카드의 배지: 심각도 모양과 성분 이름 ("▲ 언제·어디서"). 모양은 상태등과 같다.
 * `critical` 은 손봐야 해요의 ▲, 나머지는 살펴보세요의 ◆ 다.
 */
export function diagnosisBadge(severity: Severity, name: string): string {
  const glyph = severity === 'critical' ? STATUS_LIGHT_GLYPHS.intervention : STATUS_LIGHT_GLYPHS.caution;
  return `${glyph} ${name}`;
}

/** 접힌 진단 카드를 펼치는 버튼 (§6.7). */
export function moreDiagnosesLabel(count: number): string {
  return `다른 점 ${count}개 더 보기`;
}

/** 회고 화면의 제목: "명상, 잠깐 볼까요". */
export function reflectionTitle(habitName: string): string {
  return `${habitName}, 잠깐 볼까요`;
}

/** 추천 행동의 머리: "✓ 이렇게 해 볼까요: 언제·어디서 정하기". */
export function proposalLine(actionLabel: string): string {
  return `✓ 이렇게 해 볼까요: ${actionLabel}`;
}

/** "10/8" — 저널 메모의 날짜. */
export function shortDateLabel(date: string): string {
  const { month, day } = monthAndDay(date);
  return `${month}/${day}`;
}

/** "10/5 (월)" — 백필 질문의 날짜 줄. `weekday` 는 일요일이 0이다. */
export function weekdayDateLabel(date: string, weekday: number): string {
  return `${shortDateLabel(date)} (${WEEKDAY_LABELS[weekday]})`;
}

/** 회고 화면의 고정 문구 (`ReReflection`). 툴팁은 `TOOLTIPS.reflection*` 이다. */
export const REFLECTION_COPY = {
  back: '뒤로',
  did: DAY_STATE_WORDS.done,
  didNot: '안 했어요',
  recoverNote: '했어요를 누르면 그날이 성공으로 바뀌고 연속도 다시 이어져요.',
  sevenDays: '최근 7일은 이랬어요',
  howItReads: '이렇게 보여요',
  /** 캔버스 출처 없음. 기록 없는 날만 있는 🔴 는 진단이 없다 (ADR-0002). */
  nothingToFlag: '지금 기록으로는 짚을 것이 없어요. 기록이 없는 날을 채우면 더 정확히 볼 수 있어요.',
  commit: '이대로 고칠게요',
  notFound: '습관을 찾을 수 없어요.',
} as const;
