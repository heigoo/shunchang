import {
  computeTimeline,
  formatClockDisplay,
  offsetAfterDone,
  offsetAfterShift,
} from '../domain/timeline';
import type { TimelineRow } from '../domain/timeline';
import type { Item, RuntimeState, Sheet } from '../domain/types';

export function createRuntime(sheet: Sheet, nowMin: number): RuntimeState {
  const runtime: RuntimeState = {
    sheetId: sheet.id,
    currentIndex: 0,
    actuals: {},
    offsetMin: 0,
    execVersion: 1,
    lastSyncAt: 0,
  };

  const first = sheet.items[0];
  if (first) {
    runtime.actuals[first.id] = { start: nowMin };
  }

  return runtime;
}

export function completeCurrent(
  sheet: Sheet,
  runtime: RuntimeState,
  nowMin: number,
): RuntimeState {
  const index = runtime.currentIndex;
  if (index < 0 || index >= sheet.items.length) {
    return runtime;
  }

  const item = sheet.items[index];
  const actuals: RuntimeState['actuals'] = {
    ...runtime.actuals,
    [item.id]: {
      ...(runtime.actuals[item.id] ?? {}),
      end: nowMin,
      result: 'done',
    },
  };

  const offsetMin = offsetAfterDone(sheet, index, nowMin);
  const nextIndex = index + 1;

  if (nextIndex < sheet.items.length) {
    const nextItem = sheet.items[nextIndex];
    actuals[nextItem.id] = {
      ...(actuals[nextItem.id] ?? {}),
      start: nowMin,
    };
  }

  return {
    ...runtime,
    currentIndex: nextIndex,
    actuals,
    offsetMin,
    execVersion: runtime.execVersion + 1,
  };
}

export function skipCurrent(
  sheet: Sheet,
  runtime: RuntimeState,
  nowMin: number,
): RuntimeState {
  const index = runtime.currentIndex;
  if (index < 0 || index >= sheet.items.length) {
    return runtime;
  }

  const item = sheet.items[index];
  const start = runtime.actuals[item.id]?.start ?? nowMin;
  const actuals: RuntimeState['actuals'] = {
    ...runtime.actuals,
    [item.id]: { start, end: start, result: 'skipped' },
  };

  const nextIndex = index + 1;

  if (nextIndex < sheet.items.length) {
    const nextItem = sheet.items[nextIndex];
    actuals[nextItem.id] = {
      ...(actuals[nextItem.id] ?? {}),
      start: nowMin,
    };
  }

  return {
    ...runtime,
    currentIndex: nextIndex,
    actuals,
    execVersion: runtime.execVersion + 1,
  };
}

export function applyShift(
  sheet: Sheet,
  runtime: RuntimeState,
  nextStartMin: number,
): RuntimeState {
  const nextIndex = runtime.currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= sheet.items.length) {
    return runtime;
  }

  const nextItem = sheet.items[nextIndex];
  if (nextItem.locked === true || nextItem.lockAt !== null) {
    return runtime;
  }

  const offsetMin = offsetAfterShift(sheet, nextIndex, nextStartMin);
  if (offsetMin === null) {
    return runtime;
  }

  return {
    ...runtime,
    offsetMin,
    execVersion: runtime.execVersion + 1,
  };
}

export interface RuntimeView {
  finished: boolean;
  currentIndex: number;
  currentItem: Item | null;
  currentRow: TimelineRow | null;
  nextItem: Item | null;
  nextRow: TimelineRow | null;
  segmentNo: number;
  segmentTotal: number;
  planRangeText: string;
  countdownTargetMin: number | null;
  countdownIsLock: boolean;
  planTotalMin: number;
  actualTotalMin: number;
  diffMin: number;
  hasConflict: boolean;
}

function actualDurationMin(
  actual: { start?: number; end?: number } | undefined,
): number {
  if (!actual || actual.start === undefined || actual.end === undefined) {
    return 0;
  }
  let duration = actual.end - actual.start;
  if (duration < 0) {
    duration += 1440;
  }
  return duration;
}

function isTerminal(result: 'done' | 'skipped' | undefined): boolean {
  return result === 'done' || result === 'skipped';
}

export function buildRuntimeView(sheet: Sheet, runtime: RuntimeState): RuntimeView {
  const timeline = computeTimeline(sheet, runtime.offsetMin);
  const total = sheet.items.length;
  const finished = runtime.currentIndex >= total;
  const currentIndex = runtime.currentIndex;

  const currentItem =
    !finished && currentIndex >= 0 ? sheet.items[currentIndex] ?? null : null;
  const currentRow =
    currentItem !== null ? timeline.rows[currentIndex] ?? null : null;

  const nextIndex = currentIndex + 1;
  const nextItem =
    !finished && nextIndex < total ? sheet.items[nextIndex] ?? null : null;
  const nextRow = nextItem !== null ? timeline.rows[nextIndex] ?? null : null;

  let actualTotalMin = 0;
  for (const item of sheet.items) {
    const actual = runtime.actuals[item.id];
    if (!actual || !isTerminal(actual.result)) {
      continue;
    }
    if (actual.result === 'skipped') {
      continue;
    }
    actualTotalMin += actualDurationMin(actual);
  }

  const planTotalMin = timeline.totalPlanMin;

  const planRow = currentRow ?? (finished && total > 0 ? timeline.rows[total - 1] : null);
  const planRangeText = planRow
    ? `${formatClockDisplay(planRow.displayStart)} — ${formatClockDisplay(planRow.displayEnd)}`
    : '';

  let countdownTargetMin: number | null = null;
  let countdownIsLock = false;

  if (!finished && currentRow) {
    let lockTarget: number | null = null;
    for (let i = currentIndex + 1; i < total; i += 1) {
      const lockAt = sheet.items[i].lockAt;
      if (lockAt !== null) {
        lockTarget = lockAt;
        break;
      }
    }

    countdownTargetMin = currentRow.displayEnd;
    if (lockTarget !== null && lockTarget <= currentRow.displayEnd) {
      countdownTargetMin = lockTarget;
      countdownIsLock = true;
    }
  }

  return {
    finished,
    currentIndex,
    currentItem,
    currentRow,
    nextItem,
    nextRow,
    segmentNo: finished ? total : currentIndex + 1,
    segmentTotal: total,
    planRangeText,
    countdownTargetMin,
    countdownIsLock,
    planTotalMin,
    actualTotalMin,
    diffMin: actualTotalMin - planTotalMin,
    hasConflict: timeline.hasConflict,
  };
}
