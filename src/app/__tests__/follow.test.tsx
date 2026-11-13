import '@testing-library/jest-dom';
import { fireEvent, render } from '@lynx-js/react/testing-library';
import { beforeEach, expect, rstest, test } from '@rstest/core';

import type { Sheet } from '../../domain/types';
import {
  clearAllForTest,
  getRuntime,
  saveRuntime,
  saveSheet,
} from '../../store/repository';
import { FollowScreen } from '../FollowScreen';

const SHEET_ID = 'sheet-follow-screen';

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
        note: '请来宾落座',
        lockAt: null,
      },
      {
        id: 'item-c',
        name: '合影',
        durationMin: 20,
        owner: '摄影',
        note: '',
        lockAt: null,
      },
    ],
    status: 'running',
    version: 1,
    updatedAt: Date.now(),
  };
}

beforeEach(() => {
  clearAllForTest();
});

test('renders the follower view with sync trail and item states', async () => {
  saveSheet(makeSheet());
  saveRuntime({
    sheetId: SHEET_ID,
    currentIndex: 1,
    actuals: {
      'item-a': { start: 480, end: 510, result: 'done' },
      'item-b': { start: 510 },
    },
    offsetMin: 0,
    autoOffsetMin: 0,
    manualOffsetMin: 0,
    execVersion: 3,
    lastSyncAt: Date.now(),
    ownerEpoch: 0,
    ownerDeviceId: '',
    lastSyncMode: 'full',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
  });

  const { findByText, queryByText } = render(
    <FollowScreen sheetId={SHEET_ID} onBack={() => {}} />,
  );

  expect(await findByText('秋季婚礼流程')).toBeInTheDocument();
  expect(await findByText(/第 3 版/)).toBeInTheDocument();
  expect(await findByText(/同步于/)).toBeInTheDocument();
  expect(await findByText('已完成')).toBeInTheDocument();
  expect(await findByText('进行中')).toBeInTheDocument();
  expect(queryByText('完成本环节')).toBeNull();
  expect(queryByText(/顺延/)).toBeNull();
});

test('infers earlier items as approximately done after a short sync', async () => {
  saveSheet(makeSheet());
  saveRuntime({
    sheetId: SHEET_ID,
    currentIndex: 2,
    actuals: {},
    offsetMin: 0,
    autoOffsetMin: 0,
    manualOffsetMin: 0,
    execVersion: 4,
    lastSyncAt: Date.now(),
    ownerEpoch: 0,
    ownerDeviceId: '',
    lastSyncMode: 'short',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
  });

  const { findAllByText, findByText, queryByText } = render(
    <FollowScreen sheetId={SHEET_ID} onBack={() => {}} />,
  );

  expect(await findAllByText('已完成（约）')).toHaveLength(2);
  expect(
    await findByText('短码同步不含逐项结果，已完成为推断'),
  ).toBeInTheDocument();
  expect(queryByText('待执行')).toBeNull();
});

test('takes over the owner only after confirmation', async () => {
  saveSheet(makeSheet());
  saveRuntime({
    sheetId: SHEET_ID,
    currentIndex: 1,
    actuals: {},
    offsetMin: 0,
    autoOffsetMin: 0,
    manualOffsetMin: 0,
    execVersion: 3,
    lastSyncAt: Date.now(),
    ownerEpoch: 1,
    ownerDeviceId: '',
    lastSyncMode: 'full',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
  });
  const onTakeOver = rstest.fn();

  const { findByText } = render(
    <FollowScreen
      sheetId={SHEET_ID}
      onBack={() => {}}
      onTakeOver={onTakeOver}
    />,
  );

  fireEvent.tap(await findByText('接管主控'));
  expect(getRuntime(SHEET_ID)?.ownerEpoch).toBe(1);

  fireEvent.tap(await findByText('确认接管'));

  expect(onTakeOver).toHaveBeenCalledWith(SHEET_ID);
  expect(getRuntime(SHEET_ID)?.ownerEpoch).toBe(2);
});
