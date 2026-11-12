import { t } from '../i18n';
import type { Sheet } from './types';

export type LockState = 'wait' | 'absorb' | 'conflict';

export interface CompressedItem {
  itemId: string;
  lostMin: number;
}

export interface LockResult {
  itemId: string;
  index: number;
  lockAt: number;
  state: LockState;
  diffMin: number;
  waitMin: number;
  compressed: CompressedItem[];
}

export interface TimelineRow {
  itemId: string;
  index: number;
  planStart: number;
  displayStart: number;
  displayEnd: number;
  effectiveDurationMin: number;
  lockAt: number | null;
  compressedLostMin: number;
}

export interface TimelineResult {
  rows: TimelineRow[];
  locks: LockResult[];
  totalPlanMin: number;
  plannedEndMin: number;
  displayEndMin: number;
  hasConflict: boolean;
}

export function computeTimeline(sheet: Sheet, offsetMin = 0): TimelineResult {
  const items = sheet.items;
  const count = items.length;
  const startOffset = Number.isFinite(offsetMin) ? offsetMin : 0;

  const planStarts: number[] = new Array(count);
  let cursor = sheet.startMin;
  let totalPlanMin = 0;
  for (let i = 0; i < count; i += 1) {
    const item = items[i];
    totalPlanMin += item.durationMin;
    if (item.lockAt !== null) {
      planStarts[i] = item.lockAt;
      cursor = item.lockAt + item.durationMin;
    } else {
      planStarts[i] = cursor;
      cursor = planStarts[i] + item.durationMin;
    }
  }

  const rows: TimelineRow[] = items.map((item, index) => ({
    itemId: item.id,
    index,
    planStart: planStarts[index],
    displayStart: planStarts[index],
    displayEnd: planStarts[index] + item.durationMin,
    effectiveDurationMin: item.durationMin,
    lockAt: item.lockAt,
    compressedLostMin: 0,
  }));

  const locks: LockResult[] = [];
  let segOffset = startOffset;
  let segStart = 0;
  let prevLockEnd = sheet.startMin;
  let hasConflict = false;

  for (let i = 0; i < count; i += 1) {
    const item = items[i];
    if (item.lockAt === null) {
      continue;
    }

    for (let j = segStart; j < i; j += 1) {
      rows[j].displayStart = rows[j].planStart + segOffset;
      rows[j].displayEnd = rows[j].displayStart + rows[j].effectiveDurationMin;
    }

    const capacity = items
      .slice(segStart, i)
      .reduce((sum, segmentItem) => sum + segmentItem.durationMin, 0);
    const projectedEnd =
      i > segStart
        ? rows[i - 1].planStart + items[i - 1].durationMin + segOffset
        : prevLockEnd + segOffset;
    const diffMin = projectedEnd - item.lockAt;
    const compressed: CompressedItem[] = [];
    let state: LockState;

    if (diffMin < 0) {
      state = 'wait';
    } else if (diffMin === 0) {
      state = 'absorb';
      segOffset = 0;
    } else if (diffMin <= capacity) {
      state = 'absorb';

      let remaining = diffMin;
      for (let j = i - 1; j >= segStart && remaining > 0; j -= 1) {
        const lostMin = Math.min(items[j].durationMin, remaining);
        if (lostMin <= 0) {
          continue;
        }
        rows[j].effectiveDurationMin = items[j].durationMin - lostMin;
        rows[j].compressedLostMin = lostMin;
        compressed.push({ itemId: items[j].id, lostMin });
        remaining -= lostMin;
      }

      let displayCursor = rows[segStart].displayStart;
      for (let j = segStart; j < i; j += 1) {
        rows[j].displayStart = displayCursor;
        rows[j].displayEnd = displayCursor + rows[j].effectiveDurationMin;
        displayCursor = rows[j].displayEnd;
      }

      segOffset = 0;
    } else {
      state = 'conflict';
      hasConflict = true;
    }

    rows[i].displayStart = item.lockAt;
    rows[i].displayEnd = item.lockAt + item.durationMin;
    rows[i].effectiveDurationMin = item.durationMin;

    locks.push({
      itemId: item.id,
      index: i,
      lockAt: item.lockAt,
      state,
      diffMin,
      waitMin: state === 'wait' ? -diffMin : 0,
      compressed,
    });

    prevLockEnd = item.lockAt + item.durationMin;
    segStart = i + 1;
  }

  for (let j = segStart; j < count; j += 1) {
    rows[j].displayStart = rows[j].planStart + segOffset;
    rows[j].displayEnd = rows[j].displayStart + rows[j].effectiveDurationMin;
  }

  const lastRow = count > 0 ? rows[count - 1] : undefined;

  return {
    rows,
    locks,
    totalPlanMin,
    plannedEndMin: lastRow
      ? lastRow.planStart + items[count - 1].durationMin
      : sheet.startMin,
    displayEndMin: lastRow ? lastRow.displayEnd : sheet.startMin,
    hasConflict,
  };
}

export function offsetAfterDone(
  sheet: Sheet,
  index: number,
  actualEndMin: number,
): number {
  if (index < 0 || index >= sheet.items.length) {
    return 0;
  }
  const row = computeTimeline(sheet, 0).rows[index];
  return actualEndMin - row.planStart - sheet.items[index].durationMin;
}

export function offsetAfterShift(
  sheet: Sheet,
  nextIndex: number,
  actualStartMin: number,
): number | null {
  if (nextIndex < 0 || nextIndex >= sheet.items.length) {
    return null;
  }
  if (sheet.items[nextIndex].lockAt !== null) {
    return null;
  }
  const row = computeTimeline(sheet, 0).rows[nextIndex];
  return actualStartMin - row.planStart;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function clockParts(min: number): { prefix: string; hour: number; minute: number } {
  const dayOffset = Math.floor(min / 1440);
  const inDay = ((min % 1440) + 1440) % 1440;
  const prefix = dayOffset >= 1 ? t('次日 ') : dayOffset <= -1 ? t('前日 ') : '';
  return {
    prefix,
    hour: Math.floor(inDay / 60),
    minute: inDay % 60,
  };
}

export function formatClock(min: number): string {
  const { prefix, hour, minute } = clockParts(min);
  return `${prefix}${pad2(hour)}:${pad2(minute)}`;
}

export function formatClockDisplay(min: number): string {
  const { prefix, hour, minute } = clockParts(min);
  return `${prefix}${pad2(hour)}\u2236${pad2(minute)}`;
}

export function formatDuration(totalMin: number): string {
  const total = Math.max(0, Math.round(totalMin));
  if (total < 60) {
    return t('{n} 分钟', { n: total });
  }
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return t('{h} 小时 {m} 分钟', { h: hours, m: pad2(minutes) });
}

export function parseClock(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}
