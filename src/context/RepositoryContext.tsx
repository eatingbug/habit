import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { SupabaseRepository, type HabitRepository } from '@/data';
import { deviceUtcOffsetMinutes } from '@/lib/device';

import { createSupabaseClient } from './createSupabaseClient';
import { SessionContext } from './SessionContext';

/**
 * The app's single injection point for persistence — SPEC §8.
 *
 * **"한 줄 교체" 는 여기서 끝났다.** §5.3 은 이 파일의 한 줄을 바꾸면 백엔드가 바뀐다고
 * 약속했지만, ADR-0005 (`docs/adr/0005-server-is-the-single-source-of-truth.md` 의
 * `## "한 줄 교체" 약속이 깨진다`) 가 적은 대로 인증이 생기는 순간 그 약속은 깨진다:
 * 저장소를 만들려면 세션이 필요하고, 세션은 비동기로 확인되며, 로그인·로그아웃마다
 * 저장소가 다시 만들어져야 한다. 깨지지 않은 부분도 그 ADR 이 정확히 적어 뒀다 —
 * `HabitRepository` 인터페이스가 불변이므로 **도메인과 UI 는 정말로 바뀌지 않았다.**
 *
 * 세션 확인 중 / 로그인 안 됨 / 로그인 됨의 분기는 이 공급자가 아니라 `app/_layout.tsx`
 * 의 게이트가 진다. 이 공급자는 **로그인된 뒤에만** 마운트되므로, 로그아웃은
 * `<Stack>` 을 통째로 언마운트해 이전 사용자의 화면과 로드 상태를 같이 없앤다.
 *
 * Tests inject their own instance through `repository` (a `LocalRepository` over
 * `MemoryKV`), which is why no hook ever constructs a repository itself.
 */
const RepositoryContext = createContext<HabitRepository | null>(null);

export function RepositoryProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository?: HabitRepository;
}) {
  /**
   * `useSession()` 이 아니라 컨텍스트를 **직접** 읽는다. 훅 테스트들은 `repository` prop
   * 만 주입하고 `SessionProvider` 를 세우지 않으므로, 없을 때 throw 하는 읽기를 쓰면 그
   * 테스트들이 전부 죽는다. 훅은 조건부로 부를 수 없으니 분기는 값 쪽에서 한다.
   */
  const session = useContext(SessionContext)?.session;
  const userId = session?.status === 'signedIn' ? session.userId : null;

  const value = useMemo(() => {
    if (repository != null) return repository;
    if (userId == null) {
      throw new Error(
        'RepositoryProvider 가 세션 없이 마운트됐습니다 — app/_layout.tsx 의 게이트는 ' +
          '로그인된 뒤에만 이 공급자를 세웁니다.',
      );
    }
    return new SupabaseRepository(createSupabaseClient(), deviceUtcOffsetMinutes());
  }, [repository, userId]);

  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): HabitRepository {
  const repository = useContext(RepositoryContext);
  if (repository == null) {
    throw new Error('useRepository must be used inside a RepositoryProvider');
  }
  return repository;
}
