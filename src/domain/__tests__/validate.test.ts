import { describe, expect, it } from '@rstest/core';

import type { Item, Sheet } from '../types';
import { findPlanConflicts, validateForPublish } from '../validate';

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: `item-${Math.random().toString(36).slice(2, 8)}`,
    name: '入场',
    durationMin: 30,
    owner: '',
    note: '',
    lockAt: null,
    ...overrides,
  };
}

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 'sheet-1',
    name: '婚礼流程',
    date: '2026-11-10',
    startMin: 480,
    items: [makeItem()],
    status: 'draft',
    version: 1,
    updatedAt: 0,
    ...overrides,
  };
}

describe('validateForPublish', () => {
  it('合法手册无错误', () => {
    expect(validateForPublish(makeSheet())).toEqual([]);
  });

  it('空名称', () => {
    const errors = validateForPublish(makeSheet({ name: '   ' }));

    expect(errors).toContainEqual({ field: 'name', message: '请填写手册名称' });
  });

  it('时长不是 1–600 的整数', () => {
    const errors = validateForPublish(
      makeSheet({ items: [makeItem({ durationMin: 0 })] }),
    );

    expect(errors).toContainEqual({
      index: 0,
      field: 'durationMin',
      message: '时长需为 1–600 的整数',
    });
  });

  it('锁定环节未填写锁定时刻', () => {
    const errors = validateForPublish(
      makeSheet({ items: [makeItem({ locked: true, lockAt: null })] }),
    );

    expect(errors).toContainEqual({
      index: 0,
      field: 'lockAt',
      message: '锁定环节需填写锁定时刻',
    });
  });

  it('备注超长', () => {
    const errors = validateForPublish(
      makeSheet({ items: [makeItem({ note: '备'.repeat(201) })] }),
    );

    expect(errors).toContainEqual({
      index: 0,
      field: 'note',
      message: '备注不能超过 200 字',
    });
  });

  it('无环节', () => {
    const errors = validateForPublish(makeSheet({ items: [] }));

    expect(errors).toContainEqual({ field: 'items', message: '至少需要一个环节' });
  });

  it('返回全部错误而非首个错误', () => {
    const errors = validateForPublish(
      makeSheet({
        name: '',
        items: [
          makeItem({ name: '', durationMin: 0 }),
          makeItem({ durationMin: 601 }),
        ],
      }),
    );

    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('findPlanConflicts', () => {
  it('标出锁定时刻早于前一环节计划结束的环节', () => {
    const sheet = makeSheet({
      startMin: 480,
      items: [
        makeItem({ id: 'a', durationMin: 60 }),
        makeItem({ id: 'b', durationMin: 10, lockAt: 530 }),
        makeItem({ id: 'c', durationMin: 10, lockAt: 600 }),
      ],
    });

    expect(findPlanConflicts(sheet)).toEqual([1]);
  });

  it('首个环节不判定冲突', () => {
    const sheet = makeSheet({
      startMin: 480,
      items: [makeItem({ id: 'a', durationMin: 30, lockAt: 400 })],
    });

    expect(findPlanConflicts(sheet)).toEqual([]);
  });
});
