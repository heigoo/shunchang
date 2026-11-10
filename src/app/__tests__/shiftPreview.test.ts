import { describe, expect, it } from '@rstest/core';

import type { Item, RuntimeState, Sheet } from '../../domain/types';
import { buildShiftPreview } from '../shiftPreview';

function makeItem(
  id: string,
  name: string,
  durationMin: number,
  lockAt: number | null = null,
  locked?: boolean,
): Item {
  const item: Item = {
    id,
    name,
    durationMin,
    owner: '',
    note: '',
    lockAt,
  };
  if (locked !== undefined) {
    item.locked = locked;
  }
  return item;
}

function makeSheet(items: Item[], startMin = 480): Sheet {
  return {
    id: 'sheet-shift',
    name: '顺延手册',
    date: '2026-11-10',
    startMin,
    items,
    status: 'running',
    version: 1,
    updatedAt: 0,
  };
}

function makeRuntime(
  sheet: Sheet,
  currentIndex: number,
  offsetMin = 0,
): RuntimeState {
  return {
    sheetId: sheet.id,
    currentIndex,
    actuals: {},
    offsetMin,
    execVersion: 1,
    lastSyncAt: 0,
  };
}

describe('buildShiftPreview', () => {
  it('正常顺延：按选定时刻给出偏移与后续时间', () => {
    const sheet = makeSheet([
      makeItem('a', '开场', 120),
      makeItem('b', '致辞', 30),
      makeItem('c', '仪式', 30),
    ]);
    const runtime = makeRuntime(sheet, 0);
    const preview = buildShiftPreview(sheet, runtime, 610, 600);

    expect(preview.ok).toBe(true);
    expect(preview.reason).toBeNull();
    expect(preview.nextIndex).toBe(1);
    expect(preview.nextName).toBe('致辞');
    expect(preview.baseOffsetMin).toBe(0);
    expect(preview.nextOffsetMin).toBe(10);
    expect(preview.deltaMin).toBe(10);
    expect(preview.rows[0]).toEqual({
      index: 1,
      name: '致辞',
      time: '10\u223610',
    });
    expect(preview.locks).toEqual([]);
    expect(preview.hasConflict).toBe(false);
  });

  it('已是最后一个环节时不可顺延', () => {
    const sheet = makeSheet([makeItem('a', '开场', 60)]);
    const runtime = makeRuntime(sheet, 0);
    const preview = buildShiftPreview(sheet, runtime, 600, 590);

    expect(preview.ok).toBe(false);
    expect(preview.reason).toBe('last');
    expect(preview.rows).toEqual([]);
    expect(preview.locks).toEqual([]);
  });

  it('下一环节为锁定时刻时不可顺延', () => {
    const lockedSheet = makeSheet([
      makeItem('a', '开场', 60),
      makeItem('b', '仪式', 30, 600),
    ]);
    const lockedPreview = buildShiftPreview(
      lockedSheet,
      makeRuntime(lockedSheet, 0),
      500,
      480,
    );

    expect(lockedPreview.ok).toBe(false);
    expect(lockedPreview.reason).toBe('locked');
    expect(lockedPreview.nextName).toBe('仪式');

    const flaggedSheet = makeSheet([
      makeItem('a', '开场', 60),
      makeItem('b', '仪式', 30, null, true),
    ]);
    const flaggedPreview = buildShiftPreview(
      flaggedSheet,
      makeRuntime(flaggedSheet, 0),
      500,
      480,
    );

    expect(flaggedPreview.ok).toBe(false);
    expect(flaggedPreview.reason).toBe('locked');
  });

  it('超出锁定容量时吸收并压缩前一环节', () => {
    const sheet = makeSheet(
      [
        makeItem('a', '开场', 60),
        makeItem('b', '致辞', 30),
        makeItem('c', '仪式', 60),
        makeItem('d', '合影', 38, 728),
      ],
      540,
    );
    const runtime = makeRuntime(sheet, 0, 20);
    const before = JSON.stringify(sheet);

    // 下一环节计划 10:00，选择 10:40
    const preview = buildShiftPreview(sheet, runtime, 640, 620);

    expect(preview.ok).toBe(true);
    expect(preview.nextOffsetMin).toBe(40);
    expect(preview.deltaMin).toBe(20);
    expect(preview.hasConflict).toBe(false);
    expect(preview.locks).toHaveLength(1);

    const lock = preview.locks[0];
    expect(lock.index).toBe(3);
    expect(lock.name).toBe('合影');
    expect(lock.state).toBe('absorb');
    expect(lock.diffMin).toBe(2);
    expect(lock.waitMin).toBe(0);
    expect(lock.compressed).toEqual([{ name: '仪式', lostMin: 2 }]);

    expect(preview.rows[preview.rows.length - 1]).toEqual({
      index: 3,
      name: '合影',
      time: '12\u223608',
    });
    expect(JSON.stringify(sheet)).toBe(before);
  });

  it('延迟超过锁定前容量时标记冲突', () => {
    const sheet = makeSheet(
      [
        makeItem('a', '开场', 60),
        makeItem('b', '致辞', 30),
        makeItem('c', '仪式', 60),
        makeItem('d', '合影', 38, 728),
      ],
      540,
    );
    const runtime = makeRuntime(sheet, 0, 20);
    const preview = buildShiftPreview(sheet, runtime, 800, 620);

    expect(preview.ok).toBe(true);
    expect(preview.hasConflict).toBe(true);
    expect(preview.locks[0].state).toBe('conflict');
    expect(preview.locks[0].diffMin).toBe(162);
    expect(preview.locks[0].compressed).toEqual([]);
  });

  it('所选时间早于当前时刻时给出提示', () => {
    const sheet = makeSheet([
      makeItem('a', '开场', 60),
      makeItem('b', '致辞', 30),
    ]);
    const preview = buildShiftPreview(
      sheet,
      makeRuntime(sheet, 0),
      500,
      540,
    );

    expect(preview.earlierThanNow).toBe(true);
    expect(preview.nextOffsetMin).toBe(-40);
    expect(preview.deltaMin).toBe(-40);
    expect(preview.rows[0].time).toBe('08\u223620');
  });
});
