import '@testing-library/jest-dom';
import { render } from '@lynx-js/react/testing-library';
import { beforeEach, expect, test } from '@rstest/core';

import type { Sheet } from '../../domain/types';
import { clearAllForTest, saveSheet } from '../../store/repository';
import { RuntimeScreen } from '../RuntimeScreen';

const SHEET_ID = 'sheet-runtime-screen';

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
    status: 'published',
    version: 1,
    updatedAt: Date.now(),
  };
}

beforeEach(() => {
  clearAllForTest();
});

test('renders the execution console for a published sheet', async () => {
  saveSheet(makeSheet());

  const { findByText } = render(
    <RuntimeScreen sheetId={SHEET_ID} onBack={() => {}} />,
  );

  expect(await findByText('秋季婚礼流程')).toBeInTheDocument();
  expect(await findByText('SEG 001 / 002')).toBeInTheDocument();
  expect(await findByText('DONE · 完成')).toBeInTheDocument();
});
