import { expect, test } from '@rstest/core';

import type { RuntimeState, Sheet } from '../../domain/types';
import { buildSyncTrail, itemState, ownerOptions } from '../followOps';

const NOW = 1_760_000_000_000;
const MINUTE = 60 * 1000;

function makeRuntime(patch: Partial<RuntimeState> = {}): RuntimeState {
  return {
    sheetId: 'sheet-a',
    currentIndex: 0,
    actuals: {},
    offsetMin: 0,
    autoOffsetMin: 0,
    manualOffsetMin: 0,
    execVersion: 3,
    lastSyncAt: NOW,
    ownerEpoch: 0,
    ownerDeviceId: '',
    lastSyncMode: 'full',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
    ...patch,
  };
}

function makeSheet(owners: string[]): Sheet {
  return {
    id: 'sheet-a',
    name: '秋季婚礼流程',
    date: '2026-11-10',
    startMin: 480,
    items: owners.map((owner, index) => ({
      id: `item-${index}`,
      name: `环节${index}`,
      durationMin: 30,
      owner,
      note: '',
      lockAt: null,
    })),
    status: 'running',
    version: 1,
    updatedAt: NOW,
  };
}

test('buildSyncTrail treats a missing runtime as never synced and stale', () => {
  const trail = buildSyncTrail(null, NOW);
  expect(trail.absolute).toBe('尚未同步');
  expect(trail.relative).toBe('');
  expect(trail.stale).toBe(true);
});

test('buildSyncTrail reports relative minutes for a fresh sync', () => {
  const trail = buildSyncTrail(
    makeRuntime({ lastSyncAt: NOW - 3 * MINUTE }),
    NOW,
  );
  expect(trail.absolute).toMatch(/^同步于 \d{2}:\d{2}$/);
  expect(trail.relative).toBe('3 分钟前');
  expect(trail.stale).toBe(false);
  expect(trail.versionLabel).toBe('第 3 版');
});

test('buildSyncTrail marks a sync older than 15 minutes as stale', () => {
  const trail = buildSyncTrail(
    makeRuntime({ lastSyncAt: NOW - 16 * MINUTE }),
    NOW,
  );
  expect(trail.relative).toBe('16 分钟前');
  expect(trail.stale).toBe(true);
});

test('buildSyncTrail drops relative time when the device clock is behind', () => {
  const trail = buildSyncTrail(
    makeRuntime({ lastSyncAt: NOW + MINUTE }),
    NOW,
  );
  expect(trail.relative).toBe('');
  expect(trail.absolute).toMatch(/^同步于 \d{2}:\d{2}$/);
});

test('buildSyncTrail treats lastSyncAt 0 as never synced', () => {
  const trail = buildSyncTrail(makeRuntime({ lastSyncAt: 0 }), NOW);
  expect(trail.absolute).toBe('尚未同步');
  expect(trail.stale).toBe(true);
});

test('itemState prefers actual results and then the current index', () => {
  const runtime = makeRuntime({
    currentIndex: 2,
    actuals: {
      'item-0': { result: 'done' },
      'item-1': { result: 'skipped' },
    },
  });

  expect(itemState(runtime, 0, 'item-0')).toBe('done');
  expect(itemState(runtime, 1, 'item-1')).toBe('skipped');
  expect(itemState(runtime, 2, 'item-2')).toBe('active');
  expect(itemState(runtime, 3, 'item-3')).toBe('pending');
  expect(itemState(null, 0, 'item-0')).toBe('pending');
});

test('ownerOptions removes blanks and duplicates while keeping order', () => {
  const sheet = makeSheet(['督导', '', '主持', '督导', ' 摄影 ']);
  expect(ownerOptions(sheet)).toEqual(['督导', '主持', '摄影']);
});
