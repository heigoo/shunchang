import '@testing-library/jest-dom';
import { fireEvent, render } from '@lynx-js/react/testing-library';
import { beforeEach, expect, test } from '@rstest/core';

import type { RuntimeState, Sheet, SheetStatus } from '../../domain/types';
import {
  clearAllForTest,
  getSheet,
  saveRuntime,
  saveSheet,
} from '../../store/repository';
import { ReportScreen } from '../ReportScreen';

const SHEET_ID = 'sheet-report';

function makeSheet(status: SheetStatus = 'done'): Sheet {
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
    status,
    version: 2,
    updatedAt: Date.now(),
  };
}

function makeRuntime(
  actuals: RuntimeState['actuals'],
  currentIndex: number,
): RuntimeState {
  return {
    sheetId: SHEET_ID,
    currentIndex,
    actuals,
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
  };
}

beforeEach(() => {
  clearAllForTest();
});

test('summarises plan, actual, diff and completion counts', async () => {
  saveSheet(makeSheet());
  saveRuntime(
    makeRuntime(
      {
        'item-a': { start: 480, end: 550, result: 'done' },
        'item-b': { start: 550 },
      },
      1,
    ),
  );

  const { findByText } = render(
    <ReportScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onContinue={() => {}}
    />,
  );

  expect(await findByText('秋季婚礼流程')).toBeInTheDocument();
  expect(await findByText('未全部完成')).toBeInTheDocument();
  expect(await findByText('1 小时 30 分钟')).toBeInTheDocument();
  expect(await findByText('1 小时 10 分钟')).toBeInTheDocument();
  expect(await findByText('−20 分钟')).toBeInTheDocument();
  expect(await findByText('继续执行')).toBeInTheDocument();
});

test('continues execution and restores the sheet to running', async () => {
  saveSheet(makeSheet());
  saveRuntime(
    makeRuntime(
      {
        'item-a': { start: 480, end: 550, result: 'done' },
        'item-b': { start: 550 },
      },
      1,
    ),
  );

  const continued: string[] = [];
  const { findByText } = render(
    <ReportScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onContinue={(id) => {
        continued.push(id);
      }}
    />,
  );

  fireEvent.tap(await findByText('继续执行'));

  expect(continued).toEqual([SHEET_ID]);
  expect(getSheet(SHEET_ID)?.status).toBe('running');
});

test('hides continue when every item reached a terminal state', async () => {
  saveSheet(makeSheet());
  saveRuntime(
    makeRuntime(
      {
        'item-a': { start: 480, end: 540, result: 'done' },
        'item-b': { start: 540, end: 570, result: 'skipped' },
      },
      2,
    ),
  );

  const { findByText, queryByText } = render(
    <ReportScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onContinue={() => {}}
    />,
  );

  expect(await findByText('已完成')).toBeInTheDocument();
  expect(queryByText('继续执行')).toBeNull();
  expect(queryByText('未全部完成')).toBeNull();
});

test('lists unfinished items and archives the report as done', async () => {
  saveSheet(makeSheet('running'));
  saveRuntime(
    makeRuntime(
      {
        'item-a': { start: 480, end: 550, result: 'done' },
      },
      1,
    ),
  );

  const archived: string[] = [];
  const { findByText } = render(
    <ReportScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onContinue={() => {}}
      onArchive={(id) => {
        archived.push(id);
      }}
    />,
  );

  expect(await findByText('未执行清单')).toBeInTheDocument();
  expect(await findByText('仪式开始')).toBeInTheDocument();

  fireEvent.tap(await findByText('归档'));

  expect(archived).toEqual([SHEET_ID]);
  expect(getSheet(SHEET_ID)?.status).toBe('done');
});
