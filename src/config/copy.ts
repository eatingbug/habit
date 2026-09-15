import type { Habit, LogType, SkipReason } from '@/models';

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

/**
 * The target selector's free option — the canvas's **first** tab
 * (`design/parts/Today.logic.js:135`, `{ id: 'free', label: '오늘 일기' }`).
 *
 * Beside the labels above rather than in the screen for the same reason: the option
 * list itself is `useToday.targetOptions`, and a hook cannot read copy that lives in
 * `app/`.
 */
export const FREE_TARGET_LABEL = '오늘 일기';

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
 * screen's. So the clause names what the row was **counted as** (실패) and what stops
 * — never how the day now reads.
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
    lines.push('실패로 세던 기록이 바로 이 줄이라, 지우면 그 실패는 더 세지 않아요.');
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
 * The toast's amount half (§6.2 B6 copy). It cannot be built from `floorUnit` alone:
 * a binary habit carries `floorUnit: 'time'`, so `+1${floorUnit}` would render
 * `+1time`. Its detail is the fixed `✓ 완료` instead.
 *
 * It sits here with the rest of the toast's copy rather than in the hook, so the
 * `+1time` guard has exactly one home.
 */
function detailOf(habit: Habit, actual: number): string {
  return habit.kind === 'binary' ? '✓ 완료' : `+${actual}${habit.floorUnit}`;
}

/** What the log-time toast needs to know about the log that just landed. */
export interface RewardToastFacts {
  /** The habit logged — `kind` and `floorUnit` shape the amount half of `detail`. */
  habit: Habit;
  /** The amount the row records. */
  actual: number;
  /**
   * The log's delta, as the primitives the cascade below reads — the caller takes them
   * off `describeLogEffect`'s `LogEffect` (§4.2 C1) and passes them one by one. The
   * type itself is not imported: see `rewardToastLines`. `savedAtRiskDay` is on
   * `LogEffect` and deliberately absent here — no line of this copy reads it.
   */
  xpGained: number;
  statLevelUp: boolean;
  streakMilestoneHit?: number;
  pushedToOver: boolean;
  floorCrossedToday: boolean;
  showedUp: boolean;
  /** Is the row on a date other than today? Only the "showed up" line reads this. */
  isBackfill: boolean;
  /**
   * The habit's stat's display name, or absent when `statId` names no configured stat
   * — the same data defect `useDashboard`'s optional `stat` describes. The level-up
   * line is then skipped rather than rendered with a hole in it, and the next branch
   * speaks instead.
   */
  statName?: string;
  /** The stat's level **after** this log — `computeStatLevel`, never recomputed here. */
  statLevel: number;
}

/**
 * The log-time toast's two derived slots — SPEC §4.2 C1 / §6.2, issue #17.
 *
 * Copy, not judgment about scoring: every fact arrives already decided by the domain. It sits
 * in `src/config` for the reason `deleteConfirmLines` does — `jest.config.js` matches
 * `src/**` only, so the same cascade written inside `app/` would be copy no test can
 * reach. And it takes **primitives** for that function's reason too: SPEC §2.2's
 * dependency rule puts `src/config` *below* `src/domain` ("Domain imports only models
 * and config"), so importing `LogEffect` here would invert that direction. The caller
 * is UI, may import both, and passes the fields this cascade reads.
 *
 * `detail` is the mono slot (`Toast`'s `.rx`): the amount, plus ` · +N XP` only when
 * the log actually earned some. A trailing `+0 XP` would be noise on a day whose XP
 * was already banked, and the honest word for that day is the `sub` line instead —
 * nothing goes unacknowledged.
 *
 * `sub` is one plain sentence, so the branches are a priority cascade, rarest first: a
 * level-up outranks a milestone, which outranks the day's own crossings. Copy is the
 * canvas's, from Today's four-way version (`design/parts/Today.logic.js:59`/`:63`) —
 * the one that has the sub-floor branch — plus the Dashboard's already-banked line
 * (`design/parts/Dashboard.logic.js:35`). One wording serves both screens, exactly as
 * the skip toast's does (see `logSkip` in `src/hooks/useQuickLog.ts`).
 *
 * Two lines are **캔버스 출처 없음 — 신규 문구**: the level-up and the milestone. The
 * canvas has no toast for either. `이어 간 날 {N}일 보너스` borrows its vocabulary from
 * `design/parts/YesNo.body.html:18` (`이어 간 날 보너스`), and the level-up line uses
 * the stat name and level the Dashboard's own stat card shows.
 *
 * **The one declared deviation:** the toast's main verb stays `기록됨` even on a log
 * that earned no XP, where both canvases swap their main line
 * (`design/parts/Dashboard.logic.js:35` → `이미 오늘 몫은 끝났어요`;
 * `design/parts/Today.logic.js:58` → `기록했어요 · XP 없음`). SPEC §6.2 B6 specifies that
 * literal string for the undo toast (`기록됨 +N {unit} · 실행취소`), the two canvases do
 * not agree with each other on what replaces it, and one wording serves both screens
 * here as the skip toast's already does. That day is acknowledged on `sub` instead.
 *
 * On a backfill the "showed up" line says `그 날` rather than the canvas's `오늘`
 * (`design/parts/Today.logic.js:59`), a mechanical substitution: it is the only
 * sentence here that names a day, and it would be plainly false beside a row filled
 * onto yesterday. The XP itself is not softened — a backfill earns for real (ADR-0001).
 */
export function rewardToastLines(facts: RewardToastFacts): { detail: string; sub?: string } {
  return {
    detail:
      detailOf(facts.habit, facts.actual) +
      (facts.xpGained > 0 ? ` · +${facts.xpGained} XP` : ''),
    sub:
      facts.statLevelUp && facts.statName != null
        ? `${facts.statName} 레벨 ${facts.statLevel}`
        : facts.streakMilestoneHit != null
          ? `이어 간 날 ${facts.streakMilestoneHit}일 보너스`
          : facts.pushedToOver
            ? '목표까지 넘었어요 🎯'
            : facts.floorCrossedToday
              ? '최소만큼 했어요 💪'
              : facts.showedUp
                ? `${facts.isBackfill ? '그 날' : '오늘'} 나타났어요`
                : facts.habit.kind === 'binary' && facts.xpGained === 0
                  ? 'XP는 하루 한 번만'
                  : '최소보다 더 했어요',
  };
}

/**
 * The at-risk save banner's two halves (SPEC §4.3 C2, issue #18 AC 5) — copy from
 * `design/parts/Today.body.html:13`.
 *
 * Two strings and not one, because the canvas splits them typographically: the banner's
 * surface and border are `--warn` (`design/_tokens.css:93–94`) and so is the **bold**
 * first sentence (`:97`), while the single `<span class="dot r">` beside it is the only
 * crit-red thing in the box. Returning one joined sentence would lose which half is
 * bold and warn-coloured, and the screen would have to re-split it.
 *
 * Takes the habit's **name** rather than a `Habit` for `deleteConfirmLines`' reason:
 * §2.2 puts `src/config` below `src/domain`, and `src/domain/score.ts:1` already
 * imports `@/config/tuning`, so importing anything from `@/domain` here would close a
 * cycle. Nothing but the name is needed.
 *
 * **Declared deviation.** SPEC §4.3 C2 (`docs/SPEC.md:547–548`) quotes the banner as
 * `어제 놓쳤어요 — 오늘 최소 한 번이면 이어갈 수 있어요`; this follows the canvas's three-clause version instead,
 * which names the habit and adds the backfill invitation. The invitation is not a false
 * promise: the date stepper that honours it shipped with #14.
 *
 * **One word is ours: `기록을`.** The canvas writes `어제 명상을 놓쳤어요`, whose object
 * particle is `을` only because 명상 ends in a consonant; a habit named 요가 or 달리기
 * would need `를`, and half of all names would read as broken Korean. Rather than
 * inflecting the particle from the name's last syllable — a rule with its own edge
 * cases on a name ending in a digit or a Latin letter — the name is made a modifier of
 * an invariant noun. The register is the canvas's, unchanged.
 */
export function saveBannerLines(habitName: string): { lead: string; rest: string } {
  return {
    lead: `어제 ${habitName} 기록을 놓쳤어요.`,
    rest: '오늘 한 번이면 흐름이 이어져요. 어제도 지금 채워 넣을 수 있어요.',
  };
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

/** 로그아웃 버튼 — 대시보드 머리말의 테마 토글 옆. */
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
