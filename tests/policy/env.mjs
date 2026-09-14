/**
 * `.env.local` 을 읽어 자격증명을 꺼낸다. 없으면 **던진다.**
 *
 * 건너뛰지 않는 것이 요점이다. 자격증명이 없을 때 조용히 skip 하는 스위트는 green 을
 * 보고하면서 아무것도 증명하지 않는다 — 이 저장소가 반복해서 겪은 실패이고(#33 · #35),
 * RLS 처럼 경계 전체가 걸린 곳에서는 가장 비싼 실패다.
 *
 * **비밀 키(구 service_role)는 쓰지 않는다.** 그 키는 RLS 를 통째로 우회하므로 정책을
 * 검증하는 스위트가 들고 있을 물건이 아니다. 대신 사람이 미리 만들어 둔 계정 두 개로
 * 브라우저와 **똑같은 경로**(publishable key + 비밀번호 로그인)를 탄다.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readEnvLocal() {
  let raw;
  try {
    raw = readFileSync(resolve(ROOT, '.env.local'), 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const fromFile = readEnvLocal();

const SETUP = [
  '계정 두 개는 사람이 콘솔에서 만든다 (에이전트가 만들 수 없다 — 만들려면 RLS 를',
  '우회하는 비밀 키가 필요하고, 그 키는 이 스위트가 들고 있어서는 안 된다):',
  '  Supabase 대시보드 › Authentication › Users › Add user',
  '  → "Auto Confirm User" 를 **체크**한다 (프로젝트의 mailer_autoconfirm 이 꺼져 있어',
  '     확인하지 않으면 로그인이 안 된다).',
  '그리고 .env.local 에 네 값을 넣는다 — 커밋되지 않는다 (.gitignore 의 `.env*.local`):',
  '  RLS_TEST_A_EMAIL= / RLS_TEST_A_PASSWORD= / RLS_TEST_B_EMAIL= / RLS_TEST_B_PASSWORD=',
].join('\n  ');

function required(name, why) {
  const value = process.env[name] ?? fromFile[name];
  if (!value) {
    throw new Error(
      `${name} 이(가) 비어 있다. 정책 테스트는 실제 Supabase 에 붙어야 의미가 있으므로 ` +
        `건너뛰지 않고 여기서 실패한다.\n  용도: ${why}\n\n  ${SETUP}`,
    );
  }
  return value;
}

export const SUPABASE_URL = required('EXPO_PUBLIC_SUPABASE_URL', '프로젝트 엔드포인트');
export const PUBLISHABLE_KEY = required(
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  '브라우저가 쓰는 것과 같은 키 (구 anon key). 정책은 이 키 위에서 검증돼야 한다.',
);

/** A 와 B. 둘 다 오래 사는 계정이고 소유자는 사람이다 — 이 스위트는 만들지도 지우지도 않는다. */
export const ACCOUNTS = {
  A: {
    email: required('RLS_TEST_A_EMAIL', '교차 접근을 **시도하는** 쪽 (A)'),
    password: required('RLS_TEST_A_PASSWORD', 'A 의 비밀번호'),
  },
  B: {
    email: required('RLS_TEST_B_EMAIL', '행을 **지켜야 하는** 쪽 (B)'),
    password: required('RLS_TEST_B_PASSWORD', 'B 의 비밀번호'),
  },
};
