import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DetailMenuItem } from '@/hooks/useHabitDetail';
import { RADIUS, TAP_TARGET, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The ⋯ menu (SPEC §6.5, `ReDetailEstablished`'s `.menu`): a 200-wide box under the ⋯
 * button with one 48-tall row per item. A `scrim` lies behind it (§6.0 Visual rules);
 * a tap on it closes the menu. In dark it has no shadow and an `edge` outline.
 */
export function MoreMenu({
  items,
  top,
  onPick,
  onClose,
}: {
  items: DetailMenuItem[];
  /** The menu's top edge in the window, just under the ⋯ button. */
  top: number;
  onPick: (key: DetailMenuItem['key']) => void;
  onClose: () => void;
}) {
  const { redesign } = useTheme();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: redesign.scrim }]}
        onPress={onClose}
        accessible={false}
      />
      <View
        accessibilityRole="menu"
        style={[
          styles.menu,
          { top, backgroundColor: redesign.surface, borderColor: redesign.edge, boxShadow: redesign.lift },
        ]}
      >
        {items.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => onPick(item.key)}
            accessibilityRole="menuitem"
            style={({ pressed }) => [styles.item, pressed && { backgroundColor: redesign.surface2 }]}
          >
            <Text style={[TYPE.body, styles.text, { color: redesign[item.ink] }]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // `.menu` — `right:16px; width:200px; padding:6px; border:2px; --r-md`.
  menu: { position: 'absolute', right: 16, width: 200, padding: 6, borderWidth: 2, borderRadius: RADIUS.md },
  item: { minHeight: TAP_TARGET, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10 },
  text: { fontWeight: '700' },
});
