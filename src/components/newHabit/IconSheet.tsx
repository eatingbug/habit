import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Sheet } from '@/components/re';
import { RADIUS, TAP_TARGET } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface IconSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: { icon: string; selected: boolean }[];
  /** The word of the button that clears the pick (`null`). */
  clearLabel: string;
  onPick: (icon: string | null) => void;
}

/**
 * The habit icon picker (§6.6). A grid of emoji `.pick` boxes on the shared `Sheet`, and
 * one button that goes back to the stat's icon. A pick closes the sheet.
 */
export function IconSheet({ visible, onClose, title, options, clearLabel, onPick }: IconSheetProps) {
  const { redesign } = useTheme();

  function pick(icon: string | null) {
    onPick(icon);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.grid}>
        {options.map(({ icon, selected }) => (
          <Pressable
            key={icon}
            onPress={() => pick(icon)}
            accessibilityRole="button"
            accessibilityLabel={icon}
            accessibilityState={{ selected }}
            style={[
              styles.cell,
              selected
                ? { backgroundColor: redesign.accentTint, borderColor: redesign.accent }
                : { backgroundColor: redesign.surface, borderColor: redesign.border },
            ]}
          >
            <Text style={styles.emoji}>{icon}</Text>
          </Pressable>
        ))}
      </View>
      <Button label={clearLabel} variant="line" block onPress={() => pick(null)} />
    </Sheet>
  );
}

const CELL = 56;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: CELL,
    height: CELL,
    minWidth: TAP_TARGET,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 26, lineHeight: 32 },
});
