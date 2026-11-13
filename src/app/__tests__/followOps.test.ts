import { expect, test } from '@rstest/core';

import type { RuntimeState, Sheet } from '../../domain/types';
import type { TimelineRow } from '../../domain/timeline';
import {
  buildSyncCopyText,
  buildSyncTrail,
  followCountdownTarget,
  itemState,
  ownerFromSearch,
  ownerOptions,
} from '../followOps';

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

test('itemState infers earlier items as approximately done after a short sync', () => {
  const runtime = makeRuntime({
    currentIndex: 2,
    actuals: { 'item-1': { result: 'skipped' } },
    lastSyncMode: 'short',
  });

  expect(itemState(runtime, 0, 'item-0')).toBe('doneApprox');
  expect(itemState(runtime, 1, 'item-1')).toBe('skipped');
  expect(itemState(runtime, 2, 'item-2')).toBe('active');
  expect(itemState(runtime, 3, 'item-3')).toBe('pending');
});

test('itemState keeps earlier items pending after a full sync', () => {
  const runtime = makeRuntime({
    currentIndex: 2,
    actuals: {},
    lastSyncMode: 'full',
  });

  expect(itemState(runtime, 0, 'item-0')).toBe('pending');
  expect(itemState(runtime, 1, 'item-1')).toBe('pending');
});

test('ownerOptions removes blanks and duplicates while keeping order', () => {
  const sheet = makeSheet(['督导', '', '主持', '督导', ' 摄影 ']);
  expect(ownerOptions(sheet)).toEqual(['督导', '主持', '摄影']);
});

test('ownerFromSearch reads and decodes the owner query', () => {
  expect(ownerFromSearch('?follow=1&o=%E6%91%84%E5%BD%B1')).toBe('摄影');
  expect(ownerFromSearch('?o=摄影')).toBe('摄影');
  expect(ownerFromSearch('?o=灯光+组')).toBe('灯光 组');
  expect(ownerFromSearch('?follow=1')).toBe('');
  expect(ownerFromSearch('')).toBe('');
});

test('buildSyncCopyText includes the sheet, version, time and short code', () => {
  const text = buildSyncCopyText({
    sheetName: '秋季婚礼流程',
    execVersion: 3,
    now: new Date(2026, 10, 13, 14, 5, 0).getTime(),
    shortCode: '23456789A',
  });

  expect(text).toContain('【顺场】秋季婚礼流程');
  expect(text).toContain('第 3 版');
  expect(text).toContain('11-13 14:05');
  expect(text).toContain('234-567-89A');
});

test('buildSyncCopyText falls back to the link hint when no short code exists', () => {
  const text = buildSyncCopyText({
    sheetName: '',
    execVersion: 1024,
    now: NOW,
    shortCode: '',
  });

  expect(text).toContain('未命名手册');
  expect(text).toContain('当前版本无法用短码同步，请用二维码/链接');
});

test('followCountdownTarget counts the current item end or the next start', () => {
  const rows: TimelineRow[] = [
    {
      itemId: 'item-0',
      index: 0,
      planStart: 480,
      displayStart: 480,
      displayEnd: 510,
      effectiveDurationMin: 30,
      lockAt: null,
      compressedLostMin: 0,
    },
    {
      itemId: 'item-1',
      index: 1,
      planStart: 510,
      displayStart: 510,
      displayEnd: 540,
      effectiveDurationMin: 30,
      lockAt: null,
      compressedLostMin: 0,
    },
  ];

  expect(followCountdownTarget(rows, 0, 2)).toEqual({
    kind: 'current',
    targetMin: 510,
  });
  expect(followCountdownTarget(rows, -1, 2)).toEqual({
    kind: 'next',
    targetMin: 480,
  });
  expect(followCountdownTarget(rows, 2, 2)).toBeNull();
});
