import {
  MAX_INSERTED_ITEMS,
  addInsertedItem,
  buildExecutionSheet,
} from '../domain/execution';
import {
  computeTimeline,
  formatClock,
  formatClockDisplay,
  offsetAfterDone,
  offsetAfterShift,
} from '../domain/timeline';
import type { TimelineRow } from '../domain/timeline';
import type { AuditEntry, Item, RuntimeState, Sheet } from '../domain/types';
import { t } from '../i18n';
import { getDeviceId } from './device';

/** 现场操作记录最多保留的条数。 */
export const MAX_AUDIT_ENTRIES = 100;

/** 现场插入环节的表单值。 */
export interface InsertDraft {
  name: string;
  durationMin: number;
  owner: string;
  note: string;
  lockAt: number | null;
}

function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function appendAudit(
  runtime: RuntimeState,
  type: string,
  label: string,
  itemId: string | null,
  at: number,
): AuditEntry[] {
  const entry: AuditEntry = { id: createId(), at, type, label };
  if (itemId !== null) {
    entry.itemId = itemId;
  }
  return runtime.audit.concat(entry).slice(-MAX_AUDIT_ENTRIES);
}

/** 校验插入表单；名称必填，时长限定 1–600 分钟。 */
export function normalizeInsertDraft(draft: InsertDraft): Item | null {
  const name = draft.name.trim();
  const durationMin = Math.trunc(draft.durationMin);
  if (name.length === 0) {
    return null;
  }
  if (!Number.isFinite(durationMin) || durationMin < 1 || durationMin > 600) {
    return null;
  }
  const lockAt =
    typeof draft.lockAt === 'number' && Number.isFinite(draft.lockAt)
      ? draft.lockAt
      : null;
  const item: Item = {
    id: createId(),
    name,
    durationMin,
    owner: draft.owner.trim(),
    note: draft.note.trim(),
    lockAt,
  };
  if (lockAt !== null) {
    item.locked = true;
  }
  return item;
}

/**
 * 在当前环节之后插入一个现场环节。当前环节不变，新环节成为下一环节；
 * 达到上限、没有当前环节或表单不合法时返回原 runtime。
 */
export function insertAfterCurrent(
  sheet: Sheet,
  runtime: RuntimeState,
  draft: InsertDraft,
  now: number = Date.now(),
): RuntimeState {
  if (runtime.insertedItems.length >= MAX_INSERTED_ITEMS) {
    return runtime;
  }

  const execSheet = buildExecutionSheet(sheet, runtime);
  const current = execSheet.items[runtime.currentIndex];
  if (!current) {
    return runtime;
  }

  const item = normalizeInsertDraft(draft);
  if (!item) {
    return runtime;
  }

  const next = addInsertedItem(runtime, item, current.id, now);
  const label = t('插入「{name}」', { name: item.name });

  return {
    ...next,
    audit: appendAudit(next, 'insert', label, item.id, now),
    execVersion: runtime.execVersion + 1,
  };
}

/**
 * 覆盖未完成环节的锁定时刻。lockAt 为 null 表示解除锁定；
 * 已完成/已跳过或位于当前环节之前的环节不可修改。
 */
export function applyLockOverride(
  sheet: Sheet,
  runtime: RuntimeState,
  itemId: string,
  lockAt: number | null,
  now: number = Date.now(),
): RuntimeState {
  const execSheet = buildExecutionSheet(sheet, runtime);
  const index = execSheet.items.findIndex((item) => item.id === itemId);
  if (index < 0 || index < runtime.currentIndex) {
    return runtime;
  }

  if (isTerminal(runtime.actuals[itemId]?.result)) {
    return runtime;
  }

  const item = execSheet.items[index];
  const name = item.name.length > 0 ? item.name : t('未命名环节');
  const value =
    lockAt !== null && Number.isFinite(lockAt) ? Math.round(lockAt) : null;
  const label =
    value === null
      ? t('解除「{name}」锁定', { name })
      : t('锁定「{name}」{time}', { name, time: formatClock(value) });

  return {
    ...runtime,
    lockOverrides: { ...runtime.lockOverrides, [itemId]: value },
    audit: appendAudit(runtime, 'lock', label, itemId, now),
    execVersion: runtime.execVersion + 1,
  };
}

/** 可调整锁定的环节：当前及之后、尚未到终态的环节。 */
export interface LockCandidate {
  index: number;
  itemId: string;
  name: string;
  owner: string;
  lockAt: number | null;
  override: number | null | undefined;
  isCurrent: boolean;
}

export function listLockCandidates(
  sheet: Sheet,
  runtime: RuntimeState,
): LockCandidate[] {
  const execSheet = buildExecutionSheet(sheet, runtime);
  const candidates: LockCandidate[] = [];

  for (let index = runtime.currentIndex; index < execSheet.items.length; index += 1) {
    const item = execSheet.items[index];
    if (isTerminal(runtime.actuals[item.id]?.result)) {
      continue;
    }
    candidates.push({
      index,
      itemId: item.id,
      name: item.name.length > 0 ? item.name : t('未命名环节'),
      owner: item.owner,
      lockAt: item.lockAt,
      override: runtime.lockOverrides[item.id],
      isCurrent: index === runtime.currentIndex,
    });
  }

  return candidates;
}

export type LockPreviewState = 'wait' | 'absorb' | 'conflict' | 'unlocked';

export interface LockPreviewCompressed {
  itemId: string;
  name: string;
  lostMin: number;
}

export interface LockPreview {
  ok: boolean;
  reason: 'missing' | 'finished' | null;
  itemId: string;
  itemName: string;
  lockAt: number | null;
  state: LockPreviewState;
  /** 正数表示按现有偏移会超出锁定时刻。 */
  diffMin: number;
  waitMin: number;
  compressed: LockPreviewCompressed[];
  hasConflict: boolean;
  totalPlanMin: number;
  displayEndMin: number;
}

function previewReason(
  sheet: Sheet,
  runtime: RuntimeState,
  itemId: string,
): 'missing' | 'finished' | null {
  const execSheet = buildExecutionSheet(sheet, runtime);
  const index = execSheet.items.findIndex((item) => item.id === itemId);
  if (index < 0) {
    return 'missing';
  }
  if (index < runtime.currentIndex) {
    return 'finished';
  }
  if (isTerminal(runtime.actuals[itemId]?.result)) {
    return 'finished';
  }
  return null;
}

/**
 * 用 computeTimeline 预览改锁定后的等待/吸收/冲突结果；
 * 冲突时由界面二次确认后再写入。
 */
export function buildLockPreview(
  sheet: Sheet,
  runtime: RuntimeState,
  itemId: string,
  lockAt: number | null,
): LockPreview {
  const reason = previewReason(sheet, runtime, itemId);
  const execSheet = buildExecutionSheet(sheet, runtime);
  const item = execSheet.items.find((entry) => entry.id === itemId);
  const itemName =
    item && item.name.length > 0 ? item.name : t('未命名环节');
  const value =
    lockAt !== null && Number.isFinite(lockAt) ? Math.round(lockAt) : null;

  if (reason !== null || !item) {
    return {
      ok: false,
      reason: reason ?? 'missing',
      itemId,
      itemName,
      lockAt: value,
      state: 'unlocked',
      diffMin: 0,
      waitMin: 0,
      compressed: [],
      hasConflict: false,
      totalPlanMin: 0,
      displayEndMin: 0,
    };
  }

  const previewRuntime: RuntimeState = {
    ...runtime,
    lockOverrides: { ...runtime.lockOverrides, [itemId]: value },
  };
  const previewSheet = buildExecutionSheet(sheet, previewRuntime);
  const timeline = computeTimeline(previewSheet, runtime.offsetMin);
  const lock = timeline.locks.find((entry) => entry.itemId === itemId);

  if (!lock) {
    return {
      ok: true,
      reason: null,
      itemId,
      itemName,
      lockAt: null,
      state: 'unlocked',
      diffMin: 0,
      waitMin: 0,
      compressed: [],
      hasConflict: false,
      totalPlanMin: timeline.totalPlanMin,
      displayEndMin: timeline.displayEndMin,
    };
  }

  return {
    ok: true,
    reason: null,
    itemId,
    itemName,
    lockAt: value,
    state: lock.state,
    diffMin: lock.diffMin,
    waitMin: lock.waitMin,
    compressed: lock.compressed.map((entry) => {
      const target = previewSheet.items.find(
        (candidate) => candidate.id === entry.itemId,
      );
      return {
        itemId: entry.itemId,
        name:
          target && target.name.length > 0
            ? target.name
            : t('未命名环节'),
        lostMin: entry.lostMin,
      };
    }),
    hasConflict: lock.state === 'conflict',
    totalPlanMin: timeline.totalPlanMin,
    displayEndMin: timeline.displayEndMin,
  };
}

export function createRuntime(sheet: Sheet, nowMin: number): RuntimeState {
  const runtime: RuntimeState = {
    sheetId: sheet.id,
    currentIndex: 0,
    actuals: {},
    offsetMin: 0,
    autoOffsetMin: 0,
    manualOffsetMin: 0,
    execVersion: 1,
    lastSyncAt: 0,
    ownerEpoch: 0,
    ownerDeviceId: getDeviceId(),
    lastSyncMode: 'full',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
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
  const execSheet = buildExecutionSheet(sheet, runtime);
  const index = runtime.currentIndex;
  if (index < 0 || index >= execSheet.items.length) {
    return runtime;
  }

  const item = execSheet.items[index];
  const actuals: RuntimeState['actuals'] = {
    ...runtime.actuals,
    [item.id]: {
      ...(runtime.actuals[item.id] ?? {}),
      end: nowMin,
      result: 'done',
    },
  };

  // 完成只重算自动偏移；手动顺延保留，有效偏移为两者之和。
  const autoOffsetMin = offsetAfterDone(execSheet, index, nowMin);
  const offsetMin = autoOffsetMin + runtime.manualOffsetMin;
  const nextIndex = index + 1;

  if (nextIndex < execSheet.items.length) {
    const nextItem = execSheet.items[nextIndex];
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
    autoOffsetMin,
    execVersion: runtime.execVersion + 1,
  };
}

export function skipCurrent(
  sheet: Sheet,
  runtime: RuntimeState,
  nowMin: number,
): RuntimeState {
  const execSheet = buildExecutionSheet(sheet, runtime);
  const index = runtime.currentIndex;
  if (index < 0 || index >= execSheet.items.length) {
    return runtime;
  }

  const item = execSheet.items[index];
  const start = runtime.actuals[item.id]?.start ?? nowMin;
  const actuals: RuntimeState['actuals'] = {
    ...runtime.actuals,
    [item.id]: { start, end: start, result: 'skipped' },
  };

  const nextIndex = index + 1;

  if (nextIndex < execSheet.items.length) {
    const nextItem = execSheet.items[nextIndex];
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
  const execSheet = buildExecutionSheet(sheet, runtime);
  const nextIndex = runtime.currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= execSheet.items.length) {
    return runtime;
  }

  const nextItem = execSheet.items[nextIndex];
  if (nextItem.locked === true || nextItem.lockAt !== null) {
    return runtime;
  }

  const targetOffsetMin = offsetAfterShift(execSheet, nextIndex, nextStartMin);
  if (targetOffsetMin === null) {
    return runtime;
  }

  // 顺延只写手动偏移；自动偏移保持完成环节推导出的值。
  const manualOffsetMin = targetOffsetMin - runtime.autoOffsetMin;

  return {
    ...runtime,
    offsetMin: runtime.autoOffsetMin + manualOffsetMin,
    manualOffsetMin,
    execVersion: runtime.execVersion + 1,
  };
}

/** 清除手动顺延，只保留自动偏移。 */
export function clearManualShift(runtime: RuntimeState): RuntimeState {
  if (
    runtime.manualOffsetMin === 0 &&
    runtime.offsetMin === runtime.autoOffsetMin
  ) {
    return runtime;
  }

  return {
    ...runtime,
    offsetMin: runtime.autoOffsetMin,
    manualOffsetMin: 0,
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
  const execSheet = buildExecutionSheet(sheet, runtime);
  const timeline = computeTimeline(execSheet, runtime.offsetMin);
  const total = execSheet.items.length;
  const finished = runtime.currentIndex >= total;
  const currentIndex = runtime.currentIndex;

  const currentItem =
    !finished && currentIndex >= 0 ? execSheet.items[currentIndex] ?? null : null;
  const currentRow =
    currentItem !== null ? timeline.rows[currentIndex] ?? null : null;

  const nextIndex = currentIndex + 1;
  const nextItem =
    !finished && nextIndex < total ? execSheet.items[nextIndex] ?? null : null;
  const nextRow = nextItem !== null ? timeline.rows[nextIndex] ?? null : null;

  let actualTotalMin = 0;
  for (const item of execSheet.items) {
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
      const lockAt = execSheet.items[i].lockAt;
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
