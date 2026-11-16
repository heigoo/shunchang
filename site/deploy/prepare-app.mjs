import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'cue-app-'));
// 静态资源基路径：根域名部署用 /，子路径部署（如 GitHub Pages）用 ./。
const publicBase = process.env.PUBLIC_BASE || '/';

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// 发布完整 Web 工作台：主 bundle + 工作台入口 + favicon + 可运行 Web bundle 的静态运行时。
fs.copyFileSync(
  path.join(root, 'dist/main.web.bundle'),
  path.join(outDir, 'main.web.bundle'),
);
fs.copyFileSync(path.join(root, 'public/app.html'), path.join(outDir, 'index.html'));
fs.copyFileSync(path.join(root, 'public/app.html'), path.join(outDir, 'app.html'));
fs.copyFileSync(
  path.join(root, '../顺场-使用说明书/顺场-使用说明书.html'),
  path.join(outDir, 'manual.html'),
);
fs.copyFileSync(path.join(root, 'public/favicon.png'), path.join(outDir, 'favicon.png'));
fs.cpSync(
  path.join(root, 'node_modules/@lynx-js/web-rsbuild-server-middleware/www/static'),
  path.join(outDir, 'static'),
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

// 与 prepare-static.mjs 一致：把 Web bundle 里的 mocked origin 改回同源相对路径，
// 否则静态托管下资源会请求到不存在的域名。
let patched = 0;
for (const file of walk(path.join(outDir, 'static'))) {
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

const remaining = walk(path.join(outDir, 'static')).filter(
  (file) => file.endsWith('.js') && fs.readFileSync(file, 'utf8').includes('lynx-web-core-mocked'),
);
if (remaining.length > 0) {
  console.error('mocked origin still present:', remaining);
  process.exit(1);
}

const files = walk(outDir);
const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`SOURCE=${outDir}`);
console.log(`FILES=${files.length}`);
console.log(`BYTES=${bytes}`);
console.log(`PATCHED=${patched}`);
