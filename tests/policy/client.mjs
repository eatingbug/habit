/**
 * 의존성 0개의 Supabase 클라이언트 — PostgREST 와 GoTrue 는 그냥 HTTP 다.
 *
 * `@supabase/supabase-js` 를 쓰지 않는 이유: (1) #50 이 고를 클라이언트를 여기서 미리
 * 정해 버리지 않는다, (2) package.json 을 건드리지 않으므로 "앱 코드를 안 건드린다"가
 * 문자 그대로 참이 된다.
 */
import { PUBLISHABLE_KEY, SECRET_KEY, SUPABASE_URL } from './env.mjs';

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

/** 비밀 키로 도는 Admin API. 테스트 사용자 생성·삭제에만 쓴다. */
function admin(path, opts = {}) {
  return call(path, {
    ...opts,
    headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, ...(opts.headers ?? {}) },
  });
}

/**
 * GoTrue 는 이메일 도메인을 검증하고 일부를 거부한다 (`example.com` 은 400 "invalid").
 * 어느 도메인을 좋아하는지 미리 맞히는 대신 순서대로 시도한다.
 */
const EMAIL_DOMAINS = ['habitquest-test.internal', 'habitquest.test', 'rls-test.habitquest.app'];

/** 이 접두사로 만든 사용자는 전부 이 스위트의 것이다 — 아래 sweepOrphans 가 알아본다. */
const TEST_EMAIL_PREFIX = 'rls-policy-test-';

/**
 * 확인된 사용자를 만들고 그 사람으로 로그인해 access token 을 얻는다.
 *
 * Admin API 를 쓰는 이유는 `email_confirm: true` 때문이다 — 프로젝트의
 * `mailer_autoconfirm` 이 꺼져 있어서 평범한 signup 은 세션을 주지 않고, 실제 주소로
 * 확인 메일을 보낸다.
 */
export async function createUser() {
  const local = `${TEST_EMAIL_PREFIX}${crypto.randomUUID()}`;
  const password = `pw-${crypto.randomUUID()}`;

  let created;
  const failures = [];
  for (const domain of EMAIL_DOMAINS) {
    created = await admin('/auth/v1/admin/users', {
      method: 'POST',
      body: { email: `${local}@${domain}`, password, email_confirm: true },
    });
    if (created.ok) break;
    failures.push(`${domain} → ${created.status} ${JSON.stringify(created.body)}`);
    created = undefined;
  }
  if (!created) {
    throw new Error(`테스트 사용자 생성 실패 — 모든 도메인이 거부됐다:\n  ${failures.join('\n  ')}`);
  }

  const signedIn = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: created.body.email, password },
  });
  if (!signedIn.ok || !signedIn.body?.access_token) {
    throw new Error(`테스트 사용자 로그인 실패 (${signedIn.status}): ${JSON.stringify(signedIn.body)}`);
  }

  return { id: created.body.id, token: signedIn.body.access_token };
}

/**
 * 이전 실행이 중간에 죽어 남긴 테스트 사용자를 지운다.
 *
 * 매 실행이 새 UUID 를 쓰므로 재실행 자체는 안전하지만, 죽은 실행이 남긴 사용자는
 * 아무도 알아보지 못한 채 `auth.users` 에 영원히 쌓인다. 접두사가 그 표식이다.
 */
export async function sweepOrphans() {
  const res = await admin('/auth/v1/admin/users?per_page=200');
  if (!res.ok) throw new Error(`사용자 목록 조회 실패 (${res.status}): ${JSON.stringify(res.body)}`);
  const orphans = (res.body?.users ?? []).filter((u) => u.email?.startsWith(TEST_EMAIL_PREFIX));
  await Promise.all(orphans.map((u) => deleteUser(u.id)));
  return orphans.length;
}

/** 사용자를 지우면 네 테이블의 `on delete cascade` 가 그 사람 행을 전부 데려간다. */
export async function deleteUser(id) {
  const res = await admin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`테스트 사용자 삭제 실패 (${res.status}): ${JSON.stringify(res.body)}`);
  }
}
