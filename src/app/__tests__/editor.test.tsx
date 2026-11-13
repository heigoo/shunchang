import '@testing-library/jest-dom';
import { fireEvent, render } from '@lynx-js/react/testing-library';
import { beforeEach, expect, test } from '@rstest/core';

import type { Sheet } from '../../domain/types';
import { clearAllForTest, getSheet, saveSheet } from '../../store/repository';
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

test('shows 锁定 待填 for a locked item without a time', async () => {
  const sheet = makeSheet();
  sheet.items[0] = { ...sheet.items[0], locked: true, lockAt: null };
  saveSheet(sheet);

  const { findByText } = render(
    <EditorScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onStartRuntime={() => {}}
      onPrint={() => {}}
    />,
  );

  expect(await findByText('[锁定 待填]')).toBeInTheDocument();
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

function todayKey(): string {
  const now = new Date();
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value));
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

test('starts a published sheet directly without bumping the version', async () => {
  saveSheet({
    ...makeSheet(),
    date: todayKey(),
    status: 'published',
    version: 3,
  });

  const started: string[] = [];
  const { findByText } = render(
    <EditorScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onStartRuntime={(id) => {
        started.push(id);
      }}
      onPrint={() => {}}
    />,
  );

  fireEvent.tap(await findByText('开始执行'));

  expect(started).toEqual([SHEET_ID]);
  const saved = getSheet(SHEET_ID);
  expect(saved?.version).toBe(3);
  expect(saved?.status).toBe('published');
});

test('warns before starting a sheet dated another day', async () => {
  saveSheet({ ...makeSheet(), status: 'published', version: 3 });

  const started: string[] = [];
  const { findByText } = render(
    <EditorScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onStartRuntime={(id) => {
        started.push(id);
      }}
      onPrint={() => {}}
    />,
  );

  fireEvent.tap(await findByText('开始执行'));
  expect(
    await findByText('这份手册的日期是 2026-11-10，不是今天。仍要开始执行？'),
  ).toBeInTheDocument();
  expect(started).toEqual([]);

  fireEvent.tap(await findByText('继续执行'));
  expect(started).toEqual([SHEET_ID]);
});

test('blocks start execution when a published sheet has unpublished changes', async () => {
  saveSheet({ ...makeSheet(), status: 'published', version: 2, dirty: true });

  const started: string[] = [];
  const { findByText } = render(
    <EditorScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onStartRuntime={(id) => {
        started.push(id);
      }}
      onPrint={() => {}}
    />,
  );

  expect(await findByText('请先发布修改')).toBeInTheDocument();
  fireEvent.tap(await findByText('开始执行'));
  expect(started).toEqual([]);
});

test('asks for publishing before starting a draft', async () => {
  saveSheet(makeSheet());

  const started: string[] = [];
  const { findByText } = render(
    <EditorScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onStartRuntime={(id) => {
        started.push(id);
      }}
      onPrint={() => {}}
    />,
  );

  expect(await findByText('请先发布，再开始执行')).toBeInTheDocument();
  fireEvent.tap(await findByText('开始执行'));
  expect(started).toEqual([]);
});

test('renders a done sheet as read-only with report entry', async () => {
  saveSheet({ ...makeSheet(), status: 'done', version: 4 });

  const reports: string[] = [];
  const copies: string[] = [];
  const { container, findByText, queryByText } = render(
    <EditorScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onStartRuntime={() => {}}
      onPrint={() => {}}
      onOpenReport={(id) => {
        reports.push(id);
      }}
      onDuplicate={(id) => {
        copies.push(id);
      }}
    />,
  );

  expect(
    await findByText('这份手册已执行完成，不能编辑、发布或再次开始执行。'),
  ).toBeInTheDocument();
  expect(container.querySelectorAll('.Row').length).toBe(0);
  expect(container.querySelectorAll('.EditorTable').length).toBe(0);
  expect(queryByText('发布')).toBeNull();
  expect(queryByText('添加环节')).toBeNull();

  fireEvent.tap(await findByText('查看报告'));
  expect(reports).toEqual([SHEET_ID]);

  fireEvent.tap(await findByText('复制为新手册'));
  expect(copies.length).toBe(1);
  expect(copies[0]).not.toBe(SHEET_ID);
});
