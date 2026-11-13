import { describe, expect, it } from '@rstest/core';

import { buildExecutionSheet, MAX_INSERTED_ITEMS } from '../../domain/execution';
import type { InsertedItem, Item, RuntimeState, Sheet } from '../../domain/types';
import {
  applyLockOverride,
  buildLockPreview,
  insertAfterCurrent,
  listLockCandidates,
  normalizeInsertDraft,
} from '../runtimeOps';
import type { InsertDraft } from '../runtimeOps';

function makeItem(
  id: string,
  durationMin: number,
  lockAt: number | null = null,
): Item {
  return { id, name: id, durationMin, owner: '', note: '', lockAt };
}

function makeSheet(items: Item[], startMin = 480): Sheet {
  return {
    id: 'sheet-adjust',
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
    sheetId: 'sheet-adjust',
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

function draft(name: string, durationMin = 10): InsertDraft {
  return { name, durationMin, owner: '', note: '', lockAt: null };
}

function inserted(id: string, afterId: string): InsertedItem {
  return {
    id,
    afterId,
    createdAt: 0,
    item: makeItem(`extra-${id}`, 1),
  };
}

describe('normalizeInsertDraft', () => {
  it('校验名称与 1–600 分钟时长', () => {
    expect(normalizeInsertDraft(draft('  '))).toBeNull();
    expect(normalizeInsertDraft(draft('致辞', 0))).toBeNull();
    expect(normalizeInsertDraft(draft('致辞', 601))).toBeNull();

    const item = normalizeInsertDraft({
      name: ' 长辈致辞 ',
      durationMin: 10,
      owner: ' 主持 ',
      note: ' 临时 ',
      lockAt: null,
    });

    expect(item).not.toBeNull();
    expect(item?.name).toBe('长辈致辞');
    expect(item?.owner).toBe('主持');
    expect(item?.note).toBe('临时');
    expect(item?.lockAt).toBeNull();
  });
});

describe('insertAfterCurrent', () => {
  it('插到当前环节之后，当前环节不变且新环节成为下一环节', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const runtime = makeRuntime();

    const next = insertAfterCurrent(sheet, runtime, draft('长辈致辞', 10), 1000);
    const exec = buildExecutionSheet(sheet, next);

    expect(exec.items.map((item) => item.id)).toEqual([
      'a',
      next.insertedItems[0].item.id,
      'b',
    ]);
    expect(next.currentIndex).toBe(0);
    expect(next.execVersion).toBe(2);
    expect(next.audit).toHaveLength(1);
    expect(next.audit[0].type).toBe('insert');
    expect(next.audit[0].label).toBe('插入「长辈致辞」');
    expect(next.insertedItems[0].afterId).toBe('a');
    expect(next.insertedItems[0].createdAt).toBe(1000);
  });

  it('连续插入到已插入环节之后时仍保持顺序', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10)]);
    const first = insertAfterCurrent(sheet, makeRuntime(), draft('x'), 1000);
    const advanced: RuntimeState = { ...first, currentIndex: 1 };

    const second = insertAfterCurrent(sheet, advanced, draft('y'), 2000);
    const exec = buildExecutionSheet(sheet, second);
    const ids = exec.items.map((item) => item.id);

    expect(ids[0]).toBe('a');
    expect(ids[3]).toBe('b');
    expect(ids).toHaveLength(4);
    expect(exec.items[1].name).toBe('x');
    expect(exec.items[2].name).toBe('y');
    expect(second.audit).toHaveLength(2);
    expect(second.execVersion).toBe(3);
  });

  it('达到 20 个上限后不写入、不增加版本', () => {
    const sheet = makeSheet([makeItem('a', 10)]);
    const full = makeRuntime({
      insertedItems: Array.from({ length: MAX_INSERTED_ITEMS }, (_value, index) =>
        inserted(`insert-${index}`, 'a'),
      ),
    });

    const next = insertAfterCurrent(sheet, full, draft('溢出'));

    expect(next).toBe(full);
    expect(next.audit).toHaveLength(0);
    expect(next.execVersion).toBe(1);
  });

  it('表单不合法时返回原 runtime', () => {
    const sheet = makeSheet([makeItem('a', 10)]);
    const runtime = makeRuntime();

    expect(insertAfterCurrent(sheet, runtime, draft('', 10))).toBe(runtime);
    expect(insertAfterCurrent(sheet, runtime, draft('x', 0))).toBe(runtime);
  });
});

describe('applyLockOverride', () => {
  it('写入具体时刻并记录审计与版本递增', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10, 600)]);
    const runtime = makeRuntime();

    const next = applyLockOverride(sheet, runtime, 'b', 630, 1000);
    const exec = buildExecutionSheet(sheet, next);

    expect(next.lockOverrides.b).toBe(630);
    expect(exec.items[1].lockAt).toBe(630);
    expect(next.audit[0].type).toBe('lock');
    expect(next.audit[0].label).toBe('锁定「b」10:30');
    expect(next.execVersion).toBe(2);
  });

  it('null 表示解除锁定', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10, 600)]);
    const runtime = makeRuntime();

    const next = applyLockOverride(sheet, runtime, 'b', null);
    const exec = buildExecutionSheet(sheet, next);

    expect(next.lockOverrides.b).toBeNull();
    expect(exec.items[1].lockAt).toBeNull();
    expect(exec.items[1].locked).toBeUndefined();
    expect(next.audit[0].label).toBe('解除「b」锁定');
    expect(next.execVersion).toBe(2);
  });

  it('已完成或当前环节之前的环节不可修改', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10)]);
    const doneRuntime = makeRuntime({
      actuals: { b: { result: 'done' } },
    });
    const advanced = makeRuntime({ currentIndex: 1 });

    expect(applyLockOverride(sheet, doneRuntime, 'b', 630)).toBe(doneRuntime);
    expect(applyLockOverride(sheet, advanced, 'a', 630)).toBe(advanced);
  });
});

describe('listLockCandidates', () => {
  it('只列出当前及之后未完成环节', () => {
    const sheet = makeSheet([
      makeItem('a', 10),
      makeItem('b', 10, 600),
      makeItem('c', 10),
    ]);
    const runtime = makeRuntime({
      currentIndex: 1,
      actuals: { a: { result: 'done' }, b: { result: 'skipped' } },
    });

    const candidates = listLockCandidates(sheet, runtime);

    expect(candidates.map((entry) => entry.itemId)).toEqual(['c']);
  });
});

describe('buildLockPreview 三态', () => {
  it('wait：锁定晚于预计结束时给出等待分钟数', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10)]);
    const runtime = makeRuntime();

    const preview = buildLockPreview(sheet, runtime, 'b', 520);

    expect(preview.ok).toBe(true);
    expect(preview.state).toBe('wait');
    expect(preview.waitMin).toBe(30);
    expect(preview.hasConflict).toBe(false);
  });

  it('absorb：压缩前序环节并列出受影响环节', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 10)]);
    const runtime = makeRuntime();

    const preview = buildLockPreview(sheet, runtime, 'b', 520);

    expect(preview.state).toBe('absorb');
    expect(preview.diffMin).toBe(20);
    expect(preview.compressed.map((entry) => entry.name)).toEqual(['a']);
    expect(preview.compressed[0].lostMin).toBe(20);
  });

  it('conflict：超出前序容量时标记时间不足', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10)]);
    const runtime = makeRuntime();

    const preview = buildLockPreview(sheet, runtime, 'b', 400);

    expect(preview.state).toBe('conflict');
    expect(preview.diffMin).toBe(90);
    expect(preview.hasConflict).toBe(true);
  });

  it('点击解除锁定时预览为 unlocked', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10, 600)]);
    const runtime = makeRuntime();

    const preview = buildLockPreview(sheet, runtime, 'b', null);

    expect(preview.ok).toBe(true);
    expect(preview.state).toBe('unlocked');
  });

  it('已完成环节返回不可调整', () => {
    const sheet = makeSheet([makeItem('a', 10), makeItem('b', 10)]);
    const runtime = makeRuntime({ actuals: { b: { result: 'done' } } });

    const preview = buildLockPreview(sheet, runtime, 'b', 630);

    expect(preview.ok).toBe(false);
    expect(preview.reason).toBe('finished');
  });
});
