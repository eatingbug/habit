import type { SkipReason } from '@/models';

/**
 * User-facing strings that no single layer can own.
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
 */
export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  cue: '깜빡함',
  floor: '너무 힘듦',
  exception: '예외',
  identity: '안 내킴',
};

/** The order they appear on screen — the canvas's chip order, unchanged. */
export const SKIP_REASON_ORDER: readonly SkipReason[] = ['cue', 'floor', 'exception', 'identity'];
