import type { RuntimeState, Sheet } from '../domain/types';
import { getLang, t } from '../i18n';
import { buildPrintRows, paginateRows, printSummary } from './printOps';
import type { PrintPage } from './printOps';

export const PRINT_STYLES = `@page { size: A4 landscape; margin: 8mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #f3f0e8; color: #15140f; }
body {
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 11px;
}
.screen-hint {
  padding: 8px 16px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: #4b4941;
  background: #ffffff;
  border-bottom: 1px solid #dcd6c6;
}
.page {
  display: flex;
  flex-direction: column;
  width: 297mm;
  min-height: 210mm;
  margin: 12px auto;
  padding: 10mm 8mm;
  background: #ffffff;
  border: 1px solid #dcd6c6;
  page-break-after: always;
  break-after: page;
}
.page--last { page-break-after: auto; break-after: auto; }
.head { display: flex; align-items: flex-start; justify-content: space-between; }
.head-main { display: flex; flex-direction: column; align-items: flex-start; }
.title { margin: 0; font-size: 18px; font-weight: 700; }
.date { margin-top: 4px; font-family: monospace; font-size: 11px; letter-spacing: 0.08em; color: #4b4941; }
.head-aside { display: flex; flex-direction: column; align-items: flex-end; margin-left: 18px; }
.sheet-no { font-family: monospace; font-size: 10px; letter-spacing: 0.12em; }
.head-hint { margin-top: 4px; font-size: 9px; letter-spacing: 0.04em; color: #8b887a; }
.meta {
  display: flex;
  margin-top: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #15140f;
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: #4b4941;
}
table { width: 100%; border-collapse: collapse; }
thead th {
  padding: 6px;
  font-family: monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-align: left;
  color: #4b4941;
  border-bottom: 1px solid #15140f;
}
tbody td {
  padding: 5px 6px;
  font-size: 11px;
  vertical-align: top;
  border-bottom: 1px solid #dcd6c6;
}
tbody tr:nth-child(even) { background: #f7f4ec; }
.mono { font-family: monospace; }
.col-no { width: 44px; }
.col-time { width: 74px; }
.col-dur { width: 78px; }
.col-owner { width: 100px; }
.col-note { width: 28%; }
.lock { display: block; margin-top: 1px; font-size: 9px; letter-spacing: 0.06em; color: #8b887a; }
.owner, .note { color: #4b4941; }
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid #dcd6c6;
  font-family: monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #8b887a;
}
@media print {
  html, body { background: #ffffff; }
  .screen-hint { display: none !important; }
  .page {
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: none;
  }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
}`;

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function stampText(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;
}

function renderRows(page: PrintPage): string {
  return page.rows
    .map(
      (row) => `        <tr>
          <td class="col-no mono">${escapeHtml(row.no)}</td>
          <td class="col-time mono">${escapeHtml(row.time)}${
        row.lockLabel.length > 0
          ? `<span class="lock">${escapeHtml(row.lockLabel)}</span>`
          : ''
      }</td>
          <td class="col-dur mono">${escapeHtml(row.duration)}</td>
          <td class="col-seg">${escapeHtml(row.name)}</td>
          <td class="col-owner owner">${escapeHtml(row.owner)}</td>
          <td class="col-note note">${escapeHtml(row.note)}</td>
        </tr>`,
    )
    .join('\n');
}

/** 生成自包含的 A4 横版打印 HTML；桌面端交给系统浏览器打印。 */
export function buildPrintHtml(
  sheet: Sheet,
  runtime: RuntimeState | null,
  printedAt: number,
): string {
  const rows = buildPrintRows(sheet, runtime);
  const pages = paginateRows(rows);
  const summary = printSummary(sheet, runtime);
  const stamp = stampText(printedAt);
  const title = escapeHtml(summary.title);
  const hint = escapeHtml(t('桌面版请用文件或六位短码分发'));

  const pageHtml = pages
    .map((page) => {
      const last = page.pageNo === page.pageTotal;
      return `    <section class="page${last ? ' page--last' : ''}">
      <div class="head">
        <div class="head-main">
          <h1 class="title">${title}</h1>
          <div class="date">${escapeHtml(summary.date)}</div>
        </div>
        <div class="head-aside">
          <div class="sheet-no">${escapeHtml(
            t('第 {a} / {b} 张 · 第 {v} 版', {
              a: page.pageNo,
              b: page.pageTotal,
              v: summary.version,
            }),
          )}</div>
          <div class="head-hint">${hint}</div>
        </div>
      </div>
      <div class="meta">${escapeHtml(
        t('{offset} · {total} · 导出于 {time}', {
          offset: summary.offsetLabel,
          total: summary.totalLabel,
          time: stamp,
        }),
      )}</div>
      <table>
        <thead>
          <tr>
            <th class="col-no">${escapeHtml(t('序号'))}</th>
            <th class="col-time">${escapeHtml(t('时间'))}</th>
            <th class="col-dur">${escapeHtml(t('时长'))}</th>
            <th class="col-seg">${escapeHtml(t('环节'))}</th>
            <th class="col-owner">${escapeHtml(t('负责人'))}</th>
            <th class="col-note">${escapeHtml(t('备注'))}</th>
          </tr>
        </thead>
        <tbody>
${renderRows(page)}
        </tbody>
      </table>
      <div class="foot">
        <span>${escapeHtml(t('打印于 {time} · 顺场', { time: stamp }))}</span>
        <span>${escapeHtml(
          t('第 {a} / {b} 页', { a: page.pageNo, b: page.pageTotal }),
        )}</span>
      </div>
    </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="${getLang() === 'en' ? 'en' : 'zh-CN'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
${PRINT_STYLES}
  </style>
</head>
<body>
  <div class="screen-hint">${escapeHtml(
    t('已生成打印页，请在浏览器中打印'),
  )}</div>
${pageHtml}
</body>
</html>
`;
}
