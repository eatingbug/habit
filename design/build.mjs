import fs from 'node:fs';
const css = fs.readFileSync('_tokens.css', 'utf8');
const names = fs.readdirSync('parts').filter(f => f.endsWith('.body.html')).map(f => f.replace('.body.html',''));
for (const n of names) {
  const body = fs.readFileSync(`parts/${n}.body.html`, 'utf8');
  const logicPath = `parts/${n}.logic.js`;
  const propsPath = `parts/${n}.props.txt`;
  let tail = '';
  if (fs.existsSync(logicPath)) {
    const props = fs.existsSync(propsPath) ? fs.readFileSync(propsPath,'utf8').trim() : '{}';
    tail = `<script data-dc-script data-props='${props}'>\n${fs.readFileSync(logicPath,'utf8').trim()}\n</script>\n`;
  }
  const out = `<!doctype html>
<html>
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
  fs.writeFileSync(`${n}.dc.html`, out);
  console.log('built', `${n}.dc.html`, out.length);
}
