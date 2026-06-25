/** Fallback route for unmatched paths. */
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { color, font, fontSize } from '@/theme/tokens';

export default function NotFound() {
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontFamily: font.serifSemiBold, fontSize: fontSize.panelTitle, color: color.ink },
  link: { fontFamily: font.mono, fontSize: fontSize.bodySm, color: color.gold },
});
