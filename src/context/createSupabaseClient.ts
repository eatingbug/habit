import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { CONFIG_MISSING_NOTE } from '@/config/copy';

/**
 * 환경변수를 Supabase 클라이언트로 바꾸는 유일한 곳 — ADR-0005 의 서버 전용 전환이
 * 실제로 시작되는 지점이다.
 *
 * `src/context` 에 사는 이유: 이 층이 "자기가 어느 플랫폼 위에서 도는지 알아도 되는
 * 유일한 층" 이라고 `src/__tests__/architecture.test.ts` 의 docblock 이 적어 뒀고,
 * env 를 읽는 것도 같은 종류의 바깥 세상 읽기다.
 * `SupabaseRepository` 는 클라이언트를 **주입받으므로** `src/data` 는 env 도 플랫폼도
 * 모른 채 남는다.
 *
 * 이름은 `tests/policy/env.mjs` 가 이미 쓰는 것과 **같다**. 정책 테스트와 앱이 같은
 * 프로젝트·같은 키를 보게 하는 것이 이름을 공유하는 이유다. 값은 `.env.local` 에 있고
 * `.gitignore` 의 `.env*.local` 이 막는다.
 *
 * 값이 없으면 **읽을 수 있는 에러로 죽는다.** 빈 문자열로 만든 클라이언트는 로그인
 * 실패로만 드러나고 원인을 가린다 — 잘못된 URL 에 붙는 것과 구분이 되지 않는다.
 *
 * 모듈 최상위가 아니라 함수 안에서 읽는다: import 만으로 죽으면 세션을 보지 않는
 * 경로(테스트가 `RepositoryProvider repository={...}` 로 쓰는 그 경로)까지 같이 죽는다.
 *
 * 한 번 만들고 재사용한다. 호출마다 새 클라이언트를 만들면 `onAuthStateChange` 구독과
 * 토큰 갱신 타이머가 겹쳐 도는 GoTrueClient 가 여러 개 생긴다.
 */
let client: SupabaseClient | null = null;

export function createSupabaseClient(): SupabaseClient {
  if (client != null) return client;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    // 문구가 `copy.ts` 에 있는 이유: 이 에러는 로그로 끝나지 않고 `SessionProvider` 가
    // 받아 **화면에 그대로 그린다**. 흰 화면 대신 보여 줄 것이 있어야 하기 때문이다.
    throw new Error(CONFIG_MISSING_NOTE);
  }

  // **auth 옵션을 하나도 넘기지 않는 것이 결정이다.** 기본값이 웹 전용 로그인에 그대로
  // 맞기 때문이고, 맞지 않는 값을 모르고 쓰는 것과 구분되도록 여기 적어 둔다
  // (`@supabase/supabase-js` 의 `DEFAULT_AUTH_OPTIONS` 와 `@supabase/auth-js` 의
  // `GoTrueClient` 생성자에서 직접 읽었다):
  //
  //   - `persistSession: true` — 새로고침해도 세션이 남는다. 게이트가 매번 로그인을
  //     요구하지 않으려면 이게 참이어야 한다.
  //   - `storage` — 넘기지 않으면 `localStorage` 를, 못 쓰면 메모리 어댑터를 쓴다.
  //     웹에서 우리가 원하는 그 저장소다. 네이티브용 저장소를 심지 않는 이유는 네이티브에서
  //     로그인 자체가 불가능하기 때문이다(`SessionContext.signIn` 의 주석) — 쓸 수 없는
  //     경로를 위한 코드는 짓지 않는다.
  //   - `detectSessionInUrl: true` — 카카오에서 돌아온 리다이렉트 URL 의 토큰을 주워
  //     세션으로 만든다. 이게 거짓이면 로그인이 끝나고도 로그인 화면으로 돌아온다.
  //   - `autoRefreshToken: true` — 만료 전에 갱신한다. 갱신은 `userId` 를 바꾸지 않으므로
  //     `RepositoryProvider` 의 저장소는 그대로 유지된다.
  //   - `flowType: 'implicit'` — 기본값을 **그대로 둔다.** pkce 로 바꾸면 더 안전하지만,
  //     카카오 provider 가 아직 설정되지 않아 이 티켓에서는 어느 쪽도 실제로 돌려볼 수
  //     없다. 검증할 수 없는 변경은 하지 않는다.
  client = createClient(url, publishableKey);
  return client;
}
