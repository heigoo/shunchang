import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'cue-site-'));
const publicDir = path.join(outDir, 'public');
// 静态资源基路径：根域名部署用 /，子路径部署（如 GitHub Pages）用 ./。
const publicBase = process.env.PUBLIC_BASE || '/';

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

fs.copyFileSync(path.join(root, 'site/deploy/index.html'), path.join(publicDir, 'index.html'));
fs.copyFileSync(path.join(root, 'public/favicon.png'), path.join(publicDir, 'favicon.png'));
fs.copyFileSync(path.join(root, 'dist-site/main.web.bundle'), path.join(publicDir, 'main.web.bundle'));
fs.cpSync(path.join(root, 'dist-site/static'), path.join(publicDir, 'static'), { recursive: true });
fs.cpSync(
  path.join(root, 'node_modules/@lynx-js/web-rsbuild-server-middleware/www/static'),
  path.join(publicDir, 'static'),
  { recursive: true },
);

function walk(dir) {
  const entries = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) entries.push(...walk(full));
    else entries.push(full);
  }
  return entries;
}

let patched = 0;
for (const file of walk(path.join(publicDir, 'static'))) {
  if (!file.endsWith('.js')) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('lynx-web-core-mocked')) continue;
  fs.writeFileSync(
    file,
    text
      .replaceAll('http://lynx-web-core-mocked.localhost/', publicBase)
      .replaceAll('http://lynx-web-core-mocked.localhost', ''),
    'utf8',
  );
  patched += 1;
}

const remaining = walk(path.join(publicDir, 'static')).filter(
  (file) => file.endsWith('.js') && fs.readFileSync(file, 'utf8').includes('lynx-web-core-mocked'),
);
if (remaining.length > 0) {
  console.error('mocked origin still present:', remaining);
  process.exit(1);
}

const files = walk(publicDir);
const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`SOURCE=${publicDir}`);
console.log(`FILES=${files.length}`);
console.log(`BYTES=${bytes}`);
console.log(`PATCHED=${patched}`);
