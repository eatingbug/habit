import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

/** 글 모음 — SPEC §6.4. An empty tab until the 글 모음 ticket fills it (#126). */
export default function Journal() {
  const { redesign } = useTheme();
  return <View style={[styles.fill, { backgroundColor: redesign.bg }]} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
