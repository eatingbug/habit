import { StyleSheet, Text, View } from 'react-native';

import { SKIP_REASON_LABELS } from '@/config/copy';
import type { SkipReason } from '@/models';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_SIZE, SPACE } from '@/theme/tokens';

import { Button } from './Button';

export interface SkipReasonChipsProps {
  /** The row's own lead-in — Today's `건너뛰기`, the Dashboard's `오늘 못 했어요 · 왜?`. */
  label: string;
  /** The reason already representing today, if any — `row.skipReasonToday`. */
  selected?: SkipReason;
  /**
   * Blocks the chips while a write is in flight. Today's composer passes its
   * `saving` flag because the row stays on screen across the write; the Dashboard
   * passes nothing because picking a reason collapses its disclosure in the same
   * commit, so the chips are gone before a second tap could land.
   */
  disabled?: boolean;
  onPick: (reason: SkipReason) => void;
  /** Disambiguates each chip's accessible name across rows — see below. */
  habitName: string;
}

/**
 * `.skiprow` — the four reason chips (SPEC §6.2 B5), one tap each.
 *
 * **One component for both surfaces.** Today's composer and the Dashboard's
 * long-press both render this same row, so it lives here rather than being copied
 * into two screens — the same reason `ToastOverlay` is shared.
 *
 * The chips come from `SKIP_REASON_LABELS`' own key order, so a reason can never be
 * declared and then quietly left off the row.
 *
 * The chips are `Button variant="ghost"` (the canvas's `btn ghost` in
 * `design/parts/RowSkip.body.html:21–24`), flipping to `"sel"` for the reason already
 * recorded. `Chip` is deliberately not used: it is a non-pressable `View`, and these
 * are controls.
 *
 * `accessibilityLabel` carries the habit's name because the Dashboard renders one of
 * these rows *per habit* — four controls all named `깜빡함` would leave a screen
 * reader user unable to tell which habit they are answering for. An a11y label is an
 * affordance description, not screen copy, so the canvas citation rule (which covers
 * visible strings) does not reach it.
 */
export function SkipReasonChips({
  label,
  selected,
  disabled,
  onPick,
  habitName,
}: SkipReasonChipsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <Text style={[styles.lbl, { color: colors.faint }]}>{label}</Text>
      {(Object.keys(SKIP_REASON_LABELS) as SkipReason[]).map((reason) => {
        const chipLabel = SKIP_REASON_LABELS[reason];
        return (
          <Button
            key={reason}
            label={chipLabel}
            accessibilityLabel={`${habitName} 못 함 · ${chipLabel}`}
            variant={selected === reason ? 'sel' : 'ghost'}
            // §6.0's 44px minimum. These chips take `tap` where B2's quick-add chips
            // deliberately do not: those only *stage* an amount, so a mis-tap costs
            // nothing, whereas one tap here **writes** a skip row.
            tap
            disabled={disabled}
            onPress={() => onPick(reason)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Four chips plus the label overflow a narrow row, so they wrap rather than
  // squeezing each other below a legible width.
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md - 2, flexWrap: 'wrap' },
  // The same treatment as Today's other row lead-ins (`styles.lbl` there).
  lbl: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.4 },
});
