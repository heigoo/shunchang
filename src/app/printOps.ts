import {
  computeTimeline,
  formatClock,
  formatClockDisplay,
  formatDuration,
} from '../domain/timeline';
import type { Item, RuntimeState, Sheet } from '../domain/types';

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
  return item.lockAt === null ? 'LOCK 待填' : `LOCK ${formatClock(item.lockAt)}`;
}

export function buildPrintRows(
  sheet: Sheet,
  runtime: RuntimeState | null,
): PrintRow[] {
  const timeline = computeTimeline(sheet, runtime ? runtime.offsetMin : 0);

  return sheet.items.map((item, index) => {
    const row = timeline.rows[index];
    const displayStart = runtime ? row.displayStart : row.planStart;
    const effectiveMin = runtime ? row.effectiveDurationMin : item.durationMin;

    return {
      no: pad3(index + 1),
      time: formatClockDisplay(displayStart),
      duration:
        effectiveMin === item.durationMin
          ? `${effectiveMin} 分`
          : `${item.durationMin}→${effectiveMin} 分`,
      name: item.name.trim().length > 0 ? item.name : '未命名环节',
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
      ? `已顺延 ${offsetMin} 分钟`
      : offsetMin < 0
        ? `提前 ${Math.abs(offsetMin)} 分钟`
        : '未偏移';
  const totalPlanMin = computeTimeline(sheet, offsetMin).totalPlanMin;

  return {
    title: sheet.name.trim().length > 0 ? sheet.name : '未命名手册',
    date: sheet.date,
    version: String(sheet.version),
    offsetLabel,
    totalLabel: `计划 ${formatDuration(totalPlanMin)}`,
  };
}

export function printFileName(sheet: Sheet): string {
  const name = sheet.name.trim().length > 0 ? sheet.name : '未命名手册';
  const stamp = sheet.date.replace(/[^0-9]/g, '');
  return `${name}_流程表_${stamp}`;
}
