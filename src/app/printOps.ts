import { buildExecutionSheet } from '../domain/execution';
import {
  computeTimeline,
  formatClock,
  formatClockDisplay,
  formatDuration,
} from '../domain/timeline';
import type { Item, RuntimeState, Sheet } from '../domain/types';
import { t } from '../i18n';

export interface PrintRow {
  no: string;
  time: string;
  duration: string;
  name: string;
  owner: string;
  note: string;
  lockLabel: string;
}

export interface PrintPage {
  rows: PrintRow[];
  pageNo: number;
  pageTotal: number;
}

export const PRINT_ROWS_PER_PAGE = 40;

function pad3(value: number): string {
  if (value < 10) return `00${value}`;
  if (value < 100) return `0${value}`;
  return String(value);
}

function lockLabelOf(item: Item): string {
  if (item.locked !== true && item.lockAt === null) {
    return '';
  }
  return item.lockAt === null
    ? t('锁定 待填')
    : t('锁定 {time}', { time: formatClock(item.lockAt) });
}

export function buildPrintRows(
  sheet: Sheet,
  runtime: RuntimeState | null,
): PrintRow[] {
  const execSheet = runtime ? buildExecutionSheet(sheet, runtime) : sheet;
  const timeline = computeTimeline(execSheet, runtime ? runtime.offsetMin : 0);

  return execSheet.items.map((item, index) => {
    const row = timeline.rows[index];
    const displayStart = runtime ? row.displayStart : row.planStart;
    const effectiveMin = runtime ? row.effectiveDurationMin : item.durationMin;

    return {
      no: pad3(index + 1),
      time: formatClockDisplay(displayStart),
      duration:
        effectiveMin === item.durationMin
          ? t('{n} 分', { n: effectiveMin })
          : t('{a}→{b} 分', { a: item.durationMin, b: effectiveMin }),
      name: item.name.trim().length > 0 ? item.name : t('未命名环节'),
      owner: item.owner,
      note: item.note,
      lockLabel: lockLabelOf(item),
    };
  });
}

export function paginateRows(
  rows: PrintRow[],
  perPage: number = PRINT_ROWS_PER_PAGE,
): PrintPage[] {
  const size = perPage > 0 ? Math.floor(perPage) : PRINT_ROWS_PER_PAGE;
  const pageTotal = Math.max(1, Math.ceil(rows.length / size));
  const pages: PrintPage[] = [];

  for (let index = 0; index < pageTotal; index += 1) {
    pages.push({
      rows: rows.slice(index * size, index * size + size),
      pageNo: index + 1,
      pageTotal,
    });
  }

  return pages;
}

export function printSummary(
  sheet: Sheet,
  runtime: RuntimeState | null,
): {
  title: string;
  date: string;
  version: string;
  offsetLabel: string;
  totalLabel: string;
} {
  const offsetMin = runtime ? runtime.offsetMin : 0;
  const offsetLabel =
    offsetMin > 0
      ? t('已顺延 {n} 分钟', { n: offsetMin })
      : offsetMin < 0
        ? t('提前 {n} 分钟', { n: Math.abs(offsetMin) })
        : t('未偏移');
  const totalPlanMin = computeTimeline(
    runtime ? buildExecutionSheet(sheet, runtime) : sheet,
    offsetMin,
  ).totalPlanMin;

  return {
    title: sheet.name.trim().length > 0 ? sheet.name : t('未命名手册'),
    date: sheet.date,
    version: String(sheet.version),
    offsetLabel,
    totalLabel: t('计划 {duration}', {
      duration: formatDuration(totalPlanMin),
    }),
  };
}

export function printFileName(sheet: Sheet): string {
  const name = sheet.name.trim().length > 0 ? sheet.name : t('未命名手册');
  const stamp = sheet.date.replace(/[^0-9]/g, '');
  return `${name}_${t('流程表')}_${stamp}`;
}
