import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Misconfigured, SessionChecking, SignIn } from '@/components/SignIn';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { SessionProvider, useSession } from '@/context/SessionContext';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function Shell() {
  const { name, colors } = useTheme();
  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen name="today" options={{ title: '오늘' }} />
        <Stack.Screen name="habit/new" options={{ title: '습관 만들기' }} />
        <Stack.Screen name="habit/[id]" options={{ title: '습관' }} />
        <Stack.Screen name="reflect/[id]" options={{ title: '회고' }} />
      </Stack>
    </>
  );
}

/**
 * 세션 게이트 — **조건부 렌더이지 라우트 리다이렉트가 아니다.**
 *
 * 그 선택이 AC 두 개를 공짜로 준다. 리다이렉트 창이 아예 없으므로 확인 중에 깜빡일 화면이
 * 없고(AC 2), 로그아웃은 `<Stack>` 을 통째로 언마운트하므로 이전 사용자의 화면과 그
 * 로드 상태가 같이 사라진다(AC 3) — `useEffect` 가 잘 돌기를 바라는 게 아니라 구조가
 * 보장한다.
 *
 * 세 상태 전부 렌더할 것이 있다. 특히 `checking` 이 빈 화면이 아니어야 한다.
 */
function Gate() {
  const { session } = useSession();

  if (session.status === 'checking') return <SessionChecking />;
  // 로그인 이전의 실패다. 로그인 화면을 보여 주면 누를 때마다 같은 자리에서 다시 죽는다.
  if (session.status === 'misconfigured') return <Misconfigured message={session.message} />;
  if (session.status === 'signedOut') return <SignIn />;

  // 로그인된 뒤에만 세운다 — `RepositoryProvider` 는 세션이 있어야 저장소를 만들 수 있고,
  // 그 저장소는 `userId` 로 키잉돼 있어 사용자가 바뀌면 새로 만들어진다 (§8).
  return (
    <RepositoryProvider>
      <Shell />
    </RepositoryProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </ThemeProvider>
  );
}
