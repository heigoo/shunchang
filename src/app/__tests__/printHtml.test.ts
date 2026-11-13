import { afterEach, beforeEach, expect, test } from '@rstest/core';

import type { Item, RuntimeState, Sheet } from '../../domain/types';
import { clearLangForTest, setLang } from '../../i18n';
import { buildPrintHtml } from '../printHtml';

const SHEET_ID = 'sheet-print-html';
const PRINTED_AT = new Date(2026, 10, 12, 9, 5).getTime();

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function stampText(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;
}

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
    autoOffsetMin: offsetMin,
    manualOffsetMin: 0,
    execVersion: 1,
    lastSyncAt: 0,
    ownerEpoch: 0,
    ownerDeviceId: '',
    lastSyncMode: 'full',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
  };
}

function manyItems(count: number): Item[] {
  return Array.from({ length: count }, (_value, index) =>
    makeItem(`item-${index}`, `环节 ${index + 1}`, 10),
  );
}

function countOf(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

beforeEach(() => {
  clearLangForTest();
});

afterEach(() => {
  clearLangForTest();
});

test('renders every row, page number and version in a self-contained document', () => {
  const html = buildPrintHtml(
    makeSheet(manyItems(45)),
    makeRuntime(15),
    PRINTED_AT,
  );
  const stamp = stampText(PRINTED_AT);

  expect(html.startsWith('<!doctype html>')).toBe(true);
  expect(html).toContain('<meta charset="utf-8">');
  expect(html).toContain('@page { size: A4 landscape; margin: 8mm; }');
  expect(html).toContain('page-break-after: always');
  expect(html).toContain('.page--last { page-break-after: auto;');

  expect(countOf(html, '<section class="page')).toBe(2);
  expect(countOf(html, 'class="page page--last"')).toBe(1);
  expect(html).toContain('第 1 / 2 张 · 第 3 版');
  expect(html).toContain('第 2 / 2 张 · 第 3 版');
  expect(html).toContain('第 1 / 2 页');
  expect(html).toContain('第 2 / 2 页');

  expect(html).toContain('001');
  expect(html).toContain('045');
  expect(html).toContain('已顺延 15 分钟');
  expect(html).toContain(`打印于 ${stamp} · 顺场`);
  expect(html).toContain(`导出于 ${stamp}`);
});

test('escapes sheet, segment, owner and note text', () => {
  const html = buildPrintHtml(
    makeSheet(
      [
        makeItem('item-a', '签到 <b> & A', 30, {
          owner: 'A & B <i>',
          note: '备注 <script>alert(1)</script>',
        }),
      ],
      { name: '秋季 <婚礼> & "彩排"' },
    ),
    null,
    PRINTED_AT,
  );

  expect(html).not.toContain('<script');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&lt;b&gt; &amp; A');
  expect(html).toContain('A &amp; B &lt;i&gt;');
  expect(html).toContain('秋季 &lt;婚礼&gt; &amp; &quot;彩排&quot;');
  expect(html).not.toContain('"彩排"');
});

test('does not embed a QR code and keeps the distribution hint', () => {
  const html = buildPrintHtml(makeSheet(manyItems(3)), null, PRINTED_AT);

  expect(html).not.toContain('<svg');
  expect(html).not.toContain('data:image');
  expect(html).toContain('桌面版请用文件或六位短码分发');
});

test('renders the print sheet in English when the language is English', () => {
  setLang('en');
  const html = buildPrintHtml(
    makeSheet([makeItem('item-a', 'Check-in', 30)], { name: 'Autumn run' }),
    null,
    PRINTED_AT,
  );

  expect(html).toContain('<html lang="en">');
  expect(html).toContain('Autumn run');
  expect(html).toContain('No.');
  expect(html).toContain('Duration');
  expect(html).toContain('Owner');
  expect(html).toContain('Notes');
  expect(html).toContain('Sheet 1 / 1 · Version 3');
  expect(html).toContain('Page 1 of 1');
  expect(html).toContain('Printed at');
  expect(html).toContain('Shunchang');
  expect(html).toContain('On desktop, use a file or the 6-character code');
  expect(html).toContain('Print page created; print it in your browser');
  expect(html).not.toContain('序号');
});
