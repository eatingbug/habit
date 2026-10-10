import fs from 'node:fs';

function page(css, body, tail = '', theme = '') {
  return `<!doctype html>
<html${theme ? ` data-theme="${theme}"` : ''}>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
${css.trim()}
  </style>
</helmet>
${body.trim()}
</x-dc>
${tail}</body>
</html>
`;
}

function write(file, out) {
  fs.writeFileSync(file, out);
  console.log('built', file, out.length);
}

// 리디자인 (#89): 정적 아트보드. 파트 하나에서 라이트와 다크 두 장을 만든다.
const reCss = fs.readFileSync('_tokens.redesign.css', 'utf8');
const icons = fs.readFileSync('parts/redesign/_icons.svg', 'utf8').trim();
const reNames = fs.readdirSync('parts/redesign').filter(f => f.endsWith('.body.html')).map(f => f.replace('.body.html',''));
for (const n of reNames) {
  const body = `${icons}\n${fs.readFileSync(`parts/redesign/${n}.body.html`, 'utf8').trim()}`;
  write(`${n}.dc.html`, page(reCss, `<div data-theme="light">\n${body}\n</div>`, '', 'light'));
  write(`${n}.dark.dc.html`, page(reCss, `<div data-theme="dark">\n${body}\n</div>`, '', 'dark'));
}
