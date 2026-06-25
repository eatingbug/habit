/**
 * Web-only root HTML shell (expo-router). Runs on the server during static web export.
 *
 * Sets the document background to the app's dark base so there is no white flash before
 * React mounts, and disables body scrolling so the RN ScrollViews own scrolling.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: rootStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const rootStyle = `
html, body { background-color: #0c0f16; }
body { overscroll-behavior: none; }
`;
