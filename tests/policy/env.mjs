/**
 * `.env.local` 을 읽어 자격증명을 꺼낸다. 없으면 **던진다.**
 *
 * 건너뛰지 않는 것이 요점이다. 자격증명이 없을 때 조용히 skip 하는 스위트는 green 을
 * 보고하면서 아무것도 증명하지 않는다 — 이 저장소가 반복해서 겪은 실패이고(#33 · #35),
 * RLS 처럼 경계 전체가 걸린 곳에서는 가장 비싼 실패다.
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

function required(name, why) {
  const value = process.env[name] ?? fromFile[name];
  if (!value) {
    throw new Error(
      `${name} 이(가) 없다. 정책 테스트는 실제 Supabase 에 붙어야 의미가 있으므로 ` +
        `건너뛰지 않고 여기서 실패한다.\n  용도: ${why}\n` +
        `  .env.local 에 넣거나 환경변수로 주면 된다. **커밋하지 말 것** ` +
        `(.gitignore 의 \`.env*.local\`).`,
    );
  }
  return value;
}

export const SUPABASE_URL = required('EXPO_PUBLIC_SUPABASE_URL', '프로젝트 엔드포인트');
export const PUBLISHABLE_KEY = required(
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  '브라우저가 쓰는 것과 같은 키 (구 anon key). 정책은 이 키 위에서 검증돼야 한다.',
);
export const SECRET_KEY = required(
  'SUPABASE_SECRET_KEY',
  'Admin API 로 테스트 사용자 A·B 를 만들고 끝나고 지운다 (구 service_role key). ' +
    '로컬 전용이다 — Vercel 에 넣지 않는다.',
);
