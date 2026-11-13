import { describe, expect, it } from '@rstest/core';

import type { InsertedItem, Item, RuntimeState, Sheet } from '../../domain/types';
import {
  buildReport,
  buildReportText,
  offsetText,
  reportFileName,
  reportLockText,
  signedDurationText,
} from '../reportOps';

const SHEET_ID = 'sheet-report-ops';

function makeItem(
  id: string,
  name: string,
  durationMin: number,
  patch: Partial<Item> = {},
): Item {
  return {
    id,
    name,
    durationMin,
    owner: '',
    note: '',
    lockAt: null,
    ...patch,
  };
}

function makeSheet(items: Item[], patch: Partial<Sheet> = {}): Sheet {
  return {
    id: SHEET_ID,
    name: '秋季婚礼流程',
    date: '2026-11-10',
    startMin: 480,
    items,
    status: 'done',
    version: 3,
    updatedAt: 0,
    ...patch,
  };
}

function makeRuntime(patch: Partial<RuntimeState> = {}): RuntimeState {
  return {
    sheetId: SHEET_ID,
    currentIndex: 2,
    actuals: {},
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
    ...patch,
  };
}

/** 签到 08:00–09:00；仪式锁定 10:00；敬酒 10:30–11:10。 */
function baseItems(): Item[] {
  return [
    makeItem('item-a', '签到', 60, { owner: '督导' }),
    makeItem('item-b', '仪式', 30, { lockAt: 600, locked: true }),
    makeItem('item-c', '敬酒', 40),
  ];
}

function insertedItem(): InsertedItem {
  return {
    id: 'ins-1',
    afterId: 'item-a',
    createdAt: 1000,
    item: makeItem('item-x', '长辈致辞', 10, { owner: '主持' }),
  };
}

describe('buildReport', () => {
  it('逐项输出计划、展示、实际、偏差与压缩', () => {
    const report = buildReport(
      makeSheet(baseItems()),
      makeRuntime({
        offsetMin: 70,
        manualOffsetMin: 70,
        actuals: {
          'item-a': { start: 480, end: 550, result: 'done' },
          'item-b': { start: 600, end: 600, result: 'skipped' },
        },
      }),
    );

    expect(report.rows).toHaveLength(3);

    const first = report.rows[0];
    expect(first.no).toBe('001');
    expect(first.name).toBe('签到');
    expect(first.owner).toBe('督导');
    expect(first.planStart).toBe(480);
    expect(first.planEnd).toBe(540);
    expect(first.displayStart).toBe(550);
    expect(first.displayEnd).toBe(600);
    expect(first.actualStart).toBe(480);
    expect(first.actualEnd).toBe(550);
    expect(first.result).toBe('done');
    expect(first.actualDurationMin).toBe(70);
    expect(first.deviationMin).toBe(10);
    expect(first.compressedLostMin).toBe(10);
    expect(first.inserted).toBe(false);
    expect(first.lockOverridden).toBe(false);

    const second = report.rows[1];
    expect(second.result).toBe('skipped');
    expect(second.actualDurationMin).toBe(0);
    expect(second.deviationMin).toBeNull();
    expect(second.lockAt).toBe(600);

    const third = report.rows[2];
    expect(third.result).toBe('pending');
    expect(third.actualStart).toBeNull();
    expect(third.actualDurationMin).toBeNull();
    expect(third.deviationMin).toBeNull();
    expect(third.displayStart).toBe(630);
    expect(third.displayEnd).toBe(670);
  });

  it('汇总计划、实际、差值、偏移与完成率', () => {
    const report = buildReport(
      makeSheet(baseItems()),
      makeRuntime({
        offsetMin: 70,
        manualOffsetMin: 70,
        actuals: {
          'item-a': { start: 480, end: 550, result: 'done' },
          'item-b': { start: 600, end: 600, result: 'skipped' },
        },
      }),
    );

    expect(report.summary.planTotalMin).toBe(130);
    expect(report.summary.actualTotalMin).toBe(70);
    expect(report.summary.diffMin).toBe(-60);
    expect(report.summary.effectiveOffsetMin).toBe(70);
    expect(report.summary.totalCount).toBe(3);
    expect(report.summary.doneCount).toBe(1);
    expect(report.summary.skippedCount).toBe(1);
    expect(report.summary.pendingCount).toBe(1);
    expect(report.summary.completionRate).toBe(33);
    expect(report.summary.allTerminal).toBe(false);
  });

  it('把现场插入环节合并进逐项并计入计划总时长', () => {
    const report = buildReport(
      makeSheet(baseItems()),
      makeRuntime({
        currentIndex: 3,
        insertedItems: [insertedItem()],
      }),
    );

    expect(report.rows.map((row) => row.name)).toEqual([
      '签到',
      '长辈致辞',
      '仪式',
      '敬酒',
    ]);

    const inserted = report.rows[1];
    expect(inserted.inserted).toBe(true);
    expect(inserted.planStart).toBe(540);
    expect(inserted.planEnd).toBe(550);
    expect(report.summary.planTotalMin).toBe(140);
  });

  it('标记锁定覆盖并保留原锁定时刻', () => {
    const report = buildReport(
      makeSheet(baseItems()),
      makeRuntime({
        lockOverrides: { 'item-b': 620 },
      }),
    );

    const row = report.rows[1];
    expect(row.lockOverridden).toBe(true);
    expect(row.lockAt).toBe(620);
    expect(row.originalLockAt).toBe(600);
    expect(row.planStart).toBe(620);
    expect(reportLockText(row)).toBe('锁定 10:20（原 10:00）');
  });

  it('审计记录按时间倒序输出', () => {
    const report = buildReport(
      makeSheet(baseItems()),
      makeRuntime({
        audit: [
          { id: 'a-1', at: 1000, type: 'insert', label: '插入「长辈致辞」' },
          { id: 'a-2', at: 3000, type: 'lock', label: '锁定「仪式」10:20' },
          { id: 'a-3', at: 2000, type: 'skip', label: '跳过「敬酒」' },
        ],
      }),
    );

    expect(report.audit.map((entry) => entry.id)).toEqual(['a-2', 'a-3', 'a-1']);
    expect(report.audit[0].label).toBe('锁定「仪式」10:20');
  });
});

describe('report text helpers', () => {
  it('差值文案带符号且跳过/未执行为占位符', () => {
    expect(signedDurationText(10)).toBe('+10 分钟');
    expect(signedDurationText(-10)).toBe('\u221210 分钟');
    expect(signedDurationText(0)).toBe('0 分钟');
    expect(signedDurationText(null)).toBe('—');
  });

  it('偏移文案区分顺延、提前与未偏移', () => {
    expect(offsetText(30)).toBe('顺延 30 分钟');
    expect(offsetText(-5)).toBe('提前 5 分钟');
    expect(offsetText(0)).toBe('未偏移');
  });

  it('生成可复制的文字摘要，包含汇总、逐项与现场记录', () => {
    const report = buildReport(
      makeSheet(baseItems()),
      makeRuntime({
        offsetMin: 70,
        manualOffsetMin: 70,
        insertedItems: [insertedItem()],
        lockOverrides: { 'item-b': 620 },
        actuals: {
          'item-a': { start: 480, end: 550, result: 'done' },
        },
        audit: [{ id: 'a-1', at: 1000, type: 'insert', label: '插入「长辈致辞」' }],
      }),
    );

    const text = buildReportText(report);
    expect(text).toContain('秋季婚礼流程 · 2026-11-10');
    expect(text).toContain('计划总时长 2 小时 20 分钟');
    expect(text).toContain('实际总时长 1 小时 10 分钟');
    expect(text).toContain('差值 −1 小时 10 分钟');
    expect(text).toContain('完成 1 · 跳过 0 · 未执行 3 · 完成率 25%');
    expect(text).toContain('有效偏移：顺延 70 分钟');
    expect(text).toContain('002 长辈致辞（主持）');
    expect(text).toContain('现场插入');
    expect(text).toContain('锁定 10:20（原 10:00）');
    expect(text).toContain('插入「长辈致辞」');
  });

  it('导出文件名包含手册名、报告与活动日期', () => {
    expect(reportFileName(makeSheet([]))).toBe('秋季婚礼流程_执行报告_20261110');
    expect(reportFileName(makeSheet([], { name: '  ' }))).toBe(
      '未命名手册_执行报告_20261110',
    );
  });
});
