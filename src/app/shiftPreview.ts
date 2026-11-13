import { buildExecutionSheet } from '../domain/execution';
import {
  computeTimeline,
  formatClockDisplay,
  offsetAfterShift,
} from '../domain/timeline';
import type { RuntimeState, Sheet } from '../domain/types';
import { t } from '../i18n';

export interface ShiftPreviewLock {
  index: number;
  name: string;
  state: 'wait' | 'absorb' | 'conflict';
  /** 正数超出锁定，负数提前 */
  diffMin: number;
  waitMin: number;
  compressed: { name: string; lostMin: number }[];
}

export interface ShiftPreviewRow {
  index: number;
  name: string;
  time: string;
}

export interface ShiftPreview {
  ok: boolean;
  reason: 'last' | 'locked' | null;
  nextIndex: number;
  nextName: string;
  baseOffsetMin: number;
  nextOffsetMin: number;
  /** nextOffset - baseOffset */
  deltaMin: number;
  startMin: number;
  rows: ShiftPreviewRow[];
  locks: ShiftPreviewLock[];
  hasConflict: boolean;
  earlierThanNow: boolean;
}

const MAX_ROWS = 4;

function itemName(sheet: Sheet, itemId: string): string {
  const item = sheet.items.find((entry) => entry.id === itemId);
  return item && item.name.length > 0 ? item.name : t('未命名环节');
}

export function buildShiftPreview(
  sheet: Sheet,
  runtime: RuntimeState,
  startMin: number,
  nowMin: number,
): ShiftPreview {
  const execSheet = buildExecutionSheet(sheet, runtime);
  const nextIndex = runtime.currentIndex + 1;
  const baseOffsetMin = runtime.offsetMin;
  const earlierThanNow = startMin < nowMin;

  if (nextIndex < 0 || nextIndex >= execSheet.items.length) {
    return {
      ok: false,
      reason: 'last',
      nextIndex,
      nextName: '',
      baseOffsetMin,
      nextOffsetMin: baseOffsetMin,
      deltaMin: 0,
      startMin,
      rows: [],
      locks: [],
      hasConflict: false,
      earlierThanNow,
    };
  }

  const nextItem = execSheet.items[nextIndex];
  const nextName = nextItem.name.length > 0 ? nextItem.name : t('未命名环节');

  if (nextItem.locked === true || nextItem.lockAt !== null) {
    return {
      ok: false,
      reason: 'locked',
      nextIndex,
      nextName,
      baseOffsetMin,
      nextOffsetMin: baseOffsetMin,
      deltaMin: 0,
      startMin,
      rows: [],
      locks: [],
      hasConflict: false,
      earlierThanNow,
    };
  }

  const nextOffsetMin = offsetAfterShift(execSheet, nextIndex, startMin);
  if (nextOffsetMin === null) {
    return {
      ok: false,
      reason: 'locked',
      nextIndex,
      nextName,
      baseOffsetMin,
      nextOffsetMin: baseOffsetMin,
      deltaMin: 0,
      startMin,
      rows: [],
      locks: [],
      hasConflict: false,
      earlierThanNow,
    };
  }

  const timeline = computeTimeline(execSheet, nextOffsetMin);

  const locks: ShiftPreviewLock[] = timeline.locks
    .filter((lock) => lock.index >= nextIndex)
    .sort((a, b) => a.index - b.index)
    .map((lock) => ({
      index: lock.index,
      name: itemName(execSheet, lock.itemId),
      state: lock.state,
      diffMin: lock.diffMin,
      waitMin: lock.waitMin,
      compressed: lock.compressed.map((entry) => ({
        name: itemName(execSheet, entry.itemId),
        lostMin: entry.lostMin,
      })),
    }));

  const rows: ShiftPreviewRow[] = timeline.rows
    .slice(nextIndex, nextIndex + MAX_ROWS)
    .map((row) => ({
      index: row.index,
      name: itemName(execSheet, row.itemId),
      time: formatClockDisplay(row.displayStart),
    }));

  return {
    ok: true,
    reason: null,
    nextIndex,
    nextName,
    baseOffsetMin,
    nextOffsetMin,
    deltaMin: nextOffsetMin - baseOffsetMin,
    startMin,
    rows,
    locks,
    hasConflict: locks.some((lock) => lock.state === 'conflict'),
    earlierThanNow,
  };
}
