import { describe, expect, it } from '@rstest/core';

import type { Item, RuntimeState, Sheet } from '../types';
import {
  SHORT_CODE_ALPHABET,
  decodeFile,
  decodePayload,
  decodeShortCode,
  encodeFile,
  encodePayload,
  encodeShortCode,
  normalizeShortCode,
  sheetFingerprint,
} from '../codec';
import type { ShortPayload } from '../codec';

function makeItem(index: number): Item {
  const locked = index % 7 === 0;
  return {
    id: `item-${index + 1}`,
    name: `第 ${index + 1} 环节 · 迎宾签到`,
    durationMin: 15 + (index % 4) * 5,
    owner: `负责人${index % 5}`,
    note: index % 3 === 0 ? '与酒店确认灯光与音乐，提前五分钟提醒' : '',
    lockAt: locked ? 480 + index * 20 : null,
    ...(locked ? { locked: true } : {}),
  };
}

function makeSheet(): Sheet {
  return {
    id: 'sheet-codec-1',
    name: '中式婚礼全流程',
    date: '2026-11-10',
    startMin: 8 * 60,
    items: Array.from({ length: 40 }, (_, index) => makeItem(index)),
    status: 'published',
    version: 3,
    updatedAt: 1762700000000,
  };
}

function makeRuntime(sheet: Sheet): RuntimeState {
  const actuals: RuntimeState['actuals'] = {};
  for (let index = 0; index < 10; index += 1) {
    actuals[`item-${index + 1}`] = {
      start: 480 + index * 20,
      end: 480 + index * 20 + 17,
      result: index === 3 ? 'skipped' : 'done',
    };
  }

  return {
    sheetId: sheet.id,
    currentIndex: 10,
    actuals,
    offsetMin: 7,
    autoOffsetMin: 7,
    manualOffsetMin: 0,
    execVersion: 4,
    lastSyncAt: 1762700123456,
    ownerEpoch: 0,
    ownerDeviceId: '',
    lastSyncMode: 'full',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
  };
}

function buildShortCode(
  fingerprint: number,
  execVersion: number,
  currentIndex: number,
  offsetBits: number,
  checksum: number,
): string {
  const packed =
    (fingerprint << 22) |
    (execVersion << 16) |
    (currentIndex << 10) |
    (offsetBits << 2) |
    checksum;

  let code = '';
  for (let shift = 25; shift >= 0; shift -= 5) {
    code += SHORT_CODE_ALPHABET[(packed >>> shift) & 0x1f];
  }
  return code;
}

describe('payload codec', () => {
  it('round-trips a 40-item sheet with runtime through deflate + base64url', () => {
    const sheet = makeSheet();
    const runtime = makeRuntime(sheet);
    const code = encodePayload(sheet, runtime);

    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(2000);
    expect(decodePayload(code)).toEqual({
      ok: true,
      payload: { v: 1, sheet, runtime },
    });
  });

  it('round-trips a sheet without runtime', () => {
    const sheet = makeSheet();
    const decoded = decodePayload(encodePayload(sheet));

    expect(decoded).toEqual({ ok: true, payload: { v: 1, sheet } });
  });

  it('detects a tampered payload', () => {
    const code = encodePayload(makeSheet(), makeRuntime(makeSheet()));
    const middle = Math.floor(code.length / 2);
    const replacement = code[middle] === 'A' ? 'B' : 'A';
    const tampered = `${code.slice(0, middle)}${replacement}${code.slice(middle + 1)}`;

    const result = decodePayload(tampered);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['bad-checksum', 'bad-format']).toContain(result.error);
    }
  });

  it('rejects non-base64url input', () => {
    expect(decodePayload('not*valid*code')).toEqual({
      ok: false,
      error: 'bad-format',
    });
  });
});

describe('file codec', () => {
  it('round-trips sheet and runtime through readable JSON', () => {
    const sheet = makeSheet();
    const runtime = makeRuntime(sheet);
    const text = encodeFile(sheet, runtime);

    expect(text).toContain('"app": "shunchang"');
    expect(decodeFile(text)).toEqual({
      ok: true,
      payload: { v: 1, sheet, runtime },
    });
  });

  it('rejects other apps and unsupported versions', () => {
    expect(decodeFile('not json')).toEqual({
      ok: false,
      error: 'bad-format',
    });
    expect(
      decodeFile(JSON.stringify({ app: 'other', v: 1, sheet: makeSheet() })),
    ).toEqual({ ok: false, error: 'bad-format' });

    const payload = JSON.parse(encodeFile(makeSheet()));
    payload.v = 2;
    expect(decodeFile(JSON.stringify(payload))).toEqual({
      ok: false,
      error: 'unsupported-version',
    });
  });
});

describe('short code', () => {
  it('round-trips fingerprint, version, index and offset', () => {
    const sheet = makeSheet();
    const runtime = makeRuntime(sheet);
    const code = encodeShortCode(sheet.id, runtime);

    expect(code).toHaveLength(6);

    const expected: ShortPayload = {
      fingerprint: sheetFingerprint(sheet.id),
      execVersion: 4,
      currentIndex: 10,
      offsetMin: 7,
    };
    expect(decodeShortCode(code)).toEqual({ ok: true, payload: expected });
  });

  it('accepts lowercase input and hyphens', () => {
    const sheet = makeSheet();
    const runtime = makeRuntime(sheet);
    const code = encodeShortCode(sheet.id, runtime);
    const messy = `${code.slice(0, 3)}-${code.slice(3)}`.toLowerCase();

    expect(normalizeShortCode(messy)).toBe(code);
    expect(decodeShortCode(messy)).toEqual(decodeShortCode(code));
  });

  it('rejects codes with a bad length or illegal characters', () => {
    expect(decodeShortCode('ABC')).toEqual({
      ok: false,
      error: 'bad-format',
    });
    expect(decodeShortCode('ABCDEFG')).toEqual({
      ok: false,
      error: 'bad-format',
    });
    expect(decodeShortCode('0O0O0O')).toEqual({
      ok: false,
      error: 'bad-format',
    });
    expect(normalizeShortCode('0O0O0O')).toBe('');
  });

  it('rejects a wrong checksum', () => {
    const fingerprint = 1;
    const execVersion = 2;
    const currentIndex = 3;
    const offsetBits = 4;
    const wrongChecksum = ((fingerprint + execVersion + currentIndex + offsetBits) % 4 + 1) % 4;
    const code = buildShortCode(
      fingerprint,
      execVersion,
      currentIndex,
      offsetBits,
      wrongChecksum,
    );

    expect(decodeShortCode(code)).toEqual({
      ok: false,
      error: 'bad-checksum',
    });
  });
});
