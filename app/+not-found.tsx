/** Fallback route for unmatched paths. */
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { font, fontSize, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';

export default function NotFound() {
  const styles = useThemedStyles(makeStyles);
  return (
    <>
      <Stack.Screen options={{ title: '찾을 수 없음' }} />
      <View style={styles.center}>
        <Text style={styles.title}>이 화면은 존재하지 않습니다.</Text>
        <Link href="/" style={styles.link}>
          처음으로 가기
        </Link>
      </View>
    </>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
    title: { fontFamily: font.sans, fontWeight: weight.semibold, fontSize: fontSize.title, color: c.text },
    link: { fontFamily: font.mono, fontSize: fontSize.small, color: c.accent },
  });
