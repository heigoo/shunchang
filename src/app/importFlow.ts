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
import { webLocation } from './share';
import { webClearHash } from './webBridge';

export type ImportError =
  | 'bad-format'
  | 'bad-checksum'
  | 'unsupported-version'
  | 'older-sheet'
  | 'stale-state'
  | 'no-sheet';

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
};

export function importErrorMessage(error: ImportError): string {
  return t(MESSAGES[error] ?? MESSAGES['bad-format']);
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
  saveRuntime(normalizeRuntime({ ...incoming, sheetId, lastSyncAt: now }));
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

function applyPayload(payload: SheetPayload, now: number): ImportResult {
  const incoming = payload.sheet;
  const local = getSheet(incoming.id);

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
    storeRuntime(payload.runtime, incoming.id, now);
  } else {
    ensureBaseline(incoming.id, now);
  }
  return { ok: true, sheetId: saved.id, sheet: saved };
}

function applyShort(payload: ShortPayload, now: number): ImportResult {
  const match = listSheets().find(
    (sheet) => sheetFingerprint(sheet.id) === payload.fingerprint,
  );
  if (!match) {
    return { ok: false, error: 'no-sheet' };
  }

  const localRuntime = getRuntime(match.id);
  if (localRuntime && localRuntime.execVersion >= payload.execVersion) {
    return { ok: false, error: 'stale-state' };
  }

  const next: RuntimeState = {
    ...(localRuntime ?? baseRuntime(match.id)),
    sheetId: match.id,
    currentIndex: payload.currentIndex,
    offsetMin: payload.offsetMin,
    // 短码只携带有效偏移，本机按自动偏移吸收，手动偏移归零。
    autoOffsetMin: payload.offsetMin,
    manualOffsetMin: 0,
    execVersion: payload.execVersion,
    lastSyncAt: now,
  };
  saveRuntime(next);

  const sheet =
    match.status === 'done'
      ? match
      : saveSheet({ ...match, status: 'running' });

  return { ok: true, sheetId: sheet.id, sheet };
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
