import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import type {
  InsertedItem,
  Item,
  RuntimeState,
  Sheet,
  SheetStatus,
} from './types';

export interface PayloadRuntime {
  sheetId: string;
  currentIndex: number;
  actuals: RuntimeState['actuals'];
  offsetMin: number;
  execVersion: number;
  lastSyncAt: number;
}

export interface SheetPayload {
  v: 1 | 2;
  sheet: Sheet;
  runtime?: RuntimeState;
}

export interface EncodeOptions {
  /** 二维码等容量受限场景：备注截断到 40 字并标注截断。 */
  compactNotes?: boolean;
}

export const COMPACT_NOTE_LIMIT = 40;
export const NOTE_TRUNCATED_MARK = '（备注已截断）';

export type DecodeResult =
  | { ok: true; payload: SheetPayload }
  | { ok: false; error: 'bad-format' | 'unsupported-version' | 'bad-checksum' };

export type FileDecodeResult =
  | { ok: true; payload: SheetPayload }
  | { ok: false; error: 'bad-format' | 'unsupported-version' };

export const SHORT_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 9 个 base32 字符承载 45 bit；展示时在消费端拼成 XXX-XXX-XXX。 */
export const SHORT_CODE_LENGTH = 9;
export const LEGACY_SHORT_CODE_LENGTH = 6;

const SHORT_FINGERPRINT_BITS = 14;
const SHORT_EXEC_VERSION_BITS = 10;
const SHORT_INDEX_BITS = 7;
const SHORT_OFFSET_BITS = 9;
const SHORT_OWNER_EPOCH_BITS = 3;
const SHORT_CHECKSUM_BITS = 2;
const SHORT_TOTAL_BITS =
  SHORT_FINGERPRINT_BITS +
  SHORT_EXEC_VERSION_BITS +
  SHORT_INDEX_BITS +
  SHORT_OFFSET_BITS +
  SHORT_OWNER_EPOCH_BITS +
  SHORT_CHECKSUM_BITS;

export const SHORT_EXEC_VERSION_MAX = (1 << SHORT_EXEC_VERSION_BITS) - 1;
export const SHORT_INDEX_MAX = (1 << SHORT_INDEX_BITS) - 1;
export const SHORT_OWNER_EPOCH_MAX = (1 << SHORT_OWNER_EPOCH_BITS) - 1;
export const SHORT_OFFSET_MIN = -180;
export const SHORT_OFFSET_MAX = 331;

export interface ShortPayload {
  fingerprint: number;
  execVersion: number;
  currentIndex: number;
  offsetMin: number;
  ownerEpoch: number;
}

export type ShortDecodeResult =
  | { ok: true; payload: ShortPayload }
  | { ok: false; error: 'bad-format' | 'bad-checksum' | 'legacy-code' };

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

function payloadNote(note: string, compact: boolean): string {
  if (!compact) {
    return note;
  }
  const chars = Array.from(note);
  if (chars.length <= COMPACT_NOTE_LIMIT) {
    return note;
  }
  return `${chars.slice(0, COMPACT_NOTE_LIMIT).join('')}${NOTE_TRUNCATED_MARK}`;
}

function compactItemTuple(item: Item, compactNotes: boolean): unknown[] {
  return [
    item.id,
    item.name,
    item.durationMin,
    item.owner,
    payloadNote(item.note, compactNotes),
    item.lockAt,
    item.locked ? 1 : 0,
  ];
}

export function encodePayload(
  sheet: Sheet,
  runtime?: RuntimeState,
  options?: EncodeOptions,
): string {
  const compactNotes = options?.compactNotes === true;
  const data: Record<string, unknown> = {
    v: 2,
    s: [
      sheet.id,
      sheet.name,
      sheet.date,
      sheet.startMin,
      sheet.status,
      sheet.version,
      sheet.updatedAt,
      sheet.items.map((item) => compactItemTuple(item, compactNotes)),
    ],
  };

  if (runtime) {
    data.r = [
      runtime.currentIndex,
      runtime.offsetMin,
      runtime.execVersion,
      runtime.lastSyncAt,
      runtime.actuals,
      runtime.ownerEpoch,
      runtime.lastSyncMode === 'short' ? 1 : 0,
      runtime.manualOffsetMin,
      runtime.ownerDeviceId,
      runtime.insertedItems.map((entry) => [
        entry.id,
        entry.afterId,
        entry.createdAt,
        compactItemTuple(entry.item, compactNotes),
      ]),
      Object.keys(runtime.lockOverrides).map((id) => [
        id,
        runtime.lockOverrides[id],
      ]),
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

function parseInsertedItems(value: unknown): InsertedItem[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const items: InsertedItem[] = [];
  for (const raw of value) {
    if (!Array.isArray(raw) || raw.length < 4) {
      return null;
    }
    const [id, afterId, createdAt, rawItem] = raw;
    const item = parseCompactItem(rawItem);
    if (
      typeof id !== 'string' ||
      typeof afterId !== 'string' ||
      typeof createdAt !== 'number' ||
      !item
    ) {
      return null;
    }
    items.push({ id, afterId, createdAt, item });
  }
  return items;
}

function parseLockOverrides(
  value: unknown,
): Record<string, number | null> | null {
  if (value === undefined) {
    return {};
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const overrides: Record<string, number | null> = {};
  for (const raw of value) {
    if (!Array.isArray(raw) || raw.length < 2) {
      return null;
    }
    const [id, lockAt] = raw;
    if (typeof id !== 'string') {
      return null;
    }
    if (lockAt === null) {
      overrides[id] = null;
      continue;
    }
    if (typeof lockAt !== 'number' || !Number.isFinite(lockAt)) {
      return null;
    }
    overrides[id] = lockAt;
  }
  return overrides;
}

function parseCompactRuntime(
  value: unknown,
  sheetId: string,
  version: number,
): RuntimeState | null {
  if (!Array.isArray(value) || value.length < 5) {
    return null;
  }

  const [
    currentIndex,
    offsetMin,
    execVersion,
    lastSyncAt,
    actuals,
    ownerEpoch,
    syncMode,
  ] = value;
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

  // v2 才携带手动偏移、设备标识、现场插入与锁定覆盖；v1 全部补默认。
  const manualOffsetMin =
    version >= 2 && typeof value[7] === 'number' ? value[7] : 0;
  const ownerDeviceId =
    version >= 2 && typeof value[8] === 'string' ? value[8] : '';
  const insertedItems = version >= 2 ? parseInsertedItems(value[9]) : [];
  const lockOverrides = version >= 2 ? parseLockOverrides(value[10]) : {};
  if (!insertedItems || !lockOverrides) {
    return null;
  }

  return {
    sheetId,
    currentIndex,
    actuals: actuals as RuntimeState['actuals'],
    offsetMin,
    autoOffsetMin: offsetMin - manualOffsetMin,
    manualOffsetMin,
    execVersion,
    lastSyncAt,
    ownerEpoch: typeof ownerEpoch === 'number' ? ownerEpoch : 0,
    ownerDeviceId,
    lastSyncMode: syncMode === 1 ? 'short' : 'full',
    insertedItems,
    lockOverrides,
    // 审计只进文件备份，不随链接/二维码分发。
    audit: [],
  };
}

function parseCompactPayload(value: unknown, version: 1 | 2): SheetPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as { s?: unknown; r?: unknown };
  const sheet = parseCompactSheet(data.s);
  if (!sheet) {
    return null;
  }

  const payload: SheetPayload = { v: version, sheet };
  if (data.r !== undefined) {
    const runtime = parseCompactRuntime(data.r, sheet.id, version);
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
  if (version !== 1 && version !== 2) {
    return { ok: false, error: 'unsupported-version' };
  }

  const payload = parseCompactPayload(parsed, version);
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

/** `sheetId` 的 FNV-1a 低 14 位，用作短码指纹。 */
export function sheetFingerprint(sheetId: string): number {
  const text = typeof sheetId === 'string' ? sheetId : '';
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash & 0x3fff;
}

function clampOffsetBits(offsetMin: number): number {
  const safe = Number.isFinite(offsetMin) ? Math.round(offsetMin) : 0;
  return (
    Math.max(SHORT_OFFSET_MIN, Math.min(SHORT_OFFSET_MAX, safe)) -
    SHORT_OFFSET_MIN
  );
}

function toBitString(value: number, width: number): string {
  let bits = '';
  for (let shift = width - 1; shift >= 0; shift -= 1) {
    bits += (value >>> shift) & 1 ? '1' : '0';
  }
  return bits;
}

function isInRange(value: number, max: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= max;
}

/** 版本、序号、代次超出短码位宽时返回空字符串，调用方应改用链接或二维码。 */
export function encodeShortCode(sheetId: string, runtime: RuntimeState): string {
  const fingerprint = sheetFingerprint(sheetId);
  const execVersion = Math.trunc(runtime.execVersion);
  const currentIndex = Math.trunc(runtime.currentIndex);
  const ownerEpoch = Math.trunc(runtime.ownerEpoch);

  if (
    !isInRange(execVersion, SHORT_EXEC_VERSION_MAX) ||
    !isInRange(currentIndex, SHORT_INDEX_MAX) ||
    !isInRange(ownerEpoch, SHORT_OWNER_EPOCH_MAX)
  ) {
    return '';
  }

  const offsetBits = clampOffsetBits(runtime.offsetMin);
  const checksum =
    (fingerprint + execVersion + currentIndex + offsetBits + ownerEpoch) % 4;

  const bits =
    toBitString(fingerprint, SHORT_FINGERPRINT_BITS) +
    toBitString(execVersion, SHORT_EXEC_VERSION_BITS) +
    toBitString(currentIndex, SHORT_INDEX_BITS) +
    toBitString(offsetBits, SHORT_OFFSET_BITS) +
    toBitString(ownerEpoch, SHORT_OWNER_EPOCH_BITS) +
    toBitString(checksum, SHORT_CHECKSUM_BITS);

  let code = '';
  for (let i = 0; i < SHORT_TOTAL_BITS; i += 5) {
    code += SHORT_CODE_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return code;
}

/** 9 位短码展示为 XXX-XXX-XXX；其他长度原样返回（含空串）。 */
export function formatShortCode(code: string): string {
  const text = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (text.length !== SHORT_CODE_LENGTH) {
    return text;
  }
  return `${text.slice(0, 3)}-${text.slice(3, 6)}-${text.slice(6)}`;
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
  if (normalized.length === LEGACY_SHORT_CODE_LENGTH) {
    // 旧六位短码已停用；UI 据此提示重新扫码。
    return { ok: false, error: 'legacy-code' };
  }
  if (normalized.length !== SHORT_CODE_LENGTH) {
    return { ok: false, error: 'bad-format' };
  }

  let bits = '';
  for (let i = 0; i < normalized.length; i += 1) {
    const value = SHORT_CODE_INDEX.get(normalized[i]);
    if (value === undefined) {
      return { ok: false, error: 'bad-format' };
    }
    bits += toBitString(value, 5);
  }

  let cursor = 0;
  const readField = (width: number): number => {
    const field = parseInt(bits.slice(cursor, cursor + width), 2);
    cursor += width;
    return field;
  };

  const fingerprint = readField(SHORT_FINGERPRINT_BITS);
  const execVersion = readField(SHORT_EXEC_VERSION_BITS);
  const currentIndex = readField(SHORT_INDEX_BITS);
  const offsetBits = readField(SHORT_OFFSET_BITS);
  const ownerEpoch = readField(SHORT_OWNER_EPOCH_BITS);
  const checksum = readField(SHORT_CHECKSUM_BITS);

  if (
    (fingerprint + execVersion + currentIndex + offsetBits + ownerEpoch) % 4 !==
    checksum
  ) {
    return { ok: false, error: 'bad-checksum' };
  }

  return {
    ok: true,
    payload: {
      fingerprint,
      execVersion,
      currentIndex,
      offsetMin: offsetBits + SHORT_OFFSET_MIN,
      ownerEpoch,
    },
  };
}
