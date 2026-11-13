import { storage } from '../store/storage';

import type { Item, Sheet } from './types';
import { formatDateKey, isValidDateKey } from './types';

export interface CustomTemplateItem {
  name: string;
  durationMin: number;
  owner: string;
  note: string;
  locked?: boolean;
}

/** 本地自定义模板；只保存相对结构，不保存任何绝对锁定时刻。 */
export interface CustomTemplate {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  startMin: number;
  items: CustomTemplateItem[];
}

export const TEMPLATES_KEY = 'shunchang.templates.v1';
const TEMPLATES_VERSION = 1;

function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
    Array.isArray(entry.items)
  );
}

function readTemplates(): CustomTemplate[] {
  let raw: string | null = null;
  try {
    raw = storage.get(TEMPLATES_KEY);
  } catch {
    return [];
  }
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as { v?: unknown; templates?: unknown };
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.v !== TEMPLATES_VERSION ||
      !Array.isArray(parsed.templates)
    ) {
      return [];
    }
    return parsed.templates.filter(isTemplate).map((template) => ({
      ...template,
      items: template.items.filter(isTemplateItem),
    }));
  } catch {
    return [];
  }
}

function writeTemplates(templates: CustomTemplate[]): void {
  try {
    storage.set(
      TEMPLATES_KEY,
      JSON.stringify({ v: TEMPLATES_VERSION, templates }),
    );
  } catch {
    // 存储层已容错；模板保存失败时保持界面可用。
  }
}

export function listCustomTemplates(): CustomTemplate[] {
  return readTemplates().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getCustomTemplate(id: string): CustomTemplate | null {
  return readTemplates().find((template) => template.id === id) ?? null;
}

/** 把当前手册另存为模板：保留顺序、时长、负责人、备注，清空绝对锁定时刻。 */
export function saveSheetAsTemplate(
  sheet: Sheet,
  name?: string,
): CustomTemplate {
  const now = Date.now();
  const fallbackName = `${sheet.name.trim() || '未命名手册'} 模板`;
  const template: CustomTemplate = {
    id: createId(),
    name: (name ?? fallbackName).trim() || fallbackName,
    createdAt: now,
    updatedAt: now,
    startMin: sheet.startMin,
    items: sheet.items.map((item) => {
      const entry: CustomTemplateItem = {
        name: item.name,
        durationMin: item.durationMin,
        owner: item.owner,
        note: item.note,
      };
      if (item.locked === true) {
        entry.locked = true;
      }
      return entry;
    }),
  };

  const templates = readTemplates();
  templates.push(template);
  writeTemplates(templates);
  return template;
}

export function renameCustomTemplate(
  id: string,
  name: string,
): CustomTemplate | null {
  const nextName = name.trim();
  if (nextName.length === 0) {
    return null;
  }

  const templates = readTemplates();
  const index = templates.findIndex((template) => template.id === id);
  if (index < 0) {
    return null;
  }

  const updated: CustomTemplate = {
    ...templates[index],
    name: nextName,
    updatedAt: Date.now(),
  };
  templates[index] = updated;
  writeTemplates(templates);
  return updated;
}

export function deleteCustomTemplate(id: string): boolean {
  const templates = readTemplates();
  const next = templates.filter((template) => template.id !== id);
  if (next.length === templates.length) {
    return false;
  }
  writeTemplates(next);
  return true;
}

export function createSheetFromCustomTemplate(
  template: CustomTemplate,
  now: number,
  date?: string,
): Sheet {
  const items: Item[] = template.items.map((entry) => {
    const next: Item = {
      id: createId(),
      name: entry.name,
      durationMin: entry.durationMin,
      owner: entry.owner,
      note: entry.note,
      lockAt: null,
    };
    if (entry.locked === true) {
      next.locked = true;
    }
    return next;
  });

  return {
    id: createId(),
    name: template.name,
    date: date && isValidDateKey(date) ? date.trim() : formatDateKey(now),
    startMin: template.startMin,
    items,
    status: 'draft',
    version: 1,
    updatedAt: now,
  };
}

export function clearCustomTemplatesForTest(): void {
  try {
    storage.remove(TEMPLATES_KEY);
  } catch {
    // Ignore.
  }
}
