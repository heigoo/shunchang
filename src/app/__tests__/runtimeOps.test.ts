import { describe, expect, it } from '@rstest/core';

import type { Item, RuntimeState, Sheet } from '../../domain/types';
import { normalizeRuntime } from '../../store/repository';
import {
  applyShift,
  buildRuntimeView,
  clearManualShift,
  completeCurrent,
  createRuntime,
  skipCurrent,
} from '../runtimeOps';
import { getDeviceId } from '../device';
import { extendStartMin } from '../shiftPreview';

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

  it('stamps the local device as the owner', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const runtime = createRuntime(sheet, 490);

    expect(runtime.ownerEpoch).toBe(0);
    expect(runtime.ownerDeviceId).toBe(getDeviceId());
    expect(runtime.ownerDeviceId).toMatch(/^D-[2-9A-HJ-NP-Z]{4}$/);
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
    const runtime: RuntimeState = { ...createRuntime(sheet, 480), offsetMin: 5, autoOffsetMin: 5 };
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
      autoOffsetMin: 0,
      manualOffsetMin: 0,
      execVersion: 3,
      lastSyncAt: 0,
      ownerEpoch: 0,
      ownerDeviceId: '',
      lastSyncMode: 'full',
      insertedItems: [],
      lockOverrides: {},
      audit: [],
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

describe('normalizeRuntime', () => {
  it('旧运行时补齐 v2 默认值', () => {
    const runtime = normalizeRuntime({
      sheetId: 'sheet-legacy',
      currentIndex: 1,
      actuals: {},
      offsetMin: 12,
      execVersion: 3,
      lastSyncAt: 99,
    });

    expect(runtime.offsetMin).toBe(12);
    expect(runtime.autoOffsetMin).toBe(12);
    expect(runtime.manualOffsetMin).toBe(0);
    expect(runtime.ownerEpoch).toBe(0);
    expect(runtime.ownerDeviceId).toBe('');
    expect(runtime.lastSyncMode).toBe('full');
    expect(runtime.insertedItems).toEqual([]);
    expect(runtime.lockOverrides).toEqual({});
    expect(runtime.audit).toEqual([]);
  });

  it('有效偏移始终等于自动偏移加手动偏移', () => {
    const runtime = normalizeRuntime({
      sheetId: 'sheet-v2',
      offsetMin: 0,
      autoOffsetMin: 10,
      manualOffsetMin: 5,
    });

    expect(runtime.offsetMin).toBe(15);
  });
});

describe('偏移拆分', () => {
  it('完成只更新自动偏移，手动顺延保留', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const runtime: RuntimeState = {
      ...createRuntime(sheet, 480),
      manualOffsetMin: 30,
      offsetMin: 30,
    };

    const next = completeCurrent(sheet, runtime, 550);

    expect(next.autoOffsetMin).toBe(10);
    expect(next.manualOffsetMin).toBe(30);
    expect(next.offsetMin).toBe(40);
  });

  it('顺延只更新手动偏移，自动偏移不变', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const runtime: RuntimeState = {
      ...createRuntime(sheet, 480),
      autoOffsetMin: 10,
      offsetMin: 10,
    };

    // b 计划开始 540，顺延到 570 → 目标偏移 30，手动偏移 30 - 10 = 20。
    const next = applyShift(sheet, runtime, 570);

    expect(next.autoOffsetMin).toBe(10);
    expect(next.manualOffsetMin).toBe(20);
    expect(next.offsetMin).toBe(30);
  });

  it('清除手动顺延只保留自动偏移', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const runtime: RuntimeState = {
      ...createRuntime(sheet, 480),
      autoOffsetMin: 10,
      manualOffsetMin: 20,
      offsetMin: 30,
    };

    const next = clearManualShift(runtime);

    expect(next.autoOffsetMin).toBe(10);
    expect(next.manualOffsetMin).toBe(0);
    expect(next.offsetMin).toBe(10);
    expect(next.execVersion).toBe(runtime.execVersion + 1);
    expect(clearManualShift(next)).toBe(next);
  });

  it('先顺延再完成时手动偏移仍保留', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const runtime = createRuntime(sheet, 480);

    // 顺延下一环节到 09:30：手动偏移 30。
    const shifted = applyShift(sheet, runtime, 570);
    expect(shifted.manualOffsetMin).toBe(30);
    expect(shifted.offsetMin).toBe(30);

    // 当前环节实际 09:10 结束：自动偏移 10，手动 30 不被覆盖。
    const next = completeCurrent(sheet, shifted, 550);

    expect(next.autoOffsetMin).toBe(10);
    expect(next.manualOffsetMin).toBe(30);
    expect(next.offsetMin).toBe(40);
    expect(next.currentIndex).toBe(1);
  });
});

describe('延长当前环节', () => {
  it('顺延下一环节并同步延长当前环节倒计时', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30)]);
    const runtime = createRuntime(sheet, 480);
    const before = buildRuntimeView(sheet, runtime);

    const target = extendStartMin(480, before.currentRow?.displayEnd ?? null, 10);
    expect(target).toBe(550);

    const next = applyShift(sheet, runtime, target);
    const after = buildRuntimeView(sheet, next);

    expect(next.manualOffsetMin).toBe(10);
    expect(next.offsetMin).toBe(10);
    expect(next.currentIndex).toBe(0);
    expect(after.countdownTargetMin).toBe(550);
    expect(before.countdownTargetMin).toBe(540);
  });

  it('下一环节锁定时延长不可用', () => {
    const sheet = makeSheet([makeItem('a', 60), makeItem('b', 30, 600)]);
    const runtime = createRuntime(sheet, 480);
    const before = buildRuntimeView(sheet, runtime);

    const target = extendStartMin(480, before.currentRow?.displayEnd ?? null, 10);

    expect(applyShift(sheet, runtime, target)).toBe(runtime);
  });
});
