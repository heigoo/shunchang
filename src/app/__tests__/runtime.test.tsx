import '@testing-library/jest-dom';
import { fireEvent, render } from '@lynx-js/react/testing-library';
import { afterEach, beforeEach, describe, expect, rstest, test } from '@rstest/core';

import type { Sheet } from '../../domain/types';
import {
  clearAllForTest,
  getRuntime,
  getSheet,
  saveSheet,
} from '../../store/repository';
import { listSnapshots } from '../runtimeHistory';
import { batteryWarningNeeded, RuntimeScreen } from '../RuntimeScreen';
import { resetNativeHostForTest } from '../share';

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

afterEach(() => {
  delete (globalThis as any).NativeModules;
  resetNativeHostForTest();
});

test('renders the execution console for a published sheet', async () => {
  saveSheet(makeSheet());

  const { findByText } = render(
    <RuntimeScreen sheetId={SHEET_ID} onBack={() => {}} />,
  );

  expect(await findByText('秋季婚礼流程')).toBeInTheDocument();
  expect(await findByText('环节 001 / 002')).toBeInTheDocument();
  expect(await findByText('完成本环节')).toBeInTheDocument();
});

describe('battery warning', () => {
  test('fires only below 20% and before the user dismisses it', () => {
    expect(batteryWarningNeeded(19, false)).toBe(true);
    expect(batteryWarningNeeded(20, false)).toBe(false);
    expect(batteryWarningNeeded(null, false)).toBe(false);
    expect(batteryWarningNeeded(-1, false)).toBe(false);
    expect(batteryWarningNeeded(19, true)).toBe(false);
  });
});

test('shows keep-awake and low battery export on android', async () => {
  saveSheet(makeSheet());
  const keepScreenOn = rstest.fn();
  (globalThis as any).NativeModules = {
    ShunchangHost: {
      pickJson: () => {},
      saveJson: () => {},
      getBatteryLevel: () => 15,
      keepScreenOn,
    },
  };

  const { findByText } = render(
    <RuntimeScreen sheetId={SHEET_ID} onBack={() => {}} />,
  );

  expect(await findByText('屏幕常亮')).toBeInTheDocument();
  expect(await findByText('立即导出备份')).toBeInTheDocument();

  fireEvent.tap(await findByText('屏幕常亮'));
  expect(keepScreenOn).toHaveBeenCalledWith(true);
});

test('undoes a completion and restores the previous runtime', async () => {
  saveSheet(makeSheet());

  const { findByText } = render(
    <RuntimeScreen sheetId={SHEET_ID} onBack={() => {}} />,
  );

  fireEvent.tap(await findByText('完成本环节'));
  expect(await findByText('环节 002 / 002')).toBeInTheDocument();
  expect(listSnapshots(SHEET_ID)).toHaveLength(1);

  fireEvent.tap(await findByText('撤销'));

  expect(await findByText('环节 001 / 002')).toBeInTheDocument();
  expect(getRuntime(SHEET_ID)?.currentIndex).toBe(0);
  expect(getSheet(SHEET_ID)?.status).toBe('running');
  expect(listSnapshots(SHEET_ID)).toHaveLength(0);
});

test('marks skipped items as skipped and counts terminals as progress', async () => {
  saveSheet(makeSheet());

  const { findByText, queryByText } = render(
    <RuntimeScreen sheetId={SHEET_ID} onBack={() => {}} />,
  );

  fireEvent.tap(await findByText('跳过本环节'));
  fireEvent.tap(await findByText('确认跳过'));

  expect(await findByText('已跳过')).toBeInTheDocument();
  expect(await findByText('001 / 002')).toBeInTheDocument();
  expect(queryByText('已完成')).toBeNull();

  fireEvent.tap(await findByText('撤销'));
  expect(queryByText('已跳过')).toBeNull();
});

test('restores an earlier step from the operation history', async () => {
  saveSheet(makeSheet());

  const { findAllByText, findByText } = render(
    <RuntimeScreen sheetId={SHEET_ID} onBack={() => {}} />,
  );

  fireEvent.tap(await findByText('完成本环节'));
  fireEvent.tap(await findByText('记录'));

  expect((await findAllByText('完成「迎宾签到」')).length).toBeGreaterThan(0);

  fireEvent.tap(await findByText('回退到此步'));
  fireEvent.tap(await findByText('确认回退'));

  expect(await findByText('环节 001 / 002')).toBeInTheDocument();
  expect(getRuntime(SHEET_ID)?.currentIndex).toBe(0);
});

test('ends execution into the report and records a snapshot', async () => {
  saveSheet(makeSheet());
  const opened: string[] = [];

  const { findAllByText, findByText } = render(
    <RuntimeScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onOpenReport={(id) => {
        opened.push(id);
      }}
    />,
  );

  fireEvent.tap(await findByText('结束'));
  const confirmButtons = await findAllByText('结束执行');
  fireEvent.tap(confirmButtons[confirmButtons.length - 1]);

  expect(opened).toEqual([SHEET_ID]);
  expect(getSheet(SHEET_ID)?.status).toBe('done');
  expect(listSnapshots(SHEET_ID)).toHaveLength(1);
});
