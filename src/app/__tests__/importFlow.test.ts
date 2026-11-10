import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';

import type { RuntimeState, Sheet } from '../../domain/types';
import { encodePayload, encodeShortCode } from '../../domain/codec';
import {
  clearAllForTest,
  getRole,
  getRuntime,
  getSheet,
  saveRuntime,
  saveSheet,
  setRole,
} from '../../store/repository';
import {
  applyLaunchHash,
  importErrorMessage,
  importPayloadText,
  importShortCodeText,
} from '../importFlow';

const NOW = 1762700000000;

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 'sheet-import-1',
    name: '秋季婚礼流程',
    date: '2026-11-10',
    startMin: 480,
    items: [
      {
        id: 'item-a',
        name: '迎宾签到',
        durationMin: 60,
        owner: '督导',
        note: '提前确认灯光',
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
    version: 2,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRuntime(
  sheetOrder: Sheet,
  overrides: Partial<RuntimeState> = {},
): RuntimeState {
  return {
    sheetId: sheetOrder.id,
    currentIndex: 1,
    actuals: { 'item-a': { start: 480, end: 540, result: 'done' } },
    offsetMin: 5,
    execVersion: 2,
    lastSyncAt: NOW - 1000,
    ...overrides,
  };
}

beforeEach(() => {
  clearAllForTest();
});

const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');

function stubLocation(hash: string): void {
  Object.defineProperty(globalThis, 'location', {
    value: { origin: 'https://example.com', pathname: '/app', search: '', hash },
    configurable: true,
  });
}

afterEach(() => {
  if (originalLocation) {
    Object.defineProperty(globalThis, 'location', originalLocation);
  }
});

describe('import full payload', () => {
  it('stores a sheet and runtime when nothing is local', () => {
    const sheet = makeSheet();
    const runtime = makeRuntime(sheet);
    const payload = encodePayload(sheet, runtime);

    const result = importPayloadText(payload, NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sheetId).toBe(sheet.id);
    }
    expect(getSheet(sheet.id)?.name).toBe('秋季婚礼流程');
    expect(getRuntime(sheet.id)?.currentIndex).toBe(1);
    expect(getRuntime(sheet.id)?.lastSyncAt).toBe(NOW);
    expect(getRuntime(sheet.id)?.actuals['item-a']?.result).toBe('done');
  });

  it('rejects a payload whose sheet version is older', () => {
    saveSheet(makeSheet({ version: 3 }));

    const result = importPayloadText(encodePayload(makeSheet({ version: 2 })), NOW);

    expect(result).toEqual({ ok: false, error: 'older-sheet' });
    expect(getSheet('sheet-import-1')?.version).toBe(3);
  });

  it('replaces the runtime when the execution version moves forward', () => {
    const local = saveSheet(makeSheet());
    saveRuntime(makeRuntime(local, { execVersion: 1, currentIndex: 0 }));

    const incoming = makeRuntime(local, { execVersion: 2, currentIndex: 1 });
    const result = importPayloadText(encodePayload(local, incoming), NOW);

    expect(result.ok).toBe(true);
    expect(getRuntime(local.id)?.execVersion).toBe(2);
    expect(getRuntime(local.id)?.currentIndex).toBe(1);
    expect(getRuntime(local.id)?.lastSyncAt).toBe(NOW);
  });

  it('rejects a payload with an execution version that is not newer', () => {
    const local = saveSheet(makeSheet());
    saveRuntime(makeRuntime(local, { execVersion: 4 }));

    const result = importPayloadText(
      encodePayload(local, makeRuntime(local, { execVersion: 4 })),
      NOW,
    );

    expect(result).toEqual({ ok: false, error: 'stale-state' });
  });

  it('rejects a malformed payload', () => {
    const result = importPayloadText('not*a*valid*payload', NOW);

    expect(result).toEqual({ ok: false, error: 'bad-format' });
  });
});

describe('import sheet without runtime', () => {
  it('creates a sync baseline when nothing is local', () => {
    const sheet = makeSheet();
    const result = importPayloadText(encodePayload(sheet), NOW);

    expect(result.ok).toBe(true);
    const runtime = getRuntime(sheet.id);
    expect(runtime).not.toBeNull();
    expect(runtime?.currentIndex).toBe(-1);
    expect(runtime?.execVersion).toBe(0);
    expect(runtime?.lastSyncAt).toBe(NOW);
  });

  it('refreshes lastSyncAt of an existing runtime', () => {
    const local = saveSheet(makeSheet());
    saveRuntime(makeRuntime(local, { lastSyncAt: NOW - 60 * 60 * 1000 }));

    const result = importPayloadText(encodePayload(local), NOW);

    expect(result.ok).toBe(true);
    const runtime = getRuntime(local.id);
    expect(runtime?.currentIndex).toBe(1);
    expect(runtime?.execVersion).toBe(2);
    expect(runtime?.lastSyncAt).toBeGreaterThanOrEqual(NOW);
  });
});

describe('import short code', () => {
  it('applies a short code to a known sheet', () => {
    const sheet = saveSheet(makeSheet({ status: 'published', version: 1 }));
    const runtime = makeRuntime(sheet, {
      execVersion: 3,
      currentIndex: 1,
      offsetMin: 7,
    });

    const result = importShortCodeText(encodeShortCode(sheet.id, runtime), NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sheetId).toBe(sheet.id);
    }
    const stored = getRuntime(sheet.id);
    expect(stored?.execVersion).toBe(3);
    expect(stored?.currentIndex).toBe(1);
    expect(stored?.offsetMin).toBe(7);
    expect(stored?.lastSyncAt).toBe(NOW);
    expect(getSheet(sheet.id)?.status).toBe('running');
  });

  it('reports no-sheet when the fingerprint matches nothing', () => {
    const code = encodeShortCode('sheet-unknown', makeRuntime(makeSheet()));

    expect(importShortCodeText(code, NOW)).toEqual({
      ok: false,
      error: 'no-sheet',
    });
  });

  it('rejects a short code that is not newer than local state', () => {
    const sheet = saveSheet(makeSheet());
    saveRuntime(makeRuntime(sheet, { execVersion: 5 }));

    const code = encodeShortCode(sheet.id, makeRuntime(sheet, { execVersion: 2 }));

    expect(importShortCodeText(code, NOW)).toEqual({
      ok: false,
      error: 'stale-state',
    });
  });

  it('rejects an illegal short code', () => {
    expect(importShortCodeText('0O0O0O', NOW)).toEqual({
      ok: false,
      error: 'bad-format',
    });
  });
});

describe('import error messages', () => {
  it('maps every import error to Chinese copy', () => {
    expect(importErrorMessage('bad-format')).toBe('无法识别的内容');
    expect(importErrorMessage('bad-checksum')).toBe('校验失败，请核对');
    expect(importErrorMessage('unsupported-version')).toBe('版本不受支持，请升级应用');
    expect(importErrorMessage('older-sheet')).toBe('该手册已有更新版本');
    expect(importErrorMessage('stale-state')).toBe('已是最新状态');
    expect(importErrorMessage('no-sheet')).toBe('本机没有这份手册，请先扫码或导入文件');
  });
});

describe('apply launch hash', () => {
  it('imports a full payload from #d= and switches to the follower role', () => {
    const sheet = makeSheet();
    setRole('owner');
    stubLocation(`#d=${encodePayload(sheet)}`);

    const result = applyLaunchHash(NOW);

    expect(result?.ok).toBe(true);
    expect(getSheet(sheet.id)?.name).toBe('秋季婚礼流程');
    expect(getRole()).toBe('follower');
    expect(getRuntime(sheet.id)?.lastSyncAt).toBe(NOW);
  });

  it('applies a short code from #s= to a known sheet', () => {
    const sheet = saveSheet(makeSheet({ status: 'published', version: 1 }));
    saveRuntime(
      makeRuntime(sheet, { execVersion: 1, currentIndex: 0, offsetMin: 0 }),
    );
    const code = encodeShortCode(
      sheet.id,
      makeRuntime(sheet, { execVersion: 2, currentIndex: 1, offsetMin: 6 }),
    );
    stubLocation(`#s=${code}`);

    const result = applyLaunchHash(NOW);

    expect(result?.ok).toBe(true);
    const stored = getRuntime(sheet.id);
    expect(stored?.execVersion).toBe(2);
    expect(stored?.currentIndex).toBe(1);
    expect(stored?.offsetMin).toBe(6);
    expect(stored?.lastSyncAt).toBe(NOW);
    expect(getRole()).toBe('follower');
  });

  it('returns null when the launch hash carries no payload', () => {
    stubLocation('#anchor');

    expect(applyLaunchHash(NOW)).toBeNull();
  });
});
