/**
 * 의존성 0개의 Supabase 클라이언트 — PostgREST 와 GoTrue 는 그냥 HTTP 다.
 *
 * `@supabase/supabase-js` 를 쓰지 않는 이유: (1) #50 이 고를 클라이언트를 여기서 미리
 * 정해 버리지 않는다, (2) package.json 의 의존성을 건드리지 않으므로 "앱 코드를 안
 * 건드린다"가 문자 그대로 참이 된다.
 *
 * **쓰는 키는 publishable key 하나뿐이다.** 브라우저가 타는 경로와 같다.
 */
import { PUBLISHABLE_KEY, SUPABASE_URL } from './env.mjs';

async function call(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${token ?? PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, body: json };
}

/** PostgREST. `return=representation` 이라 update/delete 가 **실제로 바뀐 행**을 돌려준다. */
export function rest(path, opts = {}) {
  return call(`/rest/v1/${path}`, {
    ...opts,
    headers: { Prefer: 'return=representation', ...(opts.headers ?? {}) },
  });
}

/**
 * 비밀번호로 로그인해 access token 과 그 사람의 `sub`(= `auth.uid()`) 를 얻는다.
 *
 * `sub` 를 토큰에서 직접 꺼내는 이유: 정책이 보는 값이 바로 그것이고, 다른 경로로
 * 사용자 id 를 알아낼 방법이 (비밀 키 없이는) 없다.
 */
export async function signIn({ email, password }) {
  const res = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  if (!res.ok || !res.body?.access_token) {
    throw new Error(
      `로그인 실패 (${res.status}): ${JSON.stringify(res.body)}\n` +
        `  계정이 실제로 있고 **확인(confirmed)** 됐는지 확인할 것 — 대시보드에서 만들 때 ` +
        `"Auto Confirm User" 를 체크하지 않으면 확인되지 않은 계정이 만들어진다.\n` +
        `  이 스위트는 이메일 비밀번호 로그인이 **켜져 있어야** 돈다 (아래 rls.test.mjs 머리말 참조).`,
    );
  }
  const { access_token: token } = res.body;
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  return { id: claims.sub, token };
}
