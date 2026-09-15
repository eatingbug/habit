import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { createSupabaseClient } from './createSupabaseClient';

/**
 * 세 상태를 **하나의 유니온**으로 둔다 — ADR-0005 가 서버를 단일 원본으로 만든 뒤
 * `RepositoryProvider` 가 답해야 하는 질문이 정확히 이 셋이기 때문이다: 아직 모른다 /
 * 로그인 안 됐다 / 이 사람이다. `userId` 는 `signedIn` 일 때만 존재하므로 "로그인은
 * 안 됐는데 id 는 있다" 같은 상태를 타입이 못 만들게 한다.
 */
export type Session =
  | { status: 'checking' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; userId: string };

export interface SessionValue {
  session: Session;
  /**
   * 카카오 OAuth 를 연다. **웹에서만 동작한다** — `@supabase/auth-js` 의
   * `_handleProviderSignIn` 은 브라우저가 아니면 URL 만 돌려주고 아무 데도 가지 않으므로,
   * 네이티브에서 이 함수를 버튼에 물리면 탭이 조용히 아무 일도 안 한다. 네이티브 OAuth 는
   * 이 티켓 범위가 아니고, 로그인 화면이 `signInCopy` 로 그 사실을 말한다.
   */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

/**
 * `null` 을 기본값으로 두는 것이 계약의 일부다: `RepositoryProvider` 는 이 컨텍스트를
 * **직접** 읽고, 없으면 `repository` prop 경로로 간다. 훅 테스트들은 `SessionProvider`
 * 를 세우지 않는다.
 */
export const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'checking' });

  useEffect(() => {
    // `getSession()` 을 따로 부르지 않는다: `onAuthStateChange` 는 구독 즉시 저장된
    // 세션(또는 없음)으로 `INITIAL_SESSION` 을 한 번 쏘므로, 최초 확인과 이후 변화가
    // 한 경로로 들어온다. 두 경로를 두면 둘이 어긋나는 순간이 깜빡임이 된다.
    //
    // **읽기가 실패해도 한 번은 온다.** `GoTrueClient` 의 초기화는 저장된 세션을 읽다
    // 실패하면 `INITIAL_SESSION` 을 `null` 로 쏜다 — 즉 아래 콜백은 어느 쪽이든 반드시
    // 불리고, `checking` 은 영원히 남지 않는다. AC 2 가 요구하는 "빈 화면 없음" 은
    // 타이머가 아니라 이 성질이 지킨다.
    const { data } = createSupabaseClient().auth.onAuthStateChange((_event, next) => {
      setSession(
        next?.user == null
          ? { status: 'signedOut' }
          : { status: 'signedIn', userId: next.user.id },
      );
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      async signIn() {
        const { error } = await createSupabaseClient().auth.signInWithOAuth({
          provider: 'kakao',
          options: {
            // **`scopes` 를 넘기지 않는다 — 넘겨도 소용이 없다는 것을 실측했다.**
            //
            // 티켓은 `account_email` 을 쓰지 않기로 했지만 그 결정은 클라이언트에서
            // 집행할 수 없다. Supabase 의 kakao provider 가 scope 를 **고정으로 박아
            // 넣고**, 우리가 보낸 값은 교체가 아니라 뒤에 **덧붙는다**:
            //
            //   scopes 없이:  `account_email profile_image profile_nickname`
            //   'profile_nickname profile_image' 를 넘기면:
            //                 `account_email profile_image profile_nickname
            //                  profile_nickname profile_image`
            //
            // (`GET /auth/v1/authorize?provider=kakao` 의 302 Location 에서 읽었다.)
            // 즉 넘기는 쪽은 `account_email` 을 지우지 못하고 중복만 만든다. 아무것도
            // 하지 않는 설정을 "명시했다" 는 주석과 함께 두는 것이 더 나쁘므로 지운다.
            //
            // 이메일을 실제로 안 받으려면 카카오 동의항목에서 `account_email` 을 선택
            // 동의로 두고 Supabase 의 "Allow users without an email" 을 켜 두면 된다 —
            // 둘 다 콘솔 쪽이다. #55 가 이 근처를 다시 본다.
            // 지금 열려 있는 주소로 돌아온다. Supabase 프로젝트에 고정된 Site URL 로만
            // 돌아가면 Vercel preview 배포에서 로그인이 끝나지 않는다 (AC 4). 이 주소는
            // Supabase 의 Redirect URLs 허용목록에도 들어가 있어야 한다.
            ...(Platform.OS === 'web' ? { redirectTo: window.location.origin } : {}),
          },
        });
        if (error) throw error;
      },
      async signOut() {
        const { error } = await createSupabaseClient().auth.signOut();
        if (error) throw error;
      },
    }),
    [session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** 세션이 **있어야만** 하는 곳(게이트, 로그인 화면, 로그아웃 버튼)이 쓰는 읽기. */
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value == null) {
    throw new Error('useSession must be used inside a SessionProvider');
  }
  return value;
}
