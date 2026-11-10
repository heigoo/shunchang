import type { Sheet } from './types';
import { computeTimeline } from './timeline';

export interface SheetError {
  index?: number;
  field: string;
  message: string;
}

function textLength(value: string): number {
  return Array.from(value).length;
}

export function validateForPublish(sheet: Sheet): SheetError[] {
  const errors: SheetError[] = [];
  const name = sheet.name.trim();

  if (name.length === 0) {
    errors.push({ field: 'name', message: '请填写手册名称' });
  } else if (textLength(name) > 40) {
    errors.push({ field: 'name', message: '手册名称不能超过 40 字' });
  }

  if (sheet.items.length === 0) {
    errors.push({ field: 'items', message: '至少需要一个环节' });
    return errors;
  }

  sheet.items.forEach((item, index) => {
    const itemName = item.name.trim();

    if (itemName.length === 0) {
      errors.push({ index, field: 'name', message: '请填写环节名称' });
    } else if (textLength(itemName) > 20) {
      errors.push({ index, field: 'name', message: '环节名称不能超过 20 字' });
    }

    if (
      !Number.isInteger(item.durationMin) ||
      item.durationMin < 1 ||
      item.durationMin > 600
    ) {
      errors.push({ index, field: 'durationMin', message: '时长需为 1–600 的整数' });
    }

    if (textLength(item.owner) > 20) {
      errors.push({ index, field: 'owner', message: '负责人不能超过 20 字' });
    }

    if (textLength(item.note) > 200) {
      errors.push({ index, field: 'note', message: '备注不能超过 200 字' });
    }

    if (item.locked === true && item.lockAt === null) {
      errors.push({ index, field: 'lockAt', message: '锁定环节需填写锁定时刻' });
    }
  });

  return errors;
}

export function findPlanConflicts(sheet: Sheet): number[] {
  const rows = computeTimeline(sheet, 0).rows;
  const conflicts: number[] = [];

  for (const row of rows) {
    if (row.index === 0 || row.lockAt === null) {
      continue;
    }
    const prevRow = rows[row.index - 1];
    const prevDuration = sheet.items[row.index - 1].durationMin;
    if (row.lockAt < prevRow.planStart + prevDuration) {
      conflicts.push(row.index);
    }
  }

  return conflicts;
}
