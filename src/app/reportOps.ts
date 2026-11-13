import { buildExecutionSheet } from '../domain/execution';
import {
  computeTimeline,
  formatClock,
  formatClockDisplay,
  formatDuration,
} from '../domain/timeline';
import type { RuntimeState, Sheet, SheetStatus } from '../domain/types';
import { t } from '../i18n';

/** 报告中的逐项结果：完成、跳过、未执行。 */
export type ReportResult = 'done' | 'skipped' | 'pending';

export interface ReportItemRow {
  index: number;
  no: string;
  itemId: string;
  name: string;
  owner: string;
  /** 计划开始/结束（不含运行时偏移）。 */
  planStart: number;
  planEnd: number;
  /** 当前展示开始/结束（含偏移与锁定压缩）。 */
  displayStart: number;
  displayEnd: number;
  actualStart: number | null;
  actualEnd: number | null;
  result: ReportResult;
  /** 实际时长；未开始时为 null，跳过为 0。 */
  actualDurationMin: number | null;
  /** 实际结束 - 计划结束；跳过与未执行没有可比较的偏差。 */
  deviationMin: number | null;
  compressedLostMin: number;
  inserted: boolean;
  lockOverridden: boolean;
  /** 有效锁定时刻（含现场覆盖）。 */
  lockAt: number | null;
  /** 手册中的原锁定时刻；现场插入的环节没有原值。 */
  originalLockAt: number | null;
  note: string;
}

export interface ReportSummary {
  planTotalMin: number;
  actualTotalMin: number;
  diffMin: number;
  effectiveOffsetMin: number;
  autoOffsetMin: number;
  manualOffsetMin: number;
  totalCount: number;
  doneCount: number;
  skippedCount: number;
  pendingCount: number;
  /** 完成率，0–100 的整数。 */
  completionRate: number;
  allTerminal: boolean;
}

export interface ReportAuditRow {
  id: string;
  at: number;
  atText: string;
  type: string;
  label: string;
  itemId?: string;
}

export interface ReportData {
  title: string;
  date: string;
  version: number;
  sheetStatus: SheetStatus;
  rows: ReportItemRow[];
  summary: ReportSummary;
  audit: ReportAuditRow[];
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function pad3(value: number): string {
  if (value < 10) return `00${value}`;
  if (value < 100) return `0${value}`;
  return String(value);
}

/** 跨天时把负时长折算为次日。 */
function wrapDuration(start: number, end: number): number {
  let duration = end - start;
  if (duration < 0) {
    duration += 1440;
  }
  return duration;
}

/** 绕日比较实际结束与计划结束，避免 23:50 与 00:10 被算成 -1420。 */
function wrapDiff(end: number, target: number): number {
  let diff = end - target;
  if (diff > 720) {
    diff -= 1440;
  } else if (diff < -720) {
    diff += 1440;
  }
  return diff;
}

function stampText(ms: number): string {
  const date = new Date(ms);
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function reportResultLabel(result: ReportResult): string {
  if (result === 'skipped') {
    return t('跳过');
  }
  if (result === 'done') {
    return t('完成');
  }
  return t('未执行');
}

/** 带符号的分钟文本；null 表示不适用（跳过/未执行）。 */
export function signedDurationText(value: number | null): string {
  if (value === null) {
    return '—';
  }
  if (value === 0) {
    return formatDuration(0);
  }
  if (value > 0) {
    return `+${formatDuration(value)}`;
  }
  return `\u2212${formatDuration(-value)}`;
}

/** 有效偏移文案：顺延 / 提前 / 未偏移。 */
export function offsetText(offsetMin: number): string {
  if (offsetMin > 0) {
    return t('顺延 {n} 分钟', { n: offsetMin });
  }
  if (offsetMin < 0) {
    return t('提前 {n} 分钟', { n: -offsetMin });
  }
  return t('未偏移');
}

export function clockRange(start: number, end: number): string {
  return `${formatClockDisplay(start)}–${formatClockDisplay(end)}`;
}

/** 锁定文案：包含现场覆盖后的时刻与原值。 */
export function reportLockText(row: ReportItemRow): string {
  if (row.lockAt === null) {
    return row.lockOverridden ? t('锁定已解除') : '';
  }
  const base = t('锁定 {time}', { time: formatClock(row.lockAt) });
  if (row.lockOverridden && row.originalLockAt !== null) {
    return t('{base}（原 {origin}）', {
      base,
      origin: formatClock(row.originalLockAt),
    });
  }
  return base;
}

/** 生成逐项计划/实际/偏差、现场插入与审计；供报告页与 HTML 共用。 */
export function buildReport(
  sheet: Sheet,
  runtime: RuntimeState | null,
): ReportData {
  const execSheet = runtime ? buildExecutionSheet(sheet, runtime) : sheet;
  const planTimeline = computeTimeline(execSheet, 0);
  const offsetMin = runtime && isNumber(runtime.offsetMin) ? runtime.offsetMin : 0;
  const displayTimeline = runtime
    ? computeTimeline(execSheet, offsetMin)
    : planTimeline;

  const insertedIds = new Set(
    (runtime ? runtime.insertedItems : []).map((entry) => entry.item.id),
  );
  const overrides = runtime ? runtime.lockOverrides ?? {} : {};
  const actuals = runtime ? runtime.actuals : {};
  const originalLocks = new Map(sheet.items.map((item) => [item.id, item.lockAt]));

  const rows: ReportItemRow[] = execSheet.items.map((item, index) => {
    const planRow = planTimeline.rows[index];
    const displayRow = displayTimeline.rows[index];
    const actual = actuals[item.id];
    const result: ReportResult =
      actual?.result === 'done'
        ? 'done'
        : actual?.result === 'skipped'
          ? 'skipped'
          : 'pending';

    const actualStart = isNumber(actual?.start) ? actual.start : null;
    const actualEnd = isNumber(actual?.end) ? actual.end : null;
    const actualDurationMin =
      actualStart !== null && actualEnd !== null
        ? wrapDuration(actualStart, actualEnd)
        : null;
    const planStart = planRow ? planRow.planStart : 0;
    const planEnd = planStart + item.durationMin;

    return {
      index,
      no: pad3(index + 1),
      itemId: item.id,
      name: item.name.trim().length > 0 ? item.name : t('未命名环节'),
      owner: item.owner,
      planStart,
      planEnd,
      displayStart: displayRow ? displayRow.displayStart : planStart,
      displayEnd: displayRow ? displayRow.displayEnd : planEnd,
      actualStart,
      actualEnd,
      result,
      actualDurationMin,
      deviationMin:
        result === 'done' && actualEnd !== null
          ? wrapDiff(actualEnd, planEnd)
          : null,
      compressedLostMin: displayRow ? displayRow.compressedLostMin : 0,
      inserted: insertedIds.has(item.id),
      lockOverridden: Object.prototype.hasOwnProperty.call(overrides, item.id),
      lockAt: item.lockAt,
      originalLockAt: insertedIds.has(item.id)
        ? null
        : originalLocks.get(item.id) ?? null,
      note: item.note,
    };
  });

  let doneCount = 0;
  let skippedCount = 0;
  let pendingCount = 0;
  let actualTotalMin = 0;

  for (const row of rows) {
    if (row.result === 'done') {
      doneCount += 1;
      actualTotalMin += row.actualDurationMin ?? 0;
    } else if (row.result === 'skipped') {
      skippedCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  const planTotalMin = planTimeline.totalPlanMin;
  const totalCount = rows.length;
  const audit: ReportAuditRow[] = (runtime ? runtime.audit : [])
    .slice()
    .sort((a, b) => b.at - a.at)
    .map((entry) => ({
      id: entry.id,
      at: entry.at,
      atText: stampText(entry.at),
      type: entry.type,
      label: entry.label,
      ...(entry.itemId === undefined ? {} : { itemId: entry.itemId }),
    }));

  return {
    title: sheet.name.trim().length > 0 ? sheet.name : t('未命名手册'),
    date: sheet.date,
    version: sheet.version,
    sheetStatus: sheet.status,
    rows,
    summary: {
      planTotalMin,
      actualTotalMin,
      diffMin: actualTotalMin - planTotalMin,
      effectiveOffsetMin: offsetMin,
      autoOffsetMin: runtime && isNumber(runtime.autoOffsetMin) ? runtime.autoOffsetMin : 0,
      manualOffsetMin:
        runtime && isNumber(runtime.manualOffsetMin) ? runtime.manualOffsetMin : 0,
      totalCount,
      doneCount,
      skippedCount,
      pendingCount,
      completionRate:
        totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0,
      allTerminal: pendingCount === 0,
    },
    audit,
  };
}

function actualRange(row: ReportItemRow): string {
  if (row.actualStart === null || row.actualEnd === null) {
    return '—';
  }
  const range = clockRange(row.actualStart, row.actualEnd);
  if (
    row.actualDurationMin !== null &&
    row.actualDurationMin > 0 &&
    row.actualDurationMin < 1
  ) {
    return t('{range}（{duration}）', {
      range,
      duration: formatDuration(row.actualDurationMin),
    });
  }
  return range;
}

/** 复制到剪贴板的文字摘要：汇总 + 逐项 + 现场记录。 */
export function buildReportText(report: ReportData): string {
  const { summary } = report;
  const lines: string[] = [];

  lines.push(`${report.title} · ${report.date}`);
  lines.push(
    t('计划总时长 {plan} · 实际总时长 {actual} · 差值 {diff}', {
      plan: formatDuration(summary.planTotalMin),
      actual: formatDuration(summary.actualTotalMin),
      diff: signedDurationText(summary.diffMin),
    }),
  );
  lines.push(
    t('完成 {done} · 跳过 {skipped} · 未执行 {pending} · 完成率 {rate}%', {
      done: summary.doneCount,
      skipped: summary.skippedCount,
      pending: summary.pendingCount,
      rate: summary.completionRate,
    }),
  );
  lines.push(
    t('有效偏移：{offset}', {
      offset: offsetText(summary.effectiveOffsetMin),
    }),
  );

  if (report.rows.length > 0) {
    lines.push('');
    lines.push(t('逐项复盘'));
    for (const row of report.rows) {
      const owner = row.owner.length > 0 ? `（${row.owner}）` : '';
      lines.push(`${row.no} ${row.name}${owner}`);
      lines.push(
        `  ${t('计划')} ${clockRange(row.planStart, row.planEnd)} · ${t('顺延后')} ${clockRange(
          row.displayStart,
          row.displayEnd,
        )} · ${t('实际')} ${actualRange(row)}`,
      );
      const parts = [reportResultLabel(row.result)];
      if (row.actualDurationMin !== null) {
        parts.push(t('实际时长 {duration}', {
          duration: formatDuration(row.actualDurationMin),
        }));
      }
      parts.push(
        t('偏差 {diff}', { diff: signedDurationText(row.deviationMin) }),
      );
      if (row.compressedLostMin > 0) {
        parts.push(t('压缩 {duration}', { duration: formatDuration(row.compressedLostMin) }));
      }
      if (row.inserted) {
        parts.push(t('现场插入'));
      }
      const lockText = reportLockText(row);
      if (lockText.length > 0) {
        parts.push(lockText);
      }
      lines.push(`  ${parts.join(' · ')}`);
      if (row.note.trim().length > 0) {
        lines.push(`  ${t('备注')}：${row.note}`);
      }
    }
  }

  if (report.audit.length > 0) {
    lines.push('');
    lines.push(t('现场记录'));
    for (const entry of report.audit) {
      lines.push(`${entry.atText} ${entry.label}`);
    }
  }

  return lines.join('\n');
}

/** 导出文件名：手册名_执行报告_日期。 */
export function reportFileName(sheet: Sheet): string {
  const name = sheet.name.trim().length > 0 ? sheet.name : t('未命名手册');
  const stamp = sheet.date.replace(/[^0-9]/g, '');
  return `${name}_${t('执行报告')}_${stamp}`;
}
