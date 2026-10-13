import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { RADIUS, TAP_TARGET } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface IconButtonProps {
  icon: LucideIcon;
  /** Required: an icon-only button has no visible word (§6.0 Icons). */
  accessibilityLabel: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * `.iconbtn` (`design/_tokens.redesign.css`) — a 24px Lucide line icon in `muted`, on a
 * `TAP_TARGET` square. Redesign tokens only. Used by ⚙️ and back.
 */
export function IconButton({ icon: Icon, accessibilityLabel, onPress, style }: IconButtonProps) {
  const { redesign } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.button, style]}
    >
      <Icon size={24} strokeWidth={2} color={redesign.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
