import type { Item, RuntimeState, Sheet } from './types';

/** 单场最多允许现场插入的环节数。 */
export const MAX_INSERTED_ITEMS = 20;

function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function applyLockOverride(item: Item, override: number | null): Item {
  if (override === null) {
    const next: Item = { ...item, lockAt: null };
    delete next.locked;
    return next;
  }
  return { ...item, lockAt: override, locked: true };
}

/**
 * 生成执行用有效手册：把现场插入环节按 afterId 合并进原环节之后，
 * 并应用锁定覆盖。原 Sheet 不被修改。
 */
export function buildExecutionSheet(sheet: Sheet, runtime: RuntimeState): Sheet {
  const originalItems = sheet.items;
  const originalIds = new Set(originalItems.map((item) => item.id));
  const overrides = runtime.lockOverrides ?? {};

  const entries = (runtime.insertedItems ?? []).slice(0, MAX_INSERTED_ITEMS);
  const pending = entries.filter(
    (entry) =>
      !!entry &&
      !!entry.item &&
      typeof entry.afterId === 'string' &&
      !originalIds.has(entry.item.id),
  );

  if (pending.length === 0 && Object.keys(overrides).length === 0) {
    return sheet;
  }

  const afterMap = new Map<string, Item[]>();
  const trailing: Item[] = [];
  for (const entry of pending) {
    if (originalIds.has(entry.afterId)) {
      const list = afterMap.get(entry.afterId);
      if (list) {
        list.push(entry.item);
      } else {
        afterMap.set(entry.afterId, [entry.item]);
      }
    } else {
      trailing.push(entry.item);
    }
  }

  const merged: Item[] = [];
  for (const item of originalItems) {
    merged.push(item);
    const inserted = afterMap.get(item.id);
    if (inserted) {
      merged.push(...inserted);
    }
  }
  merged.push(...trailing);

  const items = merged.map((item) =>
    Object.prototype.hasOwnProperty.call(overrides, item.id)
      ? applyLockOverride(item, overrides[item.id])
      : item,
  );

  return { ...sheet, items };
}

/** 追加一条现场插入；超过上限返回原 runtime。 */
export function addInsertedItem(
  runtime: RuntimeState,
  item: Item,
  afterId: string,
  now: number = Date.now(),
): RuntimeState {
  if (runtime.insertedItems.length >= MAX_INSERTED_ITEMS) {
    return runtime;
  }

  return {
    ...runtime,
    insertedItems: [
      ...runtime.insertedItems,
      { id: createId(), afterId, createdAt: now, item },
    ],
  };
}
