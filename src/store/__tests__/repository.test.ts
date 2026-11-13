import { beforeEach, describe, expect, it } from '@rstest/core';

import type { RuntimeState, Sheet } from '../../domain/types';
import { formatDateKey } from '../../domain/types';
import {
  clearAllForTest,
  consumeStorageError,
  deleteSheet,
  duplicateSheet,
  getLastView,
  getRole,
  getRuntime,
  getSheet,
  getTheme,
  listSheets,
  removeRuntime,
  saveRuntime,
  saveSheet,
  setLastView,
  setRole,
  setTheme,
} from '../repository';
import { storage } from '../storage';

const SHEETS_KEY = 'shunchang.sheets.v1';

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 'sheet-1',
    name: '婚礼流程',
    date: '2026-11-10',
    startMin: 8 * 60,
    items: [
      {
        id: 'item-1',
        name: '迎宾',
        durationMin: 30,
        owner: '主持',
        note: '',
        lockAt: null,
      },
    ],
    status: 'draft',
    version: 1,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeRuntime(sheetId: string): RuntimeState {
  return {
    sheetId,
    currentIndex: 1,
    actuals: { 'item-1': { start: 480, end: 510, result: 'done' } },
    offsetMin: 3,
    autoOffsetMin: 3,
    manualOffsetMin: 0,
    execVersion: 2,
    lastSyncAt: 1762700000000,
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

describe('sheets', () => {
  it('saves a sheet, refreshes updatedAt, and reads it back', () => {
    const input = makeSheet({ updatedAt: 1 });
    const before = Date.now();
    const saved = saveSheet(input);

    expect(saved.updatedAt).toBeGreaterThanOrEqual(before);
    expect(saved.name).toBe('婚礼流程');
    expect(getSheet(input.id)?.name).toBe('婚礼流程');
    expect(listSheets()).toHaveLength(1);
  });

  it('lists sheets sorted by updatedAt descending', () => {
    storage.set(
      SHEETS_KEY,
      JSON.stringify({
        v: 1,
        sheets: [
          makeSheet({ id: 'a', updatedAt: 100 }),
          makeSheet({ id: 'b', updatedAt: 300 }),
          makeSheet({ id: 'c', updatedAt: 200 }),
        ],
      }),
    );

    expect(listSheets().map((sheet) => sheet.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by event date descending, then updatedAt descending', () => {
    storage.set(
      SHEETS_KEY,
      JSON.stringify({
        v: 1,
        sheets: [
          makeSheet({ id: 'a', date: '2026-11-10', updatedAt: 500 }),
          makeSheet({ id: 'b', date: '2026-11-23', updatedAt: 100 }),
          makeSheet({ id: 'c', date: '2026-11-23', updatedAt: 300 }),
          makeSheet({ id: 'd', date: '2026-11-01', updatedAt: 900 }),
        ],
      }),
    );

    expect(listSheets().map((sheet) => sheet.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('skips corrupt entries but keeps valid sheets', () => {
    storage.set(
      SHEETS_KEY,
      JSON.stringify({
        v: 1,
        sheets: [makeSheet({ id: 'valid' }), { id: 'broken' }, null],
      }),
    );

    expect(listSheets().map((sheet) => sheet.id)).toEqual(['valid']);
  });

  it('refuses to delete a running sheet', () => {
    saveSheet(makeSheet({ id: 'running', status: 'running' }));
    saveRuntime(makeRuntime('running'));

    expect(deleteSheet('running')).toEqual({
      ok: false,
      reason: '执行中的手册不能删除，请先结束执行',
    });
    expect(getSheet('running')).not.toBeNull();
    expect(getRuntime('running')).not.toBeNull();
  });

  it('deletes a sheet together with its runtime', () => {
    saveSheet(makeSheet({ id: 'done', status: 'done' }));
    saveRuntime(makeRuntime('done'));

    expect(deleteSheet('done')).toEqual({ ok: true });
    expect(getSheet('done')).toBeNull();
    expect(getRuntime('done')).toBeNull();
  });

  it('duplicates a sheet as a draft with fresh ids', () => {
    const source = saveSheet(
      makeSheet({
        id: 'source',
        status: 'published',
        version: 4,
        items: [
          {
            id: 'item-1',
            name: '迎宾',
            durationMin: 30,
            owner: '主持',
            note: '保留备注',
            lockAt: 600,
            locked: true,
          },
        ],
      }),
    );

    const copy = duplicateSheet(source.id);

    expect(copy).not.toBeNull();
    expect(copy?.id).not.toBe(source.id);
    expect(copy?.name).toBe('婚礼流程（副本）');
    expect(copy?.status).toBe('draft');
    expect(copy?.version).toBe(1);
    expect(copy?.items[0].id).not.toBe(source.items[0].id);
    expect(copy?.items[0].lockAt).toBe(600);
    expect(copy?.items[0].locked).toBe(true);
    expect(copy?.items[0].note).toBe('保留备注');
    expect(listSheets()).toHaveLength(2);
  });

  it('duplicates with today by default and accepts an explicit date', () => {
    const source = saveSheet(makeSheet({ id: 'source', date: '2026-11-10' }));

    const todayCopy = duplicateSheet(source.id);

    expect(todayCopy?.date).toBe(formatDateKey(Date.now()));

    const datedCopy = duplicateSheet(source.id, '2026-12-01');

    expect(datedCopy?.date).toBe('2026-12-01');

    const invalidCopy = duplicateSheet(source.id, '2026-13-01');

    expect(invalidCopy?.date).toBe(formatDateKey(Date.now()));
  });

  it('returns null when duplicating a missing sheet', () => {
    expect(duplicateSheet('missing')).toBeNull();
  });
});

describe('runtime', () => {
  it('saves, reads and removes runtime state', () => {
    const runtime = makeRuntime('sheet-1');
    saveRuntime(runtime);

    expect(getRuntime('sheet-1')).toEqual(runtime);

    removeRuntime('sheet-1');
    expect(getRuntime('sheet-1')).toBeNull();
  });

  it('ignores corrupt runtime data', () => {
    storage.set('shunchang.runtime.sheet-1', '{not-json');

    expect(getRuntime('sheet-1')).toBeNull();
    expect(consumeStorageError()).toBe('本地数据损坏，已忽略');
  });
});

describe('role and last view', () => {
  it('defaults to owner and persists the follower role', () => {
    expect(getRole()).toBe('owner');

    setRole('follower');
    expect(getRole()).toBe('follower');
  });

  it('persists and restores the last view', () => {
    expect(getLastView()).toBeNull();

    setLastView({ view: 'runtime', sheetId: 'sheet-1' });
    expect(getLastView()).toEqual({ view: 'runtime', sheetId: 'sheet-1' });

    setLastView({ view: 'list' });
    expect(getLastView()).toEqual({ view: 'list' });
  });
});

describe('theme', () => {
  it('defaults to the ink theme', () => {
    expect(getTheme()).toBe('default');
  });

  it('persists the xishi theme and can switch back', () => {
    setTheme('xishi');
    expect(getTheme()).toBe('xishi');

    setTheme('default');
    expect(getTheme()).toBe('default');
  });
});

describe('corrupt storage', () => {
  it('returns an empty list and reports corrupt JSON', () => {
    storage.set(SHEETS_KEY, '{broken-json');

    expect(listSheets()).toEqual([]);
    expect(consumeStorageError()).toBe('本地数据损坏，已忽略');
    expect(consumeStorageError()).toBeNull();
  });

  it('returns an empty list for unsupported versions', () => {
    storage.set(SHEETS_KEY, JSON.stringify({ v: 2, sheets: [makeSheet()] }));

    expect(listSheets()).toEqual([]);
    expect(consumeStorageError()).toBe('本地数据损坏，已忽略');
  });
});
