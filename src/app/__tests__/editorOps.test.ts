import { describe, expect, it } from '@rstest/core';

import { computeTimeline, formatClock } from '../../domain/timeline';
import type { Item, Sheet, SheetStatus } from '../../domain/types';
import {
  MAX_ITEMS,
  addItem,
  moveItem,
  publishSheet,
  removeItem,
  setItemDuration,
  setItemLockAt,
  setSheetDate,
  setSheetName,
  setStartTime,
  sheetContentHash,
  sortByPlanTime,
  toggleLock,
  updateItemField,
} from '../editorOps';

function makeItem(id: string, durationMin: number, lockAt: number | null = null): Item {
  return {
    id,
    name: id,
    durationMin,
    owner: '',
    note: '',
    lockAt,
  };
}

function makeSheet(
  items: Item[],
  status: SheetStatus = 'draft',
  startMin = 480,
): Sheet {
  return {
    id: 'sheet-1',
    name: '婚礼流程',
    date: '2026-11-10',
    startMin,
    items,
    status,
    version: 1,
    updatedAt: 0,
  };
}

function planStarts(sheet: Sheet): string[] {
  return computeTimeline(sheet, 0).rows.map((row) => formatClock(row.planStart));
}

describe('updateItemField', () => {
  it('只替换目标环节且不改动原手册', () => {
    const sheet = makeSheet([makeItem('a', 30), makeItem('b', 30)]);
    const next = updateItemField(sheet, 1, { name: '敬酒' });

    expect(next.items[1].name).toBe('敬酒');
    expect(next.items[0].name).toBe('a');
    expect(sheet.items[1].name).toBe('b');
    expect(next).not.toBe(sheet);
  });

  it('越界时返回原对象', () => {
    const sheet = makeSheet([makeItem('a', 30)]);

    expect(updateItemField(sheet, 5, { name: 'x' })).toBe(sheet);
    expect(updateItemField(sheet, -1, { name: 'x' })).toBe(sheet);
  });
});

describe('时长与时间轴联动', () => {
  it('08:00 起 60/30/45 分钟时第三行计划开始为 09:30', () => {
    const base = makeSheet([
      makeItem('a', 60),
      makeItem('b', 30),
      makeItem('c', 45),
    ]);

    expect(planStarts(base)).toEqual(['08:00', '09:00', '09:30']);
    expect(formatClock(computeTimeline(base, 0).rows[2].planStart)).toBe('09:30');

    const next = setItemDuration(base, 0, '90');

    expect(next).not.toBeNull();
    if (!next) return;
    expect(planStarts(next)).toEqual(['08:00', '09:30', '10:00']);
  });

  it('修改起始时间后整条时间轴平移', () => {
    const base = makeSheet([makeItem('a', 30), makeItem('b', 30)]);
    const next = setStartTime(base, '09:15');

    expect(next).not.toBeNull();
    if (!next) return;
    expect(planStarts(next)).toEqual(['09:15', '09:45']);
  });

  it('非法时长返回 null', () => {
    const sheet = makeSheet([makeItem('a', 30)]);

    expect(setItemDuration(sheet, 0, '0')).toBeNull();
    expect(setItemDuration(sheet, 0, '601')).toBeNull();
    expect(setItemDuration(sheet, 0, '12.5')).toBeNull();
    expect(setItemDuration(sheet, 0, '')).toBeNull();
    expect(setItemDuration(sheet, 0, 'abc')).toBeNull();
    expect(setItemDuration(sheet, 0, '600')).not.toBeNull();
  });

  it('非法起始时间返回 null', () => {
    const sheet = makeSheet([makeItem('a', 30)]);

    expect(setStartTime(sheet, '24:00')).toBeNull();
    expect(setStartTime(sheet, '8:5')).toBeNull();
    expect(setStartTime(sheet, '')).toBeNull();
    expect(setStartTime(sheet, ' 09:05 ')).not.toBeNull();
  });

  it('非法锁定时刻返回 null', () => {
    const sheet = makeSheet([makeItem('a', 30)]);

    expect(setItemLockAt(sheet, 0, '12:60')).toBeNull();
    expect(setItemLockAt(sheet, 0, '')).toBeNull();
    expect(setItemLockAt(sheet, 0, '12:08')).not.toBeNull();
  });
});

describe('增删与排序', () => {
  it('添加环节追加到末尾', () => {
    const sheet = makeSheet([makeItem('a', 30)]);
    const next = addItem(sheet);

    expect(next.items).toHaveLength(2);
    expect(next.items[1].durationMin).toBe(30);
  });

  it('达到 60 个后不再增加并返回原对象', () => {
    const items = Array.from({ length: MAX_ITEMS }, (_value, index) =>
      makeItem(`i${index}`, 1),
    );
    const sheet = makeSheet(items);

    expect(addItem(sheet)).toBe(sheet);
    expect(sheet.items).toHaveLength(MAX_ITEMS);
  });

  it('删除环节', () => {
    const sheet = makeSheet([makeItem('a', 30), makeItem('b', 30), makeItem('c', 30)]);
    const next = removeItem(sheet, 1);

    expect(next.items.map((item) => item.id)).toEqual(['a', 'c']);
    expect(removeItem(sheet, 9)).toBe(sheet);
  });

  it('上移与下移', () => {
    const sheet = makeSheet([makeItem('a', 30), makeItem('b', 30), makeItem('c', 30)]);

    expect(moveItem(sheet, 1, -1).items.map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(moveItem(sheet, 1, 1).items.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(moveItem(sheet, 0, -1)).toBe(sheet);
    expect(moveItem(sheet, 2, 1)).toBe(sheet);
  });

  it('按时排序按计划开始升序，锁定环节按锁定时刻落位', () => {
    const sheet = makeSheet([
      makeItem('a', 60),
      makeItem('b', 30),
      makeItem('c', 15, 480),
    ]);

    expect(planStarts(sheet)).toEqual(['08:00', '09:00', '08:00']);

    const next = sortByPlanTime(sheet);

    expect(next.items.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(planStarts(next)).toEqual(['08:00', '08:00', '08:15']);
  });

  it('已有序时不产生新对象', () => {
    const sheet = makeSheet([makeItem('a', 30), makeItem('b', 30)]);

    expect(sortByPlanTime(sheet)).toBe(sheet);
  });
});

describe('活动日期', () => {
  it('接受合法日期并更新时间戳', () => {
    const sheet = makeSheet([makeItem('a', 30)]);
    const next = setSheetDate(sheet, '2026-11-23');

    expect(next).not.toBeNull();
    expect(next?.date).toBe('2026-11-23');
    expect(next?.updatedAt).toBeGreaterThan(sheet.updatedAt);
    expect(sheet.date).toBe('2026-11-10');
  });

  it('拒绝不存在的日期和错误格式', () => {
    const sheet = makeSheet([makeItem('a', 30)]);

    expect(setSheetDate(sheet, '2026-02-30')).toBeNull();
    expect(setSheetDate(sheet, '2026-13-01')).toBeNull();
    expect(setSheetDate(sheet, '2026-2-3')).toBeNull();
    expect(setSheetDate(sheet, '')).toBeNull();
  });

  it('日期未变化时返回原对象', () => {
    const sheet = makeSheet([makeItem('a', 30)]);

    expect(setSheetDate(sheet, '2026-11-10')).toBe(sheet);
  });
});

describe('名称与锁定', () => {
  it('名称截断到 40 字', () => {
    const sheet = makeSheet([makeItem('a', 30)]);
    const longName = '甲'.repeat(45);
    const next = setSheetName(sheet, longName);

    expect(Array.from(next.name)).toHaveLength(40);
    expect(Array.from(next.name).every((char) => char === '甲')).toBe(true);
  });

  it('开启锁定沿用该行计划开始，关闭时清空锁定时刻', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const locked = toggleLock(sheet, 1);

    expect(locked.items[1].locked).toBe(true);
    expect(locked.items[1].lockAt).toBe(540);

    const unlocked = toggleLock(locked, 1);

    expect(unlocked.items[1].locked).toBe(false);
    expect(unlocked.items[1].lockAt).toBeNull();
  });
});

describe('发布状态', () => {
  it('草稿编辑后仍为草稿且不带 dirty', () => {
    const sheet = makeSheet([makeItem('a', 30)]);
    const next = setSheetName(sheet, '草稿改名');

    expect(next.status).toBe('draft');
    expect(next.dirty).toBeUndefined();
    expect(next.updatedAt).toBeGreaterThan(0);
  });

  it('已发布手册编辑后 dirty 为 true 且状态不变', () => {
    const sheet = makeSheet([makeItem('a', 30)], 'published');
    const changed = updateItemField(sheet, 0, { owner: '督导' });

    expect(changed.dirty).toBe(true);
    expect(changed.status).toBe('published');
    expect(changed.updatedAt).toBeGreaterThan(sheet.updatedAt);
  });

  it('发布校验失败时返回错误且不改状态', () => {
    const sheet = makeSheet([makeItem('', 0)]);
    const result = publishSheet(sheet);

    expect(result.ok).toBe(false);
    expect(result.sheet).toBe(sheet);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('发布成功时版本加一、状态发布并清除 dirty', () => {
    const sheet: Sheet = {
      ...makeSheet([makeItem('a', 30)], 'published'),
      version: 3,
      dirty: true,
    };
    const result = publishSheet(sheet);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.sheet.status).toBe('published');
    expect(result.sheet.version).toBe(4);
    expect(result.sheet.dirty).toBe(false);
    expect(sheet.version).toBe(3);
  });
});

describe('发布内容哈希', () => {
  it('内容未变化时重复发布不增版本', () => {
    const first = publishSheet(makeSheet([makeItem('a', 30)]));

    expect(first.ok).toBe(true);
    expect(first.changed).toBe(true);
    expect(first.sheet.version).toBe(2);
    expect(first.sheet.publishedHash).toBeDefined();

    const second = publishSheet(first.sheet);

    expect(second.ok).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.sheet.version).toBe(2);
    expect(second.sheet).toBe(first.sheet);
  });

  it('内容变化后发布增版本', () => {
    const first = publishSheet(makeSheet([makeItem('a', 30)]));
    const edited = setItemDuration(first.sheet, 0, '45');

    expect(edited).not.toBeNull();
    if (!edited) return;
    expect(edited.dirty).toBe(true);

    const second = publishSheet(edited);

    expect(second.changed).toBe(true);
    expect(second.sheet.version).toBe(3);
    expect(second.sheet.dirty).toBe(false);
    expect(second.sheet.publishedHash).not.toBe(first.sheet.publishedHash);
  });

  it('改回原内容后发布不增版本', () => {
    const first = publishSheet(makeSheet([makeItem('a', 30)]));
    const edited = setItemDuration(first.sheet, 0, '45');
    if (!edited) return;
    const reverted = setItemDuration(edited, 0, '30');

    expect(reverted).not.toBeNull();
    if (!reverted) return;
    expect(reverted.dirty).toBe(true);

    const second = publishSheet(reverted);

    expect(second.changed).toBe(false);
    expect(second.sheet.version).toBe(2);
    expect(second.sheet.dirty).toBe(false);
  });

  it('内容哈希不包含状态、版本与更新时间', () => {
    const sheet = makeSheet([makeItem('a', 30)]);
    const decorated: Sheet = {
      ...sheet,
      status: 'published',
      version: 9,
      updatedAt: 123456789,
      dirty: true,
      publishedHash: 'old',
    };

    expect(sheetContentHash(decorated)).toBe(sheetContentHash(sheet));
  });

  it('已完成的手册不能再次发布', () => {
    const result = publishSheet(makeSheet([makeItem('a', 30)], 'done'));

    expect(result.ok).toBe(false);
    expect(result.changed).toBe(false);
  });
});
