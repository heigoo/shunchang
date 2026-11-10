import { describe, expect, it } from '@rstest/core';

import type { Item, Sheet } from '../types';
import {
  computeTimeline,
  formatClock,
  formatClockDisplay,
  formatDuration,
  offsetAfterDone,
  offsetAfterShift,
  parseClock,
} from '../timeline';

function makeItem(
  id: string,
  durationMin: number,
  lockAt: number | null = null,
): Item {
  return { id, name: id, durationMin, owner: '', note: '', lockAt };
}

function makeSheet(startMin: number, items: Item[]): Sheet {
  return {
    id: 'sheet-1',
    name: '婚礼流程',
    date: '2026-11-10',
    startMin,
    items,
    status: 'draft',
    version: 1,
    updatedAt: 0,
  };
}

describe('computeTimeline R1 纯计划递推', () => {
  it('未锁定环节从起点依次累加', () => {
    const sheet = makeSheet(480, [
      makeItem('a', 60),
      makeItem('b', 30),
      makeItem('c', 15),
    ]);

    const result = computeTimeline(sheet);

    expect(result.rows.map((row) => row.planStart)).toEqual([480, 540, 570]);
    expect(result.totalPlanMin).toBe(105);
    expect(result.plannedEndMin).toBe(585);
    expect(result.displayEndMin).toBe(585);
  });

  it('锁定环节从锁定时刻开始，后续从其结束继续', () => {
    const sheet = makeSheet(480, [
      makeItem('a', 60),
      makeItem('b', 30, 600),
      makeItem('c', 15),
    ]);

    const result = computeTimeline(sheet);

    expect(result.rows.map((row) => row.planStart)).toEqual([480, 600, 630]);
  });

  it('不修改传入的 sheet', () => {
    const sheet = makeSheet(480, [makeItem('a', 60), makeItem('b', 30, 600)]);
    const snapshot = JSON.stringify(sheet);

    computeTimeline(sheet, 45);

    expect(JSON.stringify(sheet)).toBe(snapshot);
  });
});

describe('offsetAfterDone (R2)', () => {
  it('返回实际结束与计划结束的差值', () => {
    const sheet = makeSheet(480, [
      makeItem('a', 60),
      makeItem('b', 30),
      makeItem('c', 15),
    ]);

    expect(offsetAfterDone(sheet, 2, 592)).toBe(7);
  });

  it('越界返回 0', () => {
    const sheet = makeSheet(480, [makeItem('a', 60)]);

    expect(offsetAfterDone(sheet, 3, 600)).toBe(0);
    expect(offsetAfterDone(sheet, -1, 600)).toBe(0);
  });
});

describe('offsetAfterShift (R3)', () => {
  it('返回实际开始相对计划开始的偏移', () => {
    const sheet = makeSheet(480, [
      makeItem('a', 60),
      makeItem('b', 30),
      makeItem('c', 15),
    ]);

    expect(offsetAfterShift(sheet, 2, 580)).toBe(10);
  });

  it('下一环节锁定或越界时返回 null', () => {
    const sheet = makeSheet(480, [
      makeItem('a', 60),
      makeItem('b', 30, 540),
      makeItem('c', 15),
    ]);

    expect(offsetAfterShift(sheet, 1, 550)).toBeNull();
    expect(offsetAfterShift(sheet, 5, 550)).toBeNull();
  });
});

describe('computeTimeline R4 锁定吸收', () => {
  it('等待：区段结束早于锁定时刻', () => {
    const sheet = makeSheet(660, [
      makeItem('a', 20),
      makeItem('b', 10),
      makeItem('lock', 15, 720),
    ]);

    const result = computeTimeline(sheet, 0);
    const lock = result.locks[0];

    expect(lock.state).toBe('wait');
    expect(lock.diffMin).toBe(-30);
    expect(lock.waitMin).toBe(30);
    expect(lock.compressed).toEqual([]);
    expect(result.rows[2].displayStart).toBe(720);
    expect(result.rows[0].displayStart).toBe(660);
    expect(result.hasConflict).toBe(false);
  });

  it('吸收：按分区偏移压缩末尾环节至锁定时刻', () => {
    const sheet = makeSheet(540, [
      makeItem('a', 60),
      makeItem('b', 30),
      makeItem('c', 60),
      makeItem('d', 38),
      makeItem('lock', 20, 728),
      makeItem('next', 15),
    ]);

    const result = computeTimeline(sheet, 20);
    const lock = result.locks[0];

    expect(lock.state).toBe('absorb');
    expect(lock.diffMin).toBe(20);
    expect(lock.waitMin).toBe(0);
    expect(lock.compressed).toEqual([{ itemId: 'd', lostMin: 20 }]);

    expect(result.rows[3].effectiveDurationMin).toBe(18);
    expect(result.rows[3].compressedLostMin).toBe(20);
    expect(result.rows[3].displayStart).toBe(710);
    expect(result.rows[3].displayEnd).toBe(728);
    expect(result.rows[4].displayStart).toBe(728);
    expect(result.rows[5].displayStart).toBe(748);
    expect(result.rows[5].displayStart).toBe(result.rows[5].planStart);
    expect(result.displayEndMin).toBe(763);
  });

  it('跨多条压缩：从后往前逐条扣减', () => {
    const sheet = makeSheet(600, [
      makeItem('a', 30),
      makeItem('b', 10),
      makeItem('lock', 10, 660),
    ]);

    const result = computeTimeline(sheet, 40);
    const lock = result.locks[0];

    expect(lock.state).toBe('absorb');
    expect(lock.diffMin).toBe(20);
    expect(lock.compressed).toEqual([
      { itemId: 'b', lostMin: 10 },
      { itemId: 'a', lostMin: 10 },
    ]);
    expect(result.rows[0].effectiveDurationMin).toBe(20);
    expect(result.rows[1].effectiveDurationMin).toBe(0);
    expect(result.rows[1].displayEnd).toBe(660);
    expect(result.rows[2].displayStart).toBe(660);
  });

  it('冲突：超出区段总容量时不压缩', () => {
    const sheet = makeSheet(660, [
      makeItem('a', 5),
      makeItem('b', 5),
      makeItem('lock', 10, 680),
    ]);

    const result = computeTimeline(sheet, 30);
    const lock = result.locks[0];

    expect(lock.state).toBe('conflict');
    expect(lock.diffMin).toBe(20);
    expect(lock.compressed).toEqual([]);
    expect(result.hasConflict).toBe(true);
    expect(result.rows[2].displayStart).toBe(680);
    expect(result.rows[0].displayStart).toBe(690);
  });

  it('多锁定：前一锁定吸收后偏移归零，后一锁定重新判定', () => {
    const sheet = makeSheet(480, [
      makeItem('a', 60),
      makeItem('lock1', 10, 540),
      makeItem('b', 30),
      makeItem('lock2', 10, 600),
    ]);

    const result = computeTimeline(sheet, 20);

    expect(result.locks[0].state).toBe('absorb');
    expect(result.locks[0].diffMin).toBe(20);
    expect(result.rows[0].displayStart).toBe(500);
    expect(result.rows[0].displayEnd).toBe(540);

    expect(result.locks[1].state).toBe('wait');
    expect(result.locks[1].diffMin).toBe(-20);
    expect(result.locks[1].waitMin).toBe(20);
    expect(result.rows[2].displayStart).toBe(550);
  });
});

describe('跨日与格式化', () => {
  it('跨零点展示与格式化', () => {
    const sheet = makeSheet(1380, [makeItem('a', 90)]);

    const result = computeTimeline(sheet);

    expect(result.rows[0].displayEnd).toBe(1470);
    expect(result.displayEndMin).toBe(1470);
    expect(formatClock(1470)).toBe('次日 00:30');
    expect(formatClock(-30)).toBe('前日 23:30');
    expect(formatClock(480)).toBe('08:00');
    expect(formatClockDisplay(480)).toBe('08\u223600');
    expect(formatDuration(90)).toBe('1 小时 30 分钟');
  });

  it('时长格式化', () => {
    expect(formatDuration(45)).toBe('45 分钟');
    expect(formatDuration(65)).toBe('1 小时 05 分钟');
    expect(formatDuration(1590)).toBe('26 小时 30 分钟');
  });

  it('时刻解析', () => {
    expect(parseClock('8:05')).toBe(485);
    expect(parseClock('08:05')).toBe(485);
    expect(parseClock(' 23:59 ')).toBe(1439);
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('12:60')).toBeNull();
    expect(parseClock('8:5')).toBeNull();
    expect(parseClock('abc')).toBeNull();
  });
});
