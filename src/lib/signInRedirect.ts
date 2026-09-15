/**
 * 카카오에서 돌아온 주소에 실린 실패를 읽는다.
 *
 * **이 함수가 존재하는 이유는 실제로 겪었기 때문이다.** 로그인 왕복이 실패하면 Supabase
 * 는 우리 주소로 되돌려 보내면서 이유를 URL 에 싣는다:
 *
 *   ?error=server_error&error_code=unexpected_failure
 *   &error_description=Unable+to+exchange+external+code%3A+Y_nD
 *
 * 그런데 화면은 그것을 읽지 않으므로 사용자에게는 **로그인 화면이 다시 떴을 뿐**이다 —
 * 카카오까지 다녀와서 동의까지 눌렀는데 아무 일도 안 일어난 것과 구분되지 않는다.
 * 이 티켓이 "조용히 삼켜진 탭" 을 최악의 버그라고 부른 그 모양이 왕복 층에서 재현된다.
 *
 * Supabase 는 같은 값을 **쿼리와 프래그먼트 양쪽에** 싣는다(implicit flow 라 프래그먼트가
 * 정본이다). 둘 다 본다 — 한쪽만 보면 흐름이 바뀔 때 조용히 아무것도 못 읽게 된다.
 */
export function signInErrorFromUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  for (const params of [url.searchParams, new URLSearchParams(url.hash.replace(/^#/, ''))]) {
    const description = params.get('error_description');
    if (description != null && description.length > 0) return description;
    // 설명이 없어도 실패는 실패다. 코드라도 보여 주는 편이 침묵보다 낫다.
    const code = params.get('error_code') ?? params.get('error');
    if (code != null && code.length > 0) return code;
  }
  return null;
}
