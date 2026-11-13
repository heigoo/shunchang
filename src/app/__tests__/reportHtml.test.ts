import { beforeEach, expect, test } from '@rstest/core';

import type { Item, RuntimeState, Sheet } from '../../domain/types';
import { clearLangForTest } from '../../i18n';
import { buildReportHtml, reportHtmlFileName } from '../reportHtml';

const SHEET_ID = 'sheet-report-html';
const PRINTED_AT = new Date(2026, 10, 12, 9, 5).getTime();

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

function items(): Item[] {
  return [
    makeItem('item-a', '签到', 60, { owner: '督导' }),
    makeItem('item-b', '仪式', 30, { lockAt: 600, locked: true }),
    makeItem('item-c', '敬酒', 40),
  ];
}

beforeEach(() => {
  clearLangForTest();
});

test('生成自包含 HTML，包含汇总、逐项与现场记录', () => {
  const html = buildReportHtml(
    makeSheet(items()),
    makeRuntime({
      offsetMin: 70,
      manualOffsetMin: 70,
      insertedItems: [
        {
          id: 'ins-1',
          afterId: 'item-a',
          createdAt: 1000,
          item: makeItem('item-x', '长辈致辞', 10, { owner: '主持' }),
        },
      ],
      lockOverrides: { 'item-b': 620 },
      actuals: {
        'item-a': { start: 480, end: 550, result: 'done' },
      },
      audit: [{ id: 'a-1', at: 1000, type: 'insert', label: '插入「长辈致辞」' }],
    }),
    PRINTED_AT,
  );

  expect(html.startsWith('<!doctype html>')).toBe(true);
  expect(html).toContain('<meta charset="utf-8">');
  expect(html).toContain('@page { size: A4 landscape; margin: 8mm; }');
  expect(html).toContain('秋季婚礼流程');
  expect(html).toContain('2026-11-10');
  expect(html).toContain('执行报告');
  expect(html).toContain('计划总时长');
  expect(html).toContain('实际总时长');
  expect(html).toContain('完成率');
  expect(html).toContain('逐项复盘');
  expect(html).toContain('签到');
  expect(html).toContain('长辈致辞');
  expect(html).toContain('现场插入');
  expect(html).toContain('锁定 10:20（原 10:00）');
  expect(html).toContain('偏差');
  expect(html).toContain('压缩');
  expect(html).toContain('现场记录');
  expect(html).toContain('插入「长辈致辞」');
  expect(html).toContain('顺延 70 分钟');
  expect(html).toContain(`导出于 2026-11-12 09:05`);
});

test('转义手册、环节、负责人与备注中的 HTML', () => {
  const html = buildReportHtml(
    makeSheet(
      [
        makeItem('item-a', '签到 <b> & A', 30, {
          owner: 'A & B <i>',
          note: '备注 <script>alert(1)</script>',
        }),
      ],
      { name: '秋季 <婚礼> & "彩排"' },
    ),
    makeRuntime(),
    PRINTED_AT,
  );

  expect(html).not.toContain('<script');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('秋季 &lt;婚礼&gt; &amp; &quot;彩排&quot;');
  expect(html).toContain('签到 &lt;b&gt; &amp; A');
  expect(html).toContain('A &amp; B &lt;i&gt;');
});

test('未全部完成与空审计都有明确文案', () => {
  const html = buildReportHtml(makeSheet(items()), makeRuntime(), PRINTED_AT);

  expect(html).toContain('未全部完成');
  expect(html).toContain('无现场变更记录');
  expect(html).toContain('未执行');
});

test('导出文件名带手册名、报告与日期', () => {
  expect(reportHtmlFileName(makeSheet([]))).toBe(
    '秋季婚礼流程_执行报告_20261110',
  );
});
