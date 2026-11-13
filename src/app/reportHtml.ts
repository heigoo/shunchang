import { getLang, t } from '../i18n';
import type { RuntimeState, Sheet } from '../domain/types';
import { formatClock, formatDuration } from '../domain/timeline';
import { PRINT_STYLES } from './printHtml';
import {
  buildReport,
  offsetText,
  reportFileName,
  reportLockText,
  reportResultLabel,
  signedDurationText,
} from './reportOps';
import type { ReportData, ReportItemRow } from './reportOps';

const REPORT_STYLES = `.section-title {
  margin: 16px 0 0;
  font-family: monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: #4b4941;
}
.summary {
  display: flex;
  flex-wrap: wrap;
  margin-top: 10px;
  border-top: 1px solid #15140f;
}
.stat {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 110px;
  padding: 8px 12px 8px 0;
  border-bottom: 1px solid #dcd6c6;
}
.stat-label { font-size: 9px; letter-spacing: 0.06em; color: #8b887a; }
.stat-value { margin-top: 3px; font-family: monospace; font-size: 14px; }
.stat-value--accent { color: #8a4b12; }
.result { font-family: monospace; font-size: 10px; letter-spacing: 0.06em; }
.result--done { color: #1f5130; }
.result--skipped { color: #8a4b12; }
.result--pending { color: #8b887a; }
.mono { font-family: monospace; }
.col-name { width: 20%; }
.col-owner { width: 70px; }
.col-time { width: 88px; }
.col-result { width: 52px; }
.col-diff { width: 70px; }
.col-lost { width: 58px; }
.col-note { width: 16%; }
.tag { display: block; margin-top: 1px; font-size: 9px; letter-spacing: 0.06em; color: #8b887a; }
.audit { margin: 8px 0 0; padding: 0; list-style: none; }
.audit li {
  padding: 5px 0;
  font-size: 10px;
  color: #4b4941;
  border-bottom: 1px solid #dcd6c6;
}
.audit-time { margin-right: 10px; font-family: monospace; color: #8b887a; }
.audit-empty { margin-top: 8px; font-size: 10px; color: #8b887a; }
.summary-note { margin-top: 6px; font-size: 10px; color: #4b4941; }
@media print {
  .summary, .audit { break-inside: avoid; }
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

function clockRangeText(start: number | null, end: number | null): string {
  if (start === null || end === null) {
    return '—';
  }
  return `${formatClock(start)}–${formatClock(end)}`;
}

function compressedText(row: ReportItemRow): string {
  return row.compressedLostMin > 0
    ? t('−{duration}', { duration: formatDuration(row.compressedLostMin) })
    : '—';
}

function renderSummary(report: ReportData): string {
  const { summary } = report;
  const stats = [
    { label: t('计划总时长'), value: formatDuration(summary.planTotalMin), accent: false },
    { label: t('实际总时长'), value: formatDuration(summary.actualTotalMin), accent: false },
    { label: t('差值'), value: signedDurationText(summary.diffMin), accent: true },
    { label: t('完成率'), value: `${summary.completionRate}%`, accent: false },
    { label: t('完成 / 跳过 / 未执行'), value: `${summary.doneCount} / ${summary.skippedCount} / ${summary.pendingCount}`, accent: false },
  ];

  return `    <div class="summary">
${stats
  .map(
    (stat) => `      <div class="stat">
        <div class="stat-label">${escapeHtml(stat.label)}</div>
        <div class="stat-value${stat.accent ? ' stat-value--accent' : ''}">${escapeHtml(stat.value)}</div>
      </div>`,
  )
  .join('\n')}
    </div>`;
}

function renderRow(row: ReportItemRow): string {
  const lock = reportLockText(row);
  const tags: string[] = [];
  if (row.inserted) {
    tags.push(t('现场插入'));
  }
  if (lock.length > 0) {
    tags.push(lock);
  }

  return `        <tr>
          <td class="mono">${escapeHtml(row.no)}</td>
          <td class="col-name">${escapeHtml(row.name)}${
    tags.length > 0
      ? `<span class="tag">${escapeHtml(tags.join(' · '))}</span>`
      : ''
  }</td>
          <td class="col-owner owner">${escapeHtml(row.owner)}</td>
          <td class="col-time mono">${escapeHtml(
            clockRangeText(row.planStart, row.planEnd),
          )}</td>
          <td class="col-time mono">${escapeHtml(
            clockRangeText(row.displayStart, row.displayEnd),
          )}</td>
          <td class="col-time mono">${escapeHtml(
            clockRangeText(row.actualStart, row.actualEnd),
          )}</td>
          <td class="col-result"><span class="result result--${row.result}">${escapeHtml(
            reportResultLabel(row.result),
          )}</span>${
    row.actualDurationMin !== null
      ? `<span class="tag">${escapeHtml(formatDuration(row.actualDurationMin))}</span>`
      : ''
  }</td>
          <td class="col-diff mono">${escapeHtml(signedDurationText(row.deviationMin))}</td>
          <td class="col-lost mono">${escapeHtml(compressedText(row))}</td>
          <td class="col-note note">${escapeHtml(row.note)}</td>
        </tr>`;
}

function renderAudit(report: ReportData): string {
  if (report.audit.length === 0) {
    return `    <div class="audit-empty">${escapeHtml(t('无现场变更记录'))}</div>`;
  }
  return `    <ul class="audit">
${report.audit
  .map(
    (entry) => `      <li><span class="audit-time">${escapeHtml(
      entry.atText,
    )}</span>${escapeHtml(entry.label)}</li>`,
  )
  .join('\n')}
    </ul>`;
}

/**
 * 生成自包含的执行报告 HTML（内联 CSS，A4 横版），
 * 供桌面打印、Android 系统打印/分享与浏览器导出。
 */
export function buildReportHtml(
  sheet: Sheet,
  runtime: RuntimeState | null,
  printedAt: number,
): string {
  const report = buildReport(sheet, runtime);
  const stamp = stampText(printedAt);
  const title = escapeHtml(report.title);
  const status = report.summary.allTerminal ? t('已全部结束') : t('未全部完成');
  const offset = offsetText(report.summary.effectiveOffsetMin);

  return `<!doctype html>
<html lang="${getLang() === 'en' ? 'en' : 'zh-CN'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · ${escapeHtml(t('执行报告'))}</title>
  <style>
${PRINT_STYLES}
${REPORT_STYLES}
  </style>
</head>
<body>
  <div class="screen-hint">${escapeHtml(
    t('已生成执行报告，请在浏览器中打印（A4 横版）'),
  )}</div>
  <section class="page page--last">
    <div class="head">
      <div class="head-main">
        <h1 class="title">${title}</h1>
        <div class="date">${escapeHtml(report.date)} · ${escapeHtml(t('执行报告'))}</div>
      </div>
      <div class="head-aside">
        <div class="sheet-no">${escapeHtml(
          t('第 {v} 版', { v: report.version }),
        )}</div>
        <div class="head-hint">${escapeHtml(status)}</div>
      </div>
    </div>
    <div class="meta">${escapeHtml(
      t('{offset} · 完成率 {rate}% · 导出于 {time}', {
        offset,
        rate: report.summary.completionRate,
        time: stamp,
      }),
    )}</div>
${renderSummary(report)}
    <h2 class="section-title">${escapeHtml(t('逐项复盘'))}</h2>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(t('序号'))}</th>
          <th class="col-name">${escapeHtml(t('环节'))}</th>
          <th class="col-owner">${escapeHtml(t('负责人'))}</th>
          <th class="col-time">${escapeHtml(t('计划'))}</th>
          <th class="col-time">${escapeHtml(t('展示'))}</th>
          <th class="col-time">${escapeHtml(t('实际'))}</th>
          <th class="col-result">${escapeHtml(t('结果'))}</th>
          <th class="col-diff">${escapeHtml(t('偏差'))}</th>
          <th class="col-lost">${escapeHtml(t('压缩'))}</th>
          <th class="col-note">${escapeHtml(t('备注'))}</th>
        </tr>
      </thead>
      <tbody>
${report.rows.map(renderRow).join('\n')}
      </tbody>
    </table>
    <h2 class="section-title">${escapeHtml(t('现场记录'))}</h2>
${renderAudit(report)}
    <div class="summary-note">${escapeHtml(
      t('有效偏移：{offset}（自动 {auto} · 手动 {manual}）', {
        offset,
        auto: formatDuration(report.summary.autoOffsetMin),
        manual: formatDuration(report.summary.manualOffsetMin),
      }),
    )}</div>
    <div class="foot">
      <span>${escapeHtml(t('导出于 {time} · 顺场', { time: stamp }))}</span>
      <span>${escapeHtml(status)}</span>
    </div>
  </section>
</body>
</html>
`;
}

/** 报告文件基名（不含扩展名）。 */
export function reportHtmlFileName(sheet: Sheet): string {
  return reportFileName(sheet);
}
