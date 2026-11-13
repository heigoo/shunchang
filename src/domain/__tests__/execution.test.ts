import { describe, expect, it } from '@rstest/core';

import {
  MAX_INSERTED_ITEMS,
  addInsertedItem,
  buildExecutionSheet,
} from '../execution';
import type {
  InsertedItem,
  Item,
  RuntimeState,
  Sheet,
} from '../types';

function makeItem(
  id: string,
  durationMin: number,
  lockAt: number | null = null,
): Item {
  return { id, name: id, durationMin, owner: '', note: '', lockAt };
}

function makeSheet(items: Item[], startMin = 480): Sheet {
  return {
    id: 'sheet-exec',
    name: '执行手册',
    date: '2026-11-10',
    startMin,
    items,
    status: 'running',
    version: 1,
    updatedAt: 0,
  };
}

function makeRuntime(patch: Partial<RuntimeState> = {}): RuntimeState {
  return {
    sheetId: 'sheet-exec',
    currentIndex: 0,
    actuals: {},
    offsetMin: 0,
    autoOffsetMin: 0,
    manualOffsetMin: 0,
    execVersion: 1,
    lastSyncAt: 0,
    ownerEpoch: 0,
    ownerDeviceId: '',
    lastSyncMode: 'full',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
    ...patch,
  };
}

function inserted(id: string, afterId: string, item: Item): InsertedItem {
  return { id, afterId, createdAt: 0, item };
}

describe('buildExecutionSheet 现场插入', () => {
  it('按 afterId 插入到原环节之后', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10), makeItem('c', 10)]);
    const runtime = makeRuntime({
      insertedItems: [inserted('insert-1', 'a', makeItem('x', 5))],
    });

    const exec = buildExecutionSheet(sheet, runtime);

    expect(exec.items.map((item) => item.id)).toEqual(['a', 'x', 'b', 'c']);
    expect(sheet.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('多个插入保持写入顺序，原 Sheet 不被修改', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10)]);
    const snapshot = JSON.stringify(sheet);
    const runtime = makeRuntime({
      insertedItems: [
        inserted('insert-1', 'a', makeItem('x', 5)),
        inserted('insert-2', 'a', makeItem('y', 5)),
      ],
    });

    const exec = buildExecutionSheet(sheet, runtime);

    expect(exec.items.map((item) => item.id)).toEqual(['a', 'x', 'y', 'b']);
    expect(JSON.stringify(sheet)).toBe(snapshot);
  });

  it('afterId 不存在时追加到末尾', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10)]);
    const runtime = makeRuntime({
      insertedItems: [inserted('insert-1', 'missing', makeItem('x', 5))],
    });

    const exec = buildExecutionSheet(sheet, runtime);

    expect(exec.items.map((item) => item.id)).toEqual(['a', 'b', 'x']);
  });

  it('最多合并 20 个现场插入', () => {
    const sheet = makeSheet([makeItem('a', 10)]);
    const insertedItems: InsertedItem[] = Array.from(
      { length: MAX_INSERTED_ITEMS + 5 },
      (_value, index) =>
        inserted(`insert-${index}`, 'a', makeItem(`extra-${index}`, 1)),
    );

    const exec = buildExecutionSheet(sheet, makeRuntime({ insertedItems }));

    expect(exec.items).toHaveLength(1 + MAX_INSERTED_ITEMS);
  });
});

describe('buildExecutionSheet 锁定覆盖', () => {
  it('覆盖为具体时刻后按新锁定时刻生效', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10, 600)]);
    const runtime = makeRuntime({ lockOverrides: { b: 700 } });

    const exec = buildExecutionSheet(sheet, runtime);
    const item = exec.items[1];

    expect(item.lockAt).toBe(700);
    expect(item.locked).toBe(true);
    expect(sheet.items[1].lockAt).toBe(600);
  });

  it('覆盖为 null 表示解除锁定', () => {
    const sheet = makeSheet([makeItem('locked', 10, 620)]);
    sheet.items[0].locked = true;
    const runtime = makeRuntime({ lockOverrides: { locked: null } });

    const exec = buildExecutionSheet(sheet, runtime);

    expect(exec.items[0].lockAt).toBeNull();
    expect(exec.items[0].locked).toBeUndefined();
    expect(sheet.items[0].lockAt).toBe(620);
  });
});

describe('addInsertedItem', () => {
  it('追加插入记录', () => {
    const runtime = makeRuntime();

    const next = addInsertedItem(runtime, makeItem('x', 5), 'a', 1000);

    expect(next.insertedItems).toHaveLength(1);
    expect(next.insertedItems[0].afterId).toBe('a');
    expect(next.insertedItems[0].createdAt).toBe(1000);
    expect(next.insertedItems[0].item.id).toBe('x');
    expect(runtime.insertedItems).toHaveLength(0);
  });

  it('达到上限后返回原 runtime', () => {
    const full = makeRuntime({
      insertedItems: Array.from({ length: MAX_INSERTED_ITEMS }, (_value, index) =>
        inserted(`insert-${index}`, 'a', makeItem(`extra-${index}`, 1)),
      ),
    });

    expect(addInsertedItem(full, makeItem('x', 5), 'a')).toBe(full);
  });
});
