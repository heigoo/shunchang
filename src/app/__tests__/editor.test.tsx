import '@testing-library/jest-dom';
import { fireEvent, render } from '@lynx-js/react/testing-library';
import { beforeEach, expect, test } from '@rstest/core';

import type { Sheet } from '../../domain/types';
import { clearAllForTest, saveSheet } from '../../store/repository';
import { EditorScreen } from '../EditorScreen';

const SHEET_ID = 'sheet-editor';

function inputValue(element: Element | null): string | null {
  if (!element) {
    return null;
  }
  const attribute = element.getAttribute('value');
  if (attribute !== null) {
    return attribute;
  }
  const property = (element as HTMLInputElement).value;
  return typeof property === 'string' ? property : null;
}

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
      {
        id: 'item-c',
        name: '合影',
        durationMin: 45,
        owner: '摄影',
        note: '',
        lockAt: null,
      },
    ],
    status: 'draft',
    version: 1,
    updatedAt: Date.now(),
  };
}

beforeEach(() => {
  clearAllForTest();
});

test('renders the sheet name, numbering and computed plan times', async () => {
  saveSheet(makeSheet());

  const { container, findByText } = render(
    <EditorScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onStartRuntime={() => {}}
      onPrint={() => {}}
    />,
  );

  const nameInput = container.querySelector('.EditorName');
  expect(inputValue(nameInput)).toBe('秋季婚礼流程');

  const cells = Array.from(container.querySelectorAll('.CellInput'));
  expect(inputValue(cells[0] ?? null)).toBe('迎宾签到');
  expect(inputValue(cells[1] ?? null)).toBe('60');

  expect(await findByText('001')).toBeInTheDocument();
  expect(await findByText(/08:00/)).toBeInTheDocument();
  expect(await findByText(/09:00/)).toBeInTheDocument();
  expect(await findByText(/09:30/)).toBeInTheDocument();
});

test('restores a deleted item with undo', async () => {
  saveSheet(makeSheet());

  const { container, findByText } = render(
    <EditorScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onStartRuntime={() => {}}
      onPrint={() => {}}
    />,
  );

  expect(container.querySelectorAll('.Row').length).toBe(3);

  // 宽屏每行三个操作：上移、下移、删除。
  const acts = container.querySelectorAll('.ActBtn');
  fireEvent.tap(acts[2]!);

  fireEvent.tap(await findByText('删除'));
  expect(container.querySelectorAll('.Row').length).toBe(2);

  fireEvent.tap(await findByText('撤销'));
  expect(container.querySelectorAll('.Row').length).toBe(3);
});
