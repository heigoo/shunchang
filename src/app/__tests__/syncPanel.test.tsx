import '@testing-library/jest-dom';
import { render } from '@lynx-js/react/testing-library';
import { beforeEach, expect, test } from '@rstest/core';

import type { RuntimeState, Sheet } from '../../domain/types';
import { clearAllForTest } from '../../store/repository';
import { SyncBoard } from '../SyncBoard';
import { SyncPanel } from '../SyncPanel';

const SHEET_ID = 'sheet-sync-panel';

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

function makeRuntime(overrides: Partial<RuntimeState> = {}): RuntimeState {
  return {
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
    lastSyncMode: 'full',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
    ...overrides,
  };
}

beforeEach(() => {
  clearAllForTest();
});

test('shows the formatted short code and sync operations', async () => {
  const { findAllByText, findByText } = render(
    <SyncPanel
      sheet={makeSheet()}
      runtime={makeRuntime()}
      onClose={() => {}}
      onOpenBoard={() => {}}
    />,
  );

  expect(await findByText('复制同步文案')).toBeInTheDocument();
  expect(await findByText('全屏同步牌')).toBeInTheDocument();
  expect(await findByText('按负责人专属链接')).toBeInTheDocument();
  expect(await findByText('摄影')).toBeInTheDocument();

  const codes = await findAllByText(/^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/);
  expect(codes).toHaveLength(1);
});

test('explains that the short code is unavailable when out of range', async () => {
  const { findByText } = render(
    <SyncPanel
      sheet={makeSheet()}
      runtime={makeRuntime({ execVersion: 1024 })}
      onClose={() => {}}
    />,
  );

  expect(
    await findByText('当前版本无法用短码同步，请用二维码/链接'),
  ).toBeInTheDocument();
});

test('renders the full-screen board with version, stage and last sync', async () => {
  const { findByText } = render(
    <SyncBoard sheet={makeSheet()} runtime={makeRuntime()} onClose={() => {}} />,
  );

  expect(await findByText('全屏同步牌')).toBeInTheDocument();
  expect(await findByText('秋季婚礼流程')).toBeInTheDocument();
  expect(await findByText('第 4 版')).toBeInTheDocument();
  expect(await findByText('合影')).toBeInTheDocument();
  expect(await findByText(/同步于|最后同步/)).toBeInTheDocument();
  expect(await findByText('退出')).toBeInTheDocument();
});
