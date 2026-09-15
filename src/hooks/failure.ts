import { useState } from 'react';

/**
 * 실패한 동작 하나 — **무엇이 실패했는지와 다시 해 볼 방법**, 둘 다.
 *
 * `message` 만으로는 부족하다는 것이 이 타입의 요점이다. 서버가 단일 원본이 된 뒤
 * (ADR-0005) 실패는 오프라인·토큰 만료·프로젝트 정지처럼 **잠깐 뒤에는 되는** 종류가
 * 대부분이고, 다시 시도할 손잡이가 없으면 사용자가 할 수 있는 일은 앱을 껐다 켜는 것뿐이다.
 */
export interface Failure {
  message: string;
  retry: () => void;
}

/**
 * 실패를 들고 있는 한 칸. 훅마다 `useState<Failure | null>` 과 같은 모양의 try/catch 를
 * 다시 쓰는 대신 여기 한 번 적는다 — 네 훅이 쓴다.
 *
 * **성공은 실패를 지운다.** 다시 시도가 통했는데 배너가 남아 있으면 그것도 거짓말이다.
 */
export function useFailure() {
  const [failure, setFailure] = useState<Failure | null>(null);

  /** 읽기처럼 자기 취소 규약(`cancelled`)을 가진 자리에서 직접 기록한다. */
  function report(message: string, retry: () => void) {
    setFailure({ message, retry });
  }

  function clear() {
    setFailure(null);
  }

  /**
   * 쓰기 한 번. 실패하면 **그 쓰기 그대로** 가 다시 시도의 내용이 된다 — 사용자가 같은
   * 조작을 처음부터 다시 할 필요가 없다.
   *
   * 선언문으로 쓴 것은 자기 자신을 다시 부르기 위해서다. 객체 메서드로 두면 호출자가
   * 구조분해한 순간 `this` 가 사라져 다시 시도가 터진다.
   */
  async function attempt(message: string, run: () => Promise<void>): Promise<void> {
    setFailure(null);
    try {
      await run();
    } catch {
      setFailure({ message, retry: () => void attempt(message, run) });
    }
  }

  return { failure, report, clear, attempt };
}
