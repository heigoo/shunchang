import type { Item, Sheet } from '../domain/types';
import { createEmptyItem, isValidDateKey } from '../domain/types';
import { computeTimeline, parseClock } from '../domain/timeline';
import type { SheetError } from '../domain/validate';
import { validateForPublish } from '../domain/validate';

export const MAX_ITEMS = 60;

const MAX_NAME_LENGTH = 40;

function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join('') : value;
}

/** 内容变更后统一更新时间戳，并给已发布手册打上未发布标记。 */
function touch(sheet: Sheet): Sheet {
  const next: Sheet = { ...sheet, updatedAt: Date.now() };
  if (sheet.status === 'published') {
    next.dirty = true;
  }
  return next;
}

function inRange(sheet: Sheet, index: number): boolean {
  return index >= 0 && index < sheet.items.length;
}

export function updateItemField(
  sheet: Sheet,
  index: number,
  patch: Partial<Item>,
): Sheet {
  if (!inRange(sheet, index)) {
    return sheet;
  }
  const items = sheet.items.slice();
  items[index] = { ...items[index], ...patch };
  return touch({ ...sheet, items });
}

export function addItem(sheet: Sheet): Sheet {
  if (sheet.items.length >= MAX_ITEMS) {
    return sheet;
  }
  return touch({ ...sheet, items: [...sheet.items, createEmptyItem()] });
}

export function removeItem(sheet: Sheet, index: number): Sheet {
  if (!inRange(sheet, index)) {
    return sheet;
  }
  return touch({
    ...sheet,
    items: sheet.items.filter((_item, position) => position !== index),
  });
}

export function moveItem(
  sheet: Sheet,
  index: number,
  direction: -1 | 1,
): Sheet {
  const target = index + direction;
  if (!inRange(sheet, index) || !inRange(sheet, target)) {
    return sheet;
  }
  const items = sheet.items.slice();
  const moved = items[index];
  items[index] = items[target];
  items[target] = moved;
  return touch({ ...sheet, items });
}

export function sortByPlanTime(sheet: Sheet): Sheet {
  const rows = computeTimeline(sheet, 0).rows;
  const order = rows.map((row) => ({ index: row.index, planStart: row.planStart }));
  order.sort((a, b) => a.planStart - b.planStart || a.index - b.index);

  const changed = order.some((entry, position) => entry.index !== position);
  if (!changed) {
    return sheet;
  }

  return touch({
    ...sheet,
    items: order.map((entry) => sheet.items[entry.index]),
  });
}

export function setSheetName(sheet: Sheet, name: string): Sheet {
  return touch({ ...sheet, name: truncate(name, MAX_NAME_LENGTH) });
}

export function setSheetDate(sheet: Sheet, text: string): Sheet | null {
  const trimmed = text.trim();
  if (!isValidDateKey(trimmed)) {
    return null;
  }
  if (trimmed === sheet.date) {
    return sheet;
  }
  return touch({ ...sheet, date: trimmed });
}

export function setStartTime(sheet: Sheet, text: string): Sheet | null {
  const parsed = parseClock(text);
  if (parsed === null) {
    return null;
  }
  return touch({ ...sheet, startMin: parsed });
}

export function setItemDuration(
  sheet: Sheet,
  index: number,
  text: string,
): Sheet | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1 || value > 600) {
    return null;
  }
  if (!inRange(sheet, index)) {
    return sheet;
  }
  return updateItemField(sheet, index, { durationMin: value });
}

export function setItemLockAt(
  sheet: Sheet,
  index: number,
  text: string,
): Sheet | null {
  const parsed = parseClock(text);
  if (parsed === null) {
    return null;
  }
  if (!inRange(sheet, index)) {
    return sheet;
  }
  return updateItemField(sheet, index, { lockAt: parsed });
}

export function toggleLock(sheet: Sheet, index: number): Sheet {
  if (!inRange(sheet, index)) {
    return sheet;
  }
  const item = sheet.items[index];
  if (item.locked === true) {
    return updateItemField(sheet, index, { locked: false, lockAt: null });
  }
  const row = computeTimeline(sheet, 0).rows[index];
  return updateItemField(sheet, index, {
    locked: true,
    lockAt: item.lockAt === null ? row.planStart : item.lockAt,
  });
}

export interface PublishResult {
  ok: boolean;
  sheet: Sheet;
  errors: SheetError[];
}

export function publishSheet(sheet: Sheet): PublishResult {
  const errors = validateForPublish(sheet);
  if (errors.length > 0) {
    return { ok: false, sheet, errors };
  }
  return {
    ok: true,
    sheet: {
      ...sheet,
      status: 'published',
      version: sheet.version + 1,
      dirty: false,
      updatedAt: Date.now(),
    },
    errors: [],
  };
}
