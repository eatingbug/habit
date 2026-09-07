import { StyleSheet, View } from 'react-native';

import { SPACE } from '@/theme/tokens';

import { Toast } from './Toast';

export interface ToastOverlayProps {
  /** `null` renders nothing at all — the overlay only exists while a toast is live. */
  toast: { message: string; detail: string } | null;
  onUndo: () => void;
}

/**
 * B6's undo toast, pinned above a scrolling screen rather than scrolling with it.
 *
 * Mounted inside a `ScrollView`, a one-tap on content below the fold produces a
 * confirmation the user never sees and an 실행취소 unreachable inside
 * `TUNING.undoToastMs` — which defeats the toast's whole job (§6.2: it *is* the "it
 * registered" confirmation one-tap logging otherwise lacks). Its appearing and
 * disappearing also shifts whatever button sat under the user's thumb.
 *
 * Positioning lives here rather than in `Toast`, which is a shared primitive and must
 * not assume it is an overlay. Both logging surfaces (§6.1, §6.2) need this, so it is
 * one component instead of the same absolute block copied into two screens.
 *
 * Two distinct mechanisms, easily confused:
 * - returning `null` with no toast is what keeps the overlay from covering the screen
 *   at all when nothing is live — there is no invisible layer to tap through;
 * - `pointerEvents: 'box-none'` covers the case *while* a toast is live: the wrapper
 *   spans the screen's full width, so without it the empty strip either side of the
 *   `Toast` would intercept taps meant for the content beneath. The `Toast` itself
 *   still receives its own presses.
 */
export function ToastOverlay({ toast, onUndo }: ToastOverlayProps) {
  if (toast == null) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Toast message={toast.message} detail={toast.detail} onUndo={onUndo} />
    </View>
  );
}

/**
 * Bottom padding a scrolling screen must add so its last row can scroll clear of the
 * floating toast. Stated once, here, because the overlay is the only thing that knows
 * how tall it is: `SPACE.xl` of inset plus the `Toast`'s own height — a single line of
 * `FONT_SIZE.sm` text inside `SPACE.md + 1` vertical padding, about 40px — plus a gap
 * so the last row does not sit flush against it.
 */
export const TOAST_OVERLAY_CLEARANCE = SPACE.xl + 40 + SPACE.xl;

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: SPACE.xl, right: SPACE.xl, bottom: SPACE.xl },
});
