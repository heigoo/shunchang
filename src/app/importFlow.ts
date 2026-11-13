import {
  decodeFile,
  decodePayload,
  decodeShortCode,
  sheetFingerprint,
} from '../domain/codec';
import type { ShortPayload, SheetPayload } from '../domain/codec';
import type { RuntimeState, Sheet } from '../domain/types';
import { t } from '../i18n';
import {
  getRuntime,
  getSheet,
  listSheets,
  normalizeRuntime,
  saveRuntime,
  saveSheet,
  setRole,
} from '../store/repository';
import { storage } from '../store/storage';
import { webLocation } from './share';
import { webClearHash } from './webBridge';

export type ImportError =
  | 'bad-format'
  | 'bad-checksum'
  | 'unsupported-version'
  | 'older-sheet'
  | 'stale-state'
  | 'no-sheet'
  | 'legacy-code'
  | 'ambiguous-sheet';

export type ImportResult =
  | { ok: true; sheetId: string; sheet: Sheet }
  | { ok: false; error: ImportError };

const MESSAGES: Record<ImportError, string> = {
  'bad-format': '无法识别的内容',
  'bad-checksum': '校验失败，请核对',
  'unsupported-version': '版本不受支持，请升级应用',
  'older-sheet': '该手册已有更新版本',
  'stale-state': '已是最新状态',
  'no-sheet': '本机没有这份手册，请先扫码或导入文件',
  'legacy-code': '旧版短码已停用，请重新扫码',
  'ambiguous-sheet': '无法唯一匹配手册，请改用链接或文件',
};

const DEVICE_ID_KEY = 'shunchang.deviceId';
const OWNER_NOTICE_PREFIX = 'shunchang.ownerNotice.';
const DEVICE_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function importErrorMessage(error: ImportError): string {
  return t(MESSAGES[error] ?? MESSAGES['bad-format']);
}

function ownerNoticeKey(sheetId: string): string {
  return `${OWNER_NOTICE_PREFIX}${sheetId}`;
}

/** 本机设备短标识，首次使用时生成并落盘，形如 `D-7K2M`。 */
export function getDeviceId(): string {
  try {
    const saved = storage.get(DEVICE_ID_KEY);
    if (saved && saved.length > 0) {
      return saved;
    }
  } catch {
    // 读取失败时继续生成。
  }

  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += DEVICE_ID_ALPHABET[
      Math.floor(Math.random() * DEVICE_ID_ALPHABET.length)
    ];
  }
  const id = `D-${suffix}`;
  try {
    storage.set(DEVICE_ID_KEY, id);
  } catch {
    // 持久化失败时仍返回本次会话可用的标识。
  }
  return id;
}

/** 主控转移到更高代次时留下的本地提示，跟随页据此提示“只读”。 */
export function readOwnerNotice(sheetId: string): boolean {
  return readOwnerNoticeEpoch(sheetId) > 0;
}

export function readOwnerNoticeEpoch(sheetId: string): number {
  try {
    const raw = storage.get(ownerNoticeKey(sheetId));
    const epoch = raw ? Number(raw) : 0;
    return Number.isFinite(epoch) && epoch > 0 ? epoch : 0;
  } catch {
    return 0;
  }
}

function writeOwnerNotice(sheetId: string, epoch: number): void {
  try {
    storage.set(ownerNoticeKey(sheetId), String(epoch));
  } catch {
    // 提示写入失败不影响同步本身。
  }
}

export function clearOwnerNotice(sheetId: string): void {
  try {
    storage.remove(ownerNoticeKey(sheetId));
  } catch {
    // Ignore.
  }
}

function baseRuntime(sheetId: string): RuntimeState {
  return normalizeRuntime({
    sheetId,
    currentIndex: 0,
    actuals: {},
    offsetMin: 0,
    execVersion: 0,
    lastSyncAt: 0,
  });
}

function storeRuntime(
  incoming: RuntimeState,
  sheetId: string,
  now: number,
): void {
  saveRuntime(
    normalizeRuntime({
      ...incoming,
      sheetId,
      lastSyncMode: 'full',
      lastSyncAt: now,
    }),
  );
}

function ensureBaseline(sheetId: string, now: number): void {
  const existing = getRuntime(sheetId);
  if (existing) {
    saveRuntime({ ...existing, lastSyncAt: now });
    return;
  }
  saveRuntime(
    normalizeRuntime({
      sheetId,
      currentIndex: -1,
      actuals: {},
      offsetMin: 0,
      execVersion: 0,
      lastSyncAt: now,
    }),
  );
}

/** incoming 的主控代次高于本地时，本机降级为跟随并留下提示。 */
function noteHigherEpoch(sheetId: string, incoming?: RuntimeState): boolean {
  if (!incoming) {
    return false;
  }
  const localRuntime = getRuntime(sheetId);
  if (!localRuntime || incoming.ownerEpoch <= localRuntime.ownerEpoch) {
    return false;
  }
  setRole('follower');
  writeOwnerNotice(sheetId, incoming.ownerEpoch);
  return true;
}

function applyPayload(payload: SheetPayload, now: number): ImportResult {
  const incoming = payload.sheet;
  const local = getSheet(incoming.id);
  const followedOwner = noteHigherEpoch(incoming.id, payload.runtime);

  if (!local) {
    const saved = saveSheet(incoming);
    if (payload.runtime) {
      storeRuntime(payload.runtime, incoming.id, now);
    } else {
      ensureBaseline(incoming.id, now);
    }
    return { ok: true, sheetId: saved.id, sheet: saved };
  }

  if (incoming.version < local.version) {
    return { ok: false, error: 'older-sheet' };
  }

  if (incoming.version === local.version) {
    if (payload.runtime) {
      const localRuntime = getRuntime(local.id);
      if (localRuntime) {
        if (payload.runtime.execVersion <= localRuntime.execVersion) {
          // 更高代次只降级为跟随，不回退本机更新的执行数据。
          if (followedOwner) {
            return { ok: true, sheetId: local.id, sheet: local };
          }
          return { ok: false, error: 'stale-state' };
        }
      }
      storeRuntime(payload.runtime, local.id, now);
    } else {
      ensureBaseline(local.id, now);
    }
    return { ok: true, sheetId: local.id, sheet: local };
  }

  const saved = saveSheet(incoming);
  if (payload.runtime) {
    const localRuntime = getRuntime(incoming.id);
    if (!localRuntime || payload.runtime.execVersion >= localRuntime.execVersion) {
      storeRuntime(payload.runtime, incoming.id, now);
    }
  } else {
    ensureBaseline(incoming.id, now);
  }
  return { ok: true, sheetId: saved.id, sheet: saved };
}

function applyShort(payload: ShortPayload, now: number): ImportResult {
  const matches = listSheets().filter(
    (sheet) => sheetFingerprint(sheet.id) === payload.fingerprint,
  );
  if (matches.length === 0) {
    return { ok: false, error: 'no-sheet' };
  }
  if (matches.length > 1) {
    return { ok: false, error: 'ambiguous-sheet' };
  }

  const match = matches[0];
  const localRuntime = getRuntime(match.id);
  if (localRuntime && localRuntime.ownerEpoch > payload.ownerEpoch) {
    return { ok: false, error: 'stale-state' };
  }
  const followedOwner =
    localRuntime !== null && payload.ownerEpoch > localRuntime.ownerEpoch;
  if (
    localRuntime &&
    !followedOwner &&
    localRuntime.execVersion >= payload.execVersion
  ) {
    return { ok: false, error: 'stale-state' };
  }
  if (followedOwner) {
    setRole('follower');
    writeOwnerNotice(match.id, payload.ownerEpoch);
  }

  const next: RuntimeState = {
    ...(localRuntime ?? baseRuntime(match.id)),
    sheetId: match.id,
    currentIndex: payload.currentIndex,
    offsetMin: payload.offsetMin,
    // 短码只携带有效偏移，本机按自动偏移吸收，手动偏移归零。
    autoOffsetMin: payload.offsetMin,
    manualOffsetMin: 0,
    ownerEpoch: payload.ownerEpoch,
    execVersion: payload.execVersion,
    lastSyncMode: 'short',
    lastSyncAt: now,
  };
  saveRuntime(normalizeRuntime(next));

  const sheet =
    match.status === 'done'
      ? match
      : saveSheet({ ...match, status: 'running' });

  return { ok: true, sheetId: sheet.id, sheet };
}

/** 显式接管主控：代次 +1、记录本机设备标识并切回督导身份。 */
export function takeOverOwner(
  sheetId: string,
  now: number = Date.now(),
): RuntimeState {
  const localRuntime = getRuntime(sheetId);
  const base = localRuntime ?? baseRuntime(sheetId);
  const next = normalizeRuntime({
    ...base,
    sheetId,
    ownerEpoch:
      Math.max(
        localRuntime ? localRuntime.ownerEpoch : 0,
        readOwnerNoticeEpoch(sheetId),
      ) + 1,
    ownerDeviceId: getDeviceId(),
    lastSyncAt: now,
  });
  saveRuntime(next);
  setRole('owner');
  clearOwnerNotice(sheetId);
  return next;
}

export function importPayloadText(
  payloadText: string,
  now: number = Date.now(),
): ImportResult {
  const decoded = decodePayload(payloadText);
  if (!decoded.ok) {
    return { ok: false, error: decoded.error };
  }
  return applyPayload(decoded.payload, now);
}

export function importFileText(
  text: string,
  now: number = Date.now(),
): ImportResult {
  const decoded = decodeFile(text);
  if (!decoded.ok) {
    return { ok: false, error: decoded.error };
  }
  return applyPayload(decoded.payload, now);
}

export function importShortCodeText(
  text: string,
  now: number = Date.now(),
): ImportResult {
  const decoded = decodeShortCode(text);
  if (!decoded.ok) {
    return { ok: false, error: decoded.error };
  }
  return applyShort(decoded.payload, now);
}

export function applyLaunchHash(now: number = Date.now()): ImportResult | null {
  const location = webLocation();
  if (!location) {
    return null;
  }

  const hash = location.hash ?? '';
  if (hash.length === 0) {
    return null;
  }

  const raw = hash.charAt(0) === '#' ? hash.slice(1) : hash;
  let result: ImportResult;

  if (raw.indexOf('d=') === 0) {
    result = importPayloadText(raw.slice(2), now);
  } else if (raw.indexOf('s=') === 0) {
    result = importShortCodeText(raw.slice(2), now);
  } else {
    return null;
  }

  void webClearHash();
  if (result.ok) {
    setRole('follower');
  }
  return result;
}
