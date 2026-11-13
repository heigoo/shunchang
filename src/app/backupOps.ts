import type { CustomTemplate, CustomTemplateItem } from '../domain/customTemplates';
import { TEMPLATES_KEY, listCustomTemplates } from '../domain/customTemplates';
import type { Item, RuntimeState, Sheet } from '../domain/types';
import { t } from '../i18n';
import {
  getRuntime,
  importSheet,
  listSheets,
  normalizeRuntime,
  saveRuntime,
} from '../store/repository';
import { storage } from '../store/storage';

export const BACKUP_APP = 'shunchang';
export const BACKUP_VERSION = 2;

export interface BackupSheetEntry {
  sheet: Sheet;
  runtime: RuntimeState;
}

/**
 * 全量备份载荷：手册 + 运行时（含审计）+ 自定义模板。
 * 不包含设备角色、主题等本机偏好。
 */
export interface BackupPayload {
  app: 'shunchang';
  v: 2;
  exportedAt: number;
  sheets: BackupSheetEntry[];
  templates: CustomTemplate[];
}

export type BackupError = 'bad-format' | 'unsupported-version';

export type BackupParseResult =
  | { ok: true; backup: BackupPayload }
  | { ok: false; error: BackupError };

export interface BackupPreview {
  added: number;
  overwritten: number;
  skipped: number;
  conflicts: number;
  conflictNames: string[];
}

export interface BackupApplyResult extends BackupPreview {
  ok: boolean;
  error?: 'conflict';
  /** 备份内容写回本地存储时失败；界面应提示立即重新导出。 */
  writeFailed: boolean;
}

const MESSAGES: Record<BackupError, string> = {
  'bad-format': '无法识别的备份文件',
  'unsupported-version': '备份版本不受支持，请升级应用',
};

export function backupErrorMessage(error: BackupError): string {
  return t(MESSAGES[error] ?? MESSAGES['bad-format']);
}

export function backupFileName(now: number = Date.now()): string {
  const date = new Date(now);
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value));
  return `顺场_全量备份_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate(),
  )}.json`;
}

function baselineRuntime(sheetId: string): RuntimeState {
  return normalizeRuntime({
    sheetId,
    currentIndex: -1,
    actuals: {},
    offsetMin: 0,
    execVersion: 0,
    lastSyncAt: 0,
  });
}

/** 收集本机全部手册、运行时与自定义模板，生成可导出的备份载荷。 */
export function buildBackup(now: number = Date.now()): BackupPayload {
  return {
    app: BACKUP_APP,
    v: BACKUP_VERSION,
    exportedAt: now,
    sheets: listSheets().map((sheet) => ({
      sheet,
      runtime: getRuntime(sheet.id) ?? baselineRuntime(sheet.id),
    })),
    templates: listCustomTemplates(),
  };
}

export function encodeBackup(backup: BackupPayload = buildBackup()): string {
  return JSON.stringify(backup, null, 2);
}

function isItemLike(value: unknown): value is Item {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const item = value as Item;
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.name === 'string' &&
    typeof item.durationMin === 'number'
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
    sheet.items.every(isItemLike) &&
    typeof sheet.updatedAt === 'number'
  );
}

function isRuntimeLike(value: unknown): value is RuntimeState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const runtime = value as RuntimeState;
  return (
    typeof runtime.currentIndex === 'number' &&
    typeof runtime.offsetMin === 'number' &&
    typeof runtime.execVersion === 'number' &&
    typeof runtime.lastSyncAt === 'number' &&
    !!runtime.actuals &&
    typeof runtime.actuals === 'object'
  );
}

function isTemplateItem(value: unknown): value is CustomTemplateItem {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const entry = value as CustomTemplateItem;
  return (
    typeof entry.name === 'string' &&
    typeof entry.durationMin === 'number' &&
    Number.isFinite(entry.durationMin) &&
    typeof entry.owner === 'string' &&
    typeof entry.note === 'string'
  );
}

function isTemplate(value: unknown): value is CustomTemplate {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const entry = value as CustomTemplate;
  return (
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.createdAt === 'number' &&
    typeof entry.updatedAt === 'number' &&
    typeof entry.startMin === 'number' &&
    Array.isArray(entry.items) &&
    entry.items.every(isTemplateItem)
  );
}

/** 解析并校验全量备份；只接受 v2 载荷。 */
export function parseBackup(text: string): BackupParseResult {
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
    exportedAt?: unknown;
    sheets?: unknown;
    templates?: unknown;
  };

  if (data.app !== BACKUP_APP || typeof data.v !== 'number') {
    return { ok: false, error: 'bad-format' };
  }
  if (data.v !== BACKUP_VERSION) {
    return { ok: false, error: 'unsupported-version' };
  }
  if (!Array.isArray(data.sheets)) {
    return { ok: false, error: 'bad-format' };
  }

  const sheets: BackupSheetEntry[] = [];
  for (const entry of data.sheets) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'bad-format' };
    }
    const row = entry as { sheet?: unknown; runtime?: unknown };
    if (!isSheetLike(row.sheet) || !isRuntimeLike(row.runtime)) {
      return { ok: false, error: 'bad-format' };
    }
    sheets.push({
      sheet: row.sheet,
      runtime: normalizeRuntime({ ...row.runtime, sheetId: row.sheet.id }),
    });
  }

  const templates: CustomTemplate[] = [];
  if (data.templates !== undefined) {
    if (!Array.isArray(data.templates)) {
      return { ok: false, error: 'bad-format' };
    }
    for (const template of data.templates) {
      if (!isTemplate(template)) {
        return { ok: false, error: 'bad-format' };
      }
      templates.push({
        ...template,
        items: template.items.filter(isTemplateItem),
      });
    }
  }

  const exportedAt =
    typeof data.exportedAt === 'number' ? data.exportedAt : Date.now();

  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      v: BACKUP_VERSION,
      exportedAt,
      sheets,
      templates,
    },
  };
}

function displayName(sheet: Sheet): string {
  const name = sheet.name.trim();
  return name.length > 0 ? name : sheet.id;
}

/**
 * 预览合并结果：
 * - 本地不存在 → 新增
 * - 本地 updatedAt < 导入 → 覆盖（本地运行中则记为冲突）
 * - 本地更新或相同 → 跳过
 */
export function previewBackup(backup: BackupPayload): BackupPreview {
  const local = new Map<string, Sheet>();
  listSheets().forEach((sheet) => {
    local.set(sheet.id, sheet);
  });

  const preview: BackupPreview = {
    added: 0,
    overwritten: 0,
    skipped: 0,
    conflicts: 0,
    conflictNames: [],
  };

  backup.sheets.forEach((entry) => {
    const existing = local.get(entry.sheet.id);
    if (!existing) {
      preview.added += 1;
      local.set(entry.sheet.id, entry.sheet);
      return;
    }
    if (entry.sheet.updatedAt <= existing.updatedAt) {
      preview.skipped += 1;
      return;
    }
    if (existing.status === 'running') {
      preview.conflicts += 1;
      preview.conflictNames.push(displayName(entry.sheet));
    } else {
      preview.overwritten += 1;
    }
    local.set(entry.sheet.id, entry.sheet);
  });

  return preview;
}

function writeTemplates(templates: CustomTemplate[]): boolean {
  try {
    return storage.set(
      TEMPLATES_KEY,
      JSON.stringify({ v: 1, templates }),
    );
  } catch {
    return false;
  }
}

/**
 * 应用备份。存在运行中手册冲突时必须显式传入 confirmConflicts，
 * 否则不写入任何内容，交由界面二次确认。
 */
export function applyBackup(
  backup: BackupPayload,
  options: { confirmConflicts?: boolean } = {},
): BackupApplyResult {
  const preview = previewBackup(backup);
  if (preview.conflicts > 0 && options.confirmConflicts !== true) {
    return { ...preview, ok: false, error: 'conflict', writeFailed: false };
  }

  let writeFailed = false;
  const local = new Map<string, Sheet>();
  listSheets().forEach((sheet) => {
    local.set(sheet.id, sheet);
  });

  backup.sheets.forEach((entry) => {
    const existing = local.get(entry.sheet.id);
    const shouldReplace =
      existing === undefined || entry.sheet.updatedAt > existing.updatedAt;
    if (!shouldReplace) {
      return;
    }
    importSheet(entry.sheet);
    saveRuntime(entry.runtime);
    local.set(entry.sheet.id, entry.sheet);
  });

  const templates = new Map<string, CustomTemplate>();
  listCustomTemplates().forEach((template) => {
    templates.set(template.id, template);
  });

  let templatesChanged = false;
  backup.templates.forEach((template) => {
    const existing = templates.get(template.id);
    if (!existing || template.updatedAt > existing.updatedAt) {
      templates.set(template.id, template);
      templatesChanged = true;
    }
  });

  if (templatesChanged && !writeTemplates(Array.from(templates.values()))) {
    writeFailed = true;
  }

  return { ...preview, ok: true, writeFailed };
}
