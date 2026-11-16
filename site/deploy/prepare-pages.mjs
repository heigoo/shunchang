// 组装 GitHub Pages 站点：官网 /、Web 工作台 /app/、跟随页 /follow/。
// 用法: node site/deploy/prepare-pages.mjs [outDir]
// 构建前请先执行 npm run build 与 npm run site:build。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'pages-dist'));

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'shunchang-pages-'));
const siteDir = path.join(staging, 'site');
const appDir = path.join(staging, 'app');
const followDir = path.join(staging, 'follow');

// GitHub Pages 项目站点位于 /<repo>/，各页面使用各自的绝对基路径，
// 避免相对路径在 Worker importScripts 中被二次拼接。
const pagesBase = process.env.PAGES_BASE || `/${path.basename(root)}/`;

function run(script, target, base) {
  execFileSync(process.execPath, [path.join(here, script), target], {
    env: { ...process.env, PUBLIC_BASE: base },
    stdio: 'inherit',
  });
}

function copyInto(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyInto(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function walk(dir) {
  const entries = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) entries.push(...walk(full));
    else entries.push(full);
  }
  return entries;
}

try {
  run('prepare-static.mjs', siteDir, pagesBase);
  run('prepare-app.mjs', appDir, `${pagesBase}app/`);
  run('prepare-follow.mjs', followDir, `${pagesBase}follow/`);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  copyInto(path.join(siteDir, 'public'), outDir);
  copyInto(appDir, path.join(outDir, 'app'));
  copyInto(followDir, path.join(outDir, 'follow'));

  // 官网位于 /<repo>/，Web 工作台位于 /<repo>/app/，把站点内硬编码的入口
  // 改成相对路径；同时覆盖说明书链接（同一来源）。
  const siteIndex = path.join(outDir, 'index.html');
  const siteHtml = fs.readFileSync(siteIndex, 'utf8');
  const legacyAppUrl = 'https://37jgejb7nyniuhch9uk.traesite.cn/';
  if (!siteHtml.includes(legacyAppUrl)) {
    console.warn('[pages] 官网入口未找到默认 Web 地址，跳过改写');
  }
  fs.writeFileSync(
    siteIndex,
    siteHtml.replaceAll(legacyAppUrl, './app/'),
    'utf8',
  );

  const files = walk(outDir);
  const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  console.log(`SOURCE=${outDir}`);
  console.log(`FILES=${files.length}`);
  console.log(`BYTES=${bytes}`);
  console.log(
    'ENTRIES=index.html,app/index.html,follow/index.html,app/manual.html',
  );
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
