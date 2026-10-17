// يبني النسخة التجريبية الثابتة في demo/dist
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(__dirname, 'dist');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets/js'), { recursive: true });

execSync(`npx esbuild ${path.join(__dirname, 'entry.js')} --bundle --minify --platform=browser --outfile=${path.join(OUT, 'assets/js/core.js')}`
  + ` --alias:fs=./demo/stub.js --alias:path=./demo/stub.js --alias:crypto=./demo/stub.js --define:__dirname='"/"' --banner:js="var process={env:{}};"`, { cwd: ROOT, stdio: 'inherit' });

const common = [
  ['href="/"', 'href="index.html"'],
  ["location.href = '/'", "location.href = 'index.html'"],
  ['/editor/${p.id}', 'editor.html#p${p.id}'],
  ["'/editor/' + id", "'editor.html#p' + id"],
  ['href="/api/projects/${p.id}/preview" target="_blank"', 'href="preview.html#p${p.id}"'],
  ["location.href = '/login?next=' + encodeURIComponent(location.pathname)", "location.href = 'auth.html'"],
  ['href="/login"', 'href="auth.html"'],
  ['href="/register"', 'href="auth.html#register"'],
  ['"/app"', '"app.html"'], ["'/app'", "'app.html'"],
  ['"/subscribe"', '"subscribe.html"'], ["'/subscribe'", "'subscribe.html'"],
  ['href="/admin"', 'href="#"'],
  ['/assets/', 'assets/'], ['"/icon.svg"', '"icon.svg"'], ['url(/fonts/', 'url(fonts/'],
  ['<link rel="manifest" href="/manifest.webmanifest">', ''],
  ["if ('serviceWorker' in navigator)", 'if (false)'],
];
const extra = {
  'auth.html': [
    ["location.pathname.startsWith('/register')", "location.hash === '#register'"],
    ["const next = new URLSearchParams(location.search).get('next');", "const next = null; window.addEventListener('hashchange', () => location.reload());"],
  ],
  'editor.js': [
    ['Number(location.pathname.split(\'/\').pop())', 'demoProjectId()'],
    ['/api/uploads/${esc(it.uploadId)}', '${uploadUrl(it.uploadId)}'],
    ['/api/qr?u=${encodeURIComponent(url.trim())}', '${qrDataUrl(url.trim())}'],
    ["const w = window.open('about:blank', '_blank');", 'const w = null;'],
    ['href="${esc(fileLink(it.fileId))}"', 'href="${esc(demoFileHref(it.fileId))}"'],
    ['location.href = `/api/projects/${projectId}/preview`', "location.href = 'preview.html#p' + projectId"],
  ],
};
function transform(name, s) {
  for (const [a, b] of [...common, ...(extra[name] || [])]) {
    if (!s.includes(a)) continue;
    s = s.split(a).join(b);
  }
  return s.replace('<script src="assets/js/common.js"></script>',
    '<script src="assets/js/core.js"></script><script src="assets/js/common.js"></script><script src="assets/js/mock.js"></script>');
}

for (const f of ['index.html', 'auth.html', 'app.html', 'editor.html', 'subscribe.html']) {
  let s = transform(f, fs.readFileSync(path.join(PUB, f), 'utf8'));
  if (f === 'index.html') {
    // الصفحة الرئيسية تُغلّف تلقائيًا عند النشر
    const head = s.slice(s.indexOf('<head>') + 6, s.indexOf('</head>'));
    const body = s.slice(s.indexOf('<body>') + 6, s.indexOf('</body>'));
    s = head.replace(/<meta name="viewport"[^>]*>\s*/, '') + "<script>document.documentElement.dir='rtl';document.documentElement.lang='ar';</script>\n" + body;
  }
  fs.writeFileSync(path.join(OUT, f), s);
}
fs.writeFileSync(path.join(OUT, 'assets/js/editor.js'), transform('editor.js', fs.readFileSync(path.join(PUB, 'assets/js/editor.js'), 'utf8')));
fs.writeFileSync(path.join(OUT, 'assets/js/common.js'), transform('common.js', fs.readFileSync(path.join(PUB, 'assets/js/common.js'), 'utf8')));
fs.writeFileSync(path.join(OUT, 'assets/style.css'), fs.readFileSync(path.join(PUB, 'assets/style.css'), 'utf8').replace(/url\(\/fonts\//g, 'url(../fonts/'));
fs.copyFileSync(path.join(__dirname, 'mock.js'), path.join(OUT, 'assets/js/mock.js'));
fs.copyFileSync(path.join(__dirname, 'preview.html'), path.join(OUT, 'preview.html'));
fs.copyFileSync(path.join(PUB, 'icon.svg'), path.join(OUT, 'icon.svg'));
for (const f of ['tajawal-arabic-400-normal', 'tajawal-arabic-500-normal', 'tajawal-arabic-700-normal', 'tajawal-arabic-800-normal']) {
  fs.mkdirSync(path.join(OUT, 'fonts/tajawal/files'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'node_modules/@fontsource/tajawal/files', f + '.woff2'), path.join(OUT, 'fonts/tajawal/files', f + '.woff2'));
}
for (const f of ['amiri-arabic-400-normal', 'amiri-arabic-700-normal']) {
  fs.mkdirSync(path.join(OUT, 'fonts/amiri/files'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'node_modules/@fontsource/amiri/files', f + '.woff2'), path.join(OUT, 'fonts/amiri/files', f + '.woff2'));
}
console.log('built', OUT);
