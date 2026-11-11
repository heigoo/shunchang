import '@testing-library/jest-dom';
import { render } from '@lynx-js/react/testing-library';
import { beforeEach, expect, test } from '@rstest/core';

import type { Sheet } from '../../domain/types';
import { clearAllForTest, saveSheet } from '../../store/repository';
import { PrintScreen } from '../PrintScreen';

const SHEET_ID = 'sheet-print-screen';

function makeSheet(): Sheet {
  return {
    id: SHEET_ID,
    name: '秋季婚礼流程',
    date: '2026-11-10',
    startMin: 480,
    items: Array.from({ length: 45 }, (_value, index) => ({
      id: `item-${index}`,
      name: `环节 ${index + 1}`,
      durationMin: 10,
      owner: '',
      note: '',
      lockAt: null,
    })),
    status: 'published',
    version: 2,
    updatedAt: Date.now(),
  };
}

beforeEach(() => {
  clearAllForTest();
});

test('renders every page of the printed sheet', async () => {
  saveSheet(makeSheet());

  const { findAllByText, findByText } = render(
    <PrintScreen sheetId={SHEET_ID} onBack={() => {}} />,
  );

  expect((await findAllByText('秋季婚礼流程')).length).toBe(2);
  expect(await findByText('第 1 / 2 页')).toBeInTheDocument();
  expect(await findByText('第 2 / 2 页')).toBeInTheDocument();
  expect(await findByText('第 1 / 2 张 · 第 2 版')).toBeInTheDocument();
});

test('falls back to the file hint when the sheet is too large for a QR code', async () => {
  saveSheet(makeSheet());

  const { findAllByText } = render(
    <PrintScreen sheetId={SHEET_ID} onBack={() => {}} />,
  );

  expect((await findAllByText('环节较多')).length).toBe(2);
  expect((await findAllByText('请用文件分发')).length).toBe(2);
});

test('shows the print button on web', async () => {
  saveSheet(makeSheet());

  const { findByText } = render(
    <PrintScreen sheetId={SHEET_ID} onBack={() => {}} />,
  );

  expect(await findByText('打印 / 导出文件')).toBeInTheDocument();
});
