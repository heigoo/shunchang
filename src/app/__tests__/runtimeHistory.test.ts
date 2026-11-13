import { beforeEach, describe, expect, it } from '@rstest/core';

import type { Sheet } from '../../domain/types';
import { clearAllForTest, getRuntimeSnapshots, saveSheet } from '../../store/repository';
import { createRuntime } from '../runtimeOps';
import {
  clearSnapshots,
  listSnapshots,
  pushSnapshot,
  restoreSnapshot,
} from '../runtimeHistory';

const SHEET_ID = 'sheet-history';

function makeSheet(): Sheet {
  return {
    id: SHEET_ID,
    name: '秋季婚礼流程',
    date: '2026-11-10',
    startMin: 480,
    items: [
      {
        id: 'item-a',
        name: '迎宾签到',
        durationMin: 60,
        owner: '督导',
        note: '',
        lockAt: null,
      },
      {
        id: 'item-b',
        name: '仪式开始',
        durationMin: 30,
        owner: '主持',
        note: '',
        lockAt: null,
      },
    ],
    status: 'running',
    version: 1,
    updatedAt: 0,
  };
}

beforeEach(() => {
  clearAllForTest();
});

describe('runtime snapshots', () => {
  it('保存快照并跨读写保留运行时与手册状态', () => {
    const sheet = saveSheet(makeSheet());
    const runtime = createRuntime(sheet, 480);

    pushSnapshot(SHEET_ID, '完成「迎宾签到」', runtime, 'running', 1000);

    const stored = getRuntimeSnapshots(SHEET_ID);
    expect(stored).toHaveLength(1);
    expect(stored[0].label).toBe('完成「迎宾签到」');
    expect(stored[0].at).toBe(1000);
    expect(stored[0].sheetStatus).toBe('running');
    expect(stored[0].runtime.currentIndex).toBe(0);
    expect(stored[0].runtime.actuals['item-a'].start).toBe(480);
  });

  it('最多保留最近 10 步', () => {
    const sheet = saveSheet(makeSheet());
    const runtime = createRuntime(sheet, 480);

    for (let index = 0; index < 12; index += 1) {
      pushSnapshot(SHEET_ID, `操作 ${index}`, runtime, 'running', index);
    }

    const stored = listSnapshots(SHEET_ID);
    expect(stored).toHaveLength(10);
    expect(stored[0].label).toBe('操作 2');
    expect(stored[9].label).toBe('操作 11');
  });

  it('回退到指定快照并丢弃该快照及之后的记录', () => {
    const sheet = saveSheet(makeSheet());
    const runtime = createRuntime(sheet, 480);

    pushSnapshot(SHEET_ID, '第一步', runtime, 'running', 1);
    pushSnapshot(SHEET_ID, '第二步', runtime, 'done', 2);
    pushSnapshot(SHEET_ID, '第三步', runtime, 'done', 3);

    const restored = restoreSnapshot(SHEET_ID, 1);
    expect(restored?.label).toBe('第二步');
    expect(restored?.sheetStatus).toBe('done');

    const remaining = listSnapshots(SHEET_ID);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].label).toBe('第一步');
  });

  it('清空快照后不再返回记录', () => {
    const sheet = saveSheet(makeSheet());
    const runtime = createRuntime(sheet, 480);
    pushSnapshot(SHEET_ID, '完成', runtime, 'running');

    clearSnapshots(SHEET_ID);

    expect(listSnapshots(SHEET_ID)).toHaveLength(0);
    expect(restoreSnapshot(SHEET_ID, 0)).toBeNull();
  });
});
