import { Toast } from '@/components/re';
import { UNDO_TOAST_COPY } from '@/config/copy';
import type { QuickLogToast, StreakCelebration } from '@/hooks/useQuickLog';

import { MilestonePopup } from './MilestonePopup';
import { StreakBanner } from './StreakBanner';

/** Room under a screen's scroll for the floating toast. */
export const TOAST_CLEARANCE = 112;

export interface LogOverlayProps {
  toast: QuickLogToast | null;
  onUndo: () => void;
  celebration: StreakCelebration | null;
  onDismissCelebration: () => void;
}

/**
 * What floats over a screen after a log (SPEC §6.2): the undo toast, and the streak
 * banner or the milestone popup. Today and the Dashboard both draw it, from
 * `useQuickLog`'s state passed through their hooks.
 */
export function LogOverlay({ toast, onUndo, celebration, onDismissCelebration }: LogOverlayProps) {
  return (
    <>
      {toast != null && (
        <Toast
          title={toast.message}
          lines={[toast.detail, toast.sub]}
          actionLabel={UNDO_TOAST_COPY.undo}
          onAction={onUndo}
        />
      )}
      {celebration?.kind === 'banner' && (
        <StreakBanner celebration={celebration} onDismiss={onDismissCelebration} />
      )}
      {celebration?.kind === 'milestone' && (
        <MilestonePopup celebration={celebration} onDismiss={onDismissCelebration} />
      )}
    </>
  );
}
