import { describe, expect, it } from '@rstest/core';

import type { Item, RuntimeState, Sheet } from '../../domain/types';
import {
  applyShift,
  buildRuntimeView,
  completeCurrent,
  createRuntime,
  skipCurrent,
} from '../runtimeOps';

function makeItem(
  id: string,
  durationMin: number,
  lockAt: number | null = null,
): Item {
  return {
    id,
    name: id,
    durationMin,
    owner: '',
    note: '',
    lockAt,
  };
}

function makeSheet(items: Item[], startMin = 480): Sheet {
  return {
    id: 'sheet-runtime',
    name: '执行手册',
    date: '2026-11-10',
    startMin,
    items,
    status: 'running',
    version: 1,
    updatedAt: 0,
  };
}

describe('createRuntime', () => {
  it('首个环节在现在开始，索引为 0', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const runtime = createRuntime(sheet, 490);

    expect(runtime.currentIndex).toBe(0);
    expect(runtime.actuals.a.start).toBe(490);
    expect(runtime.offsetMin).toBe(0);
    expect(runtime.execVersion).toBe(1);
    expect(runtime.lastSyncAt).toBe(0);
  });
});

describe('completeCurrent', () => {
  it('完成第一环节后按实际结束时间重算偏移并推进', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const runtime = createRuntime(sheet, 480);
    const next = completeCurrent(sheet, runtime, 550);

    expect(next.offsetMin).toBe(10);
    expect(next.currentIndex).toBe(1);
    expect(next.actuals.a.end).toBe(550);
    expect(next.actuals.a.result).toBe('done');
    expect(next.actuals.b.start).toBe(550);
    expect(next.execVersion).toBe(2);
  });
});

describe('skipCurrent', () => {
  it('跳过不改偏移，实际时长为 0', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const runtime: RuntimeState = { ...createRuntime(sheet, 480), offsetMin: 5 };
    const next = skipCurrent(sheet, runtime, 500);

    expect(next.offsetMin).toBe(5);
    expect(next.currentIndex).toBe(1);
    expect(next.actuals.a.result).toBe('skipped');
    expect(next.actuals.a.start).toBe(480);
    expect(next.actuals.a.end).toBe(480);
    expect(next.actuals.b.start).toBe(500);
    expect(next.execVersion).toBe(2);
  });
});

describe('applyShift', () => {
  it('下一环节为锁定时返回原对象', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30, 600)]);
    const runtime = createRuntime(sheet, 480);

    expect(applyShift(sheet, runtime, 500)).toBe(runtime);
  });
});

describe('buildRuntimeView', () => {
  it('完成页统计计划、实际与差值', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const runtime: RuntimeState = {
      sheetId: sheet.id,
      currentIndex: 2,
      actuals: {
        a: { start: 480, end: 550, result: 'done' },
        b: { start: 550, end: 570, result: 'done' },
      },
      offsetMin: 0,
      execVersion: 3,
      lastSyncAt: 0,
    };
    const view = buildRuntimeView(sheet, runtime);

    expect(view.finished).toBe(true);
    expect(view.planTotalMin).toBe(90);
    expect(view.actualTotalMin).toBe(90);
    expect(view.diffMin).toBe(0);
  });

  it('倒计时目标取展示结束与下一锁定时刻的较小值', () => {
    const sheet = makeSheet([makeItem('a', 38, null), makeItem('b', 30, 728)], 710);
    const runtime = createRuntime(sheet, 720);
    const view = buildRuntimeView(sheet, runtime);

    expect(view.currentRow?.displayStart).toBe(710);
    expect(view.countdownTargetMin).toBe(728);
    expect(view.countdownIsLock).toBe(true);
  });
});
