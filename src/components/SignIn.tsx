import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { SESSION_CHECKING_NOTE, SIGN_IN_FAILED_NOTE, signInCopy } from '@/config/copy';
import { useSession } from '@/context/SessionContext';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_SIZE, SPACE } from '@/theme/tokens';

import { Banner } from './Banner';
import { Button } from './Button';
import { Footnote } from './Typography';

/**
 * 로그인 게이트가 그리는 두 화면. `app/_layout.tsx` 의 `Gate` 만이 이것들을 렌더한다.
 *
 * **`app/` 아래가 아니라 여기 사는 이유는 측정한 결과다.** 처음엔 `app/_signIn.tsx` 로
 * 뒀다 — expo-router 가 밑줄로 시작하는 파일을 라우트에서 제외한다는 전제였다.
 * `npx expo export --platform web` 이 그 전제를 반증했다: 정적 라우트 목록에 `/_signIn`
 * 이 그대로 나왔고 `dist/_signIn.html` 이 떨어졌다. `app.json` 의 `typedRoutes: true`
 * 아래에서 그것은 로그인한 상태에서도 URL 로 직접 도달할 수 있는 유령 라우트다 —
 * 게이트가 막는 것은 렌더이지 주소가 아니기 때문이다. `app/` 밖으로 나오면 라우트가 될
 * 방법 자체가 없다.
 *
 * `src/components/index.ts` 의 배럴에는 넣지 않는다: 그 배럴은 `design/_tokens.css` 의
 * 컴포넌트 클래스 하나당 하나씩이라고 자기 docblock 에 적어 뒀고, 이것은 화면이다.
 *
 * 문구도 "로그인이 가능한 플랫폼인가" 라는 판단도 여기 없다. 둘 다 `src/config/copy.ts`
 * 의 `signInCopy` 에 있고, 그래야 테스트가 닿는다 (`jest.config.js` 의 `testMatch` 는
 * `src/**` 뿐이다).
 */

/** 세션을 확인하는 동안. 빈 화면이 아니어야 한다는 것이 AC 2 다. */
export function SessionChecking() {
  const { colors } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.surface }]}>
      <Text style={[styles.notice, { color: colors.muted }]}>{SESSION_CHECKING_NOTE}</Text>
    </View>
  );
}

export function SignIn() {
  const { colors } = useTheme();
  const { signIn } = useSession();
  const copy = signInCopy(Platform.OS);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  /**
   * 실패를 삼키지 않는다. `signIn` 은 카카오로 **떠나는** 동작이라 성공하면 이 화면이
   * 사라지므로, 아무 일도 일어나지 않았다는 것 자체가 유일한 실패 신호다 — 말해 주지
   * 않으면 사용자에게는 먹통인 버튼이다.
   */
  async function onPress() {
    if (starting) return;
    setError(null);
    setStarting(true);
    try {
      await signIn();
    } catch {
      setError(SIGN_IN_FAILED_NOTE);
    } finally {
      setStarting(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface }]}>
      <Text style={[styles.title, { color: colors.text }]}>habiquest</Text>
      <Text style={[styles.lead, { color: colors.text }]}>{copy.lead}</Text>

      {error != null && <Banner>{error}</Banner>}

      {copy.action != null ? (
        <>
          <Button label={copy.action} variant="pri" block onPress={() => void onPress()} />
          <Footnote>{copy.note}</Footnote>
        </>
      ) : (
        <Banner variant="neutral">{copy.note}</Banner>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: SPACE.xxl, gap: SPACE.md },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: '700' },
  lead: { fontSize: FONT_SIZE.md },
  notice: { fontSize: FONT_SIZE.md, textAlign: 'center' },
});
