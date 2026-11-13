import { beforeEach, describe, expect, it } from '@rstest/core';

import type { CustomTemplate } from '../../domain/customTemplates';
import {
  TEMPLATES_KEY,
  clearCustomTemplatesForTest,
  listCustomTemplates,
} from '../../domain/customTemplates';
import type { RuntimeState, Sheet } from '../../domain/types';
import {
  clearAllForTest,
  getRuntime,
  getSheet,
  importSheet,
  saveRuntime,
} from '../../store/repository';
import { storage } from '../../store/storage';
import type { BackupPayload } from '../backupOps';
import {
  applyBackup,
  buildBackup,
  encodeBackup,
  parseBackup,
  previewBackup,
} from '../backupOps';

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 'sheet-1',
    name: '婚礼流程',
    date: '2026-11-10',
    startMin: 480,
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
    updatedAt: 100,
    ...overrides,
  };
}

function makeRuntime(
  sheetId: string,
  overrides: Partial<RuntimeState> = {},
): RuntimeState {
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
    audit: [
      {
        id: 'audit-1',
        at: 1762700000000,
        type: 'complete',
        label: '完成迎宾',
      },
    ],
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<CustomTemplate> = {}): CustomTemplate {
  return {
    id: 'tpl-1',
    name: '我的模板',
    createdAt: 10,
    updatedAt: 10,
    startMin: 480,
    items: [
      { name: '迎宾', durationMin: 30, owner: '主持', note: '' },
    ],
    ...overrides,
  };
}

function storeTemplates(templates: CustomTemplate[]): void {
  storage.set(TEMPLATES_KEY, JSON.stringify({ v: 1, templates }));
}

function backupOf(
  sheets: BackupPayload['sheets'],
  templates: CustomTemplate[] = [],
): BackupPayload {
  return {
    app: 'shunchang',
    v: 2,
    exportedAt: 1762700000000,
    sheets,
    templates,
  };
}

beforeEach(() => {
  clearAllForTest();
  clearCustomTemplatesForTest();
});

describe('backup payload', () => {
  it('round-trips sheets, runtimes and custom templates', () => {
    importSheet(makeSheet({ id: 'a', updatedAt: 100 }));
    saveRuntime(makeRuntime('a'));
    storeTemplates([makeTemplate()]);

    const text = encodeBackup(buildBackup(1762700000000));
    const parsed = parseBackup(text);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.backup.app).toBe('shunchang');
    expect(parsed.backup.v).toBe(2);
    expect(parsed.backup.exportedAt).toBe(1762700000000);
    expect(parsed.backup.sheets).toHaveLength(1);
    expect(parsed.backup.sheets[0].sheet.id).toBe('a');
    expect(parsed.backup.sheets[0].runtime.audit).toHaveLength(1);
    expect(parsed.backup.templates).toHaveLength(1);
    expect(parsed.backup.templates[0].name).toBe('我的模板');
  });

  it('rejects unknown app and legacy versions', () => {
    expect(parseBackup('not-json')).toEqual({
      ok: false,
      error: 'bad-format',
    });
    expect(
      parseBackup(JSON.stringify({ app: 'other', v: 2, sheets: [] })),
    ).toEqual({ ok: false, error: 'bad-format' });
    expect(
      parseBackup(JSON.stringify({ app: 'shunchang', v: 1, sheets: [] })),
    ).toEqual({ ok: false, error: 'unsupported-version' });
  });
});

describe('backup merge', () => {
  it('adds sheets missing locally and writes their runtime', () => {
    const backup = backupOf([
      { sheet: makeSheet({ id: 'new', name: '新手册' }), runtime: makeRuntime('new') },
    ]);

    expect(previewBackup(backup)).toMatchObject({
      added: 1,
      overwritten: 0,
      skipped: 0,
      conflicts: 0,
    });

    const result = applyBackup(backup);

    expect(result.ok).toBe(true);
    expect(getSheet('new')?.name).toBe('新手册');
    expect(getRuntime('new')?.execVersion).toBe(2);
  });

  it('overwrites a locally older sheet and keeps the imported updatedAt', () => {
    importSheet(makeSheet({ id: 'a', name: '本地', updatedAt: 100 }));

    const backup = backupOf([
      {
        sheet: makeSheet({ id: 'a', name: '导入', updatedAt: 200 }),
        runtime: makeRuntime('a', { execVersion: 7 }),
      },
    ]);

    expect(previewBackup(backup).overwritten).toBe(1);

    const result = applyBackup(backup);

    expect(result.ok).toBe(true);
    expect(getSheet('a')?.name).toBe('导入');
    expect(getSheet('a')?.updatedAt).toBe(200);
    expect(getRuntime('a')?.execVersion).toBe(7);
  });

  it('skips sheets that are newer or identical locally', () => {
    importSheet(makeSheet({ id: 'newer', name: '本地新', updatedAt: 300 }));
    importSheet(makeSheet({ id: 'same', name: '同名', updatedAt: 200 }));

    const backup = backupOf([
      {
        sheet: makeSheet({ id: 'newer', name: '导入旧', updatedAt: 200 }),
        runtime: makeRuntime('newer'),
      },
      {
        sheet: makeSheet({ id: 'same', name: '导入同名', updatedAt: 200 }),
        runtime: makeRuntime('same'),
      },
    ]);

    expect(previewBackup(backup)).toMatchObject({
      added: 0,
      overwritten: 0,
      skipped: 2,
      conflicts: 0,
    });

    applyBackup(backup);

    expect(getSheet('newer')?.name).toBe('本地新');
    expect(getSheet('same')?.name).toBe('同名');
    expect(getRuntime('newer')).toBeNull();
  });

  it('treats overwriting a running sheet as a conflict until confirmed', () => {
    importSheet(
      makeSheet({ id: 'run', name: '本地运行', status: 'running', updatedAt: 100 }),
    );
    saveRuntime(makeRuntime('run', { execVersion: 1 }));

    const backup = backupOf([
      {
        sheet: makeSheet({
          id: 'run',
          name: '导入运行',
          status: 'running',
          updatedAt: 200,
        }),
        runtime: makeRuntime('run', { execVersion: 9 }),
      },
    ]);

    const preview = previewBackup(backup);
    expect(preview.conflicts).toBe(1);
    expect(preview.conflictNames).toEqual(['导入运行']);

    const blocked = applyBackup(backup);
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toBe('conflict');
    expect(getSheet('run')?.name).toBe('本地运行');
    expect(getRuntime('run')?.execVersion).toBe(1);

    const confirmed = applyBackup(backup, { confirmConflicts: true });
    expect(confirmed.ok).toBe(true);
    expect(getSheet('run')?.name).toBe('导入运行');
    expect(getRuntime('run')?.execVersion).toBe(9);
  });

  it('merges custom templates by updatedAt', () => {
    storeTemplates([
      makeTemplate({ id: 'local-newer', name: '本地新', updatedAt: 300 }),
      makeTemplate({ id: 'local-older', name: '本地旧', updatedAt: 100 }),
    ]);

    const backup = backupOf(
      [],
      [
        makeTemplate({ id: 'local-newer', name: '导入旧', updatedAt: 200 }),
        makeTemplate({ id: 'local-older', name: '导入新', updatedAt: 200 }),
        makeTemplate({ id: 'incoming', name: '新增模板', updatedAt: 50 }),
      ],
    );

    const result = applyBackup(backup);

    expect(result.ok).toBe(true);
    const merged = listCustomTemplates();
    expect(merged.map((template) => template.id).sort()).toEqual([
      'incoming',
      'local-newer',
      'local-older',
    ]);
    expect(getTemplateName(merged, 'local-newer')).toBe('本地新');
    expect(getTemplateName(merged, 'local-older')).toBe('导入新');
    expect(getTemplateName(merged, 'incoming')).toBe('新增模板');
  });
});

function getTemplateName(
  templates: CustomTemplate[],
  id: string,
): string | undefined {
  return templates.find((template) => template.id === id)?.name;
}
