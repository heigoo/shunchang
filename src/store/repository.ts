import { MAX_INSERTED_ITEMS } from '../domain/execution';
import type {
  AuditEntry,
  InsertedItem,
  RuntimeState,
  Sheet,
} from '../domain/types';
import { t } from '../i18n';

import { storage } from './storage';

const SHEETS_KEY = 'shunchang.sheets.v1';
const ROLE_KEY = 'shunchang.role';
const LAST_VIEW_KEY = 'shunchang.lastView';
const THEME_KEY = 'shunchang.theme';
const CORRUPT_MESSAGE = '本地数据损坏，已忽略';

type AppView = 'list' | 'editor' | 'runtime' | 'follow' | 'print';

export type AppTheme = 'default' | 'xishi';

interface LastView {
  view: AppView;
  sheetId?: string;
}

const VIEWS: AppView[] = ['list', 'editor', 'runtime', 'follow', 'print'];

let lastError: string | null = null;
const runtimeKeys = new Set<string>();

function setCorruptError(): void {
  lastError = CORRUPT_MESSAGE;
}

function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function runtimeKey(sheetId: string): string {
  return `shunchang.runtime.${sheetId}`;
}

function isSheet(value: unknown): value is Sheet {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const sheet = value as Sheet;
  return (
    typeof sheet.id === 'string' &&
    sheet.id.length > 0 &&
    Array.isArray(sheet.items)
  );
}

function isView(value: unknown): value is AppView {
  return typeof value === 'string' && VIEWS.indexOf(value as AppView) >= 0;
}

function readSheets(): Sheet[] {
  let raw: string | null = null;
  try {
    raw = storage.get(SHEETS_KEY);
  } catch {
    setCorruptError();
    return [];
  }

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as {
      v?: unknown;
      sheets?: unknown;
    };
    if (!parsed || typeof parsed !== 'object') {
      setCorruptError();
      return [];
    }
    if (parsed.v !== 1) {
      setCorruptError();
      return [];
    }
    if (!Array.isArray(parsed.sheets)) {
      setCorruptError();
      return [];
    }
    return parsed.sheets.filter(isSheet);
  } catch {
    setCorruptError();
    return [];
  }
}

function writeSheets(sheets: Sheet[]): void {
  try {
    storage.set(SHEETS_KEY, JSON.stringify({ v: 1, sheets }));
  } catch {
    // The storage layer already degrades gracefully; keep the API non-throwing.
  }
}

export function listSheets(): Sheet[] {
  const sheets = readSheets();
  sheets.sort((a, b) => b.updatedAt - a.updatedAt);
  return sheets;
}

export function getSheet(id: string): Sheet | null {
  return readSheets().find((sheet) => sheet.id === id) ?? null;
}

export function saveSheet(sheet: Sheet): Sheet {
  const next: Sheet = { ...sheet, updatedAt: Date.now() };
  const sheets = readSheets();
  const index = sheets.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    sheets[index] = next;
  } else {
    sheets.unshift(next);
  }
  writeSheets(sheets);
  return next;
}

export function deleteSheet(id: string): { ok: boolean; reason?: string } {
  const sheets = readSheets();
  const index = sheets.findIndex((sheet) => sheet.id === id);
  if (index < 0) {
    return { ok: false, reason: t('手册不存在') };
  }
  if (sheets[index].status === 'running') {
    return {
      ok: false,
      reason: t('执行中的手册不能删除，请先结束执行'),
    };
  }

  sheets.splice(index, 1);
  writeSheets(sheets);
  removeRuntime(id);
  return { ok: true };
}

export function duplicateSheet(id: string): Sheet | null {
  const source = getSheet(id);
  if (!source) {
    return null;
  }

  const copy: Sheet = {
    ...source,
    id: createId(),
    name: `${source.name}${t('（副本）')}`,
    items: source.items.map((item) => ({ ...item, id: createId() })),
    status: 'draft',
    version: 1,
    updatedAt: Date.now(),
  };

  return saveSheet(copy);
}

function isInsertedItem(value: unknown): value is InsertedItem {
  const entry = value as InsertedItem;
  return (
    !!entry &&
    typeof entry === 'object' &&
    typeof entry.id === 'string' &&
    typeof entry.afterId === 'string' &&
    !!entry.item &&
    typeof entry.item === 'object' &&
    typeof entry.item.id === 'string'
  );
}

function isAuditEntry(value: unknown): value is AuditEntry {
  const entry = value as AuditEntry;
  return (
    !!entry &&
    typeof entry === 'object' &&
    typeof entry.id === 'string' &&
    typeof entry.at === 'number' &&
    typeof entry.type === 'string' &&
    typeof entry.label === 'string'
  );
}

function normalizeLockOverrides(value: unknown): Record<string, number | null> {
  const overrides: Record<string, number | null> = {};
  if (!value || typeof value !== 'object') {
    return overrides;
  }

  Object.keys(value as Record<string, unknown>).forEach((itemId) => {
    const entry = (value as Record<string, unknown>)[itemId];
    if (entry === null || (typeof entry === 'number' && Number.isFinite(entry))) {
      overrides[itemId] = entry;
    }
  });

  return overrides;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 把旧版运行时补齐为 v2 字段；offsetMin 始终等于自动偏移 + 手动偏移。 */
export function normalizeRuntime(
  raw: Partial<RuntimeState> & { sheetId: string },
): RuntimeState {
  const storedOffset = finiteNumber(raw.offsetMin, 0);
  const autoOffsetMin =
    typeof raw.autoOffsetMin === 'number' && Number.isFinite(raw.autoOffsetMin)
      ? raw.autoOffsetMin
      : storedOffset;
  const manualOffsetMin = finiteNumber(raw.manualOffsetMin, 0);

  return {
    sheetId: raw.sheetId,
    currentIndex: Math.trunc(finiteNumber(raw.currentIndex, 0)),
    actuals: raw.actuals && typeof raw.actuals === 'object' ? raw.actuals : {},
    offsetMin: autoOffsetMin + manualOffsetMin,
    autoOffsetMin,
    manualOffsetMin,
    execVersion: finiteNumber(raw.execVersion, 1),
    lastSyncAt: finiteNumber(raw.lastSyncAt, 0),
    ownerEpoch: Math.trunc(finiteNumber(raw.ownerEpoch, 0)),
    ownerDeviceId: typeof raw.ownerDeviceId === 'string' ? raw.ownerDeviceId : '',
    lastSyncMode: raw.lastSyncMode === 'short' ? 'short' : 'full',
    insertedItems: Array.isArray(raw.insertedItems)
      ? raw.insertedItems.filter(isInsertedItem).slice(0, MAX_INSERTED_ITEMS)
      : [],
    lockOverrides: normalizeLockOverrides(raw.lockOverrides),
    audit: Array.isArray(raw.audit) ? raw.audit.filter(isAuditEntry).slice(-100) : [],
  };
}

export function getRuntime(sheetId: string): RuntimeState | null {
  let raw: string | null = null;
  try {
    raw = storage.get(runtimeKey(sheetId));
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as RuntimeState;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.sheetId !== sheetId ||
      typeof parsed.currentIndex !== 'number' ||
      typeof parsed.offsetMin !== 'number' ||
      typeof parsed.execVersion !== 'number' ||
      typeof parsed.lastSyncAt !== 'number' ||
      !parsed.actuals ||
      typeof parsed.actuals !== 'object'
    ) {
      setCorruptError();
      return null;
    }
    return normalizeRuntime(parsed);
  } catch {
    setCorruptError();
    return null;
  }
}

export function saveRuntime(runtime: RuntimeState): void {
  runtimeKeys.add(runtime.sheetId);
  try {
    storage.set(runtimeKey(runtime.sheetId), JSON.stringify(runtime));
  } catch {
    // Ignore persistence failures.
  }
}

export function removeRuntime(sheetId: string): void {
  runtimeKeys.delete(sheetId);
  try {
    storage.remove(runtimeKey(sheetId));
  } catch {
    // Ignore.
  }
}

export function getRole(): 'owner' | 'follower' {
  try {
    const raw = storage.get(ROLE_KEY);
    return raw === 'follower' ? 'follower' : 'owner';
  } catch {
    return 'owner';
  }
}

export function setRole(role: 'owner' | 'follower'): void {
  try {
    storage.set(ROLE_KEY, role);
  } catch {
    // Ignore persistence failures.
  }
}

export function getTheme(): AppTheme {
  try {
    return storage.get(THEME_KEY) === 'xishi' ? 'xishi' : 'default';
  } catch {
    return 'default';
  }
}

export function setTheme(theme: AppTheme): void {
  try {
    storage.set(THEME_KEY, theme === 'xishi' ? 'xishi' : 'default');
  } catch {
    // Ignore persistence failures.
  }
}

/** 等主题落盘后再切换桌面图标：原生会从新入口重启应用。 */
export function setThemeAsync(theme: AppTheme): Promise<void> {
  const value = theme === 'xishi' ? 'xishi' : 'default';
  try {
    if (storage.setAsync) {
      return storage.setAsync(THEME_KEY, value);
    }
    storage.set(THEME_KEY, value);
  } catch {
    // Ignore persistence failures.
  }
  return Promise.resolve();
}

export function getLastView(): LastView | null {
  try {
    const raw = storage.get(LAST_VIEW_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { view?: unknown; sheetId?: unknown };
    if (!parsed || typeof parsed !== 'object' || !isView(parsed.view)) {
      return null;
    }
    const result: LastView = { view: parsed.view };
    if (typeof parsed.sheetId === 'string') {
      result.sheetId = parsed.sheetId;
    }
    return result;
  } catch {
    return null;
  }
}

export function setLastView(view: LastView): void {
  try {
    const data: LastView = { view: view.view };
    if (typeof view.sheetId === 'string') {
      data.sheetId = view.sheetId;
    }
    storage.set(LAST_VIEW_KEY, JSON.stringify(data));
  } catch {
    // Ignore persistence failures.
  }
}

export function consumeStorageError(): string | null {
  const error = lastError;
  lastError = null;
  return error ? t(error) : null;
}

export async function hydrateStorage(): Promise<void> {
  if (!storage.hydrate) {
    return;
  }

  await storage.hydrate([
    SHEETS_KEY,
    ROLE_KEY,
    LAST_VIEW_KEY,
    THEME_KEY,
    'shunchang.lang',
  ]);

  const sheetIds = readSheets().map((sheet) => sheet.id);
  if (sheetIds.length > 0) {
    await storage.hydrate(sheetIds.map(runtimeKey));
  }
}

export function clearAllForTest(): void {
  const sheetIds = new Set<string>(runtimeKeys);
  for (const sheet of readSheets()) {
    sheetIds.add(sheet.id);
  }

  sheetIds.forEach((sheetId) => {
    try {
      storage.remove(runtimeKey(sheetId));
    } catch {
      // Ignore.
    }
  });
  runtimeKeys.clear();

  [SHEETS_KEY, ROLE_KEY, LAST_VIEW_KEY, THEME_KEY].forEach((key) => {
    try {
      storage.remove(key);
    } catch {
      // Ignore.
    }
  });

  lastError = null;
}
