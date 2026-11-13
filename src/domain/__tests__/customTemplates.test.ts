import { beforeEach, describe, expect, it } from '@rstest/core';

import type { Sheet } from '../types';
import { formatDateKey } from '../types';
import {
  TEMPLATES_KEY,
  clearCustomTemplatesForTest,
  createSheetFromCustomTemplate,
  deleteCustomTemplate,
  listCustomTemplates,
  renameCustomTemplate,
  saveSheetAsTemplate,
} from '../customTemplates';
import { storage } from '../../store/storage';

const NOW = 1762732800000;

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 'sheet-1',
    name: '秋季婚礼流程',
    date: '2026-11-10',
    startMin: 480,
    items: [
      {
        id: 'item-a',
        name: '迎宾签到',
        durationMin: 30,
        owner: '督导',
        note: '门口立牌',
        lockAt: 510,
        locked: true,
      },
      {
        id: 'item-b',
        name: '仪式开始',
        durationMin: 20,
        owner: '司仪',
        note: '',
        lockAt: null,
      },
    ],
    status: 'published',
    version: 3,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  clearCustomTemplatesForTest();
});

describe('custom templates', () => {
  it('saves the sheet structure and clears absolute lock times', () => {
    const template = saveSheetAsTemplate(makeSheet());

    expect(template.name).toBe('秋季婚礼流程 模板');
    expect(template.startMin).toBe(480);
    expect(template.items).toEqual([
      {
        name: '迎宾签到',
        durationMin: 30,
        owner: '督导',
        note: '门口立牌',
        locked: true,
      },
      { name: '仪式开始', durationMin: 20, owner: '司仪', note: '' },
    ]);
    expect('lockAt' in template.items[0]).toBe(false);

    expect(listCustomTemplates()).toHaveLength(1);
    const raw = storage.get(TEMPLATES_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).v).toBe(1);
  });

  it('uses an explicit template name when provided', () => {
    const template = saveSheetAsTemplate(makeSheet(), '  秋季模板  ');

    expect(template.name).toBe('秋季模板');
    expect(listCustomTemplates()[0].name).toBe('秋季模板');
  });

  it('creates a sheet with the selected date and preserved segments', () => {
    const template = saveSheetAsTemplate(makeSheet());

    const sheet = createSheetFromCustomTemplate(template, NOW, '2026-12-01');

    expect(sheet.date).toBe('2026-12-01');
    expect(sheet.name).toBe(template.name);
    expect(sheet.startMin).toBe(480);
    expect(sheet.status).toBe('draft');
    expect(sheet.version).toBe(1);
    expect(sheet.updatedAt).toBe(NOW);
    expect(sheet.items).toHaveLength(2);
    expect(sheet.items[0].name).toBe('迎宾签到');
    expect(sheet.items[0].durationMin).toBe(30);
    expect(sheet.items[0].owner).toBe('督导');
    expect(sheet.items[0].note).toBe('门口立牌');
    expect(sheet.items[0].locked).toBe(true);
    expect(sheet.items[0].lockAt).toBeNull();
    expect(sheet.items[0].id).not.toBe(template.id);

    const again = createSheetFromCustomTemplate(template, NOW);
    expect(again.date).toBe(formatDateKey(NOW));
    expect(again.items[0].id).not.toBe(sheet.items[0].id);

    const invalid = createSheetFromCustomTemplate(template, NOW, '2026-02-30');
    expect(invalid.date).toBe(formatDateKey(NOW));
  });

  it('renames and deletes templates', () => {
    const template = saveSheetAsTemplate(makeSheet());

    const renamed = renameCustomTemplate(template.id, '  冬季模板 ');

    expect(renamed?.name).toBe('冬季模板');
    expect(listCustomTemplates()[0].name).toBe('冬季模板');
    expect(renameCustomTemplate(template.id, '   ')).toBeNull();
    expect(renameCustomTemplate('missing', '新名字')).toBeNull();
    expect(listCustomTemplates()[0].name).toBe('冬季模板');

    expect(deleteCustomTemplate(template.id)).toBe(true);
    expect(listCustomTemplates()).toEqual([]);
    expect(deleteCustomTemplate(template.id)).toBe(false);
  });
});
