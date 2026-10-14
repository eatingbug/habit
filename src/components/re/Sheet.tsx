import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ICON_LABELS } from '@/config/copy';
import { COLUMN_MAX_WIDTH, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { IconButton } from './IconButton';

export interface SheetProps {
  visible: boolean;
  /** Called by the close button, a tap on the `scrim` and the system back gesture. */
  onClose: () => void;
  /** The sheet title (`title` type). */
  title: string;
  /** A muted `label` line above the title, e.g. the habit or the date. */
  eyebrow?: string;
  /** Drawn on the title line after the title, e.g. "지금 6쪽" or a `HelpTip`. */
  titleAside?: ReactNode;
  children: ReactNode;
}

/**
 * The bottom sheet (SPEC §6.0, `.sheet`): it rises from the bottom over a `scrim`, with
 * a grab handle, a head with the title and a close button, and the body below.
 * Record, skip reason, 끄적이기, stat and confirm sheets all use it.
 *
 * In dark there is no shadow; the sheet carries an `edge` outline (§6.0 Visual rules).
 * The body scrolls when it is taller than the screen allows.
 */
export function Sheet({ visible, onClose, title, eyebrow, titleAside, children }: SheetProps) {
  const { redesign } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: redesign.scrim }]}
          onPress={onClose}
          accessible={false}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: redesign.surface,
              borderColor: redesign.edge,
              paddingBottom: 32 + insets.bottom,
            },
          ]}
        >
          <View style={[styles.grab, { backgroundColor: redesign.border }]} />
          <View style={styles.head}>
            <View style={styles.grow}>
              {eyebrow != null && <Text style={[TYPE.label, { color: redesign.muted }]}>{eyebrow}</Text>}
              <View style={styles.titleLine}>
                <Text style={[TYPE.title, { color: redesign.text }]} accessibilityRole="header">
                  {title}
                </Text>
                {titleAside}
              </View>
            </View>
            <IconButton icon={X} accessibilityLabel={ICON_LABELS.close} onPress={onClose} />
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  // `.sheet` — `border-radius:28px 28px 0 0; padding:12px 20px 32px; gap:12px`.
  // The `Modal` draws outside the root column, so the sheet takes the column width again.
  sheet: {
    width: '100%',
    maxWidth: COLUMN_MAX_WIDTH,
    alignSelf: 'center',
    maxHeight: '90%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 2,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 12,
  },
  grab: { width: 40, height: 5, borderRadius: 9, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  body: { flexGrow: 0 },
  bodyContent: { gap: 12 },
});
