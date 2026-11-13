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

  // afterId 既可能指向原环节，也可能指向先前的插入环节；
  // 用递归链保证“插入到当前环节之后”在连续插入时仍然成立。
  const afterMap = new Map<string, Item[]>();
  for (const entry of pending) {
    const list = afterMap.get(entry.afterId);
    if (list) {
      list.push(entry.item);
    } else {
      afterMap.set(entry.afterId, [entry.item]);
    }
  }

  const merged: Item[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>();

  const appendItem = (item: Item) => {
    merged.push(item);
    if (visiting.has(item.id)) {
      return;
    }
    visiting.add(item.id);
    const inserted = afterMap.get(item.id);
    if (inserted) {
      for (const child of inserted) {
        if (placed.has(child.id)) {
          continue;
        }
        placed.add(child.id);
        appendItem(child);
      }
    }
    visiting.delete(item.id);
  };

  for (const item of originalItems) {
    appendItem(item);
  }

  // afterId 完全不存在的插入仍追加到末尾，避免丢失现场记录。
  for (const entry of pending) {
    if (!placed.has(entry.item.id)) {
      merged.push(entry.item);
    }
  }

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
