import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT_SIZE, RADIUS, SPACE } from '@/theme/tokens';

export default function Dashboard() {
  const { colors, preference, toggle } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>대시보드</Text>
        <Pressable
          onPress={toggle}
          style={[styles.toggle, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
        >
          <Text style={[styles.toggleText, { color: colors.muted }]}>
            {preference === 'system' ? '자동' : preference === 'light' ? '라이트' : '다크'}
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.empty, { color: colors.muted }]}>아직 습관이 없습니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: SPACE.xl, gap: SPACE.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '600', letterSpacing: -0.2 },
  toggle: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 1,
  },
  toggleText: { fontSize: FONT_SIZE.sm },
  empty: { fontSize: FONT_SIZE.base },
});
