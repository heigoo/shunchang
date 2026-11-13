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

function bitsOf(value: number, width: number): string {
  let bits = '';
  for (let shift = width - 1; shift >= 0; shift -= 1) {
    bits += (value >>> shift) & 1 ? '1' : '0';
  }
  return bits;
}

function buildShortCode(fields: {
  fingerprint: number;
  execVersion: number;
  currentIndex: number;
  offsetBits: number;
  ownerEpoch: number;
  checksum: number;
}): string {
  const bits =
    bitsOf(fields.fingerprint, 14) +
    bitsOf(fields.execVersion, 10) +
    bitsOf(fields.currentIndex, 7) +
    bitsOf(fields.offsetBits, 9) +
    bitsOf(fields.ownerEpoch, 3) +
    bitsOf(fields.checksum, 2);

  let code = '';
  for (let i = 0; i < bits.length; i += 5) {
    code += SHORT_CODE_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
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

  it('truncates long notes only for the compact payload', () => {
    const sheet = makeSheet();
    const longNote = '请与酒店确认灯光、音乐与上菜节奏，并提前五分钟提醒所有负责人'.repeat(4);
    sheet.items[0].note = longNote;

    const compact = decodePayload(
      encodePayload(sheet, undefined, { compactNotes: true }),
    );
    expect(compact.ok).toBe(true);
    if (compact.ok) {
      const note = compact.payload.sheet.items[0].note;
      expect(note.endsWith('（备注已截断）')).toBe(true);
      expect(Array.from(note).slice(0, -7).length).toBe(40);
    }

    const full = decodePayload(encodePayload(sheet));
    expect(full.ok).toBe(true);
    if (full.ok) {
      expect(full.payload.sheet.items[0].note).toBe(longNote);
    }
  });

  it('keeps short notes unchanged in the compact payload', () => {
    const sheet = makeSheet();
    sheet.items[0].note = '与酒店确认灯光';

    const decoded = decodePayload(
      encodePayload(sheet, undefined, { compactNotes: true }),
    );

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.payload.sheet.items[0].note).toBe('与酒店确认灯光');
    }
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
  it('round-trips 45 bits into nine base32 characters', () => {
    const sheet = makeSheet();
    const runtime = { ...makeRuntime(sheet), ownerEpoch: 5 };
    const code = encodeShortCode(sheet.id, runtime);

    expect(code).toHaveLength(9);

    const expected: ShortPayload = {
      fingerprint: sheetFingerprint(sheet.id),
      execVersion: 4,
      currentIndex: 10,
      offsetMin: 7,
      ownerEpoch: 5,
    };
    expect(decodeShortCode(code)).toEqual({ ok: true, payload: expected });
  });

  it('accepts lowercase input and XXX-XXX-XXX hyphens', () => {
    const sheet = makeSheet();
    const runtime = makeRuntime(sheet);
    const code = encodeShortCode(sheet.id, runtime);
    const messy = `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6)}`.toLowerCase();

    expect(normalizeShortCode(messy)).toBe(code);
    expect(decodeShortCode(messy)).toEqual(decodeShortCode(code));
  });

  it('rejects the retired six-character code', () => {
    expect(decodeShortCode('ABCDEF')).toEqual({
      ok: false,
      error: 'legacy-code',
    });
    expect(decodeShortCode('ABC-DEF')).toEqual({
      ok: false,
      error: 'legacy-code',
    });
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
    expect(decodeShortCode('ABCDEFGH')).toEqual({
      ok: false,
      error: 'bad-format',
    });
    expect(decodeShortCode('0O0O0O0O0')).toEqual({
      ok: false,
      error: 'bad-format',
    });
    expect(normalizeShortCode('0O0O0O0O0')).toBe('');
  });

  it('rejects a wrong checksum', () => {
    const fingerprint = 1;
    const execVersion = 2;
    const currentIndex = 3;
    const offsetBits = 4;
    const ownerEpoch = 5;
    const sum = fingerprint + execVersion + currentIndex + offsetBits + ownerEpoch;
    const code = buildShortCode({
      fingerprint,
      execVersion,
      currentIndex,
      offsetBits,
      ownerEpoch,
      checksum: (sum % 4 + 1) % 4,
    });

    expect(decodeShortCode(code)).toEqual({
      ok: false,
      error: 'bad-checksum',
    });
  });

  it('keeps the fingerprint in 14 bits and detects collisions', () => {
    expect(sheetFingerprint('any-sheet')).toBeLessThanOrEqual(0x3fff);

    const seen = new Map<number, string>();
    let collision: [string, string] | null = null;
    for (let i = 0; i < 20000 && !collision; i += 1) {
      const id = `sheet-collide-${i}`;
      const fingerprint = sheetFingerprint(id);
      const previous = seen.get(fingerprint);
      if (previous !== undefined) {
        collision = [previous, id];
      } else {
        seen.set(fingerprint, id);
      }
    }

    expect(collision).not.toBeNull();
    if (collision) {
      expect(sheetFingerprint(collision[0])).toBe(
        sheetFingerprint(collision[1]),
      );
    }
  });

  it('refuses to encode out-of-range version, index or owner epoch', () => {
    const sheet = makeSheet();
    const runtime = makeRuntime(sheet);

    expect(
      encodeShortCode(sheet.id, { ...runtime, execVersion: 1024 }),
    ).toBe('');
    expect(
      encodeShortCode(sheet.id, { ...runtime, currentIndex: 128 }),
    ).toBe('');
    expect(
      encodeShortCode(sheet.id, { ...runtime, currentIndex: -1 }),
    ).toBe('');
    expect(encodeShortCode(sheet.id, { ...runtime, ownerEpoch: 8 })).toBe('');
  });

  it('clamps the offset into -180..331 minutes', () => {
    const sheet = makeSheet();
    const runtime = makeRuntime(sheet);

    const early = decodeShortCode(
      encodeShortCode(sheet.id, { ...runtime, offsetMin: -500 }),
    );
    expect(early.ok).toBe(true);
    if (early.ok) {
      expect(early.payload.offsetMin).toBe(-180);
    }

    const late = decodeShortCode(
      encodeShortCode(sheet.id, { ...runtime, offsetMin: 1000 }),
    );
    expect(late.ok).toBe(true);
    if (late.ok) {
      expect(late.payload.offsetMin).toBe(331);
    }
  });
});
