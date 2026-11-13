import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import type { Item, RuntimeState, Sheet, SheetStatus } from './types';

export interface PayloadRuntime {
  sheetId: string;
  currentIndex: number;
  actuals: RuntimeState['actuals'];
  offsetMin: number;
  execVersion: number;
  lastSyncAt: number;
}

export interface SheetPayload {
  v: 1;
  sheet: Sheet;
  runtime?: RuntimeState;
}

export type DecodeResult =
  | { ok: true; payload: SheetPayload }
  | { ok: false; error: 'bad-format' | 'unsupported-version' | 'bad-checksum' };

export type FileDecodeResult =
  | { ok: true; payload: SheetPayload }
  | { ok: false; error: 'bad-format' | 'unsupported-version' };

export const SHORT_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface ShortPayload {
  fingerprint: number;
  execVersion: number;
  currentIndex: number;
  offsetMin: number;
}

export type ShortDecodeResult =
  | { ok: true; payload: ShortPayload }
  | { ok: false; error: 'bad-format' | 'bad-checksum' };

const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const BASE64URL_INDEX = new Map<string, number>();
for (let i = 0; i < BASE64URL_ALPHABET.length; i += 1) {
  BASE64URL_INDEX.set(BASE64URL_ALPHABET[i], i);
}

const SHORT_CODE_INDEX = new Map<string, number>();
for (let i = 0; i < SHORT_CODE_ALPHABET.length; i += 1) {
  SHORT_CODE_INDEX.set(SHORT_CODE_ALPHABET[i], i);
}

const STATUSES: SheetStatus[] = ['draft', 'published', 'running', 'done'];

function isStatus(value: unknown): value is SheetStatus {
  return typeof value === 'string' && STATUSES.indexOf(value as SheetStatus) >= 0;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;

    output += BASE64URL_ALPHABET[b0 >> 2];
    output += BASE64URL_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (hasB1) {
      output += BASE64URL_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    }
    if (hasB2) {
      output += BASE64URL_ALPHABET[b2 & 0x3f];
    }
  }
  return output;
}

function base64UrlToBytes(text: string): Uint8Array | null {
  const clean = text.replace(/\s/g, '').replace(/=+$/, '');
  if (clean.length === 0 || clean.length % 4 === 1) {
    return null;
  }

  const output = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const value = BASE64URL_INDEX.get(clean[i]);
    if (value === undefined) {
      return null;
    }
    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }

  return output.subarray(0, offset);
}

function checksum16(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    sum = (sum + bytes[i]) % 65536;
  }
  return sum;
}

export function encodePayload(sheet: Sheet, runtime?: RuntimeState): string {
  const data: Record<string, unknown> = {
    v: 1,
    s: [
      sheet.id,
      sheet.name,
      sheet.date,
      sheet.startMin,
      sheet.status,
      sheet.version,
      sheet.updatedAt,
      sheet.items.map((item) => [
        item.id,
        item.name,
        item.durationMin,
        item.owner,
        item.note,
        item.lockAt,
        item.locked ? 1 : 0,
      ]),
    ],
  };

  if (runtime) {
    data.r = [
      runtime.currentIndex,
      runtime.offsetMin,
      runtime.execVersion,
      runtime.lastSyncAt,
      runtime.actuals,
    ];
  }

  const compressed = deflateSync(strToU8(JSON.stringify(data)));
  const checksum = checksum16(compressed);
  const framed = new Uint8Array(compressed.length + 2);
  framed[0] = (checksum >> 8) & 0xff;
  framed[1] = checksum & 0xff;
  framed.set(compressed, 2);

  return bytesToBase64Url(framed);
}

function parseCompactItem(value: unknown): Item | null {
  if (!Array.isArray(value) || value.length < 6) {
    return null;
  }

  const [id, name, durationMin, owner, note, lockAt] = value;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof durationMin !== 'number'
  ) {
    return null;
  }

  const item: Item = {
    id,
    name,
    durationMin,
    owner: typeof owner === 'string' ? owner : '',
    note: typeof note === 'string' ? note : '',
    lockAt: typeof lockAt === 'number' ? lockAt : null,
  };

  if (value[6] === 1) {
    item.locked = true;
  }

  return item;
}

function parseCompactSheet(value: unknown): Sheet | null {
  if (!Array.isArray(value) || value.length < 8) {
    return null;
  }

  const [id, name, date, startMin, status, version, updatedAt, items] = value;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof date !== 'string' ||
    typeof startMin !== 'number' ||
    !isStatus(status) ||
    typeof version !== 'number' ||
    typeof updatedAt !== 'number' ||
    !Array.isArray(items)
  ) {
    return null;
  }

  const parsedItems: Item[] = [];
  for (const rawItem of items) {
    const item = parseCompactItem(rawItem);
    if (!item) {
      return null;
    }
    parsedItems.push(item);
  }

  return {
    id,
    name,
    date,
    startMin,
    items: parsedItems,
    status,
    version,
    updatedAt,
  };
}

function parseCompactRuntime(
  value: unknown,
  sheetId: string,
): RuntimeState | null {
  if (!Array.isArray(value) || value.length < 5) {
    return null;
  }

  const [currentIndex, offsetMin, execVersion, lastSyncAt, actuals] = value;
  if (
    typeof currentIndex !== 'number' ||
    typeof offsetMin !== 'number' ||
    typeof execVersion !== 'number' ||
    typeof lastSyncAt !== 'number' ||
    !actuals ||
    typeof actuals !== 'object' ||
    Array.isArray(actuals)
  ) {
    return null;
  }

  return {
    sheetId,
    currentIndex,
    actuals: actuals as RuntimeState['actuals'],
    offsetMin,
    autoOffsetMin: offsetMin,
    manualOffsetMin: 0,
    execVersion,
    lastSyncAt,
    ownerEpoch: 0,
    ownerDeviceId: '',
    lastSyncMode: 'full',
    insertedItems: [],
    lockOverrides: {},
    audit: [],
  };
}

function parseCompactPayload(value: unknown): SheetPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as { s?: unknown; r?: unknown };
  const sheet = parseCompactSheet(data.s);
  if (!sheet) {
    return null;
  }

  const payload: SheetPayload = { v: 1, sheet };
  if (data.r !== undefined) {
    const runtime = parseCompactRuntime(data.r, sheet.id);
    if (!runtime) {
      return null;
    }
    payload.runtime = runtime;
  }

  return payload;
}

export function decodePayload(code: string): DecodeResult {
  const bytes = base64UrlToBytes(typeof code === 'string' ? code : '');
  if (!bytes || bytes.length <= 2) {
    return { ok: false, error: 'bad-format' };
  }

  const expected = (bytes[0] << 8) | bytes[1];
  const body = bytes.subarray(2);
  if (checksum16(body) !== expected) {
    return { ok: false, error: 'bad-checksum' };
  }

  let text: string;
  try {
    text = strFromU8(inflateSync(body));
  } catch {
    return { ok: false, error: 'bad-format' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'bad-format' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'bad-format' };
  }

  const version = (parsed as { v?: unknown }).v;
  if (typeof version !== 'number') {
    return { ok: false, error: 'bad-format' };
  }
  if (version !== 1) {
    return { ok: false, error: 'unsupported-version' };
  }

  const payload = parseCompactPayload(parsed);
  if (!payload) {
    return { ok: false, error: 'bad-format' };
  }

  return { ok: true, payload };
}

export function encodeFile(sheet: Sheet, runtime?: RuntimeState): string {
  const data: Record<string, unknown> = {
    app: 'shunchang',
    v: 1,
    exportedAt: Date.now(),
    sheet,
  };
  if (runtime) {
    data.runtime = runtime;
  }
  return JSON.stringify(data, null, 2);
}

function isItemLike(value: unknown): value is Item {
  return (
    !!value && typeof value === 'object' && typeof (value as Item).id === 'string'
  );
}

function isSheetLike(value: unknown): value is Sheet {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const sheet = value as Sheet;
  return (
    typeof sheet.id === 'string' &&
    sheet.id.length > 0 &&
    Array.isArray(sheet.items) &&
    sheet.items.every(isItemLike)
  );
}

export function decodeFile(text: string): FileDecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof text === 'string' ? text : '');
  } catch {
    return { ok: false, error: 'bad-format' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'bad-format' };
  }

  const data = parsed as {
    app?: unknown;
    v?: unknown;
    sheet?: unknown;
    runtime?: unknown;
  };

  if (data.app !== 'shunchang') {
    return { ok: false, error: 'bad-format' };
  }
  if (typeof data.v !== 'number') {
    return { ok: false, error: 'bad-format' };
  }
  if (data.v !== 1) {
    return { ok: false, error: 'unsupported-version' };
  }
  if (!isSheetLike(data.sheet)) {
    return { ok: false, error: 'bad-format' };
  }

  const payload: SheetPayload = { v: 1, sheet: data.sheet };
  if (data.runtime !== undefined) {
    const runtime = data.runtime as RuntimeState;
    if (
      !runtime ||
      typeof runtime !== 'object' ||
      typeof runtime.currentIndex !== 'number' ||
      typeof runtime.offsetMin !== 'number' ||
      typeof runtime.execVersion !== 'number' ||
      typeof runtime.lastSyncAt !== 'number' ||
      !runtime.actuals ||
      typeof runtime.actuals !== 'object'
    ) {
      return { ok: false, error: 'bad-format' };
    }
    payload.runtime = runtime;
  }

  return { ok: true, payload };
}

export function sheetFingerprint(sheetId: string): number {
  const text = typeof sheetId === 'string' ? sheetId : '';
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  hash ^= hash >>> 16;
  return hash & 0xff;
}

function clampOffsetBits(offsetMin: number): number {
  const safe = Number.isFinite(offsetMin) ? Math.round(offsetMin) : 0;
  return Math.max(-90, Math.min(165, safe)) + 90;
}

export function encodeShortCode(sheetId: string, runtime: RuntimeState): string {
  const fingerprint = sheetFingerprint(sheetId);
  const execVersion = ((Math.trunc(runtime.execVersion) % 64) + 64) % 64;
  const currentIndex =
    runtime.currentIndex < 0
      ? 0
      : Math.min(63, Math.trunc(runtime.currentIndex));
  const offsetBits = clampOffsetBits(runtime.offsetMin);
  const checksum = (fingerprint + execVersion + currentIndex + offsetBits) % 4;

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

export function normalizeShortCode(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }

  const normalized = text.replace(/[\s-]/g, '').toUpperCase();
  if (normalized.length === 0) {
    return '';
  }

  for (let i = 0; i < normalized.length; i += 1) {
    if (!SHORT_CODE_INDEX.has(normalized[i])) {
      return '';
    }
  }

  return normalized;
}

export function decodeShortCode(text: string): ShortDecodeResult {
  const normalized = normalizeShortCode(text);
  if (normalized.length !== 6) {
    return { ok: false, error: 'bad-format' };
  }

  let packed = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const value = SHORT_CODE_INDEX.get(normalized[i]);
    if (value === undefined) {
      return { ok: false, error: 'bad-format' };
    }
    packed = (packed << 5) | value;
  }

  const fingerprint = (packed >>> 22) & 0xff;
  const execVersion = (packed >>> 16) & 0x3f;
  const currentIndex = (packed >>> 10) & 0x3f;
  const offsetBits = (packed >>> 2) & 0xff;
  const checksum = packed & 0x03;

  if ((fingerprint + execVersion + currentIndex + offsetBits) % 4 !== checksum) {
    return { ok: false, error: 'bad-checksum' };
  }

  return {
    ok: true,
    payload: {
      fingerprint,
      execVersion,
      currentIndex,
      offsetMin: offsetBits - 90,
    },
  };
}
