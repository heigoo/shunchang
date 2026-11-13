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
  /** 下一环节在无偏移下的计划开始；没有下一环节时为 null。 */
  nextPlanStart: number | null;
  /** 当前环节按现有偏移的展示结束；没有当前环节时为 null。 */
  currentEndMin: number | null;
  /** 所选开始时间早于下一环节计划开始的分钟数；0 表示不提前。 */
  planEarlyMin: number;
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

function planStartOf(sheet: Sheet, index: number): number | null {
  if (index < 0 || index >= sheet.items.length) {
    return null;
  }
  const row = computeTimeline(sheet, 0).rows[index];
  return row ? row.planStart : null;
}

/** 下一环节的计划开始；没有下一环节时返回 null。 */
export function nextPlanStartOf(sheet: Sheet, runtime: RuntimeState): number | null {
  const execSheet = buildExecutionSheet(sheet, runtime);
  return planStartOf(execSheet, runtime.currentIndex + 1);
}

/**
 * 顺延面板的默认开始时间：已过计划时刻用当前时刻，尚未到计划时刻用计划时刻。
 */
export function defaultShiftStart(
  nowMin: number,
  nextPlanStart: number | null,
): number {
  if (nextPlanStart !== null && nowMin < nextPlanStart) {
    return nextPlanStart;
  }
  return nowMin;
}

/**
 * 延长当前环节：把下一环节开始时间设为 max(当前时刻, 当前环节展示结束) + 分钟数。
 */
export function extendStartMin(
  nowMin: number,
  currentEndMin: number | null,
  minutes: number,
): number {
  const base =
    currentEndMin !== null && currentEndMin > nowMin ? currentEndMin : nowMin;
  return base + minutes;
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
  const nextPlanStart = planStartOf(execSheet, nextIndex);
  const planEarlyMin =
    nextPlanStart !== null ? Math.max(0, nextPlanStart - startMin) : 0;
  const currentIndex = runtime.currentIndex;
  const currentEndMin =
    currentIndex >= 0 && currentIndex < execSheet.items.length
      ? computeTimeline(execSheet, runtime.offsetMin).rows[currentIndex]
          ?.displayEnd ?? null
      : null;

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
      nextPlanStart,
      currentEndMin,
      planEarlyMin,
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
      nextPlanStart,
      currentEndMin,
      planEarlyMin,
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
      nextPlanStart,
      currentEndMin,
      planEarlyMin,
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
    nextPlanStart,
    currentEndMin,
    planEarlyMin,
    rows,
    locks,
    hasConflict: locks.some((lock) => lock.state === 'conflict'),
    earlierThanNow,
  };
}
