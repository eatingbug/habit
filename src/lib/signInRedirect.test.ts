import { signInErrorFromUrl } from './signInRedirect';

/**
 * 실제로 받은 주소다 — 카카오 동의까지 성공한 뒤 Supabase 가 코드 교환에 실패했을 때.
 */
const REAL_FAILURE =
  'https://habit-4p8k5v35g-eatingbugs-projects-994392c4.vercel.app/' +
  '?error=server_error&error_code=unexpected_failure' +
  '&error_description=Unable+to+exchange+external+code%3A+Y_nD' +
  '#error=server_error&error_code=unexpected_failure' +
  '&error_description=Unable+to+exchange+external+code%253A+Y_nD&sb=';

describe('signInErrorFromUrl — 왕복이 실패한 것을 화면이 알 수 있게 한다 (#51)', () => {
  it('실제로 받은 실패 주소에서 이유를 읽는다', () => {
    expect(signInErrorFromUrl(REAL_FAILURE)).toBe('Unable to exchange external code: Y_nD');
  });

  /** 프래그먼트가 정본인 흐름도 있다. 한쪽만 보면 조용히 아무것도 못 읽는다. */
  it('프래그먼트에만 실려 있어도 읽는다', () => {
    expect(signInErrorFromUrl('https://x.test/#error_description=Kakao+said+no')).toBe(
      'Kakao said no',
    );
  });

  /** 설명이 없어도 침묵보다는 코드가 낫다. */
  it('설명이 없으면 코드라도 돌려준다', () => {
    expect(signInErrorFromUrl('https://x.test/?error=access_denied')).toBe('access_denied');
  });

  it('성공한 왕복과 평범한 주소에서는 아무것도 말하지 않는다', () => {
    expect(signInErrorFromUrl('https://x.test/#access_token=abc&token_type=bearer')).toBeNull();
    expect(signInErrorFromUrl('https://x.test/')).toBeNull();
    expect(signInErrorFromUrl('not a url')).toBeNull();
  });
});
