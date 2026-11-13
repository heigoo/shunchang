import '@testing-library/jest-dom';
import { fireEvent, render } from '@lynx-js/react/testing-library';
import { afterEach, beforeEach, describe, expect, rstest, test } from '@rstest/core';

import type { Sheet } from '../../domain/types';
import { clearAllForTest, saveSheet } from '../../store/repository';
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
