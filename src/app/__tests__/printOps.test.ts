import { expect, test } from '@rstest/core';

import { formatClockDisplay } from '../../domain/timeline';
import type { Item, RuntimeState, Sheet } from '../../domain/types';
import {
  buildPrintRows,
  paginateRows,
  printFileName,
  printSummary,
} from '../printOps';

const SHEET_ID = 'sheet-print-ops';

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
    status: 'published',
    version: 3,
    updatedAt: 0,
    ...patch,
  };
}

function makeRuntime(offsetMin: number): RuntimeState {
  return {
    sheetId: SHEET_ID,
    currentIndex: 0,
    actuals: {},
    offsetMin,
    execVersion: 1,
    lastSyncAt: 0,
  };
}

function manyItems(count: number): Item[] {
  return Array.from({ length: count }, (_value, index) =>
    makeItem(`item-${index}`, `环节 ${index + 1}`, 10),
  );
}

test('splits 45 rows into two pages with 40 and 5 rows', () => {
  const rows = buildPrintRows(makeSheet(manyItems(45)), null);
  const pages = paginateRows(rows);

  expect(pages).toHaveLength(2);
  expect(pages[0].rows).toHaveLength(40);
  expect(pages[1].rows).toHaveLength(5);
  expect(pages[0].pageNo).toBe(1);
  expect(pages[0].pageTotal).toBe(2);
  expect(pages[1].pageNo).toBe(2);
  expect(pages[1].pageTotal).toBe(2);
  expect(pages[0].rows[0].no).toBe('001');
  expect(pages[1].rows[0].no).toBe('041');
});

test('keeps an empty page so the header still renders', () => {
  const pages = paginateRows([]);

  expect(pages).toHaveLength(1);
  expect(pages[0].rows).toHaveLength(0);
  expect(pages[0].pageNo).toBe(1);
  expect(pages[0].pageTotal).toBe(1);
});

test('uses planStart without runtime and shifts times by the runtime offset', () => {
  const sheet = makeSheet([
    makeItem('item-a', '迎宾签到', 30),
    makeItem('item-b', '仪式开始', 30),
  ]);

  const planned = buildPrintRows(sheet, null);
  expect(planned[0].time).toBe(formatClockDisplay(480));
  expect(planned[1].time).toBe(formatClockDisplay(510));

  const shifted = buildPrintRows(sheet, makeRuntime(10));
  expect(shifted[0].time).toBe(formatClockDisplay(490));
  expect(shifted[1].time).toBe(formatClockDisplay(520));
});

test('shows the compressed duration when a lock swallows minutes', () => {
  const sheet = makeSheet([
    makeItem('item-a', '迎宾签到', 38),
    makeItem('item-b', '仪式开始', 30, { locked: true, lockAt: 498 }),
  ]);

  const rows = buildPrintRows(sheet, makeRuntime(0));

  expect(rows[0].duration).toBe('38→18 分');
  expect(rows[1].duration).toBe('30 分');
});

test('renders lock labels for locked rows only', () => {
  const sheet = makeSheet([
    makeItem('item-a', '迎宾签到', 30),
    makeItem('item-b', '仪式开始', 30, { locked: true, lockAt: 498 }),
    makeItem('item-c', '合影', 30, { locked: true, lockAt: null }),
  ]);

  const rows = buildPrintRows(sheet, null);

  expect(rows[0].lockLabel).toBe('');
  expect(rows[1].lockLabel).toBe('LOCK 08:18');
  expect(rows[2].lockLabel).toBe('LOCK 待填');
  expect(rows[2].name).toBe('合影');
});

test('summarises the offset and the planned total', () => {
  const sheet = makeSheet([makeItem('item-a', '迎宾签到', 185)]);

  expect(printSummary(sheet, makeRuntime(15)).offsetLabel).toBe('已顺延 15 分钟');
  expect(printSummary(sheet, makeRuntime(-5)).offsetLabel).toBe('提前 5 分钟');
  expect(printSummary(sheet, makeRuntime(0)).offsetLabel).toBe('未偏移');
  expect(printSummary(sheet, null).offsetLabel).toBe('未偏移');
  expect(printSummary(sheet, null).totalLabel).toBe('计划 3 小时 05 分钟');
  expect(printSummary(sheet, null).title).toBe('秋季婚礼流程');
  expect(printSummary(sheet, null).version).toBe('3');
});

test('builds the file name from the sheet name and date', () => {
  expect(printFileName(makeSheet([]))).toBe('秋季婚礼流程_流程表_20261110');
  expect(printFileName(makeSheet([], { name: '' }))).toBe('未命名手册_流程表_20261110');
});
