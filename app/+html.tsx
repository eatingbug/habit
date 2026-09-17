import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * 정적 export 의 HTML 껍데기. expo 기본 껍데기를 통째로 대체하므로 charset·viewport·
 * `ScrollViewStyleReset` 을 여기서 다시 준다 — 빠뜨리면 standalone 창이 데스크톱 폭으로 뜬다.
 *
 * service worker 등록은 인라인 `<script>` 다. export 산출물을 기본 껍데기와 diff 해서
 * 이 스크립트가 `dist/index.html` 에 그대로 들어가는 것을 확인했다 — 등록이 앱 트리의
 * 하이드레이션 성공에 기대지 않는다는 뜻이고, 그래야 설치 기준이 소리 없이 미달하지 않는다.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <ScrollViewStyleReset />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js'); }); }",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
