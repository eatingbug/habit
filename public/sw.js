/**
 * 동일 출처 문서만, 그것도 네트워크 우선으로 캐시한다. 기록 데이터는 캐시하지 않는다.
 *
 * ADR-0005(`docs/adr/0005-server-is-the-single-source-of-truth.md`) 가 Supabase
 * Postgres 하나를 진실 원본으로 정했다. 캐시된 기록을 진짜인 척 보여 주면 사용자는
 * 자기가 옛 데이터를 보고 있다는 것을 알 방법이 없고, 그건 그 결정을 조용히 뒤집는 일이다.
 *
 * 그래서 예외 목록도 URL 패턴 목록도 두지 않는다 — 목록이 없으면 목록이 틀릴 일도 없다.
 * 대신 적용 범위를 한 줄로 선언한다: 동일 출처만 다룬다. Supabase 는 다른 출처이므로
 * 기록 요청은 이 worker 가 가로채지 않는다 — 브라우저가 평소대로 네트워크로 보낸다.
 *
 * 셸조차 네트워크 우선인 이유: 정적 export 의 `index.html` 에는 해시가 없다. 캐시
 * 우선으로 잡으면 사용자가 옛 빌드에 갇히는데, 그건 흰 화면과 달리 눈에 띄지도 않는다.
 * 캐시는 네트워크가 죽었을 때만 꺼내 쓰는 비상용이다.
 *
 * 다만 캐시에 셸만 들어가지는 않는다. `vercel.json` 의 포괄 rewrite 가 없는 경로를
 * `+not-found` 로 보내면서 **200 으로** 응답한다(측정: `curl -o /dev/null -w '%{http_code}
 * %{content_type}' https://habit-ochre-zeta.vercel.app/nonexistent-xyz` → `200 text/html`).
 * 그래서 아래 `response.ok` 가 존재하지 않는 동일 출처 URL 도 걸러내지 못하고, 캐시에는
 * not-found 문서가 임의의 경로로 함께 들어갈 수 있다. 그걸 감수한다 — 목록으로 막으려는
 * 순간 틀릴 목록이 생기고, 들어가는 것은 어차피 동일 출처의 셸 모양 문서일 뿐 기록
 * 데이터가 아니다. AC 6 이 기대는 성질은 동일 출처 가드가 Supabase 를 막는다는 것이고,
 * 그 성질은 그대로다.
 *
 * 그래서 "앱인데 왜 오프라인에서 기록이 안 보이나" 의 답은: 그게 의도다.
 */

const CACHE = 'habiquest-shell-v1';

self.addEventListener('install', () => {
  // 새 worker 가 옛 worker 뒤에서 대기하면 배포가 다음 방문까지 반영되지 않는다.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      // 이미 열려 있는 탭도 새 worker 가 곧바로 맡는다.
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 실패 응답까지 넣어 두면 오프라인에서 그 오류 페이지가 셸 행세를 한다.
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
